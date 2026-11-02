/* On the Pulse — likes, comments, share; What's Cooking open/close. Talks to the Worker at /api/*. */
(function () {
  'use strict';
  var dl = (window.dataLayer = window.dataLayer || []);

  // Keep in sync with ALLOWED_DOMAINS in worker/index.js (the Worker is the real check).
  var ALLOWED = ['gmail.com','googlemail.com','outlook.com','outlook.co.nz','hotmail.com','hotmail.co.nz','hotmail.co.uk',
    'live.com','live.co.nz','live.com.au','msn.com','yahoo.com','yahoo.co.nz','yahoo.co.uk','yahoo.com.au','ymail.com',
    'icloud.com','me.com','mac.com','proton.me','protonmail.com','pm.me','aol.com','zoho.com','fastmail.com','gmx.com',
    'gmx.net','mail.com','hey.com','tutanota.com','tuta.io','xtra.co.nz','slingshot.co.nz','orcon.net.nz',
    'vodafone.co.nz','clear.net.nz','paradise.net.nz','bigpond.com','optusnet.com.au','btinternet.com','qq.com','163.com','naver.com'];
  var FAKE_LOCAL = /^(test\d*|testing|tester|example|sample|demo|asdf\w*|qwerty\w*|foo|bar|foobar|fake|none|null|noreply|no-reply|abc|abc123|xxx+|aaa+|user\d*|admin)$/i;

  function emailProblem(v) {
    var m = String(v || '').trim().toLowerCase().match(/^([a-z0-9._%+-]{1,64})@([a-z0-9.-]+\.[a-z]{2,})$/);
    if (!m) return 'That doesn’t look like an email address.';
    if (ALLOWED.indexOf(m[2]) === -1) return 'Please use an address from a mainstream provider like Gmail, Outlook, iCloud, Yahoo, Proton or Xtra.';
    if (FAKE_LOCAL.test(m[1].replace(/\+.*$/, ''))) return 'Please use your real email address.';
    return '';
  }

  // Anonymous per-browser id so a like can be undone. Random, not derived from anything about the person.
  function visitorId() {
    var k = 'otp_visitor';
    try {
      var v = localStorage.getItem(k);
      if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); localStorage.setItem(k, v); }
      return v;
    } catch (e) { return 'anon-' + (window.__otpv = window.__otpv || String(Math.random()).slice(2) + Date.now()); }
  }
  var VID = visitorId();

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    return fetch('/api/' + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var err = new Error(j.error || 'Request failed'); err.status = r.status; throw err; }
        return j;
      });
    });
  }

  function setAll(sel, val) { document.querySelectorAll(sel).forEach(function (el) { el.textContent = val; }); }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch (e) { return ''; }
  }

  // ---------- What's Cooking: open/close all, track which tools people open ----------
  document.querySelectorAll('[data-expand]').forEach(function (b) {
    b.addEventListener('click', function () {
      var open = b.getAttribute('data-expand') === 'open';
      document.querySelectorAll('.dish details').forEach(function (d) { d.open = open; });
    });
  });
  document.querySelectorAll('details[data-project]').forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (d.open) dl.push({ event: 'project_expand', item_id: d.getAttribute('data-project') });
    });
  });

  // ---------- counts on "previous editions" cards ----------
  var cards = Array.prototype.map.call(document.querySelectorAll('[data-issue-card]'), function (el) { return el.getAttribute('data-issue-card'); });
  if (cards.length) {
    api('counts?slugs=' + encodeURIComponent(cards.join(','))).then(function (res) {
      cards.forEach(function (s) {
        var c = res[s] || { likes: 0, comments: 0 };
        setAll('[data-like-count="' + s + '"]', c.likes);
        setAll('[data-comment-count="' + s + '"]', c.comments);
      });
    }).catch(function () {
      document.querySelectorAll('.arch-row .counts').forEach(function (el) { el.hidden = true; });
    });
    document.addEventListener('click', function (ev) {
      var a = ev.target.closest('a[data-post-id]');
      if (a) dl.push({ event: 'post_click', post_id: a.getAttribute('data-post-id'), content_group: 'newsletter' });
    });
  }

  // ---------- edition (homepage or /pulse/YYYY-MM) ----------
  var main = document.querySelector('[data-issue]');
  if (!main) return;
  var slug = main.getAttribute('data-issue');
  var likeBtns = document.querySelectorAll('[data-like="' + slug + '"]');
  var list = document.querySelector('.comment-list');
  var form = document.querySelector('.comment-form');
  var emailEl = form.elements.email;
  var status = form.querySelector('.form-status');
  var liked = false, busy = false;

  function renderLike(count) {
    likeBtns.forEach(function (b) {
      b.setAttribute('aria-pressed', liked ? 'true' : 'false');
      b.querySelector('.like-label').textContent = liked ? 'Liked' : 'Like';
    });
    setAll('[data-like-count="' + slug + '"]', count > 0 ? count : '');
  }

  function renderComments(comments) {
    list.innerHTML = '';
    setAll('[data-comment-count="' + slug + '"]', comments.length ? comments.length : '');
    if (!comments.length) {
      var li = document.createElement('li');
      li.className = 'comment-empty';
      li.textContent = 'No comments yet. Be the first! 💛';
      list.appendChild(li);
      return;
    }
    comments.slice().reverse().forEach(function (c) {
      var li = document.createElement('li');
      var who = document.createElement('span'); who.className = 'who'; who.textContent = c.name;
      var when = document.createElement('span'); when.className = 'when'; when.textContent = fmtDate(c.created_at);
      var body = document.createElement('p'); body.className = 'body'; body.textContent = c.body;
      li.appendChild(who); li.appendChild(when); li.appendChild(body);
      list.appendChild(li);
    });
  }

  function loadIssue() {
    return api('issues/' + slug + '?v=' + encodeURIComponent(VID)).then(function (res) {
      liked = !!res.liked;
      renderLike(res.likes);
      renderComments(res.comments || []);
    });
  }
  loadIssue().catch(function () {
    list.innerHTML = '<li class="comment-empty">Comments are unavailable right now.</li>';
  });

  likeBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      if (busy) return;
      busy = true;
      api('issues/' + slug + '/like', { method: 'POST', body: JSON.stringify({ visitor: VID }) })
        .then(function (res) {
          liked = res.liked;
          renderLike(res.likes);
          if (liked) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
          dl.push({ event: 'newsletter_like', item_id: slug, like_action: liked ? 'like' : 'unlike' });
        })
        .catch(function () {})
        .then(function () { busy = false; });
    });
  });

  document.querySelectorAll('[data-share="' + slug + '"]').forEach(function (b) {
    b.addEventListener('click', function () {
      var url = location.origin + '/pulse/' + slug;
      var done = function (method) { dl.push({ event: 'share', method: method, content_type: 'newsletter', item_id: slug }); };
      if (navigator.share) {
        navigator.share({ title: document.title, url: url }).then(function () { done('native'); }, function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () {
          var t = b.textContent; b.textContent = 'Link copied 💕'; setTimeout(function () { b.textContent = t; }, 1800);
          done('copy_link');
        });
      }
    });
  });

  emailEl.addEventListener('blur', function () {
    var p = emailEl.value.trim() ? emailProblem(emailEl.value) : '';
    emailEl.setAttribute('aria-invalid', p ? 'true' : 'false');
    status.className = 'form-status' + (p ? ' err' : '');
    status.textContent = p;
  });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var email = emailEl.value.trim(), body = form.elements.body.value.trim();
    status.className = 'form-status err';
    var problem = !email || !body ? 'Add your email and a comment first.' : emailProblem(email);
    if (problem) { status.textContent = problem; (email ? form.elements.body : emailEl).focus(); return; }
    var btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    status.className = 'form-status';
    status.textContent = 'Posting…';
    api('issues/' + slug + '/comments', {
      method: 'POST',
      body: JSON.stringify({ email: email, body: body, website: form.elements.website.value, visitor: VID })
    }).then(function (res) {
      form.elements.body.value = '';
      // Never send the email or comment text to analytics
      dl.push({ event: 'comment_submit', item_id: slug, comment_status: res.status });
      status.textContent = 'Posted — thank you! 💛';
      return loadIssue();
    }).catch(function (err) {
      status.className = 'form-status err';
      status.textContent = err.status === 429 ? 'You’re commenting fast. Try again in a few minutes.' : (err.message || 'Something went wrong.');
    }).then(function () { btn.disabled = false; });
  });
})();
