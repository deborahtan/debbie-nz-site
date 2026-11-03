#!/usr/bin/env python3
"""
Builds the On the Pulse pages and What's Cooking from content/.

  python3 scripts/build_pulse.py

Writes:
  debbie-nz-site/index.html            homepage: the full latest edition, comments, then previous editions
  debbie-nz-site/pulse/YYYY-MM.html    one page per monthly edition (likes + comments)
  debbie-nz-site/pulse/feed.xml        RSS
  debbie-nz-site/whats-cooking.html    projects page (content/whats-cooking.json)

New edition: add content/pulse/YYYY-MM.json (YYYY-MM = the month it covers),
run this script, commit.
"""
import json, re, datetime, pathlib, os
from html import escape

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "debbie-nz-site"
CONTENT = ROOT / "content"
GTM_ID = "GTM-NXPF7HTS"
# Cloudflare Turnstile site key (public). Default is Cloudflare's always-pass test key until you create a widget.
TURNSTILE_SITE_KEY = os.environ.get("TURNSTILE_SITE_KEY", "1x00000000000000000000AA")
# Where the site lives. debbie.nz still points at the Soundbytes blog, so canonical links and share
# images use the Workers address until the domain moves:  SITE_URL=https://debbie.nz python3 scripts/build_pulse.py
SITE_URL = os.environ.get("SITE_URL", "https://debbie-nz-site.deborahtanyl.workers.dev").rstrip("/")


def e(s):
    return escape(s or "", quote=True)


def month_label(m):
    return datetime.date.fromisoformat(m + "-01").strftime("%B %Y")


def nice_date(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{d.day} {d.strftime('%B %Y')}"


def all_text(issue):
    parts = [issue.get("lede", "")] + issue.get("take", [])
    for s in issue["sections"]:
        for it in s["items"]:
            parts += [it.get("title") or ""] + [p["text"] for p in it["paragraphs"] + it.get("paragraphs_after", [])]
    return " ".join(parts)


def read_mins(issue):
    return max(1, round(len(all_text(issue).split()) / 230))


def story_count(issue):
    return sum(1 for s in issue["sections"] for it in s["items"] if it.get("title"))


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]


def title_html(issue):
    t, acc = issue["title"], issue.get("title_accent")
    if acc and t.endswith(acc):
        return e(t[: -len(acc)]) + f"<span>{e(acc)}</span>"
    return e(t)


# ------------------------------------------------------------------ shell
NAV_ITEMS = [("/", "on the pulse", "pulse"), ("/whats-cooking", "what's cooking", "cooking"), ("/roadmap", "roadmap", "roadmap"),
             ("/how-i-use-ai", "how i use ai", "ai"), ("/about.html", "about", "about")]

RIBBON = """<div class="ribbon" role="note">
  <p><b>💗 A real site:</b> ongoing news on data &amp; technology, with Debbie's own human-written commentary.
  <b>🧪 Also a test bench:</b> anything marked <span class="test-tag">test</span> (the shop and sign-up) is pretend, built for testing tracking.
  <a href="/about#this-site">How this site works</a></p>
</div>"""


def head(title, description, path, current, image=None):
    image = image or "/og/site.png"
    links = "\n      ".join(
        f'<a href="{href}"{" aria-current=\"page\"" if key == current else ""}>{label}</a>'
        for href, label, key in NAV_ITEMS)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{e(title)}</title>
<meta name="description" content="{e(description)}">
<link rel="canonical" href="{SITE_URL}{path}">
<meta property="og:site_name" content="Debbie Tan — On the Pulse">
<meta property="og:type" content="{"article" if path.startswith("/pulse/") else "website"}">
<meta property="og:url" content="{SITE_URL}{path}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(description)}">
<meta property="og:image" content="{SITE_URL}{image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="627">
<meta property="og:image:alt" content="{e(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="color-scheme" content="light dark">
<script src="/consent.js"></script>
<script>(function(w,d,s,l,i){{w[l]=w[l]||[];w[l].push({{'gtm.start':
new Date().getTime(),event:'gtm.js'}});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
}})(window,document,'script','dataLayer','{GTM_ID}');</script>
<!-- End Google Tag Manager -->
<link rel="preload" href="/fonts/baloo-2-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/nunito-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>💗</text></svg>">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/pulse.css">
<link rel="alternate" type="application/rss+xml" title="On the Pulse" href="/pulse/feed.xml">
</head>
<body class="pulse">
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id={GTM_ID}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
<a class="skip" href="#main">Skip to content</a>
<nav>
  <a href="/" class="wordmark">Debbie Tan</a>
  <div class="nav-right">
    <div class="nav-links">
      {links}
      <a href="/shop"{" aria-current=\"page\"" if current == "shop" else ""}>shop <span class="test-tag">test</span></a>
      <a href="/form-test.html">sign up <span class="test-tag">test</span></a>
    </div>
    <div class="nav-search">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <input type="text" id="site-search" placeholder="Search" autocomplete="off" aria-label="Search">
    </div>
  </div>
</nav>
""" + RIBBON + """
"""


FOOT = """
<footer>
  <span>© Debbie Tan — Auckland, Aotearoa</span>
  <span class="hit-counter" data-hit-counter hidden><span class="hc-label">You are visitor no.</span> <span class="hc-odo" data-hit-digits aria-hidden="true"></span><span class="sr-only" data-hit-sr></span> <span class="hc-label">✨ since 2026</span></span>
  <span class="foot-links"><a href="/privacy">Privacy</a> · <a href="/privacy#consent" data-consent-open>Cookie settings</a></span>
  <span>News roundups are AI-assisted, then read, questioned and approved by me. My commentary is my own.</span>
