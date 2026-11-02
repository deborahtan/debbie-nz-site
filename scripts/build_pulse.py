#!/usr/bin/env python3
"""
Builds the On the Pulse blog from content/pulse/*.json.

  python3 scripts/build_pulse.py

Writes:
  debbie-nz-site/index.html              homepage: latest issue + archive
  debbie-nz-site/pulse/issue-XX.html     one page per issue (likes + comments)

To publish a new edition: add content/pulse/issue-10.json (same shape as the
others), run this script, commit. No other step.
"""
import json, re, datetime, pathlib
from html import escape

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "debbie-nz-site"
CONTENT = ROOT / "content" / "pulse"
GTM_ID = "GTM-NXPF7HTS"
SITE_URL = "https://debbie.nz"


def e(s):
    return escape(s or "", quote=True)


def nice_date(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{d.day} {d.strftime('%B %Y')}"


def words(issue):
    parts = [issue.get("lede", "")] + issue.get("take", [])
    for s in issue["sections"]:
        for it in s["items"]:
            parts += [it.get("title") or ""] + [p["text"] for p in it["paragraphs"]]
    return len(" ".join(parts).split())


def story_count(issue):
    return sum(1 for s in issue["sections"] for it in s["items"] if it.get("title"))


def issue_stats(issue):
    if issue.get("stats"):
        return issue["stats"]
    for s in issue["sections"]:
        if s.get("stats"):
            return s["stats"]
    return []


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def title_html(issue):
    t, acc = issue["title"], issue.get("title_accent")
    if acc and t.endswith(acc):
        return e(t[: -len(acc)]) + f"<span>{e(acc)}</span>"
    return e(t)


# ------------------------------------------------------------------ shell
def head(title, description, path, extra=""):
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{e(title)}</title>
<meta name="description" content="{e(description)}">
<link rel="canonical" href="{SITE_URL}{path}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(description)}">
<meta property="og:type" content="article">
<script>(function(w,d,s,l,i){{w[l]=w[l]||[];w[l].push({{'gtm.start':
new Date().getTime(),event:'gtm.js'}});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
}})(window,document,'script','dataLayer','{GTM_ID}');</script>
<!-- End Google Tag Manager -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Instrument+Sans:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600;700;800&family=Newsreader:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/pulse.css">
<link rel="alternate" type="application/rss+xml" title="On the Pulse" href="/pulse/feed.xml">
{extra}</head>
<body class="pulse">
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id={GTM_ID}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->

<nav>
  <a href="/" class="wordmark">Debbie Tan</a>
  <div class="nav-right">
    <div class="nav-links">
      <a href="/" aria-current="page">on the pulse</a>
      <a href="/writing.html">writing</a>
      <a href="/about.html">about</a>
      <a href="#" id="shop-teaser">shop</a>
      <a href="/form-test.html">sign up</a>
    </div>
    <div class="nav-search">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <input type="text" id="site-search" placeholder="Search writing" autocomplete="off" aria-label="Search writing">
    </div>
  </div>
</nav>
"""


FOOT = """
<footer>
  <span>© Debbie Tan — Auckland, Aotearoa</span>
  <span>Some posts are AI-assisted. All are read, questioned, and approved by me.</span>
</footer>

<script>
  window.dataLayer = window.dataLayer || [];
  const searchInput = document.getElementById('site-search');
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && this.value.trim().length > 0) {
      window.dataLayer.push({ event: 'search', search_term: this.value.trim() });
    }
  });
  document.getElementById('shop-teaser').addEventListener('click', function(e) {
    e.preventDefault();
    window.dataLayer.push({ event: 'shop_teaser_click' });
    alert('Shop is currently being built — check back soon.');
  });
