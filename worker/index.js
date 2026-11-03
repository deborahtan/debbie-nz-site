/**
 * debbie.nz Worker — serves the static site and the On the Pulse likes/comments API.
 *
 * Privacy: commenter emails are checked then discarded (never stored). Raw IP addresses are never stored or logged. Each request's IP is
 * salted (HASH_SALT secret) and SHA-256 hashed, then truncated, and used only for
 * rate limiting and blocking spam.
 *
 * Bindings (wrangler.jsonc): ASSETS, DB (D1), vars COMMENTS_MODERATED
 * Secrets: ADMIN_TOKEN, HASH_SALT   (npx wrangler secret put <NAME>)
 */

const SLUG = /^\d{4}-(0[1-9]|1[0-2])$/; // editions are keyed by month, e.g. 2026-10

// Comments need a real address from a mainstream provider. Keep in sync with pulse.js.
const ALLOWED_DOMAINS = new Set(['gmail.com','googlemail.com','outlook.com','outlook.co.nz','hotmail.com','hotmail.co.nz','hotmail.co.uk',
  'live.com','live.co.nz','live.com.au','msn.com','yahoo.com','yahoo.co.nz','yahoo.co.uk','yahoo.com.au','ymail.com',
  'icloud.com','me.com','mac.com','proton.me','protonmail.com','pm.me','aol.com','zoho.com','fastmail.com','gmx.com',
  'gmx.net','mail.com','hey.com','tutanota.com','tuta.io','xtra.co.nz','slingshot.co.nz','orcon.net.nz',
  'vodafone.co.nz','clear.net.nz','paradise.net.nz','bigpond.com','optusnet.com.au','btinternet.com','qq.com','163.com','naver.com']);
const FAKE_LOCAL = /^(test\d*|testing|tester|example|sample|demo|asdf\w*|qwerty\w*|foo|bar|foobar|fake|none|null|noreply|no-reply|abc|abc123|xxx+|aaa+|user\d*|admin)$/i;

function checkEmail(raw) {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  const m = v.match(/^([a-z0-9._%+-]{1,64})@([a-z0-9.-]+\.[a-z]{2,})$/);
  if (!m || v.length > 120) return { error: "That doesn't look like an email address." };
  if (!ALLOWED_DOMAINS.has(m[2])) return { error: 'Please use an address from a mainstream provider like Gmail, Outlook, iCloud, Yahoo, Proton or Xtra.' };
  if (FAKE_LOCAL.test(m[1].replace(/\+.*$/, ''))) return { error: 'Please use your real email address.' };
  return { email: v, local: m[1], domain: m[2] };
}