</footer>
<script src="/site.js" defer></script>
<script src="/tools.js" defer></script>
<script src="/pulse.js" defer></script>
</body>
</html>
"""

HEART = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.5h2c.7-1.4 2.2-2.5 4.3-2.5 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>'
BUBBLE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/></svg>'


# ------------------------------------------------------------------ pieces
def stats_html(stats):
    if not stats:
        return ""
    cells = "".join(
        f'<div class="stat"><span class="n">{e(s["value"])}</span><span class="l">{e(s["label"])}</span>'
        + (f'<span class="s">{e(s["source"])}</span>' if s.get("source") else "")
        + "</div>" for s in stats)
    return f'<div class="stats-row">{cells}</div>'


def paras_html(paras):
    out = []
    for p in paras:
        lab = p.get("label")
        cls = " imp" if lab and lab.lower() not in ("what happened", "what it is", "what it can do") else ""
        lab_html = f'<span class="label{cls}">{e(lab)}</span>' if lab else ""
        out.append(f"<p>{lab_html}{e(p['text'])}</p>")
    return "\n".join(out)


def table_html(t):
    head = "".join(f"<th scope=\"col\">{e(h)}</th>" for h in t["head"])
    rows = "".join("<tr>" + f"<th scope=\"row\">{e(r[0])}</th>" + "".join(f"<td>{e(c)}</td>" for c in r[1:]) + "</tr>"
                   for r in t["rows"])
    return f'<div class="table-wrap" tabindex="0"><table><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table></div>'


def item_html(it, no):
    out = ['<article class="item">']
    if it.get("title"):
        num = f'<span class="no">{no:02d}</span>' if no else ""
        out.append(f'<h3 id="{slugify(it["title"])}">{num}{e(it["title"])}</h3>')
    if it.get("meta"):
        out.append(f'<div class="meta">{e(it["meta"])}</div>')
    out.append(paras_html(it["paragraphs"]))
    if it.get("table"):
        out.append(table_html(it["table"]))
    if it.get("paragraphs_after"):
        out.append(paras_html(it["paragraphs_after"]))
    if it.get("sources"):
        links = " · ".join(f'<a href="{e(s["url"])}" target="_blank" rel="noopener">{e(s["name"])}</a>' for s in it["sources"])
        out.append(f'<p class="src-inline">Source: {links}</p>')
    out.append("</article>")
    return "\n".join(out)


def engage_bar(slug, where):
    return f"""<div class="engage engage-{where}" data-engage="{slug}">
  <button class="like-btn" type="button" data-like="{slug}" aria-pressed="false">{HEART}<span class="like-label">Like</span><span class="like-count" data-like-count="{slug}"></span></button>
  <a class="comment-jump" href="#comments">{BUBBLE}<span>Comment</span><span class="comment-n" data-comment-count="{slug}"></span></a>
  <button class="share-btn" type="button" data-share="{slug}">Share</button>
</div>"""


def comments_block(slug):
    return f"""<section class="comments" id="comments" data-comments="{slug}">
  <h2>Comments <span class="count" data-comment-count="{slug}"></span></h2>
  <form class="comment-form" novalidate>
    <h3>Join the conversation</h3>
    <label for="c-email">Your email</label>
    <input id="c-email" name="email" type="email" required maxlength="120" autocomplete="email" inputmode="email" placeholder="you@gmail.com">
    <p class="hint">We only use your email to check you're a real person: it needs to be from a mainstream provider (Gmail, Outlook, iCloud, Yahoo, Proton, Xtra…). It's <b>never stored, shown or shared</b>. Your comment appears under a friendly nickname like <b>Sunny Kererū</b>. <a href="/privacy#comments">How comments work</a></p>
    <label for="c-body">Comment</label>
    <textarea id="c-body" name="body" required maxlength="2000" rows="5"></textarea>
    <label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
    <div class="turnstile" data-sitekey="{TURNSTILE_SITE_KEY}"></div>
    <button type="submit">Post comment</button>
    <p class="hint small">Protected by Cloudflare Turnstile, an invisible check that you're not a bot.</p>
    <p class="form-status" role="status"></p>
  </form>
  <ol class="comment-list" aria-live="polite"><li class="comment-empty">Loading comments…</li></ol>
</section>"""


def issue_body(issue, heading_level_link=None):
    """The full edition. Used on the homepage (latest) and each edition page."""
    slug = issue["slug"]
    label = month_label(issue["month"])
    out = []
    out.append(f'<div class="mast"><span>On the Pulse · {e(label)}</span>'
               f'<span>Published <b>{e(nice_date(issue["date"]))}</b> · covers {e(issue["period"])}</span></div>')
    title = title_html(issue)
    if heading_level_link:
        title = f'<a href="{heading_level_link}">{title}</a>'
    out.append(f"<h1>{title}</h1>")
    out.append(f'<div class="byline">Debbie Tan · {story_count(issue)} stories · {read_mins(issue)} min read</div>')
    out.append(engage_bar(slug, "top"))
    if issue.get("greeting"):
        out.append(f'<div class="greeting">{e(issue["greeting"])}</div>')
    out.append(f'<p class="lede">{e(issue["lede"])}</p>')
    if issue.get("stats"):
        out.append(stats_html(issue["stats"]))
    if issue.get("recap"):
        rc = issue["recap"]
        flags = {"new": '<span class="recap-flag new">new</span>', "act": '<span class="recap-flag act">act</span>'}
        lis = "".join(f'<li>{flags.get(r.get("flag"), "")}<a href="#{e(r["anchor"])}">{e(r["text"])}</a></li>' for r in rc["items"])
        out.append(f'<section class="recap" aria-labelledby="recap-h"><h2 id="recap-h">⏱️ {e(rc["heading"])}</h2><ol>{lis}</ol></section>')
    toc = "".join(f'<a href="#{slugify(s["heading"])}">{e(s["heading"])}</a>' for s in issue["sections"])
    out.append(f'<nav class="toc" aria-label="In this edition"><span>In this edition</span>{toc}</nav>')

    no = 0
    for s in issue["sections"]:
        tag = f' <span class="count">{e(s["tag"])}</span>' if s.get("tag") else ""
        out.append(f'<section class="sec"><h2 id="{slugify(s["heading"])}">{e(s["heading"])}{tag}</h2>')
        if s.get("description"):
            out.append(f'<p class="sec-desc">{e(s["description"])}</p>')
        if s.get("stats"):
            out.append(stats_html(s["stats"]))
        for it in s["items"]:
            if it.get("title"):
                no += 1
            out.append(item_html(it, no if it.get("title") and issue["format"] == "memo" else None))
        if s.get("note"):
            out.append(f'<div class="quiet"><strong>{e(s["note"]["strong"])}</strong> {e(s["note"]["text"])}</div>')
        out.append("</section>")

    if issue.get("take"):
        paras = "".join(f"<p>{e(p)}</p>" for p in issue["take"])
        out.append(f'<div class="take"><span class="label-take">My take</span>{paras}</div>')
    for a in issue.get("actions", []):
        lis = "".join(f"<li>{e(x)}</li>" for x in a["items"])
        out.append(f'<h4 class="rec-head">{e(a["heading"])}</h4><div class="rec"><ol>{lis}</ol></div>')
    if issue.get("signoff"):
        out.append(f'<div class="sign">{e(issue["signoff"][0])}<br>{e(issue["signoff"][1])}</div>')
    out.append(engage_bar(slug, "bottom"))
    if issue.get("sources"):
        lis = "".join(f'<li><a href="{e(s["url"])}" target="_blank" rel="noopener">{e(s["name"])}</a></li>' for s in issue["sources"])
        out.append(f'<details class="src"><summary>All sources ({len(issue["sources"])})</summary><ol>{lis}</ol></details>')
    for note in issue.get("notes", []):
        out.append(f'<p class="note">{e(note)}</p>')
    if issue.get("about"):
        out.append(f'<p class="note">{e(issue["about"])}</p>')
    out.append(comments_block(slug))
    return "\n".join(out)


def previous_list(issues, exclude):
    rows = []
    for i in issues:
        if i["slug"] == exclude:
            continue
        rows.append(f"""<li data-issue-card="{i['slug']}"><a class="arch-row" href="/pulse/{i['slug']}" data-post-id="{i['slug']}">
  <div class="arch-top"><span class="no">{e(month_label(i['month']))}</span>
  <span class="counts"><span class="ct">{HEART}<span data-like-count="{i['slug']}">–</span></span><span class="ct">{BUBBLE}<span data-comment-count="{i['slug']}">–</span></span></span></div>
  <h3>{e(i['title'])}</h3>
  <p>{e(i['lede'][:200].rsplit(' ', 1)[0])}…</p>
