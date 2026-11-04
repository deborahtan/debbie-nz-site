// Funnel QA — walks each journey in content/funnels.json with a real browser, watches the
// dataLayer and the GA4 network hits, and asserts both against funnel-spec.json (generated from
// scripts/make_gtm.py, so the QA spec and the GTM container can never disagree).
//
// Every assertion is a plain comparison: spec says the event must carry these parameters, the run
// either saw them or it didn't. Same input, same verdict, every time — which is the point of QA.
//
// Local:  SITE_URL=http://127.0.0.1:8787 node scripts/funnel-qa.mjs
// CI:     .github/workflows/funnel-qa.yml   (posts the report to /api/admin/audit)
//
// Exit code 1 if any journey fails, so a broken tag fails the build.

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const SITE = (process.env.SITE_URL || 'https://debbie-nz-site.deborahtanyl.workers.dev').replace(/\/$/, '');
const TOKEN = process.env.ADMIN_TOKEN || '';
const ONLY = process.env.ONLY_JOURNEY || '';
const HEADLESS = process.env.HEADED !== '1';

const spec = JSON.parse(readFileSync(new URL('../funnel-spec.json', import.meta.url), 'utf8'));
const { journeys } = JSON.parse(readFileSync(new URL('../content/funnels.json', import.meta.url), 'utf8'));

// ---------------------------------------------------------------- redaction
// The report is published on a public page, so nothing that could identify a person goes in it.
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const LONG_ID = /\b[0-9a-f]{24,}\b/gi;
function redact(value) {
  if (typeof value === 'string') return value.replace(EMAIL, '[email]').replace(LONG_ID, '[id]');
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = /email|address|phone/i.test(k) ? '[redacted]' : redact(v);
    return out;
  }
  return value;
}

// ---------------------------------------------------------------- dataLayer capture
// Two problems with reading window.dataLayer directly: GTM replaces dataLayer.push when it loads,
// and a click that navigates throws the array away before it can be read. So a script injected
// before any page code mirrors the array into sessionStorage, which survives same-origin
// navigation, and flushes on pagehide so the last event before a navigation is kept.
const CAPTURE = () => {
  const KEY = '__qa_dl';
  window.dataLayer = window.dataLayer || [];
  let synced = 0;
  function sync() {
    try {
      const dl = window.dataLayer || [];
      if (dl.length <= synced) return;
      const store = JSON.parse(sessionStorage.getItem(KEY) || '[]');
      for (let i = synced; i < dl.length; i++) {
        const raw = dl[i];
        let plain;
        if (raw && typeof raw === 'object' && !Array.isArray(raw) && typeof raw.length === 'number' && raw.event === undefined) {
          plain = { _gtag: Array.prototype.slice.call(raw).map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))) };
        } else {
          try {
            plain = JSON.parse(JSON.stringify(raw, (k, v) => (typeof v === 'function' ? undefined : v)));
          } catch {
            plain = { _unserialisable: true };
          }
        }
        if (plain && typeof plain === 'object') plain.__page = location.pathname;
        store.push(plain);
      }
      synced = dl.length;
      sessionStorage.setItem(KEY, JSON.stringify(store));
    } catch {}
  }
  setInterval(sync, 80);
  addEventListener('pagehide', sync);
  addEventListener('visibilitychange', sync);
  window.__qaSync = sync;
};

async function drain(page, from) {
  const entries = await page.evaluate((start) => {
    try { window.__qaSync && window.__qaSync(); } catch {}
    let store = [];
    try { store = JSON.parse(sessionStorage.getItem('__qa_dl') || '[]'); } catch {}
    return store.slice(start);
  }, from);
  return { entries, length: from + entries.length };
}

// ---------------------------------------------------------------- assertions
function missing(obj, keys) {
  return keys.filter((k) => {
    const v = obj?.[k];
    return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  });
}

