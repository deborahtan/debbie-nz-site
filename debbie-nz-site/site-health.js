/* Site health dashboard — reads /api/site-health (aggregates only) and draws it. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function ago(iso) {
    if (!iso) return '—';
    var m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    if (m < 1440) return Math.round(m / 60) + ' h ago';
    return Math.round(m / 1440) + ' d ago';
  }
  function empty(target, msg) { var p = el('p', 'health-empty', msg); target.replaceChildren(p); }
  function tile(label, value, sub, rating) {
    var t = el('div', 'h-tile ' + (rating ? 'r-' + rating : ''));
    t.appendChild(el('span', 'h-label', label));
    t.appendChild(el('span', 'h-value', value));
    if (sub) t.appendChild(el('span', 'h-sub', sub));
    return t;
  }
  function scoreCell(n) {
    var td = el('td');
    if (n == null) { td.textContent = '—'; return td; }
    var b = el('span', 'score ' + (n >= 90 ? 'r-good' : n >= 50 ? 'r-needs-improvement' : 'r-poor'), String(n));
    b.setAttribute('aria-label', n + ' out of 100');
    td.appendChild(b);
    return td;
  }
  var NAMES = { LCP: 'Largest Contentful Paint', INP: 'Interaction to Next Paint', CLS: 'Cumulative Layout Shift', FCP: 'First Contentful Paint', TTFB: 'Time to First Byte' };
  function fmt(metric, v) { return metric === 'CLS' ? v.toFixed(3) : v >= 1000 ? (v / 1000).toFixed(2) + 's' : Math.round(v) + 'ms'; }

  fetch('/api/site-health').then(function (r) { return r.json(); }).then(function (h) {
    $('health-updated').textContent = 'Updated ' + ago(h.generated_at) + '.';

    // ---- summary ----
    var issues = [];
    (h.uptime || []).forEach(function (u) { if (u.uptime_pct != null && u.uptime_pct < 99) issues.push(u.target + ' uptime ' + u.uptime_pct + '%'); });
    (h.field_vitals || []).forEach(function (v) { if (v.rating === 'poor') issues.push(v.metric + ' (' + v.device + ') is poor'); });
    (h.accessibility || []).forEach(function (a) { if (!a.passed) issues.push('accessibility issues on ' + a.page); });
    var real = (h.client_errors || []).filter(function (e) { return e.message.indexOf('[chaos]') !== 0; });
    if (real.length) issues.push(real.length + ' kinds of JavaScript error');
    var sum = $('health-summary');
    var box = el('div', 'h-banner ' + (issues.length ? 'warn' : 'ok'));
    box.appendChild(el('strong', null, issues.length ? '👀 Worth a look' : '💚 All healthy'));
    box.appendChild(el('span', null, issues.length ? issues.slice(0, 4).join(' · ') : 'Up, fast, accessible and error-free on the latest checks.'));
    sum.replaceChildren(box);

    // ---- uptime ----
    var up = $('health-uptime');
    if (!(h.uptime || []).length) empty(up, 'No checks recorded yet. They start once the monitor runs (every 15 minutes).');
    else {
      up.replaceChildren();
      h.uptime.forEach(function (u) {
        up.appendChild(tile(u.target, u.uptime_pct + '%', u.checks + ' checks · avg ' + u.avg_ms + 'ms', u.uptime_pct >= 99.5 ? 'good' : u.uptime_pct >= 98 ? 'needs-improvement' : 'poor'));
      });
      var last = (h.recent_checks || [])[0];
      if (last) up.appendChild(tile('last check', last.ok ? 'Up ✅' : 'Down 🚨', ago(last.checked_at), last.ok ? 'good' : 'poor'));
    }

    // ---- field Core Web Vitals ----
    var cwv = $('health-cwv');
    var order = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];
    var fv = (h.field_vitals || []).sort(function (a, b) { return order.indexOf(a.metric) - order.indexOf(b.metric) || a.device.localeCompare(b.device); });
    if (!fv.length) empty(cwv, 'No real-visitor data yet. It appears as people who allow analytics browse the site.');
    else {
      cwv.replaceChildren();
      fv.forEach(function (v) {
        var t = tile(v.metric + ' · ' + v.device, fmt(v.metric, v.p75), v.samples + ' visits · ' + v.rating.replace('-', ' '), v.rating);
        t.title = NAMES[v.metric];
        cwv.appendChild(t);
      });
    }

    // ---- lighthouse ----
    var tb = $('health-lh').querySelector('tbody');
    if (!(h.lighthouse || []).length) {
      var tr = el('tr'); var td = el('td', 'health-empty', 'No Lighthouse runs yet. The daily audit adds them each morning.'); td.colSpan = 8; tr.appendChild(td); tb.replaceChildren(tr);
    } else {
      tb.replaceChildren();
      h.lighthouse.forEach(function (l) {
        var tr = el('tr');
        var th = el('th', null, l.page); th.scope = 'row'; tr.appendChild(th);
        [l.performance, l.accessibility, l.best_practices, l.seo].forEach(function (n) { tr.appendChild(scoreCell(n)); });
        tr.appendChild(el('td', null, l.lcp_ms != null ? fmt('LCP', l.lcp_ms) : '—'));
        tr.appendChild(el('td', null, l.cls != null ? l.cls.toFixed(3) : '—'));
        tr.appendChild(el('td', null, ago(l.at)));
        tb.appendChild(tr);
      });
    }

    // ---- accessibility ----
    var a11y = $('health-a11y');
    if (!(h.accessibility || []).length) empty(a11y, 'No accessibility runs yet. The daily audit adds them each morning.');
    else {
      a11y.replaceChildren();
      h.accessibility.forEach(function (a) {
        var c = a.axe_counts || {};
        var serious = (c.critical || 0) + (c.serious || 0);
        var t = tile(a.page, a.passed ? 'Pass ✅' : 'Issues', '', a.passed ? 'good' : serious ? 'poor' : 'needs-improvement');
        var ul = el('ul', 'h-list');
        ul.appendChild(el('li', null, 'axe: ' + (Object.keys(c).length ? Object.keys(c).map(function (k) { return c[k] + ' ' + k; }).join(', ') : 'no issues')));
        ul.appendChild(el('li', null, 'Keyboard: ' + a.keyboard.tab_stops + ' stops, skip link first ' + (a.keyboard.skip_link_first ? '✅' : '❌') + ', focus visible ' + (a.keyboard.missing_focus_style.length ? '❌ ' + a.keyboard.missing_focus_style.length + ' gaps' : '✅')));
        ul.appendChild(el('li', null, 'Structure: ' + a.structure.h1_count + ' h1, ' + a.structure.skipped_heading_levels + ' skipped heading levels, landmarks ' + a.structure.landmarks.join(', ')));
        (a.axe_violations || []).slice(0, 3).forEach(function (v) { ul.appendChild(el('li', 'h-issue', v.impact + ': ' + v.help)); });
        t.appendChild(ul);
        t.appendChild(el('span', 'h-sub', 'Tested ' + ago(a.at)));
        a11y.appendChild(t);
      });
    }

    // ---- CSP + errors as simple lists ----
    function list(target, rows, render, none) {
      if (!rows.length) { empty(target, none); return; }
      var ul = el('ul', 'h-rows');
      rows.forEach(function (r) { ul.appendChild(render(r)); });
      target.replaceChildren(ul);
    }
    list($('health-csp'), h.csp_violations || [], function (r) {
      var li = el('li'); li.appendChild(el('b', null, r.blocked)); li.appendChild(el('span', null, ' blocked by ' + r.directive));
      li.appendChild(el('span', 'h-n', r.n + '×')); return li;
    }, 'Nothing blocked in the last 7 days. 🎉');
    list($('health-errors'), h.client_errors || [], function (r) {
      var li = el('li');
      if (r.message.indexOf('[chaos]') === 0) li.appendChild(el('span', 'test-tag', 'chaos'));
      li.appendChild(el('b', null, ' ' + r.message.replace(/^\[chaos\]\s*/, '')));
      li.appendChild(el('span', null, ' on ' + r.page + (r.file ? ' (' + r.file + ':' + r.line + ')' : '')));
      li.appendChild(el('span', 'h-n', r.n + '×')); return li;
    }, 'No JavaScript errors in the last 7 days. 🎉');
  }).catch(function () {
    $('health-updated').textContent = 'Couldn’t load the health data right now.';
  });
})();