</a></li>""")
    if not rows:
        return ""
    return f'<section class="archive" aria-labelledby="prev-h"><h2 id="prev-h">Previous editions</h2><ol>{"".join(rows)}</ol></section>'


# ------------------------------------------------------------------ pages
def render_issue(issue, issues):
    out = [head(f"{issue['title']} — On the Pulse, {month_label(issue['month'])}", issue["lede"][:200],
                f"/pulse/{issue['slug']}", "pulse", f"/og/{issue['slug']}.png")]
    out.append(f'<main id="main" class="pulse-wrap issue" data-issue="{issue["slug"]}">')
    out.append('<a class="back" href="/">← Latest edition</a>')
    out.append(issue_body(issue))
    out.append(previous_list(issues, issue["slug"]))
    out.append("</main>")
    out.append(FOOT)
    return "\n".join(out)


def render_home(issues):
    latest = issues[0]
    out = [head("On the Pulse — Debbie Tan",
                "A monthly read on AI, data, measurement and privacy, from Auckland, Aotearoa. Every item dated and sourced.",
                "/", "pulse", f"/og/{latest['slug']}.png")]
    out.append(f'<main id="main" class="pulse-wrap issue home" data-issue="{latest["slug"]}">')
    out.append('<header class="brand"><span class="badge">💗 On the Pulse · monthly</span>'
               '<p>A real, ongoing monthly read on data, technology, measurement &amp; privacy from Auckland, Aotearoa. News is dated and sourced; the commentary is mine.</p></header>')
    out.append(issue_body(latest, heading_level_link=f"/pulse/{latest['slug']}"))
    out.append(previous_list(issues, latest["slug"]))
    out.append("</main>")
    out.append(FOOT)
    return "\n".join(out)


def render_cooking(data, roadmap=None):
    statuses = data["statuses"]
    projects = [p for g in data["groups"] for p in g["projects"]]
    rmap = roadmap_index(roadmap, data)[1] if roadmap else {}
    out = [head("What's Cooking — Debbie Tan", data["intro"], "/whats-cooking", "cooking", "/og/whats-cooking.png")]
    out.append('<main id="main" class="pulse-wrap cooking">')
    out.append(f'<header class="brand"><span class="badge">🍳 fresh from the kitchen</span><h1>{e(data["title"])}</h1><p>{e(data["intro"])}</p>'
               f'<p class="cooking-x"><a href="/roadmap">See how these fit the work on the Roadmap →</a></p></header>')

    # status legend doubles as a filter
    counts = {}
    for p in projects:
        counts[p["status"]] = counts.get(p["status"], 0) + 1
    chips = [f'<button type="button" class="status-chip all" data-filter="all" aria-pressed="true">All <b>{len(projects)}</b></button>']
    for key, st in statuses.items():
        if counts.get(key):
            chips.append(f'<button type="button" class="status-chip st-{key}" data-filter="{key}" aria-pressed="false">'
                         f'{st["emoji"]} {e(st["label"])} <b>{counts[key]}</b></button>')
    out.append(f'<div class="status-filter" role="group" aria-label="Filter by status">{"".join(chips)}</div>')
    out.append('<div class="dish-tools"><button type="button" data-expand="open">Open all</button>'
               '<button type="button" data-expand="close">Close all</button></div>')

    for g in data["groups"]:
        out.append(f'<section class="dish-group"><h2>{e(g["heading"])}</h2><p class="group-blurb">{e(g.get("blurb", ""))}</p>')
        out.append('<ul class="dishes">')
        for p in g["projects"]:
            st = statuses[p["status"]]
            tags = "".join(f"<span>{e(t)}</span>" for t in p.get("tags", []))
            does = "".join(f"<li>{e(x)}</li>" for x in p.get("does", []))
            bens = "".join(f"<li>{e(x)}</li>" for x in p.get("benefits", []))
            nxt = f'<p class="dish-next"><b>Next:</b> {e(p["next"])}</p>' if p.get("next") else ""
            rm = rmap.get(p["name"])
            rm_html = ""
            if rm and (rm["tasks"] or rm["column"]):
                bits = []
                if rm["stages"]:
                    bits.append(f'<span class="rx-stage">{e(" · ".join(dict.fromkeys(rm["stages"])))}</span>')
                if rm["column"]:
                    bits.append(f'<span class="rx-col rx-{rm["column"].lower().replace(" ", "-")}">{e(rm["column"])}</span>')
                tasks = "".join(f'<li>{e(t)}</li>' for t in rm["tasks"])
                rm_html = (f'<div class="dish-roadmap"><h3>On the roadmap {"".join(bits)}</h3>'
                           f'<ul class="rx-tasks">{tasks}</ul>'
                           f'<a class="rx-link" href="/roadmap#impact-effort">See it on the impact / effort matrix →</a></div>')
            link = f'<a class="dish-link" href="{e(p["link"]["url"])}">{e(p["link"]["label"])} →</a>' if p.get("link") else ""
            out.append(f"""<li class="dish" id="{slugify(p['name'])}" data-status="{p['status']}">
  <details data-project="{slugify(p['name'])}">
    <summary>
      <span class="dish-emoji" aria-hidden="true">{e(p.get('emoji', '🍳'))}</span>
      <span class="dish-head">
        <span class="status-bubble st-{p['status']}">{st['emoji']} {e(st['label'])}</span>
        <span class="dish-name">{e(p['name'])}</span>
        <span class="dish-sum">{e(p['summary'])}</span>
        <span class="dish-tags">{tags}</span>
      </span>
      <span class="dish-toggle" aria-hidden="true"></span>
    </summary>
    <div class="dish-body">
      {nxt}
      {rm_html}
      <div class="dish-col"><h3>What it does</h3><ul>{does}</ul></div>
      <div class="dish-col"><h3>Why it helps</h3><ul>{bens}</ul></div>
      {link}
    </div>
  </details>
