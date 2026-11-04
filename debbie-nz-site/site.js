/* debbie.nz — shared page behaviour: search, shop teaser, error reporting, Core Web Vitals. */
(function () {
  'use strict';
  var dl = (window.dataLayer = window.dataLayer || []);

  // ---------- search + shop teaser ----------
  var search = document.getElementById('site-search');
  if (search) search.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && this.value.trim().length > 0) dl.push({ event: 'search', search_term: this.value.trim() });
  });
  var shop = document.getElementById('shop-teaser');
  if (shop) shop.addEventListener('click', function (e) {
    e.preventDefault();
    dl.push({ event: 'shop_teaser_click' });
    alert('The test shop is being built — check back soon.');
  });

  function beacon(path, payload) {
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon('/api/' + path, new Blob([body], { type: 'application/json' }))) return;
    } catch (e) {}
    fetch('/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
  }

  // ---------- old-school hit counter (one visit per browser session; nothing about the visitor is sent) ----------
  var hc = document.querySelector('[data-hit-counter]');
  if (hc) {
    var counted = false;
    try { counted = sessionStorage.getItem('dn_hit') === '1'; } catch (e) {}
    fetch('/api/hits', { method: counted ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || typeof d.total !== 'number') return;
        try { sessionStorage.setItem('dn_hit', '1'); } catch (e) {}
        var digits = String(d.total).padStart(7, '0');
        var odo = hc.querySelector('[data-hit-digits]');
        odo.textContent = '';
        digits.split('').forEach(function (ch) { var s = document.createElement('span'); s.textContent = ch; odo.appendChild(s); });
        hc.querySelector('[data-hit-sr]').textContent = d.total.toLocaleString('en-NZ');
        hc.hidden = false;
      }).catch(function () {});
  }

  // ---------- JavaScript error reporting (essential: keeps the site working; no personal data) ----------
  // Sends only the message, file and line — never form contents, URLs with query strings, or anything about the visitor.
  var sent = 0, seen = {};
  function reportError(msg, src, line) {
    msg = String(msg || '').slice(0, 300);
    var key = msg + '|' + src + '|' + line;
    if (sent >= 5 || seen[key] || /extension:\/\/|ResizeObserver loop/.test(msg + src)) return;
    seen[key] = 1; sent++;
    var file = '';
    try { var u = new URL(src || '', location.href); file = u.origin === location.origin ? u.pathname : u.hostname; } catch (e) {}
    beacon('client-error', { page: location.pathname, message: msg, file: file, line: line || 0 });
  }
  window.addEventListener('error', function (e) { if (e.message) reportError(e.message, e.filename, e.lineno); });
  window.addEventListener('unhandledrejection', function (e) {
    reportError('Unhandled promise: ' + (e.reason && (e.reason.message || e.reason)), location.href, 0);
  });

  // ---------- Core Web Vitals (only with analytics consent) ----------
  function analyticsAllowed() {
    var c = window.dnConsent && window.dnConsent.get();
    return !!(c && c.analytics);
  }
  function startVitals() {
    if (startVitals.done || !analyticsAllowed()) return;
    startVitals.done = true;
    var s = document.createElement('script');
    s.src = '/vendor/web-vitals.iife.js';
    s.onload = function () {
      var wv = window.webVitals;
      if (!wv) return;
      var report = function (m) {
        var device = window.matchMedia('(max-width: 680px)').matches ? 'mobile' : 'desktop';
        dl.push({ event: 'web_vitals', metric_name: m.name, metric_value: Math.round(m.name === 'CLS' ? m.value * 1000 : m.value), metric_rating: m.rating });
        beacon('vitals', { page: location.pathname, metric: m.name, value: m.value, rating: m.rating, device: device });
      };
      wv.onLCP(report); wv.onINP(report); wv.onCLS(report); wv.onFCP(report); wv.onTTFB(report);
    };
    document.head.appendChild(s);
  }
  startVitals();
  window.addEventListener('dn:consent', startVitals);
})();
