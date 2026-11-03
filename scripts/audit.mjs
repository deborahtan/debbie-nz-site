// Daily site audit: Lighthouse (performance, accessibility, best practices, SEO + lab Core Web Vitals)
// and an accessibility pass (axe-core rules, keyboard walk-through, headings and landmarks).
// Runs in GitHub Actions (.github/workflows/audit.yml); results go to /site-health.
// Local run:  SITE_URL=http://127.0.0.1:8787 node scripts/audit.mjs   (writes audit-report.json)

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const SITE = (process.env.SITE_URL || 'https://debbie-nz-site.deborahtanyl.workers.dev').replace(/\/$/, '');
const TOKEN = process.env.ADMIN_TOKEN || '';
const PAGES = (process.env.AUDIT_PAGES || '/,/whats-cooking,/shop,/site-health,/privacy,/about').split(',');
const SKIP_LIGHTHOUSE = process.env.SKIP_LIGHTHOUSE === '1';
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

async function post(kind, page, data) {
  if (!TOKEN) return;
  const r = await fetch(SITE + '/api/admin/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify({ kind, page, data }),
  });
  if (!r.ok) console.warn(`Could not record ${kind} for ${page}: ${r.status}`);
}

function lighthouse(url) {
  const out = join(mkdtempSync(join(tmpdir(), 'lh-')), 'report.json');
  execFileSync('npx', ['--yes', 'lighthouse@12', url, '--quiet', '--output=json', `--output-path=${out}`,
    '--only-categories=performance,accessibility,best-practices,seo', '--chrome-flags=--headless=new --no-sandbox'],
    { stdio: 'inherit', env: { ...process.env, CHROME_PATH: chromium.executablePath() }, timeout: 180000 });
  const r = JSON.parse(readFileSync(out, 'utf8'));
  const score = (k) => Math.round((r.categories[k]?.score ?? 0) * 100);
  const num = (id) => r.audits[id]?.numericValue ?? null;
  return {
    performance: score('performance'), accessibility: score('accessibility'),
    best_practices: score('best-practices'), seo: score('seo'),
    lcp_ms: Math.round(num('largest-contentful-paint')), cls: Math.round((num('cumulative-layout-shift') ?? 0) * 1000) / 1000,
    tbt_ms: Math.round(num('total-blocking-time')), fcp_ms: Math.round(num('first-contentful-paint')),
    lighthouse_version: r.lighthouseVersion,
  };
}

async function accessibility(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // Pretend a choice was already made so the cookie banner doesn't cover the page under test
  await ctx.addInitScript(() => localStorage.setItem('dn_consent_v1', JSON.stringify({ analytics: false, marketing: false, ts: Date.now() })));
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => page.goto(url));

  // 1) axe-core rules (WCAG 2.2 A + AA)
  await page.addScriptTag({ content: axeSource });
  const axe = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, example: v.nodes[0]?.target?.join(' ') }));
  });

  // 2) Keyboard walk-through: tab through everything, check focus is visible and nothing traps focus
  const stops = [];
  const missingFocusStyle = [];
  await page.focus('body');
  for (let i = 0; i < 200; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const visible = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none' || el.matches(':focus-visible') && cs.outlineStyle !== 'none';
      const name = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('title') || '').trim().slice(0, 40);
      return { tag: el.tagName.toLowerCase(), name, visible, id: el.id || '', key: el.outerHTML.slice(0, 80) };
    });
    if (!info) break;
    if (stops.length && stops[0].key === info.key) break; // wrapped round to the start
    stops.push(info);
    if (!info.visible) missingFocusStyle.push(`${info.tag} "${info.name}"`);
  }
  const firstStop = stops[0] ? `${stops[0].tag} "${stops[0].name}"` : '(none)';

  // 3) What a screen reader gets: headings, landmarks, images without alt, unnamed controls
  const structure = await page.evaluate(() => {
    const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1]));
    let skipped = 0;
    for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] > 1) skipped++;
    const landmarks = ['header', 'nav', 'main', 'footer', '[role="region"]', '[role="note"]'].filter((s) => document.querySelector(s));
    return {
      lang: document.documentElement.lang || null,
      title: document.title,
      h1_count: hs.filter((h) => h === 1).length,
      skipped_heading_levels: skipped,
      landmarks,
      images_without_alt: [...document.images].filter((i) => !i.hasAttribute('alt')).length,
    };
  });
  await ctx.close();

  const byImpact = axe.reduce((m, v) => ((m[v.impact] = (m[v.impact] || 0) + v.nodes), m), {});
  return {
    axe_violations: axe, axe_counts: byImpact,
    keyboard: { tab_stops: stops.length, first_stop: firstStop, skip_link_first: /skip/i.test(firstStop), missing_focus_style: missingFocusStyle.slice(0, 10), trap_suspected: stops.length >= 200 },
    structure,
    passed: !axe.some((v) => ['serious', 'critical'].includes(v.impact)) && missingFocusStyle.length === 0 && structure.h1_count === 1,
  };
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const report = [];
for (const path of PAGES) {
  const url = SITE + path;
  console.log(`\n▶ ${url}`);
  const a11y = await accessibility(browser, url);
  console.log(`  accessibility: ${a11y.passed ? 'pass' : 'issues'}  axe=${JSON.stringify(a11y.axe_counts)}  tab stops=${a11y.keyboard.tab_stops}  focus-style gaps=${a11y.keyboard.missing_focus_style.length}`);
  await post('accessibility', path, a11y);
  let lh = null;
  if (!SKIP_LIGHTHOUSE) {
    try {
      lh = lighthouse(url);
      console.log(`  lighthouse: perf ${lh.performance} · a11y ${lh.accessibility} · best ${lh.best_practices} · seo ${lh.seo} · LCP ${lh.lcp_ms}ms · CLS ${lh.cls}`);
      await post('lighthouse', path, lh);
    } catch (e) { console.warn('  lighthouse failed:', e.message); }
  }
  report.push({ path, accessibility: a11y, lighthouse: lh });
}
await browser.close();
writeFileSync('audit-report.json', JSON.stringify(report, null, 2));
const failing = report.filter((r) => !r.accessibility.passed).map((r) => r.path);
if (failing.length) { console.log(`\nAccessibility issues on: ${failing.join(', ')}`); process.exitCode = 1; }