</li>""")
        out.append("</ul></section>")
    if data.get("outro"):
        out.append(f'<p class="note">{e(data["outro"])}</p>')
    out.append("</main>")
    out.append(FOOT)
    return "\n".join(out)


def render_health():
    body = """<header class="brand"><span class="badge">🩺 checked daily</span><h1>Site health</h1>
<p>How this site is doing, measured on itself: uptime, real-visitor speed (Core Web Vitals), Lighthouse,
accessibility, security-policy blocks and errors. Updated automatically.</p></header>
<p class="health-updated" id="health-updated" role="status">Loading the latest numbers…</p>
<div class="health-summary" id="health-summary"></div>

<section class="sec health-sec" aria-labelledby="h-up"><h2 id="h-up">Uptime <span class="count">last 7 days · checked every 15 min</span></h2>
<div class="health-grid" id="health-uptime"></div></section>

<section class="sec health-sec" aria-labelledby="h-cwv"><h2 id="h-cwv">Core Web Vitals <span class="count">real visitors · 75th percentile · last 28 days</span></h2>
<p class="sec-desc">From visitors who allowed analytics. Green is Google's "good" threshold: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1.</p>
<div class="health-grid" id="health-cwv"></div></section>

<section class="sec health-sec" aria-labelledby="h-lh"><h2 id="h-lh">Lighthouse <span class="count">lab test · mobile · daily</span></h2>
<div class="table-wrap" tabindex="0"><table id="health-lh"><thead><tr><th scope="col">Page</th><th scope="col">Performance</th><th scope="col">Accessibility</th><th scope="col">Best practices</th><th scope="col">SEO</th><th scope="col">LCP</th><th scope="col">CLS</th><th scope="col">Tested</th></tr></thead><tbody></tbody></table></div></section>

<section class="sec health-sec" aria-labelledby="h-a11y"><h2 id="h-a11y">Accessibility <span class="count">axe-core · keyboard · structure · daily</span></h2>
<div class="health-grid" id="health-a11y"></div></section>

<section class="sec health-sec" aria-labelledby="h-csp"><h2 id="h-csp">Security policy blocks <span class="count">last 7 days</span></h2>
<p class="sec-desc">Things the Content Security Policy stopped from loading. A marketing tag showing up here means it needs adding to the policy.</p>
<div id="health-csp"></div></section>

<section class="sec health-sec" aria-labelledby="h-err"><h2 id="h-err">JavaScript errors <span class="count">last 7 days</span></h2>
<p class="sec-desc">Errors marked <span class="test-tag">chaos</span> were caused on purpose by the chaos gremlin button.</p>
<div id="health-errors"></div></section>
"""
    return render_page("Site health — Debbie Tan", "Uptime, Core Web Vitals, Lighthouse, accessibility and error monitoring for this site.",
                       "/site-health", body, "health", current="health") .replace('<script src="/pulse.js" defer></script>',
                       '<script src="/pulse.js" defer></script>\n<script src="/site-health.js" defer></script>')


# ------------------------------------------------------------------ test shop
def money(n):
    return f"${n:,.2f}"


def shop_shell(title, desc, path, body, page_kind, image="/og/shop.png"):
    data = (CONTENT / "shop.json").read_text()
    out = [head(f"{title} — The (not set) Shop (test)", desc, path, "shop", image)]
    out.append(f'<main id="main" class="pulse-wrap shop" data-shop-page="{page_kind}">')
    out.append('<p class="shop-test-note" role="note">🧪 <b>Test shop.</b> Nothing here is real: no products, no payments, no deliveries. '
               'It exists to test ecommerce tracking. Please don\'t enter a real card.</p>')
    out.append(body)
    out.append("</main>")
    out.append(f'<script type="application/json" id="shop-data">{data}</script>')
    out.append(FOOT.replace('<script src="/pulse.js" defer></script>', '<script src="/pulse.js" defer></script>\n<script src="/shop.js" defer></script>'))
    return "\n".join(out)


def product_card(p, idx):
    price = "Pay what you want" if p.get("pay_what_you_want") else ("from " if p.get("variants") and any("price" in o for o in p["variants"]["options"]) else "") + money(p["price"])
    return f"""<li class="product" data-item-id="{p['id']}" data-index="{idx}">
  <a class="product-link" href="/shop/{p['id']}" data-select-item="{p['id']}">
    <span class="product-art" aria-hidden="true">{p['emoji']}</span>
    <span class="product-name">{e(p['name'])}</span>
    <span class="product-blurb">{e(p['blurb'])}</span>
    <span class="product-price">{e(price)}</span>
  </a>