function checkEvent(name, hits, globals) {
  const def = spec.events[name];
  const problems = [];
  if (!def) return [{ level: 'fail', text: `\`${name}\` is not in the tracking plan` }];

  if (hits.length === 0) return [{ level: 'fail', text: `\`${name}\` did not fire` }];
  if (hits.length > 1) {
    problems.push({ level: 'fail', text: `\`${name}\` fired ${hits.length} times — expected once (duplicate tag or double-bound handler)` });
  }

  const hit = hits[0];
  if (def.type === 'ecommerce') {
    const ec = hit.ecommerce || {};
    const gone = missing(ec, def.required);
    if (gone.length) problems.push({ level: 'fail', text: `\`${name}\` is missing \`ecommerce.${gone.join('`, `ecommerce.')}\`` });
    if (def.currency && ec.currency && ec.currency !== def.currency) {
      problems.push({ level: 'fail', text: `\`${name}\` currency is \`${ec.currency}\`, spec says \`${def.currency}\`` });
    }
    if (ec.value !== undefined && typeof ec.value !== 'number') {
      problems.push({ level: 'fail', text: `\`${name}\` value is a ${typeof ec.value}, GA4 needs a number` });
    }
    const items = Array.isArray(ec.items) ? ec.items : [];
    if (def.item_required.length && items.length === 0 && def.required.includes('items')) {
      problems.push({ level: 'fail', text: `\`${name}\` has an empty \`items\` array` });
    }
    items.forEach((item, i) => {
      const itemGone = missing(item, def.item_required);
      if (itemGone.length) problems.push({ level: 'fail', text: `\`${name}\` item ${i} is missing \`${itemGone.join('`, `')}\`` });
      if (item.price !== undefined && typeof item.price !== 'number') {
        problems.push({ level: 'fail', text: `\`${name}\` item ${i} price is a ${typeof item.price}, GA4 needs a number` });
      }
    });
  } else {
    const gone = missing(hit, def.required);
    if (gone.length) problems.push({ level: 'fail', text: `\`${name}\` is missing \`${gone.join('`, `')}\`` });
  }

  if (def.expect_test_store) {
    for (const g of globals) {
      if (hit[g] === undefined) problems.push({ level: 'warn', text: `\`${name}\` has no \`${g}\` flag` });
    }
  }
  return problems;
}

// ---------------------------------------------------------------- journey runner
async function runJourney(browser, journey) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(CAPTURE);
  if (journey.consent) {
    await ctx.addInitScript((c) => {
      try { localStorage.setItem('dn_consent_v1', JSON.stringify({ ...c, ts: Date.now() })); } catch {}
    }, journey.consent);
  }
  const page = await ctx.newPage();

  const ga4 = [];
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));
  page.on('request', (req) => {
    const u = req.url();
    if (!/google-analytics\.com|analytics\.google\.com|\/g\/collect|\/mp\/collect/.test(u)) return;
    try {
      const q = new URL(u).searchParams;
      // a GA4 request can batch several events in the POST body; the query carries the first
      if (q.get('en')) ga4.push({ event: q.get('en'), tid: q.get('tid') || '' });
    } catch {}
  });

  const steps = [];
  const pool = [];
  let cursor = 0;
  let failed = false;

  for (const [n, step] of journey.steps.entries()) {
    const record = { n: n + 1, action: describe(step), problems: [], saw: [] };
    try {
      switch (step.do) {
        case 'goto':
          await page.goto(SITE + step.path, { waitUntil: 'networkidle' });
          break;
        case 'click':
          await page.locator(step.selector).first().click();
          break;
        case 'fill':
          await page.locator(step.selector).first().fill(step.value);
          break;
        case 'press':
          await page.locator(step.selector).first().press(step.key);
          break;
        case 'expect_url':
          await page.waitForURL(new RegExp(step.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 10000 });
          break;
        default:
          throw new Error(`Unknown step "${step.do}"`);
      }
      await page.waitForTimeout(step.settle ?? 450);
    } catch (err) {
      record.problems.push({ level: 'fail', text: `Could not ${describe(step)} — ${String(err.message).split('\n')[0].slice(0, 160)}` });
      failed = true;
      steps.push(record);
      break; // the journey is off the rails; later steps would be noise
    }

    // Everything pushed since the last drain goes into a pool. A click that navigates fires its
    // event and loads the next page in one go, so an event can land either side of a step
    // boundary — matching against the pool and consuming what it finds keeps that from being a
    // false failure, while still catching an event that fired twice.
    const { entries, length } = await drain(page, cursor);
    cursor = length;
    pool.push(...entries.filter((e) => e && e.event && !/^gtm\./.test(e.event)));
    record.saw = [...new Set(entries.filter((e) => e && e.event).map((e) => e.event))];

    for (const want of step.expect || []) {
      const hits = pool.filter((e) => e.event === want);
      for (const h of hits) pool.splice(pool.indexOf(h), 1);
      const problems = checkEvent(want, hits, spec.global_params);
      record.problems.push(...problems);
      if (hits.length >= 1) record.payload = { ...record.payload, [want]: redact(hits[0]) };
    }
    for (const banned of step.forbid || []) {
      if (pool.some((e) => e.event === banned)) {
        record.problems.push({ level: 'fail', text: `\`${banned}\` fired and must not have` });
      }
    }
    if (record.problems.some((p) => p.level === 'fail')) failed = true;
    steps.push(record);
  }

  await ctx.close();

  const expected = journey.steps.flatMap((s) => s.expect || []);
  const ga4Events = [...new Set(ga4.map((h) => h.event))];
  const notes = [];
  if (ga4.length === 0) {
    notes.push({ level: 'warn', text: 'No GA4 network hits seen. Either GTM did not load, or no GA4 tag is firing for these events — the dataLayer checks above still ran.' });
  } else {
    const absent = expected.filter((e) => !ga4Events.includes(e));
    if (absent.length) notes.push({ level: 'warn', text: `Reached the dataLayer but not GA4: \`${absent.join('`, `')}\`. Check the GTM trigger and consent settings.` });
  }
  if (pageErrors.length) notes.push({ level: 'warn', text: `${pageErrors.length} JavaScript error(s) during this journey: ${redact(pageErrors[0])}` });

  return {
    id: journey.id, name: journey.name, why: journey.why,
    pass: !failed, steps, notes,
    ga4_hits: ga4Events, expected: [...new Set(expected)],
  };
}

