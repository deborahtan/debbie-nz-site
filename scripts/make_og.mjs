// Generates the 1200x627 social share images (LinkedIn, Slack, X) in debbie-nz-site/og/.
// Everything is drawn here from the site's own fonts and colours, so there's nothing to license.
// Run after build_pulse.py:  node scripts/make_og.mjs
import { chromium } from 'playwright';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'debbie-nz-site');
const OUT = join(SITE, 'og');
mkdirSync(OUT, { recursive: true });
// Fonts are inlined as data URIs (a blank page can't load file:// fonts)
const font = (f) => 'data:font/woff2;base64,' + readFileSync(join(SITE, 'fonts', f)).toString('base64');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const monthLabel = (m) => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-NZ', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const cards = [];
for (const f of readdirSync(join(ROOT, 'content', 'pulse')).filter((f) => f.endsWith('.json'))) {
  const i = JSON.parse(readFileSync(join(ROOT, 'content', 'pulse', f), 'utf8'));
  const stories = i.sections.reduce((n, s) => n + s.items.filter((x) => x.title).length, 0);
  cards.push({ file: `${i.slug}.png`, badge: `💗 On the Pulse · ${monthLabel(i.month)}`, title: i.title, accent: i.title_accent || '',
    foot: `${stories} stories · dated & sourced · commentary by Debbie` });
}
cards.push({ file: 'site.png', badge: '💗 On the Pulse', title: "What's moving in data, technology & measurement.", accent: 'measurement.', foot: 'A monthly read from Auckland, Aotearoa · by Debbie Tan' });
cards.push({ file: 'philosophy.png', badge: '🧠 How I use AI', title: 'A tool, not a brain transplant.', accent: 'brain transplant.', foot: "Judgment stays mine · measured, costed, sceptical · by Debbie Tan" });
cards.push({ file: 'whats-cooking.png', badge: "🍳 What's cooking", title: 'The automations taking the grunt work out of measurement.', accent: 'measurement.', foot: 'Tracking plans · GTM · audits · agents · by Debbie Tan' });
cards.push({ file: 'shop.png', badge: '🧪 Test shop', title: 'A pretend shop for testing ecommerce tracking.', accent: 'tracking.', foot: 'Nothing is real · no money changes hands' });

const html = (c) => {
  let title = esc(c.title);
  if (c.accent && c.title.endsWith(c.accent)) title = esc(c.title.slice(0, -c.accent.length)) + `<span>${esc(c.accent)}</span>`;
  const size = c.title.length > 70 ? 58 : c.title.length > 48 ? 66 : 76;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Baloo 2';font-weight:700;src:url(${font('baloo-2-latin-700-normal.woff2')})}
@font-face{font-family:'Baloo 2';font-weight:700;src:url(${font('baloo-2-latin-ext-700-normal.woff2')});unicode-range:U+0100-02BA}
@font-face{font-family:'Nunito';font-weight:700;src:url(${font('nunito-latin-700-normal.woff2')})}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:627px;background:#FFF4EC;font-family:'Nunito',sans-serif;color:#3E2A24;position:relative;overflow:hidden}
.card{position:absolute;inset:44px 56px;background:#fff;border:2px solid rgba(62,42,36,.12);border-radius:36px;padding:52px 60px;
  box-shadow:0 30px 60px -30px rgba(70,48,42,.35);transform:rotate(-1.2deg);display:flex;flex-direction:column}
.badge{display:inline-block;align-self:flex-start;font-family:'Baloo 2';font-weight:700;font-size:28px;color:#B8285A;background:#FFE9EF;
  border:2.5px solid rgba(184,40,90,.3);border-radius:999px;padding:4px 24px}
h1{font-family:'Baloo 2';font-weight:700;font-size:${size}px;line-height:1.04;margin-top:26px;letter-spacing:-.5px;max-width:930px}
h1 span{color:#B8285A}
.foot{margin-top:auto;display:flex;justify-content:space-between;align-items:center;border-top:3px dashed rgba(62,42,36,.18);padding-top:20px;font-size:26px;color:#6B4F45}
.foot b{font-family:'Baloo 2';font-size:30px;color:#3E2A24}
.doodle{position:absolute;font-size:46px}
.d1{top:18px;right:64px;transform:rotate(12deg)}.d2{bottom:20px;left:24px;transform:rotate(-14deg);font-size:40px}
.d3{top:40%;right:18px;font-size:34px;transform:rotate(8deg)}
.dots{position:absolute;right:120px;top:150px;width:150px;height:150px;border-radius:50%;
  background:radial-gradient(circle,#F2A541 0 22%,transparent 23%) 0 0/50px 50px;opacity:.35}
</style></head><body>
<div class="dots"></div>
<div class="card"><span class="badge">${esc(c.badge)}</span><h1>${title}</h1>
<div class="foot"><span>${esc(c.foot)}</span><b>debbie tan 💗</b></div></div>
<span class="doodle d1">✨</span><span class="doodle d2">💛</span><span class="doodle d3">🍜</span>
</body></html>`;
};

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 627 } });
for (const c of cards) {
  await page.setContent(html(c), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUT, c.file), type: 'png' });
  console.log('og/' + c.file);
}
await browser.close();