</script>
<script src="/pulse.js" defer></script>
</body>
</html>
"""

HEART = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.5h2c.7-1.4 2.2-2.5 4.3-2.5 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>'
BUBBLE = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/></svg>'


# ------------------------------------------------------------------ pieces
def stats_html(stats):
    if not stats:
        return ""
    cells = "".join(
        f'<div class="stat"><span class="n">{e(s["value"])}</span><span class="l">{e(s["label"])}</span>'
        + (f'<span class="s">{e(s["source"])}</span>' if s.get("source") else "")
        + "</div>"
        for s in stats
    )
    return f'<div class="stats-row">{cells}</div>'


def item_html(it, no):
    out = ['<article class="item">']
    if it.get("title"):
        num = f'<span class="no">{no:02d}</span>' if no else ""
        out.append(f'<h3 id="{slugify(it["title"])[:60]}">{num}{e(it["title"])}</h3>')
    if it.get("meta"):
        out.append(f'<div class="meta">{e(it["meta"])}</div>')
    for p in it["paragraphs"]:
        lab = p.get("label")
        cls = " imp" if lab and lab.lower() not in ("what happened", "what it is") else ""
        lab_html = f'<span class="label{cls}">{e(lab)}</span>' if lab else ""
        out.append(f"<p>{lab_html}{e(p['text'])}</p>")
    if it.get("sources"):
        links = " · ".join(
            f'<a href="{e(s["url"])}" target="_blank" rel="noopener">{e(s["name"])}</a>' for s in it["sources"]
        )
        out.append(f'<p class="src-inline">Source: {links}</p>')
    out.append("</article>")
    return "\n".join(out)


def engage_bar(slug):
    return f"""<div class="engage" data-engage="{slug}">
  <button class="like-btn" type="button" data-like="{slug}" aria-pressed="false">{HEART}<span class="like-label">Like</span><span class="like-count" data-like-count="{slug}"></span></button>
  <a class="comment-jump" href="#comments">{BUBBLE}<span data-comment-count="{slug}"></span><span class="sr">comments</span></a>
  <button class="share-btn" type="button" data-share="{slug}">Share</button>
</div>"""


def comments_block(slug):
    return f"""<section class="comments" id="comments" data-comments="{slug}">
  <h2>Comments <span class="count" data-comment-count="{slug}"></span></h2>
  <ol class="comment-list" aria-live="polite"><li class="comment-empty">Loading comments…</li></ol>
  <form class="comment-form" novalidate>
    <h3>Add a comment</h3>
    <label>Name<input name="name" required maxlength="60" autocomplete="nickname"></label>
    <label>Comment<textarea name="body" required maxlength="2000" rows="5"></textarea></label>
    <label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
    <p class="form-note">No email, no account. Comments are read before they're published — be kind and on-topic.</p>
    <button type="submit">Post comment</button>
    <p class="form-status" role="status"></p>
  </form>
</section>"""


# ------------------------------------------------------------------ issue page
def render_issue(issue, prev_i, next_i):
    slug, n = issue["slug"], issue["number"]
    date = nice_date(issue["date"])
    mins = max(1, round(words(issue) / 230))
    stories = story_count(issue)
    desc = issue["lede"][:200]
    out = [head(f"{issue['title']} — On the Pulse No. {n:02d}", desc, f"/pulse/{slug}")]
    out.append(f'<main class="pulse-wrap issue" data-issue="{slug}">')
    out.append('<a class="back" href="/">← All issues</a>')
    out.append(f'<div class="mast"><span>On the Pulse · Issue No. {n:02d}</span>'
               f'<span><b>{e(date)}</b> · {e(issue["period"])}</span></div>')
    out.append(f'<div class="kicker">On the Pulse · {e(issue.get("kicker",""))}</div>')
    out.append(f"<h1>{title_html(issue)}</h1>")
    out.append(f'<div class="byline">Debbie Tan · {e(date)} · {stories} stories · {mins} min read</div>')
    out.append(engage_bar(slug))
    if issue.get("greeting"):
        out.append(f'<div class="greeting">{e(issue["greeting"])}</div>')
    out.append(f'<p class="lede">{e(issue["lede"])}</p>')
    if issue.get("stats"):
        out.append(stats_html(issue["stats"]))

    # contents
    toc = "".join(f'<a href="#{slugify(s["heading"])}">{e(s["heading"])}</a>' for s in issue["sections"])
    out.append(f'<nav class="toc" aria-label="In this issue"><span>In this issue</span>{toc}</nav>')

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

    out.append(engage_bar(slug))

    if issue.get("sources"):
        lis = "".join(f'<li><a href="{e(s["url"])}" target="_blank" rel="noopener">{e(s["name"])}</a></li>'
                      for s in issue["sources"])
        out.append(f'<div class="src"><h4>Sources</h4><ol>{lis}</ol></div>')
    for note in issue.get("notes", []):
        out.append(f'<p class="note">{e(note)}</p>')
    if issue.get("about"):
        out.append(f'<p class="note">{e(issue["about"])}</p>')

    pn = []
    if next_i:
        pn.append(f'<a class="newer" href="/pulse/{next_i["slug"]}"><span>Newer · No. {next_i["number"]:02d}</span>{e(next_i["title"])}</a>')
    if prev_i:
        pn.append(f'<a class="older" href="/pulse/{prev_i["slug"]}"><span>Older · No. {prev_i["number"]:02d}</span>{e(prev_i["title"])}</a>')
    if pn:
        out.append(f'<nav class="prevnext" aria-label="More issues">{"".join(pn)}</nav>')

    out.append(comments_block(slug))
    out.append("</main>")
    out.append(FOOT)
    return "\n".join(out)


# ------------------------------------------------------------------ homepage
def render_home(issues):
    latest, older = issues[0], issues[1:]
    date = nice_date(latest["date"])
    mins = max(1, round(words(latest) / 230))
    out = [head("On the Pulse — Debbie Tan",
                "Monthly notes on AI, data, measurement and privacy from Auckland, Aotearoa. Every item dated and sourced.",
                "/")]
    out.append('<main class="pulse-wrap home">')
    out.append("""<header class="pulse-mast">
  <div class="kicker">On the Pulse · by Debbie Tan</div>
  <h1>What's moving in AI, data &amp; <span>measurement.</span></h1>
  <p class="intro">A monthly pull of what actually changed for anyone working in data, measurement or privacy in media and marketing — written from Auckland, Aotearoa. Every item is dated and links to its primary source.</p>