// The email is only checked (format, mainstream provider, not a throwaway) and then discarded.
// Nothing from it is stored. Commenters appear under a friendly pseudonym derived from the
// random per-browser id, so the same browser keeps the same name across comments.
const ADJ = ['Sunny','Curious','Cosy','Bubbly','Brave','Gentle','Cheeky','Clever','Dreamy','Plucky','Merry','Zesty','Snug','Witty','Breezy','Kind'];
const NOUN = ['Kererū','Tūī','Kiwi','Pīwakawaka','Dumpling','Noodle','Bao','Pavlova','Lamington','Kūmara','Mochi','Ruru','Tīeke','Hokey Pokey','Kawakawa','Pōhutukawa'];
async function pseudonym(visitor, env) {
  const seed = (env.HASH_SALT || 'on-the-pulse') + '|' + (visitor || crypto.randomUUID());
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed)));
  return ADJ[h[0] % ADJ.length] + ' ' + NOUN[h[1] % NOUN.length];
}
const LIMITS = {
  comment: { max: 3, minutes: 10 },
  like: { max: 40, minutes: 10 },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(request, env, url);
      } catch (err) {
        console.error('api error', err && err.message);
        return json({ error: 'Something went wrong.' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};

// Tables are created on first use, so a fresh (auto-created) database works with no manual migration step.
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS likes (slug TEXT NOT NULL, visitor TEXT NOT NULL, ip_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), PRIMARY KEY (slug, visitor))`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS likes_ip ON likes (ip_hash, created_at)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL,
      name TEXT NOT NULL, body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published')), ip_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS comments_slug ON comments (slug, status, created_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS comments_ip ON comments (ip_hash, created_at)'),
    // ---- site health (all aggregate or anonymous; shaped to port into BigQuery later) ----
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS csp_reports (day TEXT NOT NULL, directive TEXT NOT NULL, blocked TEXT NOT NULL,
      page TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 1, last_seen TEXT NOT NULL, PRIMARY KEY (day, directive, blocked, page))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS client_errors (day TEXT NOT NULL, page TEXT NOT NULL, message TEXT NOT NULL,
      file TEXT NOT NULL, line INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 1, last_seen TEXT NOT NULL,
      PRIMARY KEY (day, page, message, file, line))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS vitals (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL
      DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), page TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL,
      rating TEXT, device TEXT)`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS vitals_metric ON vitals (metric, created_at)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS uptime_checks (id INTEGER PRIMARY KEY AUTOINCREMENT, checked_at TEXT NOT NULL
      DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), target TEXT NOT NULL, ok INTEGER NOT NULL, status INTEGER, ms INTEGER, detail TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS audits (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL
      DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), kind TEXT NOT NULL, page TEXT NOT NULL, data TEXT NOT NULL)`),
    // old-school hit counter: one number per day, nothing about the visitor
    env.DB.prepare('CREATE TABLE IF NOT EXISTS hits (day TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0)'),
  ]);
  // Emails are never stored. Remove the column (and anything shown as a masked email) left by an earlier version.
  const cols = await env.DB.prepare('PRAGMA table_info(comments)').all();
  if (cols.results.some((c) => c.name === 'email')) {
    await env.DB.prepare('UPDATE comments SET email = NULL').run();
    await env.DB.prepare('ALTER TABLE comments DROP COLUMN email').run();
  }
  await env.DB.prepare("UPDATE comments SET name = 'A reader' WHERE name LIKE '%@%'").run();
  // Clear pre-launch test likes/comments from the old issue-XX slugs (one-off, harmless afterwards)
  await env.DB.batch([
    env.DB.prepare("DELETE FROM comments WHERE slug LIKE 'issue-%'"),
    env.DB.prepare("DELETE FROM likes WHERE slug LIKE 'issue-%'"),
  ]);
  await purgeOldIpHashes(env);
  schemaReady = true;
}

// Scrambled IPs are only needed for short-term spam limits: drop them after 30 days (runs at most hourly).
let lastPurge = 0;
async function purgeOldIpHashes(env) {
  if (Date.now() - lastPurge < 3600e3) return;
  lastPurge = Date.now();
  const cutoff = "strftime('%Y-%m-%dT%H:%M:%SZ','now','-30 days')";
  await env.DB.batch([
    env.DB.prepare(`UPDATE comments SET ip_hash = NULL WHERE ip_hash IS NOT NULL AND created_at < ${cutoff}`),
    env.DB.prepare(`UPDATE likes SET ip_hash = NULL WHERE ip_hash IS NOT NULL AND created_at < ${cutoff}`),
    // keep monitoring data for 13 months (enough for year-on-year), then drop it
    env.DB.prepare("DELETE FROM vitals WHERE created_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-400 days')"),
    env.DB.prepare("DELETE FROM uptime_checks WHERE checked_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-400 days')"),
    env.DB.prepare("DELETE FROM csp_reports WHERE day < date('now','-400 days')"),
    env.DB.prepare("DELETE FROM client_errors WHERE day < date('now','-400 days')"),
    env.DB.prepare("DELETE FROM audits WHERE created_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-400 days')"),
  ]);
}

async function api(request, env, url) {
  await ensureSchema(env);
  await purgeOldIpHashes(env);
  const parts = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean);
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, { status: 204 });
  if (method === 'POST' && !sameOrigin(request, url)) return json({ error: 'Forbidden' }, 403);

  // GET /api/health — used by the uptime monitor. 200 when the site and database answer, 503 otherwise.
  if (parts[0] === 'health' && method === 'GET') {
    const t0 = Date.now();
    try {
      await env.DB.prepare('SELECT 1').first();
      return json({ ok: true, db: 'ok', ms: Date.now() - t0, at: new Date().toISOString() });
    } catch (e) {
      return json({ ok: false, db: 'down', at: new Date().toISOString() }, 503);
    }
  }

  // POST /api/csp-report — browsers report Content Security Policy violations here.
  // Only the blocked host, the directive and the page path are kept (no query strings, nothing about the visitor).
  if (parts[0] === 'csp-report' && method === 'POST') {
    const raw = await readJson(request);
    const reports = Array.isArray(raw) ? raw.map((r) => r && r.body).filter(Boolean) : [raw['csp-report'] || raw];
    for (const r of reports.slice(0, 10)) {
      const directive = clean(r.effectiveDirective || r['effective-directive'] || r['violated-directive'] || '', 60).split(' ')[0];
      const blocked = hostOnly(r.blockedURL || r['blocked-uri'] || '');
      const page = pathOnly(r.documentURL || r['document-uri'] || '');
      if (!directive) continue;
      await upsertCount(env, 'csp_reports', ['directive', 'blocked', 'page'], [directive, blocked, page]);
    }
    return new Response(null, { status: 204 });
  }

  // POST /api/client-error — JavaScript errors from visitors' browsers (message, file, line only)
  if (parts[0] === 'client-error' && method === 'POST') {
    const b = await readJson(request);
    const message = clean(b.message, 300);
    if (message) await upsertCount(env, 'client_errors', ['page', 'message', 'file', 'line'],
      [pathOnly(b.page || ''), message, clean(b.file, 200), Math.max(0, Math.min(1e6, Number(b.line) || 0))]);
    return new Response(null, { status: 204 });
  }

  // POST /api/vitals — Core Web Vitals from visitors who allowed analytics. Anonymous: page, metric, value, device type.
  if (parts[0] === 'vitals' && method === 'POST') {
    const b = await readJson(request);
    const metric = String(b.metric || '');
    const value = Number(b.value);
    if (VITALS[metric] && Number.isFinite(value) && value >= 0 && value < VITALS[metric]) {
      await env.DB.prepare('INSERT INTO vitals (page, metric, value, rating, device) VALUES (?, ?, ?, ?, ?)')
        .bind(pathOnly(b.page || ''), metric, value, ['good', 'needs-improvement', 'poor'].includes(b.rating) ? b.rating : null,
          b.device === 'mobile' ? 'mobile' : 'desktop').run();
    }
    return new Response(null, { status: 204 });
  }

  // GET /api/hits — total visits so far. POST /api/hits — count this visit (the browser sends it once per session).
  if (parts[0] === 'hits' && (method === 'GET' || method === 'POST')) {
    if (method === 'POST') {
      await env.DB.prepare(`INSERT INTO hits (day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1`)
        .bind(new Date().toISOString().slice(0, 10)).run();
    }
    const row = await env.DB.prepare('SELECT COALESCE(SUM(count), 0) AS total FROM hits').first();
    return json({ total: row.total });
  }

  // GET /api/me?v=visitor — the friendly nickname for this browser (same one used on comments)
  if (parts[0] === 'me' && method === 'GET') {
    const v = cleanVisitor(url.searchParams.get('v'));
    return json({ name: v ? await pseudonym(v, env) : null });
  }

  // GET /api/site-health — everything the /site-health dashboard shows (aggregates only)
  if (parts[0] === 'site-health' && method === 'GET') {
    return json(await siteHealth(env), 200, 60);
  }

  // GET /api/counts?slugs=issue-07,issue-08
  if (parts[0] === 'counts' && method === 'GET') {
    const slugs = (url.searchParams.get('slugs') || '').split(',').filter((s) => SLUG.test(s)).slice(0, 50);
    const out = {};
    slugs.forEach((s) => (out[s] = { likes: 0, comments: 0 }));
    if (!slugs.length) return json(out);
    const qs = slugs.map(() => '?').join(',');
    const likes = await env.DB.prepare(`SELECT slug, COUNT(*) n FROM likes WHERE slug IN (${qs}) GROUP BY slug`).bind(...slugs).all();
    const comments = await env.DB.prepare(`SELECT slug, COUNT(*) n FROM comments WHERE status='published' AND slug IN (${qs}) GROUP BY slug`).bind(...slugs).all();
    likes.results.forEach((r) => (out[r.slug].likes = r.n));
    comments.results.forEach((r) => (out[r.slug].comments = r.n));
    return json(out, 200, 30);
  }

  if (parts[0] === 'issues' && SLUG.test(parts[1] || '')) {
    const slug = parts[1];

    // GET /api/issues/:slug?v=visitor
    if (parts.length === 2 && method === 'GET') {
      const visitor = cleanVisitor(url.searchParams.get('v'));
      const [likes, mine, comments] = await Promise.all([
        env.DB.prepare('SELECT COUNT(*) n FROM likes WHERE slug=?').bind(slug).first('n'),
        visitor ? env.DB.prepare('SELECT 1 FROM likes WHERE slug=? AND visitor=?').bind(slug, visitor).first() : null,
        env.DB.prepare("SELECT id, name, body, created_at FROM comments WHERE slug=? AND status='published' ORDER BY created_at ASC LIMIT 500").bind(slug).all(),
      ]);
      return json({ likes: likes || 0, liked: !!mine, comments: comments.results });
    }

    // POST /api/issues/:slug/like   {visitor} — toggles
    if (parts[2] === 'like' && method === 'POST') {
      const body = await readJson(request);
      const visitor = cleanVisitor(body.visitor);
      if (!visitor) return json({ error: 'Missing visitor' }, 400);
      const ipHash = await hashIp(request, env);
      const existing = await env.DB.prepare('SELECT 1 FROM likes WHERE slug=? AND visitor=?').bind(slug, visitor).first();
      let liked;
      if (existing) {
        await env.DB.prepare('DELETE FROM likes WHERE slug=? AND visitor=?').bind(slug, visitor).run();
        liked = false;
      } else {
        if (await overLimit(env, 'likes', ipHash, LIMITS.like)) return json({ error: 'Slow down a little.' }, 429);
        await env.DB.prepare('INSERT OR IGNORE INTO likes (slug, visitor, ip_hash) VALUES (?, ?, ?)').bind(slug, visitor, ipHash).run();
        liked = true;
      }
      const likes = await env.DB.prepare('SELECT COUNT(*) n FROM likes WHERE slug=?').bind(slug).first('n');
      return json({ likes, liked });
    }

    // POST /api/issues/:slug/comments   {email, body, website(honeypot)} — published immediately
    if (parts[2] === 'comments' && method === 'POST') {
      const b = await readJson(request);
      if (b.website) return json({ status: 'published' }, 201); // bot filled the honeypot: pretend success, store nothing
      if (!(await turnstileOk(b.turnstile, env))) return json({ error: "We couldn't confirm you're human. Please try again." }, 403);
      const text = clean(b.body, 2000, true);
      if (!text) return json({ error: 'Add a comment first.' }, 400);
      const em = checkEmail(b.email);
      if (em.error) return json({ error: em.error }, 400);
      if (/https?:\/\/\S+.*https?:\/\/\S+.*https?:\/\//is.test(text)) return json({ error: 'Too many links in one comment.' }, 400);
      const ipHash = await hashIp(request, env);
      if (await overLimit(env, 'comments', ipHash, LIMITS.comment)) return json({ error: 'Too many comments — try again shortly.' }, 429);
      const status = env.COMMENTS_MODERATED === 'true' ? 'pending' : 'published';
      // The email has done its job (proving a real address) and is not stored or logged.
      const name = await pseudonym(cleanVisitor(b.visitor), env);
      await env.DB.prepare('INSERT INTO comments (slug, name, body, status, ip_hash) VALUES (?, ?, ?, ?, ?)')
        .bind(slug, name, text, status, ipHash).run();
      return json({ status, name }, 201);
    }
  }

  // ---------- admin (moderation + monitoring results from GitHub Actions) ----------
  if (parts[0] === 'admin') {
    if (!(await authorised(request, env))) return json({ error: 'Unauthorised' }, 401);

    // POST /api/admin/uptime  {target, ok, status, ms, detail}
    if (parts[1] === 'uptime' && method === 'POST') {
      const b = await readJson(request);
      await env.DB.prepare('INSERT INTO uptime_checks (target, ok, status, ms, detail) VALUES (?, ?, ?, ?, ?)')
        .bind(clean(b.target, 100), b.ok ? 1 : 0, Number(b.status) || 0, Number(b.ms) || 0, clean(b.detail, 300)).run();
      return json({ ok: true });
    }

    // POST /api/admin/audit  {kind: lighthouse|accessibility, page, data}
    if (parts[1] === 'audit' && method === 'POST') {
      const b = await readJson(request, 300000);
      if (!['lighthouse', 'accessibility'].includes(b.kind)) return json({ error: 'Unknown kind' }, 400);
      await env.DB.prepare('INSERT INTO audits (kind, page, data) VALUES (?, ?, ?)')
        .bind(b.kind, pathOnly(b.page || '/'), JSON.stringify(b.data || {}).slice(0, 250000)).run();
      return json({ ok: true });
    }

    // GET /api/admin/comments?status=pending|published|all
    if (parts[1] === 'comments' && parts.length === 2 && method === 'GET') {
      const st = url.searchParams.get('status') || 'pending';
      const q = st === 'all'
        ? env.DB.prepare('SELECT id, slug, name, body, status, created_at FROM comments ORDER BY created_at DESC LIMIT 300')
        : env.DB.prepare('SELECT id, slug, name, body, status, created_at FROM comments WHERE status=? ORDER BY created_at DESC LIMIT 300').bind(st);
      return json({ comments: (await q.all()).results });
    }

    // POST /api/admin/comments/:id   {action: approve|hide|delete}
    if (parts[1] === 'comments' && /^\d+$/.test(parts[2] || '') && method === 'POST') {
      const id = Number(parts[2]);
      const { action } = await readJson(request);
      if (action === 'approve') await env.DB.prepare("UPDATE comments SET status='published' WHERE id=?").bind(id).run();
      else if (action === 'hide') await env.DB.prepare("UPDATE comments SET status='pending' WHERE id=?").bind(id).run();
      else if (action === 'delete') await env.DB.prepare('DELETE FROM comments WHERE id=?').bind(id).run();
      else return json({ error: 'Unknown action' }, 400);
      return json({ ok: true });
    }
  }

  return json({ error: 'Not found' }, 404);
}

// ---------- site health helpers ----------
// Upper bounds used to drop junk values (ms, except CLS which is unitless)
const VITALS = { LCP: 60000, INP: 60000, CLS: 50, FCP: 60000, TTFB: 60000 };
const GOOD = { LCP: 2500, INP: 200, CLS: 0.1, FCP: 1800, TTFB: 800 };
const POOR = { LCP: 4000, INP: 500, CLS: 0.25, FCP: 3000, TTFB: 1800 };

function hostOnly(u) {
  if (!u) return '(none)';
  if (/^(inline|eval|data|blob|self)$/i.test(u)) return u.toLowerCase();
  try { return new URL(u).host || u.slice(0, 40); } catch { return String(u).slice(0, 40); }
}
function pathOnly(u) {
  try { return new URL(u, 'https://x.invalid').pathname.slice(0, 120); } catch { return '/'; }
}
async function upsertCount(env, table, cols, vals) {
  const day = new Date().toISOString().slice(0, 10);
  const all = ['day', ...cols];
  await env.DB.prepare(
    `INSERT INTO ${table} (${all.join(', ')}, count, last_seen) VALUES (${all.map(() => '?').join(', ')}, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     ON CONFLICT (${all.join(', ')}) DO UPDATE SET count = MIN(count + 1, 1000000), last_seen = excluded.last_seen`
  ).bind(day, ...vals).run();
}

async function siteHealth(env) {
  const since = (d) => `strftime('%Y-%m-%dT%H:%M:%SZ','now','-${d} days')`;
  const [uptime, lastCheck, vitals, csp, errors, lighthouse, a11y] = await Promise.all([
    env.DB.prepare(`SELECT target, COUNT(*) n, SUM(ok) ok, AVG(ms) ms FROM uptime_checks WHERE checked_at > ${since(7)} GROUP BY target`).all(),
    env.DB.prepare('SELECT target, ok, status, ms, detail, checked_at FROM uptime_checks ORDER BY id DESC LIMIT 6').all(),
    env.DB.prepare(`SELECT metric, device, value FROM vitals WHERE created_at > ${since(28)} ORDER BY metric, device, value LIMIT 20000`).all(),
    env.DB.prepare(`SELECT directive, blocked, SUM(count) n, MAX(last_seen) last_seen FROM csp_reports WHERE day >= date('now','-7 days') GROUP BY directive, blocked ORDER BY n DESC LIMIT 15`).all(),
    env.DB.prepare(`SELECT page, message, file, line, SUM(count) n, MAX(last_seen) last_seen FROM client_errors WHERE day >= date('now','-7 days') GROUP BY page, message, file, line ORDER BY n DESC LIMIT 15`).all(),
    env.DB.prepare("SELECT page, data, created_at FROM audits WHERE kind='lighthouse' ORDER BY id DESC LIMIT 20").all(),
    env.DB.prepare("SELECT page, data, created_at FROM audits WHERE kind='accessibility' ORDER BY id DESC LIMIT 20").all(),
  ]);
  // p75 per metric and device, as Google reports Core Web Vitals
  const groups = {};
  for (const r of vitals.results) (groups[r.metric + '|' + r.device] ||= []).push(r.value);
  const field = Object.entries(groups).map(([k, vals]) => {
    const [metric, device] = k.split('|');
    const p75 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.75))];
    const rating = p75 <= GOOD[metric] ? 'good' : p75 <= POOR[metric] ? 'needs-improvement' : 'poor';
    return { metric, device, p75, samples: vals.length, rating };
  });
  const latestPerPage = (rows) => {
    const seen = new Set(); const out = [];
    for (const r of rows) { if (seen.has(r.page)) continue; seen.add(r.page); out.push({ page: r.page, at: r.created_at, ...JSON.parse(r.data) }); }
    return out;
  };
  return {
    generated_at: new Date().toISOString(),
    uptime: uptime.results.map((r) => ({ target: r.target, checks: r.n, uptime_pct: r.n ? Math.round((r.ok / r.n) * 10000) / 100 : null, avg_ms: Math.round(r.ms || 0) })),
    recent_checks: lastCheck.results,
    field_vitals: field,
    csp_violations: csp.results,
    client_errors: errors.results,
    lighthouse: latestPerPage(lighthouse.results),
    accessibility: latestPerPage(a11y.results),
  };
}

// Cloudflare Turnstile. Until real keys are added, Cloudflare's always-pass test secret is used.
const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA';
async function turnstileOk(token, env) {
  if (env.TURNSTILE_DISABLED === 'true') return true; // local development only (.dev.vars)
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET || TURNSTILE_TEST_SECRET);
  form.append('response', token);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const j = await r.json();
    return !!j.success;
  } catch {
    return false;
  }
}

// ---------- helpers ----------
function json(data, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

async function readJson(request, max = 10000) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > max) return {};
  try { return (await request.json()) || {}; } catch { return {}; }
}

function sameOrigin(request, url) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // same-origin fetches from some browsers omit it; JSON content-type still forces a preflight cross-site
  try { return new URL(origin).host === url.host; } catch { return false; }
}

function clean(v, max, multiline = false) {
  if (typeof v !== 'string') return '';
  let s = v.normalize('NFC').replace(multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '');
  if (multiline) s = s.replace(/\n{3,}/g, '\n\n');
  s = s.trim();
  return s.length > max ? s.slice(0, max) : s;
}

function cleanVisitor(v) {
  return typeof v === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(v) ? v : null;
}

async function hashIp(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!ip || !env.HASH_SALT) return null; // no salt configured → store nothing rather than an unsalted hash
  const data = new TextEncoder().encode(env.HASH_SALT + '|' + ip);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function overLimit(env, table, ipHash, { max, minutes }) {
  if (!ipHash) return false;
  const n = await env.DB.prepare(
    `SELECT COUNT(*) n FROM ${table} WHERE ip_hash=? AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ','now', ?)`
  ).bind(ipHash, `-${minutes} minutes`).first('n');
  return n >= max;
}

async function authorised(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.ADMIN_TOKEN || !token) return false;
  // constant-time compare via hashing both sides
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(token)),
    crypto.subtle.digest('SHA-256', enc.encode(env.ADMIN_TOKEN)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
