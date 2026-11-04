// Uptime + error-spike monitor. Runs in GitHub Actions every 15 minutes (.github/workflows/monitor.yml).
// Exits 1 when something is wrong; the workflow then opens a GitHub issue, which GitHub emails to you.
// Results are also recorded on the site (/api/admin/uptime) for the Site health dashboard.

const SITE = (process.env.SITE_URL || 'https://debbie-nz-site.deborahtanyl.workers.dev').replace(/\/$/, '');
const TOKEN = process.env.ADMIN_TOKEN || '';
const ERROR_SPIKE = Number(process.env.ERROR_SPIKE || 25); // real (non-chaos) JS errors in the last hour

const checks = [
  { target: 'homepage', path: '/', expect: (r, body) => r.status === 200 && body.includes('On the Pulse') },
  { target: 'comments-api', path: '/api/health', expect: (r, body) => r.status === 200 && JSON.parse(body).ok === true },
  { target: 'whats-cooking', path: '/whats-cooking', expect: (r) => r.status === 200 },
];

async function record(result) {
  if (!TOKEN) return;
  try {
    await fetch(SITE + '/api/admin/uptime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify(result),
    });
  } catch { /* recording is best-effort */ }
}

const problems = [];
for (const c of checks) {
  const t0 = Date.now();
  let ok = false, status = 0, detail = '';
  try {
    const r = await fetch(SITE + c.path, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'debbie-nz-monitor' } });
    status = r.status;
    const body = await r.text();
    ok = c.expect(r, body);
    if (!ok) detail = `Unexpected response (${r.status})`;
  } catch (e) {
    detail = e.name === 'TimeoutError' ? 'Timed out after 15s' : e.message;
  }
  const ms = Date.now() - t0;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${c.target.padEnd(14)} ${status} ${ms}ms ${detail}`);
  await record({ target: c.target, ok, status, ms, detail });
  if (!ok) problems.push(`- **${c.target}** (${SITE}${c.path}): ${detail || status}`);
}

// Error spike: real JavaScript errors seen in the last hour (chaos-mode errors are excluded)
try {
  const r = await fetch(SITE + '/api/site-health', { signal: AbortSignal.timeout(15000) });
  if (r.ok) {
    const h = await r.json();
    const hourAgo = Date.now() - 3600e3;
    const recent = (h.client_errors || []).filter((e) => !String(e.message).startsWith('[chaos]') && Date.parse(e.last_seen) > hourAgo);
    const total = recent.reduce((n, e) => n + e.n, 0);
    console.log(`JS errors in the last hour (excluding chaos mode): ${total}`);
    if (total >= ERROR_SPIKE) {
      problems.push(`- **JavaScript error spike**: ${total} errors in the last hour. Top: ${recent.slice(0, 3).map((e) => `"${e.message}" on ${e.page}`).join('; ')}`);
    }
  }
} catch { /* the uptime checks above already cover the site being down */ }

if (problems.length) {
  const fs = await import('node:fs');
  fs.writeFileSync('monitor-report.md', `The monitor found a problem at ${new Date().toISOString()}:\n\n${problems.join('\n')}\n\nSite: ${SITE}\n`);
  process.exit(1);
}