</header>""")

    # featured latest issue
    toc = []
    for s in latest["sections"]:
        for it in s["items"]:
            if it.get("title"):
                toc.append(f"<li>{e(it['title'])}</li>")
    out.append(f"""<article class="feature" data-issue-card="{latest['slug']}">
  <div class="feature-meta"><span class="badge">Latest</span><span>Issue No. {latest['number']:02d}</span><span>{e(date)}</span><span>{mins} min read</span></div>
  <h2><a href="/pulse/{latest['slug']}" class="issue-link" data-post-id="{latest['slug']}">{title_html(latest)}</a></h2>
  <p class="lede">{e(latest['lede'])}</p>
  {stats_html(issue_stats(latest))}
  <div class="inside"><span>Inside</span><ol>{''.join(toc[:8])}</ol></div>
  <div class="feature-foot">
    <a class="read" href="/pulse/{latest['slug']}" data-post-id="{latest['slug']}">Read the issue →</a>
    <span class="counts"><span class="ct">{HEART}<span data-like-count="{latest['slug']}">–</span></span><span class="ct">{BUBBLE}<span data-comment-count="{latest['slug']}">–</span></span></span>
  </div>
</article>""")

    if older:
        out.append('<section class="archive"><h2>Earlier issues</h2><ol>')
        for i in older:
            out.append(f"""<li data-issue-card="{i['slug']}"><a class="arch-row issue-link" href="/pulse/{i['slug']}" data-post-id="{i['slug']}">
  <div class="arch-top"><span class="no">No. {i['number']:02d}</span><span class="date">{e(nice_date(i['date']))}</span>
  <span class="counts"><span class="ct">{HEART}<span data-like-count="{i['slug']}">–</span></span><span class="ct">{BUBBLE}<span data-comment-count="{i['slug']}">–</span></span></span></div>
  <h3>{e(i['title'])}</h3>
  <p>{e(i['lede'][:220].rsplit(' ', 1)[0])}…</p>
</a></li>""")
        out.append("</ol></section>")
    out.append("</main>")
    out.append(FOOT)
    return "\n".join(out)


def render_feed(issues):
    items = []
    for i in issues:
        d = datetime.datetime.fromisoformat(i["date"] + "T08:00:00+13:00")
        items.append(f"""<item><title>{e(i['title'])}</title><link>{SITE_URL}/pulse/{i['slug']}</link>
<guid>{SITE_URL}/pulse/{i['slug']}</guid><pubDate>{d.strftime('%a, %d %b %Y %H:%M:%S %z')}</pubDate>
<description>{e(i['lede'])}</description></item>""")
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>On the Pulse — Debbie Tan</title><link>{SITE_URL}/</link>
<description>Monthly notes on AI, data, measurement and privacy.</description>
{''.join(items)}
</channel></rss>
"""


def main():
    issues = sorted((json.loads(p.read_text()) for p in CONTENT.glob("issue-*.json")),
                    key=lambda i: i["number"], reverse=True)
    (SITE / "pulse").mkdir(exist_ok=True)
    for idx, issue in enumerate(issues):
        newer = issues[idx - 1] if idx > 0 else None
        older = issues[idx + 1] if idx + 1 < len(issues) else None
        (SITE / "pulse" / f"{issue['slug']}.html").write_text(render_issue(issue, older, newer))
    (SITE / "index.html").write_text(render_home(issues))
    (SITE / "pulse" / "feed.xml").write_text(render_feed(issues))
    print(f"Built {len(issues)} issues + homepage + feed")


if __name__ == "__main__":
    main()