</li>"""


def render_shop(shop):
    promo = shop["promo"]
    cards = "".join(product_card(p, i + 1) for i, p in enumerate(shop["products"]))
    body = f"""<header class="brand"><span class="badge">🛍️ {e(shop['name'])}</span><h1>Cute things, fake money</h1>
<p>{e(shop['tagline'])}</p></header>
<a class="promo" href="/shop/cart" data-promo-id="{promo['id']}" data-promo-name="{e(promo['name'])}" data-creative="{promo['creative']}">🎟️ {e(promo['text'])}</a>
<div class="shop-bar"><a class="cart-link" href="/shop/cart">🛒 Cart <span data-cart-count>0</span></a><a href="/shop/orders">📦 Your test orders</a></div>
<ul class="products" data-item-list-id="shop_all" data-item-list-name="All products">{cards}</ul>"""
    return shop_shell("Shop", shop["tagline"], "/shop", body, "list")


def render_product(shop, p):
    det = "".join(f"<li>{e(d)}</li>" for d in p.get("details", []))
    opts = ""
    if p.get("variants"):
        v = p["variants"]
        radios = "".join(
            f'<label class="variant{" oos" if o.get("out_of_stock") else ""}"><input type="radio" name="variant" value="{o["id"]}"'
            f'{" disabled" if o.get("out_of_stock") else ""}{" checked" if i == 0 else ""} data-price="{o.get("price", p["price"])}">'
            f'<span>{e(o["label"])}{" · " + money(o["price"]) if "price" in o else ""}</span></label>'
            for i, o in enumerate(v["options"]))
        opts += f'<fieldset class="variants"><legend>{e(v["label"])}</legend>{radios}</fieldset>'
    if p.get("custom_text"):
        c = p["custom_text"]
        opts += f'<label class="custom-text">{e(c["label"])}<input name="custom_text" maxlength="{c["max"]}" placeholder="{e(c["placeholder"])}" autocomplete="off" required></label>'
    if p.get("pay_what_you_want"):
        opts += f'<label class="custom-text">Your amount (NZD)<input name="amount" type="number" min="1" max="500" step="0.5" value="{p["price"]}" inputmode="decimal"></label>'
    price = money(p["price"])
    body = f"""<a class="back" href="/shop">← All products</a>
<article class="pdp" data-item-id="{p['id']}">
  <div class="pdp-art" aria-hidden="true">{p['emoji']}</div>
  <div class="pdp-info">
    <span class="badge">{e(p['category'])}{" · digital" if p.get("digital") else ""}</span>
    <h1>{e(p['name'])}</h1>
    <p class="pdp-price" data-price-label>{"Pay what you want" if p.get("pay_what_you_want") else price}</p>
    <p class="pdp-blurb">{e(p['blurb'])}</p>
    <form class="pdp-form" novalidate>
      {opts}
      <div class="qty-row">
        <label>Quantity <input name="qty" type="number" min="1" max="10" value="1" inputmode="numeric"></label>
        <button type="submit" class="btn-primary">{"Buy now" if p.get("psych") else "Add to cart"}</button>
        <button type="button" class="btn-ghost" data-wishlist aria-pressed="false">♡ Wishlist</button>
      </div>
      <p class="form-status" role="status"></p>
    </form>
    <ul class="pdp-details">{det}</ul>
  </div>
</article>
<div class="shop-bar"><a class="cart-link" href="/shop/cart">🛒 Cart <span data-cart-count>0</span></a><a href="/shop/orders">📦 Your test orders</a></div>"""
    return shop_shell(p["name"], p["blurb"], f"/shop/{p['id']}", body, "product")


def render_cart():
    body = """<header class="brand"><span class="badge">🛒 Cart</span><h1>Your (pretend) cart</h1></header>
<div id="cart-root" aria-live="polite"><p class="health-empty">Loading…</p></div>"""
    return shop_shell("Cart", "Your pretend cart", "/shop/cart", body, "cart")


def render_checkout(shop):
    cards = "".join(f'<li><button type="button" class="card-fill" data-card="{c["number"]}"><code>{c["number"]}</code> {e(c["label"])}</button></li>' for c in shop["test_cards"])
    ship = "".join(f'<label class="variant"><input type="radio" name="shipping" value="{s["id"]}"{" checked" if i == 0 else ""}><span>{e(s["label"])} · <b data-ship-price="{s["id"]}">{money(s["price"])}</b></span></label>'
                   for i, s in enumerate(shop["shipping"]))
    body = f"""<header class="brand"><span class="badge">🔒 Pretend checkout</span><h1>Checkout</h1>
<p>Use a test card below. Real cards are refused, and nothing you type leaves this page.</p></header>
<div class="checkout" id="checkout-root">
  <form class="checkout-form" novalidate autocomplete="off">
    <fieldset class="step" data-step="contact"><legend><span>1</span> Contact</legend>
      <label>Email for your pretend receipt<input name="email" type="email" placeholder="you@example.com" autocomplete="off" required></label>
      <p class="hint">Use a made-up address if you like. It stays in your browser (only a scrambled hash is offered to tag tests, with marketing consent).</p>
      <button type="button" class="btn-primary" data-next="contact">Continue</button>
    </fieldset>
    <fieldset class="step" data-step="shipping" hidden><legend><span>2</span> Delivery</legend>
      <div class="ship-options">{ship}</div>
      <p class="hint" data-digital-note hidden>Everything in your cart is digital, so there's nothing to ship. 🎉</p>
      <button type="button" class="btn-primary" data-next="shipping">Continue to payment</button>
    </fieldset>
    <fieldset class="step" data-step="payment" hidden><legend><span>3</span> Payment</legend>
      <div class="wallets">
        <button type="button" class="wallet" data-wallet="apple_pay">Apple Pay <span class="test-tag">pretend</span></button>
        <button type="button" class="wallet" data-wallet="google_pay">Google Pay <span class="test-tag">pretend</span></button>
      </div>
      <p class="or"><span>or pay by test card</span></p>
      <label>Card number<input name="card" inputmode="numeric" autocomplete="off" placeholder="4242 4242 4242 4242" maxlength="23"></label>
      <div class="two-col"><label>Expiry<input name="exp" autocomplete="off" placeholder="12 / 34" maxlength="7"></label>
      <label>CVC<input name="cvc" autocomplete="off" inputmode="numeric" placeholder="123" maxlength="4"></label></div>
      <details class="test-cards"><summary>Test cards to try</summary><ul>{cards}</ul></details>
      <button type="submit" class="btn-primary pay-btn">Pay <span data-total></span></button>
    </fieldset>
    <p class="form-status" role="status" aria-live="assertive"></p>
  </form>
  <aside class="summary" aria-labelledby="sum-h"><h2 id="sum-h">Order summary</h2>
    <ul class="summary-lines" id="summary-lines"></ul>
    <form class="coupon" novalidate><label>Coupon code<input name="coupon" autocomplete="off" placeholder="CONSENT10, NOTSET or BADUTM"></label><button type="submit" class="btn-ghost">Apply</button><p class="form-status" role="status"></p></form>
    <dl class="totals" id="totals"></dl>
  </aside>
