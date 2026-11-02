/* On the Pulse — likes, comments, share. Talks to the Worker at /api/*. */
(function () {
  'use strict';
  var dl = (window.dataLayer = window.dataLayer || []);

  // Anonymous per-browser id so a like can be undone. Random, not derived from anything about the person.
  function visitorId() {
    var k = 'otp_visitor';
    try {
      var v = localStorage.getItem(k);
      if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); localStorage.setItem(k, v); }
      return v;
    } catch (e) { return 'anon-' + (window.__otpv = window.__otpv || String(Math.random()).slice(2)); }
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

  function setAll(sel, val) {
    document.querySelectorAll(sel).forEach(function (el) { el.textContent = val; });
  }

  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch (e) { return ''; }
  }

  // ---------- homepage: counts on every issue card ----------
  var cards = Array.prototype.map.call(document.querySelectorAll('[data-issue-card]'), function (el) { return el.getAttribute('data-issue-card'); });
  if (cards.length) {
    api('counts?slugs=' + encodeURIComponent(cards.join(','))).then(function (res) {
      cards.forEach(function (s) {
        var c = res[s] || { likes: 0, comments: 0 };
        setAll('[data-like-count="' + s + '"]', c.likes);
        setAll('[data-comment-count="' + s + '"]', c.comments);
      });
    }).catch(function () {
      document.querySelectorAll('.counts').forEach(function (el) { el.hidden = true; });
    });
    document.addEventListener('click', function (ev) {
      var a = ev.target.closest('a[data-post-id]');
      if (a) dl.push({ event: 'post_click', post_id: a.getAttribute('data-post-id'), content_group: 'newsletter' });
    });
  }

  // ---------- issue page ----------
  var main = document.querySelector('[data-issue]');
  if (!main) return;
  var slug = main.getAttribute('data-issue');
  var likeBtns = document.querySelectorAll('[data-like="' + slug + '"]');
  var list = document.querySelector('.comment-list');
  var form = document.querySelector('.comment-form');
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
      li.textContent = 'No comments yet. Start the conversation.';
      list.appendChild(li);
      return;
    }
    comments.forEach(function (c) {
      var li = document.createElement('li');
      var who = document.createElement('span'); who.className = 'who'; who.textContent = c.name;
      var when = document.createElement('span'); when.className = 'when'; when.textContent = fmtDate(c.created_at);
      var body = document.createElement('p'); body.className = 'body'; body.textContent = c.body;
      li.appendChild(who); li.appendChild(when); li.appendChild(body);
      list.appendChild(li);
    });
  }

  api('issues/' + slug + '?v=' + encodeURIComponent(VID)).then(function (res) {
    liked = !!res.liked;
    renderLike(res.likes);
    renderComments(res.comments || []);
  }).catch(function () {
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
      var url = location.origin + location.pathname;
      var done = function (method) {
        dl.push({ event: 'share', method: method, content_type: 'newsletter', item_id: slug });
      };
      if (navigator.share) {
        navigator.share({ title: document.title, url: url }).then(function () { done('native'); }, function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () {
          var t = b.textContent; b.textContent = 'Link copied'; setTimeout(function () { b.textContent = t; }, 1800);
          done('copy_link');
        });
      }
    });
  });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var name = form.elements.name.value.trim(), body = form.elements.body.value.trim();
    status.className = 'form-status';
    if (!name || !body) { status.textContent = 'Add your name and a comment first.'; status.className += ' err'; return; }
    var btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    status.textContent = 'Posting…';
    api('issues/' + slug + '/comments', {
      method: 'POST',
      body: JSON.stringify({ name: name, body: body, website: form.elements.website.value, visitor: VID })
    }).then(function (res) {
      form.elements.body.value = '';
      dl.push({ event: 'comment_submit', item_id: slug, comment_status: res.status });
      if (res.status === 'published') {
        status.textContent = 'Posted. Thanks for joining in.';
        return api('issues/' + slug + '?v=' + encodeURIComponent(VID)).then(function (r) { renderComments(r.comments || []); });
      }
      status.textContent = "Thanks — your comment will appear once it's been read.";
    }).catch(function (err) {
      status.textContent = err.status === 429 ? "You're commenting fast. Try again in a few minutes." : (err.message || 'Something went wrong.');
      status.className += ' err';
    }).then(function () { btn.disabled = false; });
  });
})();
