/*!
 * debbie.nz — consent management (Google Consent Mode v2)
 * Load this BEFORE the GTM snippet on every page:  <script src="/consent.js"></script>
 *
 * - Everything except essentials starts OFF until the visitor chooses.
 * - Browsers sending Global Privacy Control keep marketing off.
 * - The choice is kept in this browser only (localStorage), for 12 months.
 * - Pushes `consent_update` to the dataLayer so GTM can react.
 */
(function () {
  'use strict';
  var KEY = 'dn_consent_v1';
  var MAX_AGE = 365 * 24 * 60 * 60 * 1000;
  var dl = (window.dataLayer = window.dataLayer || []);
  function gtag() { dl.push(arguments); }
  window.gtag = window.gtag || gtag;
  var gpc = navigator.globalPrivacyControl === true;

  function read() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY));
      if (c && Date.now() - c.ts < MAX_AGE) return c;
    } catch (e) {}
    return null;
  }
  function toGoogle(c) {
    var ads = c.marketing && !gpc ? 'granted' : 'denied';
    return {
      analytics_storage: c.analytics ? 'granted' : 'denied',
      ad_storage: ads, ad_user_data: ads, ad_personalization: ads,
      functionality_storage: 'granted', security_storage: 'granted'
    };
  }

  // Defaults: off until chosen
  var defaults = toGoogle({ analytics: false, marketing: false });
  defaults.wait_for_update = 500;
  gtag('consent', 'default', defaults);
  gtag('set', 'ads_data_redaction', true);

  var saved = read();
  if (saved) {
    gtag('consent', 'update', toGoogle(saved));
    dl.push({ event: 'consent_update', consent_analytics: !!saved.analytics, consent_marketing: !!(saved.marketing && !gpc), consent_source: 'stored' });
  }

  function save(c, source) {
    c = { analytics: !!c.analytics, marketing: !!(c.marketing && !gpc), ts: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
    gtag('consent', 'update', toGoogle(c));
    dl.push({ event: 'consent_update', consent_analytics: c.analytics, consent_marketing: c.marketing, consent_source: source || 'banner' });
    saved = c;
    try { window.dispatchEvent(new CustomEvent('dn:consent', { detail: c })); } catch (e) {}
    closeBanner();
    syncControls();
  }

  // ---------- banner ----------
  var banner;
  function closeBanner() { if (banner) { banner.remove(); banner = null; } }
  function openBanner() {
    if (banner) return;
    banner = document.createElement('div');
    banner.className = 'consent';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Cookie choices');
    banner.innerHTML =
      '<p class="consent-title">🍪 Only the tasty kind of cookies?</p>' +
      '<p>I use Google Analytics to see which posts are useful. It stays off unless you say yes. ' +
      '<a href="/privacy#consent">Privacy &amp; cookies</a></p>' +
      '<div class="consent-actions">' +
      '<button type="button" class="consent-yes">Sounds good</button>' +
      '<button type="button" class="consent-no">Just the essentials</button>' +
      '</div>';
    document.body.appendChild(banner);
    banner.querySelector('.consent-yes').addEventListener('click', function () { save({ analytics: true, marketing: true }, 'banner_accept'); });
    banner.querySelector('.consent-no').addEventListener('click', function () { save({ analytics: false, marketing: false }, 'banner_essential'); });
  }

  // ---------- controls on the privacy page ----------
  function syncControls() {
    var a = document.getElementById('consent-analytics'), m = document.getElementById('consent-marketing');
    var s = document.getElementById('consent-status');
    if (a) a.checked = !!(saved && saved.analytics);
    if (m) { m.checked = !!(saved && saved.marketing); m.disabled = gpc; }
    if (s) s.textContent = saved
      ? 'Saved ' + new Date(saved.ts).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) + '.'
      : 'You haven’t chosen yet, so everything optional is off.';
    var g = document.getElementById('consent-gpc');
    if (g) g.hidden = !gpc;
  }

  window.dnConsent = { open: openBanner, get: function () { return saved; }, set: save };

  function init() {
    document.querySelectorAll('[data-consent-open]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); closeBanner(); openBanner(); });
    });
    var form = document.getElementById('consent-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        save({ analytics: form.elements.analytics.checked, marketing: form.elements.marketing.checked }, 'privacy_page');
        var s = document.getElementById('consent-status'); if (s) s.textContent = 'Saved — thank you! 💛';
      });
    }
    syncControls();
    if (!saved && !form) openBanner();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