</div>
<div class="modal" id="verify-modal" hidden role="dialog" aria-modal="true" aria-labelledby="verify-h">
  <div class="modal-card"><h2 id="verify-h">🏦 Pretend Bank: verify it's you</h2>
  <p>This is a fake 3-D Secure check. A real bank would send you a code.</p>
  <div class="modal-actions"><button type="button" class="btn-primary" data-verify="pass">Approve</button><button type="button" class="btn-ghost" data-verify="fail">Fail verification</button></div></div>
</div>
<div class="modal" id="wallet-modal" hidden role="dialog" aria-modal="true" aria-labelledby="wallet-h">
  <div class="modal-card"><h2 id="wallet-h">📱 Pretend wallet</h2><p>Approve this pretend payment?</p>
  <div class="modal-actions"><button type="button" class="btn-primary" data-wallet-answer="approve">Approve</button><button type="button" class="btn-ghost" data-wallet-answer="cancel">Cancel</button></div></div>
</div>"""
    return shop_shell("Checkout", "Pretend checkout", "/shop/checkout", body, "checkout")


def render_order():
    body = """<header class="brand"><span class="badge">🎉 Order confirmed</span><h1>Thanks for your pretend order!</h1>
<p>Nothing will arrive, and no money moved. But the tracking did.</p></header>
<div id="order-root" aria-live="polite"></div>
<div class="shop-bar"><a href="/shop">Keep shopping</a><a href="/shop/orders">📦 Your test orders</a></div>"""
    return shop_shell("Order confirmed", "Pretend order confirmation", "/shop/order", body, "order")


def render_orders():
    body = """<header class="brand"><span class="badge">📦 Your test orders</span><h1>Order history</h1>
<p>Stored only in this browser. Request a refund to test the refund event.</p></header>
<div id="orders-root" aria-live="polite"></div>"""
    return shop_shell("Your test orders", "Pretend order history", "/shop/orders", body, "orders")


def roadmap_index(roadmap, cooking):
    """Map each What's Cooking product to the roadmap entries that point at it, so the two pages stay in step."""
    products = [pr for g in cooking["groups"] for pr in g["projects"]]

    def find(ref):
        hits = [pr for pr in products if ref.lower() in pr["name"].lower()]
        if len(hits) != 1:
            raise SystemExit(f"roadmap.json: product reference {ref!r} matched {len(hits)} products")
        return hits[0]

    idx = {}
    def slot(pr):
        return idx.setdefault(pr["name"], {"tasks": [], "stages": [], "column": None})
    for st in roadmap["recap"]:
        for ref in st["products"]:
            slot(find(ref))["stages"].append(st["stage"])
    for t in roadmap["tasks"]:
        slot(find(t["product"]))["tasks"].append(t["task"])
    for col in roadmap["kanban"]:
        for card in col["cards"]:
            slot(find(card["product"]))["column"] = col["name"]
    return find, idx



