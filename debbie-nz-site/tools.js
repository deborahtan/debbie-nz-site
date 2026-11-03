/* debbie.nz test-bench tools, on every page:
   1. dataLayer viewer  — a friendlier Omnibug: live events, categories, validation hints, search, JSON tree, copy
   2. Chaos gremlin     — a small red button that deliberately breaks tracking for 30 seconds, then fixes it
   3. Welcome back      — a time-of-day greeting for returning visitors */
(function () {
  'use strict';
  var dl = (window.dataLayer = window.dataLayer || []);
  var T0 = performance.now();
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // =====================================================================
  // 1. dataLayer viewer
  // =====================================================================
  var ECOM = ['view_item_list', 'select_item', 'view_item', 'add_to_wishlist', 'add_to_cart', 'remove_from_cart', 'view_cart',
    'begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase', 'refund', 'view_promotion', 'select_promotion'];
  var entries = [], paused = false, filter = 'all', query = '', showGtm = false, seenTx = {};

  function categorise(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && typeof raw.length === 'number' && raw[0] !== undefined) {
      // gtag() arguments object
      var a = Array.prototype.slice.call(raw);
      return { cat: a[0] === 'consent' ? 'consent' : 'gtag', name: 'gtag: ' + a.slice(0, 2).join(' '), data: a };
    }
    var name = raw && raw.event ? String(raw.event) : '(no event — data push)';
    var cat = !raw || !raw.event ? 'data' : /^gtm\./.test(name) ? 'gtm' : ECOM.indexOf(name) >= 0 ? 'ecommerce'
      : name === 'consent_update' ? 'consent' : raw.chaos_mode || /^chaos_/.test(name) ? 'chaos' : 'custom';
    if (raw && raw.chaos_mode) cat = 'chaos';
    return { cat: cat, name: name, data: raw };
  }

  function validate(c) {
    var w = [], d = c.data;
    if (!d || typeof d !== 'object' || Array.isArray(d)) return w;
    var name = d.event;
    if (name && name.length > 40) w.push('Event name is over 40 characters; GA4 will reject it.');
    if (name && !/^gtm\./.test(name) && !/^[a-z][a-z0-9_]*$/.test(name)) w.push('Event name isn\'t snake_case ("' + name + '").');
    var json = JSON.stringify(d);
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(json)) w.push('Looks like an email address (personal data) in the dataLayer.');
    if (ECOM.indexOf(name) >= 0) {
      var e = d.ecommerce;
      if (!e) { w.push('Ecommerce event without an ecommerce object.'); return w; }
      var promo = name === 'view_promotion' || name === 'select_promotion';
      if (!promo && (!Array.isArray(e.items) || !e.items.length)) w.push('items[] is missing or empty.');
      if (e.value !== undefined && typeof e.value !== 'number') w.push('value should be a number, not ' + typeof e.value + '.');
      if (e.value !== undefined && !e.currency) w.push('value is set but currency is missing.');
      (e.items || []).forEach(function (it, i) {
        if (!it.item_id && !it.item_name) w.push('Item ' + (i + 1) + ' has neither item_id nor item_name.');
        if (it.price !== undefined && typeof it.price !== 'number') w.push('Item ' + (i + 1) + ' price is a ' + typeof it.price + '.');
      });
      if ((name === 'purchase' || name === 'refund') && !e.transaction_id) w.push(name + ' needs a transaction_id.');
      if (name === 'purchase' && e.transaction_id) {
        if (seenTx[e.transaction_id]) w.push('Duplicate purchase: ' + e.transaction_id + ' already fired on this page.');
        seenTx[e.transaction_id] = true;
      }
    }
    return w;
  }

  function capture(raw) {
    var c = categorise(raw);
    c.t = Math.round(performance.now() - T0);
    c.warnings = validate(c);
    try { c.json = JSON.stringify(c.data, null, 2); } catch (e) { c.json = String(c.data); }
    entries.push(c);
    if (entries.length > 500) entries.shift();
    updateBadge();
    if (!paused && panel && !panel.hidden) renderList();
  }
  dl.slice().forEach(capture);
  var origPush = dl.push;
  dl.push = function () {
    var r = origPush.apply(dl, arguments);
    for (var i = 0; i < arguments.length; i++) capture(arguments[i]);
    return r;
  };
  // GTM swaps in its own push when it loads; re-wrap so the viewer keeps listening
  var wrapped = dl.push;
  setInterval(function () {
    if (dl.push !== wrapped && !(window.dnChaos && window.dnChaos.active())) {
      var gtmPush = dl.push;
      dl.push = function () { var r = gtmPush.apply(dl, arguments); for (var i = 0; i < arguments.length; i++) capture(arguments[i]); return r; };
      wrapped = dl.push;
    }
  }, 1000);

  var dock = el('div', 'tb-dock');
  var launch = el('button', 'tb-launch'); launch.type = 'button';
  launch.setAttribute('aria-expanded', 'false'); launch.setAttribute('aria-controls', 'tb-panel');
  launch.innerHTML = '<span aria-hidden="true">🔍</span> dataLayer <span class="tb-badge">0</span>';
  var panel, listEl, detailEl, countEl;
  updateBadge();

  function updateBadge() {
    if (!launch) return; // entries captured before the button exists are counted once it's built
    var n = entries.filter(function (e) { return e.cat !== 'gtm'; }).length;
    var warn = entries.some(function (e) { return e.warnings.length; });
    var b = launch.querySelector('.tb-badge'); b.textContent = n; b.classList.toggle('warn', warn);
  }

  function buildPanel() {
    panel = el('section', 'tb-panel'); panel.id = 'tb-panel'; panel.hidden = true;
    panel.setAttribute('aria-label', 'dataLayer viewer');
    var head = el('div', 'tb-head');
    var h = el('h2', null, 'dataLayer'); countEl = el('span', 'tb-count');
    h.appendChild(countEl); head.appendChild(h);
    var consent = el('span', 'tb-consent'); head.appendChild(consent);
    var acts = el('div', 'tb-acts');
    var pauseBtn = el('button', 'tb-btn', 'Pause'); pauseBtn.type = 'button'; pauseBtn.setAttribute('aria-pressed', 'false');
    var clearBtn = el('button', 'tb-btn', 'Clear'); clearBtn.type = 'button';
    var closeBtn = el('button', 'tb-btn tb-close', '✕'); closeBtn.type = 'button'; closeBtn.setAttribute('aria-label', 'Close dataLayer viewer');
    acts.appendChild(pauseBtn); acts.appendChild(clearBtn); acts.appendChild(closeBtn); head.appendChild(acts);
    panel.appendChild(head);

    var tools = el('div', 'tb-tools');
    var search = el('input', 'tb-search'); search.type = 'search'; search.placeholder = 'Search events and values…'; search.setAttribute('aria-label', 'Search the dataLayer');
    tools.appendChild(search);
    var chips = el('div', 'tb-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Filter');
    ['all', 'ecommerce', 'custom', 'consent', 'chaos', 'warnings'].forEach(function (f) {
      var c = el('button', 'tb-chip cat-' + f, f); c.type = 'button'; c.setAttribute('aria-pressed', f === 'all' ? 'true' : 'false');
      c.addEventListener('click', function () { filter = f; chips.querySelectorAll('.tb-chip').forEach(function (x) { x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); }); renderList(); });
      chips.appendChild(c);
    });
    var gtmToggle = el('label', 'tb-gtm'); var cb = el('input'); cb.type = 'checkbox';
    gtmToggle.appendChild(cb); gtmToggle.appendChild(document.createTextNode(' show gtm.*'));
    cb.addEventListener('change', function () { showGtm = cb.checked; renderList(); });
    chips.appendChild(gtmToggle);
    tools.appendChild(chips);
    panel.appendChild(tools);

    var body = el('div', 'tb-body');
    listEl = el('ol', 'tb-list'); body.appendChild(listEl);
    detailEl = el('div', 'tb-detail'); detailEl.hidden = true; body.appendChild(detailEl);
    panel.appendChild(body);

    search.addEventListener('input', function () { query = search.value.toLowerCase(); renderList(); });
    pauseBtn.addEventListener('click', function () { paused = !paused; pauseBtn.setAttribute('aria-pressed', String(paused)); pauseBtn.textContent = paused ? 'Resume' : 'Pause'; if (!paused) renderList(); });
    clearBtn.addEventListener('click', function () { entries = []; seenTx = {}; detailEl.hidden = true; updateBadge(); renderList(); });
    closeBtn.addEventListener('click', toggle);
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggle(); });
    document.body.appendChild(panel);

    function consentState() {
      var c = window.dnConsent && window.dnConsent.get();
      consent.replaceChildren(
        el('span', 'tb-pill ' + (c && c.analytics ? 'on' : 'off'), 'analytics ' + (c && c.analytics ? '✓' : '✗')),
        el('span', 'tb-pill ' + (c && c.marketing ? 'on' : 'off'), 'ads ' + (c && c.marketing ? '✓' : '✗')));
    }
    consentState(); window.addEventListener('dn:consent', consentState);
  }

  function summary(c) {
    var d = c.data, bits = [];
    if (d && d.ecommerce) {
      if (d.ecommerce.value !== undefined) bits.push((d.ecommerce.currency || '') + ' ' + d.ecommerce.value);
      if (d.ecommerce.items) bits.push(d.ecommerce.items.length + ' item' + (d.ecommerce.items.length === 1 ? '' : 's'));
      if (d.ecommerce.transaction_id) bits.push(d.ecommerce.transaction_id);
    } else if (d && typeof d === 'object' && !Array.isArray(d)) {
      Object.keys(d).filter(function (k) { return k !== 'event' && k !== 'gtm.uniqueEventId'; }).slice(0, 3).forEach(function (k) {
        var v = d[k]; if (v !== undefined && typeof v !== 'object') bits.push(k + ': ' + String(v).slice(0, 24));
      });
    } else if (Array.isArray(d) && d[2]) {
      bits.push(Object.keys(d[2]).map(function (k) { return k.replace('_storage', '') + '=' + d[2][k]; }).slice(0, 3).join(' '));
    }
    return bits.join(' · ');
  }

  function renderList() {
    if (!listEl) return;
    var shown = entries.filter(function (c) {
      if (c.cat === 'gtm' && !showGtm) return false;
      if (filter === 'warnings' && !c.warnings.length) return false;
      if (filter !== 'all' && filter !== 'warnings' && c.cat !== filter) return false;
      return !query || (c.name + ' ' + c.json).toLowerCase().indexOf(query) >= 0;
    });
    countEl.textContent = ' ' + shown.length;
    listEl.replaceChildren();
    shown.slice().reverse().forEach(function (c) {
      var li = el('li', 'tb-item cat-' + c.cat);
      var b = el('button', 'tb-row'); b.type = 'button';
      b.appendChild(el('span', 'tb-name', c.name));
      if (c.warnings.length) b.appendChild(el('span', 'tb-warn', '⚠ ' + c.warnings.length));
      b.appendChild(el('span', 'tb-time', (c.t / 1000).toFixed(2) + 's'));
      var s = summary(c); if (s) b.appendChild(el('span', 'tb-sum', s));
      b.addEventListener('click', function () { showDetail(c); });
      li.appendChild(b); listEl.appendChild(li);
    });
    if (!shown.length) listEl.appendChild(el('li', 'tb-empty', 'Nothing yet. Click around — events appear here live.'));
  }

  function highlight(json) {
    var frag = document.createDocumentFragment();
    var re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi, last = 0, m;
    while ((m = re.exec(json))) {
      if (m.index > last) frag.appendChild(document.createTextNode(json.slice(last, m.index)));
      var cls = m[1] ? (m[2] ? 'k' : 's') : m[3] ? 'b' : 'n';
      frag.appendChild(el('span', 'j-' + cls, m[1] || m[3] || m[4]));
      if (m[2]) frag.appendChild(document.createTextNode(m[2]));
      last = re.lastIndex;
    }
    frag.appendChild(document.createTextNode(json.slice(last)));
    return frag;
  }

  function showDetail(c) {
    detailEl.hidden = false; detailEl.replaceChildren();
    var top = el('div', 'tb-dhead');
    top.appendChild(el('b', null, c.name));
    var copy = el('button', 'tb-btn', 'Copy JSON'); copy.type = 'button';
    copy.addEventListener('click', function () { navigator.clipboard && navigator.clipboard.writeText(c.json).then(function () { copy.textContent = 'Copied 💕'; setTimeout(function () { copy.textContent = 'Copy JSON'; }, 1500); }); });
    var back = el('button', 'tb-btn', '← Back'); back.type = 'button';
    back.addEventListener('click', function () { detailEl.hidden = true; });
    top.appendChild(copy); top.appendChild(back);
    detailEl.appendChild(top);
    if (c.warnings.length) {
      var ul = el('ul', 'tb-warnings');
      c.warnings.forEach(function (w) { ul.appendChild(el('li', null, '⚠ ' + w)); });
      detailEl.appendChild(ul);
    }
    var pre = el('pre', 'tb-json'); pre.appendChild(highlight(c.json)); detailEl.appendChild(pre);
    back.focus();
  }

  function toggle() {
    if (!panel) buildPanel();
    panel.hidden = !panel.hidden;
    dock.classList.toggle("panel-open", !panel.hidden);
    launch.setAttribute('aria-expanded', String(!panel.hidden));
    try { sessionStorage.setItem('tb_open', panel.hidden ? '0' : '1'); } catch (e) {}
    if (!panel.hidden) { renderList(); panel.querySelector('.tb-search').focus(); dl.push({ event: 'datalayer_viewer_open' }); }
    else launch.focus();
  }
  launch.addEventListener('click', toggle);

  // =====================================================================
  // 2. Chaos gremlin
  // =====================================================================
  var CHAOS_MS = 30000, chaosUntil = 0, chaosTimers = [], prePush = null;
  var gremlin = el('button', 'tb-gremlin'); gremlin.type = 'button';
  gremlin.setAttribute('aria-label', 'Chaos gremlin: deliberately break tracking for 30 seconds');
  gremlin.title = 'Chaos gremlin: breaks tracking for 30 seconds';
  gremlin.innerHTML = '<span aria-hidden="true">😈</span>';
  var chaosStatus = el('p', 'tb-chaos-status'); chaosStatus.setAttribute('role', 'status');

  // the button lives in a little spot with a speech bubble; it explodes on click and comes back after 30s
  var gSpot = el('div', 'tb-gspot');
  var bubble = el('p', 'tb-bubble');
  bubble.setAttribute('aria-hidden', 'true'); // the button's own label says the same thing to screen readers
  bubble.innerHTML = '<b>Press me!</b> I am chaos mode. I break the site on purpose for 30 seconds so there\'s debugging data to look at.';
  var bubbleX = el('button', 'tb-bubble-x', '✕'); bubbleX.type = 'button'; bubbleX.setAttribute('aria-label', 'Hide the chaos mode speech bubble');
  bubbleX.addEventListener('click', function () { gSpot.classList.add('bubble-off'); save('dn_bubble_off', true); });
  bubble.appendChild(bubbleX);
  if (load('dn_bubble_off', false)) gSpot.classList.add('bubble-off');
  var countdown = el('span', 'tb-countdown'); countdown.setAttribute('aria-hidden', 'true');
  gSpot.appendChild(bubble); gSpot.appendChild(gremlin); gSpot.appendChild(countdown);

  function explode() {
    var boom = el('span', 'tb-boom'); boom.setAttribute('aria-hidden', 'true');
    boom.appendChild(el('span', 'tb-boom-flash'));
    boom.appendChild(el('span', 'tb-boom-word', 'KABOOM!'));
    var bits = ['💥', '✨', '⭐', '💗', '🔩', '🧷', '🌸', '⚡', '🍬', '🔧', '💫', '🎀'];
    bits.forEach(function (b, i) {
      var a = (i / bits.length) * Math.PI * 2 + Math.random() * .4, d = 70 + Math.random() * 60;
      var piece = el('span', 'tb-bit', b);
      piece.style.setProperty('--dx', Math.round(Math.cos(a) * d) + 'px');
      piece.style.setProperty('--dy', Math.round(Math.sin(a) * d - 30) + 'px');
      piece.style.setProperty('--r', Math.round(Math.random() * 720 - 360) + 'deg');
      boom.appendChild(piece);
    });
    gSpot.appendChild(boom);
    gSpot.classList.add('is-exploding');
    setTimeout(function () { gSpot.classList.remove('is-exploding'); gSpot.classList.add('is-gone'); }, 420);
    setTimeout(function () { boom.remove(); }, 1400);
  }
  function rebuild() {
    gSpot.classList.remove('is-gone', 'is-exploding');
    gSpot.classList.add('is-back');
    gSpot.classList.add('just-fixed'); // keep the bubble out of the way of the "Fixed" message
    setTimeout(function () { gSpot.classList.remove('is-back'); }, 900);
    setTimeout(function () { gSpot.classList.remove('just-fixed'); }, 4200);
  }

  window.dnChaos = { active: function () { return Date.now() < chaosUntil; } };

  function mangle(o, n) {
    // Each push gets a different, realistic kind of breakage
    var c = JSON.parse(JSON.stringify(o));
    c.chaos_mode = true;
    var kind = n % 5;
    if (c.ecommerce) {
      if (kind === 0) delete c.ecommerce.currency;
      if (kind === 1 && c.ecommerce.value !== undefined) c.ecommerce.value = String(c.ecommerce.value);
      if (kind === 2) (c.ecommerce.items || []).forEach(function (it) { it.price = '$' + it.price; delete it.item_id; });
      if (kind === 3) c.ecommerce.items = [];
    }
    if (kind === 4 && c.event) c.event = c.event.replace(/(^|_)(\w)/g, function (m, a, b) { return (a ? ' ' : '') + b.toUpperCase(); });
    return c;
  }

  function startChaos() {
    if (window.dnChaos.active()) return;
    chaosUntil = Date.now() + CHAOS_MS;
    explode();
    document.documentElement.classList.add('chaos');
    gremlin.setAttribute('aria-pressed', 'true');
    origPushRef().apply(dl, [{ event: 'chaos_start', chaos_mode: true, chaos_seconds: CHAOS_MS / 1000 }]);
    var n = 0;
    prePush = dl.push;
    dl.push = function () {
      var out = [];
      for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i];
        if (a && a.event && !/^gtm\./.test(a.event)) {
          var bad = mangle(a, n++);
          out.push(bad);
          if (n % 2) out.push(JSON.parse(JSON.stringify(bad))); // duplicate fire
        } else out.push(a);
      }
      return prePush.apply(dl, out);
    };
    // JavaScript errors (reported to Site health, tagged [chaos])
    chaosTimers.push(setInterval(function () {
      setTimeout(function () { throw new Error('[chaos] Gremlin chewed through the dataLayer'); });
    }, 6000));
    setTimeout(function () { Promise.reject(new Error('[chaos] Gremlin dropped a promise')); }, 1500);
    // A blocked third-party script → a Content Security Policy report
    var s = document.createElement('script'); s.src = 'https://gremlin-tracker.invalid/pixel.js'; s.async = true;
    s.onerror = function () { s.remove(); }; document.head.appendChild(s);
    // A request that 404s
    fetch('/api/gremlin-was-here').catch(function () {});
    // Countdown
    var tick = function () {
      var left = Math.ceil((chaosUntil - Date.now()) / 1000);
      if (left <= 0) return stopChaos();
      countdown.textContent = left + 's';
      chaosStatus.textContent = '😈 Chaos gremlin loose: tracking is deliberately broken for ' + left + ' more seconds.';
    };
    tick(); chaosTimers.push(setInterval(tick, 1000));
    chaosStatus.hidden = false;
  }
  function origPushRef() { return prePush || dl.push; }
  function stopChaos() {
    chaosTimers.forEach(clearInterval); chaosTimers = [];
    if (prePush) { dl.push = prePush; prePush = null; }
    chaosUntil = 0;
    document.documentElement.classList.remove('chaos');
    gremlin.setAttribute('aria-pressed', 'false');
    rebuild();
    dl.push({ event: 'chaos_end', chaos_mode: true });
    chaosStatus.textContent = '😇 Fixed. Everything is back to normal.';
    setTimeout(function () { chaosStatus.hidden = true; }, 4000);
  }
  gremlin.addEventListener('click', function () { if (!window.dnChaos.active()) startChaos(); });

  // =====================================================================
  // 3. Welcome back
  // =====================================================================
  function greet() {
    var v = load('dn_visits', null), now = Date.now();
    if (!v) { save('dn_visits', { count: 1, last: now }); return; }
    var newVisit = now - v.last > 30 * 60 * 1000;
    if (newVisit) v.count++;
    v.last = now; save('dn_visits', v);
    if (!newVisit) return;
    var h = new Date().getHours();
    var part = h >= 5 && h < 11 ? ['morning', 'Mōrena', '☀️'] : h < 14 ? ['midday', 'Kia ora', '🌿'] : h < 17 ? ['afternoon', 'Good afternoon', '🍵']
      : h < 22 ? ['evening', 'Good evening', '🌙'] : ['night', 'Hello, night owl', '🦉'];
    var visitor = load('otp_visitor', null) || (function () { try { return localStorage.getItem('otp_visitor'); } catch (e) { return null; } })();
    var show = function (name) {
      var t = el('div', 'tb-welcome'); t.setAttribute('role', 'status');
      t.appendChild(el('span', null, part[1] + (name ? ', ' + name : '') + '! ' + part[2] + ' Welcome back. Visit #' + v.count + '.'));
      var x = el('button', 'tb-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Dismiss greeting');
      x.addEventListener('click', function () { t.remove(); });
      t.appendChild(x);
      var ribbon = document.querySelector('.ribbon');
      (ribbon || document.querySelector('nav')).insertAdjacentElement('afterend', t);
      setTimeout(function () { t.classList.add('bye'); setTimeout(function () { t.remove(); }, 400); }, 9000);
      dl.push({ event: 'welcome_back', visit_count: v.count, day_part: part[0] });
    };
    if (visitor) fetch('/api/me?v=' + encodeURIComponent(visitor)).then(function (r) { return r.json(); })
      .then(function (j) { show(j.name); }, function () { show(''); });
    else show('');
  }

  function mount() {
    dock.appendChild(gSpot); dock.appendChild(launch);
    document.body.appendChild(dock);
    chaosStatus.hidden = true; document.body.appendChild(chaosStatus);
    try { if (sessionStorage.getItem('tb_open') === '1') toggle(); } catch (e) {}
    greet();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
