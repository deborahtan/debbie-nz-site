/* Renders the latest funnel QA run on /funnel-qa. The run itself happens in CI
   (scripts/funnel-qa.mjs); this page only displays what was recorded. */
(function () {
  'use strict';
  var root = document.getElementById('fq-root');
  if (!root) return;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // the report writes problem text with `backticks` around identifiers
  function withCode(text) {
    var frag = document.createDocumentFragment();
    text.split('`').forEach(function (part, i) {
      if (part === '') return;
      frag.appendChild(i % 2 ? el('code', null, part) : document.createTextNode(part));
    });
    return frag;
  }

  function when(iso) {
    try {
      return new Date(iso).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Pacific/Auckland' });
    } catch (e) { return iso; }
  }

  function problemList(problems) {
    var ul = el('ul', 'fq-problems');
    problems.forEach(function (p) {
      var li = el('li', 'fq-' + p.level);
      li.appendChild(el('span', 'fq-mark', p.level === 'fail' ? '✖' : '!'));
      li.appendChild(withCode(p.text));
      ul.appendChild(li);
    });
    return ul;
  }

  function render(run, recordedAt) {
    root.replaceChildren();
    if (!run) {
      root.appendChild(el('p', 'note', 'No run recorded yet. The check runs in GitHub Actions and posts its result here.'));
      return;
    }

    var head = el('div', 'fq-head');
    var ok = run.failed === 0;
    head.appendChild(el('span', 'fq-verdict ' + (ok ? 'ok' : 'bad'), ok ? '✅ All journeys passing' : '✖ ' + run.failed + ' journey' + (run.failed === 1 ? '' : 's') + ' failing'));
    head.appendChild(el('span', 'fq-meta', run.passed + ' passed · ' + run.journeys.length + ' journeys · ' + run.spec_events + ' events in the plan'));
    head.appendChild(el('span', 'fq-meta', 'Ran ' + when(run.run_at) + (recordedAt ? '' : '')));
    head.appendChild(el('span', 'fq-meta', 'Against ' + run.site));
    root.appendChild(head);

    run.journeys.forEach(function (j) {
      var card = el('section', 'fq-journey' + (j.pass ? '' : ' is-bad'));
      var det = document.createElement('details');
      if (!j.pass) det.open = true;
      var sum = document.createElement('summary');
      sum.appendChild(el('span', 'fq-pill ' + (j.pass ? 'ok' : 'bad'), j.pass ? 'pass' : 'fail'));
      sum.appendChild(el('span', 'fq-jname', j.name));
      sum.appendChild(el('span', 'fq-why', j.why || ''));
      det.appendChild(sum);

      var body = el('div', 'fq-body');
      var ol = el('ol', 'fq-steps');
      j.steps.forEach(function (s) {
        var li = el('li', s.problems.some(function (p) { return p.level === 'fail'; }) ? 'bad' : '');
        li.appendChild(el('span', 'fq-action', s.action));
        if (s.saw && s.saw.length) {
          var saw = el('span', 'fq-saw');
          s.saw.forEach(function (name) { saw.appendChild(el('code', null, name)); });
          li.appendChild(saw);
        }
        if (s.problems.length) li.appendChild(problemList(s.problems));
        ol.appendChild(li);
      });
      body.appendChild(ol);
      if (j.notes && j.notes.length) body.appendChild(problemList(j.notes));
      det.appendChild(body);
      card.appendChild(det);
      root.appendChild(card);
    });
  }

  fetch('/api/funnel-qa')
    .then(function (r) { return r.json(); })
    .then(function (d) { render(d.run, d.recorded_at); })
    .catch(function () {
      root.replaceChildren(el('p', 'note', "Couldn't load the latest run."));
    });
})();
