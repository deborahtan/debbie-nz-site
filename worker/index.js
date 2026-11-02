/**
 * debbie.nz Worker — serves the static site and the On the Pulse likes/comments API.
 *
 * Privacy: raw IP addresses are never stored or logged. Each request's IP is
 * salted (HASH_SALT secret) and SHA-256 hashed, then truncated, and used only for
 * rate limiting and blocking spam. Commenters give a display name, nothing else.
 *
 * Bindings (wrangler.jsonc): ASSETS, DB (D1), vars COMMENTS_MODERATED
 * Secrets: ADMIN_TOKEN, HASH_SALT   (npx wrangler secret put <NAME>)
 */

const SLUG = /^issue-\d{2,3}$/;
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
  ]);
  schemaReady = true;
}

async function api(request, env, url) {
  await ensureSchema(env);
  const parts = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean);
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, { status: 204 });
  if (method === 'POST' && !sameOrigin(request, url)) return json({ error: 'Forbidden' }, 403);

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

    // POST /api/issues/:slug/comments   {name, body, website(honeypot)}
    if (parts[2] === 'comments' && method === 'POST') {
      const b = await readJson(request);
      if (b.website) return json({ status: 'pending' }, 201); // bot filled the honeypot: pretend success, store nothing
      const name = clean(b.name, 60);
      const text = clean(b.body, 2000, true);
      if (!name || !text) return json({ error: 'Add your name and a comment first.' }, 400);
      if (/https?:\/\/\S+.*https?:\/\/\S+.*https?:\/\//is.test(text)) return json({ error: 'Too many links in one comment.' }, 400);
      const ipHash = await hashIp(request, env);
      if (await overLimit(env, 'comments', ipHash, LIMITS.comment)) return json({ error: 'Too many comments — try again shortly.' }, 429);
      const status = env.COMMENTS_MODERATED === 'false' ? 'published' : 'pending';
      await env.DB.prepare('INSERT INTO comments (slug, name, body, status, ip_hash) VALUES (?, ?, ?, ?, ?)').bind(slug, name, text, status, ipHash).run();
      return json({ status }, 201);
    }
  }

  // ---------- admin (moderation) ----------
  if (parts[0] === 'admin') {
    if (!(await authorised(request, env))) return json({ error: 'Unauthorised' }, 401);

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

async function readJson(request) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > 10000) return {};
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