def render_roadmap(data, cooking):
    """Roadmap: (1) what I do, (2) tasks on an impact/effort matrix, (3) kanban of the products.
    Every task and card names a What's Cooking product; links, status and 'automated or not' come from there."""
    statuses = cooking["statuses"]
    _find, _ = roadmap_index(data, cooking)

    def find(ref):
        p = _find(ref)
        return p, f"/whats-cooking#{slugify(p['name'])}"

    def bubble(p, status=None):
        key = status or p["status"]
        st = statuses[key]
        return f'<span class="status-bubble st-{key}">{st["emoji"]} {e(st["label"])}</span>'

    def state(p):
        # how the task is handled today, derived from the product that covers it
        return ("auto", "🤖 Automated") if p["status"] == "done" else (("build", "🛠️ Automating") if p["status"] in ("drafted", "testing", "progress", "idle") else ("rnd", "🔬 Exploring"))

    out = [head("Roadmap — Debbie Tan", data["intro"], "/roadmap", "roadmap", "/og/whats-cooking.png")]
    out.append('<main id="main" class="pulse-wrap roadmap">')
    out.append(f'<header class="brand"><span class="badge">🧭 built in my own time</span><h1>{e(data["title"])}</h1><p>{e(data["intro"])}</p></header>')
    out.append('<div class="dish-tools"><button type="button" data-rm-expand="open">Open all</button><button type="button" data-rm-expand="close">Close all</button></div>')

    # (1) recap
    stages = []
    for s in data["recap"]:
        prods = "".join(f'<li><a href="{find(r)[1]}">{e(find(r)[0]["name"])}</a> {bubble(find(r)[0])}</li>' for r in s["products"])
        stages.append(f"""<li class="rm-stage">
  <h3><span aria-hidden="true">{e(s['emoji'])}</span> {e(s['stage'])}</h3>
  <p>{e(s['what'])}</p>
  <p class="rm-time"><b>⏳ Where the time goes:</b> {e(s['time'])}</p>
  <ul class="rm-prods" aria-label="What I've built for it">{prods}</ul>
</li>""")
    out.append(f"""<details class="rm-sec" id="what-i-do" data-rm="recap" open>
<summary><span class="rm-no">1</span><span><b>What I do, end to end</b><small>The work in the order it happens, what eats the time, and what I've built for it</small></span></summary>
<ol class="rm-stages">{''.join(stages)}</ol>
</details>""")

    # (2) impact / effort matrix
    q = data["quadrants"]
    dots, keys = [], {"tl": [], "tr": [], "bl": [], "br": []}
    for n, t in enumerate(data["tasks"], 1):
        p, href = find(t["product"])
        quad = ("t" if t["impact"] == "high" else "b") + ("r" if t["effort"] == "high" else "l")
        cls, lab = state(p)
        tip = f'{t["task"]} · {t["impact"]} impact, {t["effort"]} effort · {lab[2:].strip()} by {p["name"]}'
        dots.append(f'<a class="rm-dot q-{quad} s-{cls}" href="{href}" style="left:{t["x"]}%;bottom:{t["y"]}%" '
                    f'data-n="{n}" data-task="{e(t["task"])}" aria-label="{e(tip)}"><span>{n}</span>'
                    f'<span class="rm-tip" aria-hidden="true"><b>{e(t["task"])}</b>{e(t["effort"].capitalize())} effort · {lab}<i>{e(p["name"])} →</i></span></a>')
        keys.setdefault(quad if t["effort"] != "medium" else "tm", []).append(
            f'<li><a href="{href}" data-n="{n}"><span class="rm-k s-{cls}">{n}</span><span class="rm-kt">{e(t["task"])}</span>'
            f'<span class="rm-ks s-{cls}">{lab}</span><span class="rm-kp">→ {e(p["name"])}</span></a></li>')
    groups = [("tl", q["tl"]["name"], q["tl"]["hint"]), ("tm", "Steady earners", "High impact, medium effort"),
              ("tr", q["tr"]["name"], q["tr"]["hint"]), ("bl", q["bl"]["name"], q["bl"]["hint"]), ("br", q["br"]["name"], q["br"]["hint"])]
    key_html = "".join(f'<div class="rm-kg q-{k}"><h4>{e(name)} <small>{e(hint)}</small></h4><ul>{"".join(keys.get(k, []))}</ul></div>'
                       for k, name, hint in groups if keys.get(k))
    out.append(f"""<details class="rm-sec" id="impact-effort" data-rm="matrix" open>
<summary><span class="rm-no">2</span><span><b>Impact / effort matrix</b><small>Every task I do, plotted. The quick wins and time sinks are how I picked what to automate first</small></span></summary>
<div class="rm-matrix-wrap">
  <p class="rm-howto">Hover or tap a number to see the task, then click through to the product that handles it.</p>
  <div class="rm-legend"><span class="rm-k s-auto">#</span> Automated <span class="rm-k s-build">#</span> Automating <span class="rm-k s-rnd">#</span> Exploring</div>
  <div class="rm-plot-wrap">
    <span class="rm-axis-y" aria-hidden="true">Impact →</span>
    <div class="rm-plot" role="group" aria-label="Impact and effort matrix of {len(data['tasks'])} tasks">
      <span class="rm-q rm-q-tl" aria-hidden="true">{e(q['tl']['name'])}</span><span class="rm-q rm-q-tm" aria-hidden="true">Steady earners</span><span class="rm-q rm-q-tr" aria-hidden="true">{e(q['tr']['name'])}</span>
      <span class="rm-q rm-q-bl" aria-hidden="true">{e(q['bl']['name'])}</span><span class="rm-q rm-q-br" aria-hidden="true">{e(q['br']['name'])}</span>
      {''.join(dots)}
    </div>
    <div class="rm-axis-x" aria-hidden="true"><span>Low effort</span><span>Medium</span><span>High effort →</span></div>
  </div>
  <div class="rm-key">{key_html}</div>
</div>
</details>""")

    # (3) kanban
    cols = []
    for c in data["kanban"]:
        cards = []
        for card in c["cards"]:
            p, href = find(card["product"])
            note = f'<span class="kb-note">{e(card["note"])}</span>' if card.get("note") else ""
            cards.append(f'<li><a class="kb-card" href="{href}"><span class="kb-emoji" aria-hidden="true">{e(p.get("emoji", "🍳"))}</span>'
                         f'<span class="kb-name">{e(card.get("label") or p["name"])}</span>{bubble(p, card.get("status"))}{note}<span class="kb-go" aria-hidden="true">→</span></a></li>')
        cols.append(f'<section class="kb-col kb-{c["key"]}" aria-labelledby="kb-{c["key"]}"><h3 id="kb-{c["key"]}">{e(c["name"])} <span class="kb-count">{len(c["cards"])}</span></h3><ul>{"".join(cards)}</ul></section>')
    out.append(f"""<details class="rm-sec" id="kanban" data-rm="kanban" open>
<summary><span class="rm-no">3</span><span><b>Kanban</b><small>Where each product is up to. Tap a card to open it</small></span></summary>
<div class="kb-board">{''.join(cols)}</div>
</details>""")
    out.append("</main>")
    out.append(FOOT)
    return "\n".join(out)


