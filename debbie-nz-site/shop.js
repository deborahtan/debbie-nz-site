/* The (not set) Shop — a fully fake store for testing GA4 ecommerce tracking.
   Nothing leaves the browser except dataLayer events. Card numbers are never stored or pushed anywhere. */
(function () {
  'use strict';
  var dataEl = document.getElementById('shop-data');
  if (!dataEl) return;
  var SHOP = JSON.parse(dataEl.textContent);
  var dl = (window.dataLayer = window.dataLayer || []);
  var main = document.querySelector('[data-shop-page]');
  var PAGE = main.getAttribute('data-shop-page');
  var CUR = SHOP.currency;
  var BY_ID = {};
  SHOP.products.forEach(function (p, i) { p.index = i + 1; BY_ID[p.id] = p; });

  // ---------- helpers ----------
  function r2(n) { return Math.round(n * 100) / 100; }
  function money(n) { return '$' + r2(n).toFixed(2); }
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function track(event, ecommerce, extra) {
    dl.push({ ecommerce: null }); // clear the previous ecommerce object, as Google recommends
    var o = { event: event, test_store: true, ecommerce: Object.assign({ currency: CUR }, ecommerce) };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    dl.push(o);
  }
  function trackSimple(event, params) {
    var o = { event: event, test_store: true };
    Object.keys(params || {}).forEach(function (k) { o[k] = params[k]; });
    dl.push(o);
  }

  function variantOf(p, vid) {
    if (!p.variants || !vid) return null;
    return p.variants.options.filter(function (o) { return o.id === vid; })[0] || null;
  }
  function gaItem(line, extra) {
    var p = BY_ID[line.id], v = variantOf(p, line.variant);
    var it = {
      item_id: p.id, item_name: p.name, item_brand: SHOP.name, affiliation: SHOP.name + ' (test)',
      item_category: p.category, item_category2: p.category2 || undefined,
      item_variant: v ? v.label : (line.custom ? line.custom : undefined),
      price: r2(line.price), quantity: line.qty || 1, index: p.index
    };
    if (extra) Object.keys(extra).forEach(function (k) { it[k] = extra[k]; });
    Object.keys(it).forEach(function (k) { if (it[k] === undefined) delete it[k]; });
    return it;
  }

  // ---------- cart ----------
  function cart() { return load('dn_cart', []); }
  function setCart(c) { save('dn_cart', c); updateCount(); }
  function updateCount() {
    var n = cart().reduce(function (s, l) { return s + l.qty; }, 0);
    document.querySelectorAll('[data-cart-count]').forEach(function (e) { e.textContent = n; });
  }
  function lineKey(l) { return l.id + '|' + (l.variant || '') + '|' + (l.custom || ''); }
  function coupon() { return load('dn_coupon', null); }

  function totals(c, shipId) {
    var sub = c.reduce(function (s, l) { return s + l.price * l.qty; }, 0);
    var cp = coupon(), cdef = cp && SHOP.coupons[cp];
    var discount = cdef && cdef.type === 'percent' ? r2(sub * cdef.value / 100) : 0;
    var digitalOnly = c.length > 0 && c.every(function (l) { return BY_ID[l.id].digital; });
    var shipping = 0, ship = null;
    if (!digitalOnly && c.length) {
      ship = SHOP.shipping.filter(function (s) { return s.id === (shipId || 'standard'); })[0] || SHOP.shipping[0];
      shipping = ship.price;
      if (ship.free_over && sub - discount >= ship.free_over) shipping = 0;
      if (cdef && cdef.type === 'free_shipping') shipping = 0;
    }
    var value = r2(sub - discount + shipping);
    return { subtotal: r2(sub), discount: discount, shipping: r2(shipping), ship: ship, value: value,
      tax: r2(value * 3 / 23), coupon: cdef && cdef.type !== 'invalid' ? cp : undefined, digitalOnly: digitalOnly };
  }

  // ---------- psych modal (coffee + tip jar) ----------
  function psych(p) {
    trackSimple('psych_reveal', { item_id: p.id, item_name: p.name });
    var m = el('div', 'modal'); m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'psych-h');
    var card = el('div', 'modal-card psych');
    var h = el('h2', null, p.psych_title); h.id = 'psych-h';
    card.appendChild(h); card.appendChild(el('p', null, p.psych_message));
    var ok = el('button', 'btn-primary', 'Ha, fair enough 💛'); ok.type = 'button';
    var acts = el('div', 'modal-actions'); acts.appendChild(ok); card.appendChild(acts);
    m.appendChild(card); document.body.appendChild(m);
    var prev = document.activeElement;
    ok.focus();
    function close() { m.remove(); if (prev) prev.focus(); }
    ok.addEventListener('click', close);
    m.addEventListener('keydown', function (e) { if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); if (e.key === 'Escape') close(); } });
  }

  // ---------- pages ----------
  function listPage() {
    var list = $('.products');
    var items = Array.prototype.map.call(list.querySelectorAll('.product'), function (li) {
      return gaItem({ id: li.getAttribute('data-item-id'), price: BY_ID[li.getAttribute('data-item-id')].price, qty: 1 },
        { item_list_id: 'shop_all', item_list_name: 'All products' });
    });
    track('view_item_list', { item_list_id: 'shop_all', item_list_name: 'All products', items: items });
    list.addEventListener('click', function (e) {
      var a = e.target.closest('[data-select-item]'); if (!a) return;
      var id = a.getAttribute('data-select-item');
      track('select_item', { item_list_id: 'shop_all', item_list_name: 'All products',
        items: [gaItem({ id: id, price: BY_ID[id].price, qty: 1 }, { item_list_id: 'shop_all', item_list_name: 'All products' })] });
    });
  }

  function promoBanner() {
    var pr = $('.promo'); if (!pr) return;
    var promo = { promotion_id: pr.getAttribute('data-promo-id'), promotion_name: pr.getAttribute('data-promo-name'), creative_name: pr.getAttribute('data-creative'), creative_slot: 'shop_top' };
    track('view_promotion', Object.assign({}, promo, { items: [] }));
    pr.addEventListener('click', function () { track('select_promotion', Object.assign({}, promo, { items: [] })); save('dn_coupon', 'CONSENT10'); });
  }

  function productPage() {
    var id = $('.pdp').getAttribute('data-item-id'), p = BY_ID[id];
    var form = $('.pdp-form'), status = $('.form-status', form), priceLabel = $('[data-price-label]');
    function current() {
      var v = form.querySelector('input[name=variant]:checked');
      var price = p.price;
      if (v) price = Number(v.getAttribute('data-price'));
      if (p.pay_what_you_want) price = Math.max(1, Math.min(500, Number(form.elements.amount.value) || p.price));
      var qty = Math.max(1, Math.min(10, parseInt(form.elements.qty.value, 10) || 1));
      var custom = form.elements.custom_text ? form.elements.custom_text.value.trim().replace(/[^\w.\-]/g, '_').slice(0, 40) : '';
      return { id: id, variant: v ? v.value : '', custom: custom, price: r2(price), qty: qty };
    }
    track('view_item', { value: p.price, items: [gaItem({ id: id, price: p.price, qty: 1 })] });
    form.addEventListener('change', function (e) {
      if (e.target.name === 'variant') priceLabel.textContent = money(current().price);
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (p.psych) { psych(p); return; }
      var line = current();
      if (p.custom_text && !line.custom) { status.className = 'form-status err'; status.textContent = 'Give your event a name first.'; form.elements.custom_text.focus(); return; }
      var c = cart(), k = lineKey(line), found = c.filter(function (l) { return lineKey(l) === k; })[0];
      if (found) found.qty = Math.min(10, found.qty + line.qty); else c.push(line);
      setCart(c);
      track('add_to_cart', { value: r2(line.price * line.qty), items: [gaItem(line)] }, p.custom_text && line.custom ? { adopted_event: line.custom } : null);
      status.className = 'form-status';
      status.innerHTML = '';
      status.appendChild(document.createTextNode('Added! '));
      var a = el('a', null, 'View cart →'); a.href = '/shop/cart'; status.appendChild(a);
    });
    var wl = $('[data-wishlist]');
    wl.addEventListener('click', function () {
      var on = wl.getAttribute('aria-pressed') !== 'true';
      wl.setAttribute('aria-pressed', on ? 'true' : 'false');
      wl.textContent = on ? '♥ Wishlisted' : '♡ Wishlist';
      if (on) track('add_to_wishlist', { value: current().price, items: [gaItem(current())] });
    });
  }

  function cartPage() {
    var root = $('#cart-root');
    function render(first) {
      var c = cart(); root.replaceChildren();
      if (!c.length) {
        var p = el('p', 'health-empty', 'Your cart is empty. '); var a = el('a', null, 'Go shopping →'); a.href = '/shop'; p.appendChild(a); root.appendChild(p); return;
      }
      var t = totals(c);
      if (first) track('view_cart', { value: t.value, items: c.map(function (l) { return gaItem(l); }) });
      var ul = el('ul', 'cart-lines');
      c.forEach(function (l, i) {
        var p = BY_ID[l.id], v = variantOf(p, l.variant);
        var li = el('li', 'cart-line');
        li.appendChild(el('span', 'cart-art', p.emoji));
        var info = el('div', 'cart-info');
        info.appendChild(el('b', null, p.name));
        if (v || l.custom) info.appendChild(el('span', 'hint', v ? v.label : 'Adopting: ' + l.custom));
        li.appendChild(info);
        var q = el('div', 'qty');
        var minus = el('button', 'qty-btn', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'One fewer ' + p.name);
        var n = el('span', 'qty-n', String(l.qty));
        var plus = el('button', 'qty-btn', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'One more ' + p.name);
        q.appendChild(minus); q.appendChild(n); q.appendChild(plus); li.appendChild(q);
        li.appendChild(el('span', 'cart-price', money(l.price * l.qty)));
        var rm = el('button', 'btn-link', 'Remove'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove ' + p.name); li.appendChild(rm);
        function change(delta) {
          var cc = cart(), line = cc[i];
          if (delta < 0 || line.qty + delta <= 10) {
            var one = Object.assign({}, line, { qty: Math.min(Math.abs(delta), line.qty) });
            line.qty += delta;
            track(delta > 0 ? 'add_to_cart' : 'remove_from_cart', { value: r2(one.price * one.qty), items: [gaItem(one)] });
            if (line.qty <= 0) cc.splice(i, 1);
            setCart(cc); render();
          }
        }
        plus.addEventListener('click', function () { change(1); });
        minus.addEventListener('click', function () { change(-1); });
        rm.addEventListener('click', function () { change(-cart()[i].qty); });
        ul.appendChild(li);
      });
      root.appendChild(ul);
      var sum = el('p', 'cart-total'); sum.appendChild(el('span', null, 'Subtotal ')); sum.appendChild(el('b', null, money(t.subtotal))); root.appendChild(sum);
      var go = el('a', 'btn-primary checkout-btn', 'Checkout →'); go.href = '/shop/checkout'; root.appendChild(go);
    }
    render(true);
  }

  // ---------- checkout ----------
  function luhn(num) {
    var sum = 0, alt = false;
    for (var i = num.length - 1; i >= 0; i--) {
      var d = +num[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } sum += d; alt = !alt;
    }
    return num.length >= 12 && sum % 10 === 0;
  }
  function sha256(str) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (h) {
      return Array.prototype.map.call(new Uint8Array(h), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }

  function checkoutPage() {
    var c = cart();
    var root = $('#checkout-root'), form = $('.checkout-form'), status = $('.checkout-form > .form-status');
    if (!c.length) {
      var p = el('p', 'health-empty', 'Your cart is empty, so there\'s nothing to check out. '); var a = el('a', null, 'Go shopping →'); a.href = '/shop';
      p.appendChild(a); root.replaceChildren(p); return;
    }
    var shipId = 'standard';
    var t0 = totals(c, shipId);
    track('begin_checkout', { value: t0.value, coupon: t0.coupon, items: c.map(function (l) { return gaItem(l); }) });
    if (t0.digitalOnly) { $('.ship-options').hidden = true; $('[data-digital-note]').hidden = false; }

    function renderSummary() {
      var t = totals(cart(), shipId);
      var lines = $('#summary-lines'); lines.replaceChildren();
      cart().forEach(function (l) {
        var li = el('li'); li.appendChild(el('span', null, BY_ID[l.id].emoji + ' ' + BY_ID[l.id].name + ' × ' + l.qty)); li.appendChild(el('b', null, money(l.price * l.qty))); lines.appendChild(li);
      });
      var dlist = $('#totals'); dlist.replaceChildren();
      [['Subtotal', money(t.subtotal)], t.discount ? ['Discount (' + t.coupon + ')', '−' + money(t.discount)] : null,
       t.digitalOnly ? null : ['Shipping', t.shipping ? money(t.shipping) : 'Free'], ['Total (incl. GST ' + money(t.tax) + ')', money(t.value)]]
        .filter(Boolean).forEach(function (row) { dlist.appendChild(el('dt', null, row[0])); dlist.appendChild(el('dd', null, row[1])); });
      document.querySelectorAll('[data-total]').forEach(function (e) { e.textContent = money(t.value); });
      return t;
    }
    renderSummary();

    // coupon
    var cf = $('.coupon'), cs = $('.form-status', cf);
    if (coupon()) cf.elements.coupon.value = coupon();
    cf.addEventListener('submit', function (e) {
      e.preventDefault();
      var code = cf.elements.coupon.value.trim().toUpperCase(), def = SHOP.coupons[code];
      if (!def || def.type === 'invalid') {
        trackSimple('coupon_error', { coupon: code || '(empty)', error_reason: def ? 'invalid_code' : 'unknown_code' });
        cs.className = 'form-status err'; cs.textContent = def ? def.message : 'That code doesn\'t exist.'; save('dn_coupon', null);
      } else {
        save('dn_coupon', code); trackSimple('coupon_apply', { coupon: code });
        cs.className = 'form-status'; cs.textContent = def.label + ' ✅';
      }
      renderSummary();
    });

    // steps
    function show(step) {
      form.querySelectorAll('.step').forEach(function (f) { f.hidden = f.getAttribute('data-step') !== step && !(f.getAttribute('data-step') === 'contact'); });
      var target = form.querySelector('[data-step="' + step + '"]');
      target.hidden = false;
      var first = target.querySelector('input, button'); if (first) first.focus();
    }
    form.addEventListener('change', function (e) {
      if (e.target.name === 'shipping') { shipId = e.target.value; renderSummary(); }
    });
    form.querySelector('[data-next="contact"]').addEventListener('click', function () {
      var em = form.elements.email.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { status.className = 'form-status err'; status.textContent = 'Add an email (a pretend one is fine).'; form.elements.email.focus(); return; }
      status.textContent = '';
      show('shipping');
    });
    form.querySelector('[data-next="shipping"]').addEventListener('click', function () {
      var t = renderSummary();
      if (!t.digitalOnly) track('add_shipping_info', { value: t.value, coupon: t.coupon, shipping_tier: t.ship.id, items: cart().map(function (l) { return gaItem(l); }) });
      show('payment');
    });
    form.querySelectorAll('[data-card]').forEach(function (b) {
      b.addEventListener('click', function () { form.elements.card.value = b.getAttribute('data-card'); form.elements.exp.value = '12 / 34'; form.elements.cvc.value = '123'; form.elements.card.focus(); });
    });

    function fail(paymentType, reason, msg) {
      trackSimple('payment_failed', { payment_type: paymentType, failure_reason: reason, value: totals(cart(), shipId).value, currency: CUR });
      status.className = 'form-status err'; status.textContent = msg;
    }
    function succeed(paymentType) {
      var t = renderSummary(), c2 = cart();
      var order = {
        transaction_id: 'TEST-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
        created: new Date().toISOString(), lines: c2, totals: t, payment_type: paymentType, shipping_tier: t.ship ? t.ship.id : 'digital',
        purchase_tracked: false, refunded: false
      };
      var email = form.elements.email.value.trim().toLowerCase();
      var go = function (hash) {
        if (hash) order.email_hash = hash; // only the hash, only kept in this browser
        var orders = load('dn_orders', []); orders.unshift(order); save('dn_orders', orders.slice(0, 50));
        setCart([]); save('dn_coupon', null);
        location.href = '/shop/order?id=' + encodeURIComponent(order.transaction_id);
      };
      if (window.crypto && crypto.subtle) sha256(email).then(go, function () { go(null); }); else go(null);
    }
    function addPaymentInfo(type) {
      var t = renderSummary();
      track('add_payment_info', { value: t.value, coupon: t.coupon, payment_type: type, items: cart().map(function (l) { return gaItem(l); }) });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var num = (form.elements.card.value || '').replace(/\D/g, '');
      var exp = form.elements.exp.value, cvc = form.elements.cvc.value;
      var card = SHOP.test_cards.filter(function (c) { return c.number.replace(/\D/g, '') === num; })[0];
      if (!card) {
        // Never accept, store or track anything that might be a real card
        form.elements.card.value = ''; form.elements.cvc.value = '';
        if (luhn(num)) { status.className = 'form-status err'; status.textContent = 'That looks like a real card, so it\'s been cleared. This is a pretend shop: please use a test card.'; }
        else { status.className = 'form-status err'; status.textContent = 'Use one of the test cards listed below.'; }
        return;
      }
      if (!/\d/.test(exp) || !/^\d{3,4}$/.test(cvc)) { status.className = 'form-status err'; status.textContent = 'Add any future expiry and a 3-digit CVC.'; return; }
      addPaymentInfo('credit_card');
      status.className = 'form-status'; status.textContent = 'Processing pretend payment…';
      setTimeout(function () {
        if (card.result === 'success') succeed('credit_card');
        else if (card.result === 'declined') fail('credit_card', 'card_declined', 'Your (pretend) card was declined. Try 4242 4242 4242 4242.');
        else if (card.result === 'expired') fail('credit_card', 'expired_card', 'That (pretend) card has expired.');
        else if (card.result === 'verify') openModal('verify-modal', function (answer) {
          trackSimple('payment_verification', { payment_type: 'credit_card', verification_result: answer });
          if (answer === 'pass') succeed('credit_card'); else fail('credit_card', 'verification_failed', 'Verification failed, so the pretend payment didn\'t go through.');
        });
      }, 700);
    });

    form.querySelectorAll('[data-wallet]').forEach(function (b) {
      b.addEventListener('click', function () {
        var type = b.getAttribute('data-wallet');
        var em = form.elements.email.value.trim();
        if (!em) { status.className = 'form-status err'; status.textContent = 'Add an email first (step 1).'; form.elements.email.focus(); return; }
        addPaymentInfo(type);
        openModal('wallet-modal', function (answer) {
          if (answer === 'approve') succeed(type); else fail(type, 'wallet_cancelled', 'Payment cancelled.');
        });
      });
    });
  }

  function openModal(id, done) {
    var m = document.getElementById(id), prev = document.activeElement;
    m.hidden = false;
    var btns = m.querySelectorAll('button');
    btns[0].focus();
    function finish(ans) { m.hidden = true; cleanup(); if (prev) prev.focus(); done(ans); }
    function onClick(e) {
      var b = e.target.closest('[data-verify],[data-wallet-answer]'); if (!b) return;
      finish(b.getAttribute('data-verify') || b.getAttribute('data-wallet-answer'));
    }
    function onKey(e) {
      if (e.key === 'Escape') finish(id === 'verify-modal' ? 'fail' : 'cancel');
      if (e.key === 'Tab') { // keep focus inside the dialog
        var first = btns[0], last = btns[btns.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    function cleanup() { m.removeEventListener('click', onClick); m.removeEventListener('keydown', onKey); }
    m.addEventListener('click', onClick); m.addEventListener('keydown', onKey);
  }

  function orderSummary(o) {
    var box = el('div', 'order-card');
    var h = el('h2', null, 'Order ' + o.transaction_id); box.appendChild(h);
    box.appendChild(el('p', 'hint', new Date(o.created).toLocaleString('en-NZ') + ' · paid with ' + o.payment_type.replace('_', ' ') + (o.refunded ? ' · refunded' : '')));
    var ul = el('ul', 'summary-lines');
    o.lines.forEach(function (l) { var li = el('li'); li.appendChild(el('span', null, BY_ID[l.id].emoji + ' ' + BY_ID[l.id].name + ' × ' + l.qty)); li.appendChild(el('b', null, money(l.price * l.qty))); ul.appendChild(li); });
    box.appendChild(ul);
    var tot = el('p', 'cart-total'); tot.appendChild(el('span', null, 'Total ')); tot.appendChild(el('b', null, money(o.totals.value))); box.appendChild(tot);
    return box;
  }
  function purchasePayload(o) {
    return { transaction_id: o.transaction_id, value: o.totals.value, tax: o.totals.tax, shipping: o.totals.shipping, coupon: o.totals.coupon,
      payment_type: o.payment_type, shipping_tier: o.shipping_tier, items: o.lines.map(function (l) { return gaItem(l, o.totals.coupon ? { coupon: o.totals.coupon } : null); }) };
  }

  function orderPage() {
    var id = new URLSearchParams(location.search).get('id');
    var orders = load('dn_orders', []), o = orders.filter(function (x) { return x.transaction_id === id; })[0];
    var root = $('#order-root');
    if (!o) { root.appendChild(el('p', 'health-empty', 'We couldn\'t find that pretend order in this browser.')); return; }
    root.appendChild(orderSummary(o));
    if (!o.purchase_tracked) {
      // Fire purchase exactly once per order (a reload doesn't double-count, unless the chaos gremlin is loose)
      var c = window.dnConsent && window.dnConsent.get();
      var extra = o.email_hash && c && c.marketing ? { user_data: { sha256_email_address: o.email_hash } } : null;
      track('purchase', purchasePayload(o), extra);
      o.purchase_tracked = true; save('dn_orders', orders);
    } else if (window.dnChaos && window.dnChaos.active()) {
      track('purchase', purchasePayload(o), { chaos_mode: true }); // deliberate duplicate
    }
  }

  function ordersPage() {
    var root = $('#orders-root');
    function render() {
      var orders = load('dn_orders', []); root.replaceChildren();
      if (!orders.length) { var p = el('p', 'health-empty', 'No pretend orders yet. '); var a = el('a', null, 'Go shopping →'); a.href = '/shop'; p.appendChild(a); root.appendChild(p); return; }
      orders.forEach(function (o, i) {
        var card = orderSummary(o);
        if (!o.refunded) {
          var b = el('button', 'btn-ghost', 'Request a refund'); b.type = 'button';
          b.addEventListener('click', function () {
            var all = load('dn_orders', []);
            track('refund', { transaction_id: o.transaction_id, value: o.totals.value, tax: o.totals.tax, shipping: o.totals.shipping, items: o.lines.map(function (l) { return gaItem(l); }) });
            all[i].refunded = true; save('dn_orders', all); render();
          });
          card.appendChild(b);
        }
        root.appendChild(card);
      });
    }
    render();
  }

  updateCount();
  if (PAGE === 'list') { listPage(); promoBanner(); }
  else if (PAGE === 'product') productPage();
  else if (PAGE === 'cart') cartPage();
  else if (PAGE === 'checkout') checkoutPage();
  else if (PAGE === 'order') orderPage();
  else if (PAGE === 'orders') ordersPage();
})();