function describe(step) {
  if (step.do === 'goto') return `open ${step.path}`;
  if (step.do === 'click') return `click ${step.selector}`;
  if (step.do === 'fill') return `fill ${step.selector}`;
  if (step.do === 'press') return `press ${step.key}`;
  if (step.do === 'expect_url') return `land on ${step.pattern}`;
  return step.do;
}

// ---------------------------------------------------------------- main
const browser = await chromium.launch({
  headless: HEADLESS,
  // CHROME_PATH lets you point at a specific Chrome; CI uses Playwright's own build
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});
const results = [];
for (const journey of journeys) {
  if (ONLY && journey.id !== ONLY) continue;
  process.stdout.write(`▶ ${journey.name} … `);
  const r = await runJourney(browser, journey);
  results.push(r);
  const fails = r.steps.flatMap((s) => s.problems).filter((p) => p.level === 'fail').length;
  console.log(r.pass ? 'pass' : `FAIL (${fails} problem${fails === 1 ? '' : 's'})`);
}
await browser.close();

const report = {
  site: SITE,
  run_at: new Date().toISOString(),
  spec_events: Object.keys(spec.events).length,
  passed: results.filter((r) => r.pass).length,
  failed: results.filter((r) => !r.pass).length,
  journeys: results,
};
writeFileSync('funnel-report.json', JSON.stringify(report, null, 2));

console.log(`\n${report.passed} passed, ${report.failed} failed → funnel-report.json`);
for (const r of results) {
  for (const s of r.steps) {
    for (const p of s.problems) console.log(`  ${p.level === 'fail' ? '✖' : '!'} [${r.id} step ${s.n}] ${p.text.replace(/`/g, '')}`);
  }
  for (const nte of r.notes) console.log(`  ! [${r.id}] ${nte.text.replace(/`/g, '')}`);
}

if (TOKEN) {
  const res = await fetch(SITE + '/api/admin/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify({ kind: 'funnel', page: '/shop', data: report }),
  });
  console.log(res.ok ? 'Report recorded.' : `Could not record report: ${res.status}`);
}

process.exit(report.failed > 0 ? 1 : 0);