def render_philosophy(data):
    """How I use AI — Debbie's own position, each principle backed by a named 2026 source."""
    out = [head("How I use AI — Debbie Tan", data["intro"], "/how-i-use-ai", "ai", "/og/philosophy.png")]
    out.append('<main id="main" class="pulse-wrap philosophy">')
    out.append(f'<header class="brand"><span class="badge">{e(data["badge"])}</span><h1>{e(data["title"])}</h1>'
               f'<p>{e(data["intro"])}</p></header>')
    out.append(f'<p class="lede">{e(data["standfirst"])}</p>')
    out.append('<div class="dish-tools"><button type="button" data-ph-expand="open">Open all</button>'
               '<button type="button" data-ph-expand="close">Close all</button></div>')

    def quote_html(q):
        return (f'<figure class="ph-quote"><blockquote>{e(q["text"])}</blockquote>'
                f'<figcaption>— {e(q["who"])}, <a href="{e(q["url"])}" target="_blank" rel="noopener">{e(q["where"])}</a>, {e(q["date"])}</figcaption></figure>')

    out.append('<ol class="ph-list">')
    for n, pr in enumerate(data["principles"], 1):
        paras = "".join(f"<p>{e(x)}</p>" for x in pr["body"])
        quotes = quote_html(pr["quote"]) + (quote_html(pr["quote2"]) if pr.get("quote2") else "")
        out.append(f"""<li class="ph-item" id="{slugify(pr['name'])}">
  <details data-principle="{slugify(pr['name'])}" open>
    <summary>
      <span class="ph-no" aria-hidden="true">{n}</span>
      <span class="ph-emoji" aria-hidden="true">{e(pr.get('emoji', '💭'))}</span>
      <span class="ph-head"><span class="ph-name">{e(pr['name'])}</span><span class="ph-sum">{e(pr['summary'])}</span></span>
    </summary>
    <div class="ph-body">{paras}{quotes}</div>
  </details>
</li>""")
    out.append("</ol>")

    seen, srcs = set(), []
    for pr in data["principles"]:
        for key in ("quote", "quote2"):
            q = pr.get(key)
            if q and q["url"] not in seen:
                seen.add(q["url"])
                srcs.append(f'<li><a href="{e(q["url"])}" target="_blank" rel="noopener">{e(q["who"])} — {e(q["where"])}</a>, {e(q["date"])}</li>')
    out.append(f'<section class="ph-sources"><h2>Where the quotes come from</h2>'
               f'<p class="hint">{e(data["sources_note"])}</p><ol>{"".join(srcs)}</ol></section>')
    out.append(f'<p class="note">{e(data["outro"])}</p>')
    out.append("</main>")
    out.append(FOOT)
    return "\n".join(out)



def render_page(title, desc, path, body_html, extra_class="", current=""):
    return "\n".join([head(title, desc, path, current), f'<main id="main" class="pulse-wrap {extra_class}">', body_html, "</main>", FOOT])


def render_404():
    body = """<header class="brand"><span class="badge">🍜 oops</span><h1>This page wandered off</h1>
<p>It might have moved, or never existed. Try the <a href="/">latest edition of On the Pulse</a> or see <a href="/whats-cooking">what's cooking</a>.</p></header>"""
    return render_page("Page not found — Debbie Tan", "Page not found", "/404", body)


def render_sitemap(issues):
    urls = ["/", "/whats-cooking", "/roadmap", "/how-i-use-ai", "/shop", "/about", "/privacy"] + [f"/pulse/{i['slug']}" for i in issues]
    rows = "".join(f"<url><loc>{SITE_URL}{u}</loc></url>" for u in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{rows}</urlset>\n'


def render_feed(issues):
    items = []
    for i in issues:
        d = datetime.datetime.fromisoformat(i["date"] + "T08:00:00+13:00")
        items.append(f"""<item><title>{e(month_label(i['month']))}: {e(i['title'])}</title><link>{SITE_URL}/pulse/{i['slug']}</link>
<guid>{SITE_URL}/pulse/{i['slug']}</guid><pubDate>{d.strftime('%a, %d %b %Y %H:%M:%S %z')}</pubDate>
<description>{e(i['lede'])}</description></item>""")
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>On the Pulse — Debbie Tan</title><link>{SITE_URL}/</link>
<description>A monthly read on AI, data, measurement and privacy.</description>
{''.join(items)}
</channel></rss>
"""


def main():
    issues = sorted((json.loads(p.read_text()) for p in (CONTENT / "pulse").glob("*.json")),
                    key=lambda i: i["month"], reverse=True)
    pulse_dir = SITE / "pulse"
    pulse_dir.mkdir(exist_ok=True)
    for old in pulse_dir.glob("*.html"):
        old.unlink()
    for issue in issues:
        (pulse_dir / f"{issue['slug']}.html").write_text(render_issue(issue, issues))
    (SITE / "index.html").write_text(render_home(issues))
    (pulse_dir / "feed.xml").write_text(render_feed(issues))
    cooking = CONTENT / "whats-cooking.json"
    if cooking.exists():
        cooking_data = json.loads(cooking.read_text())
        roadmap_data = json.loads((CONTENT / "roadmap.json").read_text())
        (SITE / "whats-cooking.html").write_text(render_cooking(cooking_data, roadmap_data))
        (SITE / "roadmap.html").write_text(render_roadmap(roadmap_data, cooking_data))
    (SITE / "how-i-use-ai.html").write_text(render_philosophy(json.loads((CONTENT / "philosophy.json").read_text())))
    privacy = CONTENT / "privacy.html"
    if privacy.exists():
        (SITE / "privacy.html").write_text(render_page(
            "Privacy & cookies — Debbie Tan", "What this site collects, why, and how to change your cookie choices.",
            "/privacy", privacy.read_text(), "privacy"))
    (SITE / "404.html").write_text(render_404())
    # Site health tab is off for now. The data is still collected (/api/csp-report, /api/client-error,
    # /api/vitals) and render_health() below still works — put this line back to bring the tab back.
    shop = json.loads((CONTENT / "shop.json").read_text())
    (SITE / "shop").mkdir(exist_ok=True)
    for old in (SITE / "shop").glob("*.html"):
        old.unlink()
    (SITE / "shop.html").write_text(render_shop(shop))
    for p in shop["products"]:
        (SITE / "shop" / f"{p['id']}.html").write_text(render_product(shop, p))
    (SITE / "shop" / "cart.html").write_text(render_cart())
    (SITE / "shop" / "checkout.html").write_text(render_checkout(shop))
    (SITE / "shop" / "order.html").write_text(render_order())
    (SITE / "shop" / "orders.html").write_text(render_orders())
    (SITE / "sitemap.xml").write_text(render_sitemap(issues))
    (SITE / "robots.txt").write_text(f"User-agent: *\nDisallow: /admin.html\nDisallow: /api/\n\nSitemap: {SITE_URL}/sitemap.xml\n")
    print(f"Built {len(issues)} editions, homepage, feed, What's Cooking, privacy, 404, sitemap")


if __name__ == "__main__":
    main()
