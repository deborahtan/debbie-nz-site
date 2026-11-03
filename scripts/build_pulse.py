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
import json, re, datetime, pathlib
from html import escape

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "debbie-nz-site"
CONTENT = ROOT / "content"
GTM_ID = "GTM-NXPF7HTS"
SITE_URL = "https://debbie.nz"


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
NAV_ITEMS = [("/", "on the pulse", "pulse"), ("/whats-cooking", "what's cooking", "cooking"),
             ("/about.html", "about", "about")]


def head(title, description, path, current):
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
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(description)}">
<meta name="color-scheme" content="light dark">
<script src="/consent.js"></script>
<script>(function(w,d,s,l,i){{w[l]=w[l]||[];w[l].push({{'gtm.start':
new Date().getTime(),event:'gtm.js'}});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
}})(window,document,'script','dataLayer','{GTM_ID}');</script>
<!-- End Google Tag Manager -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700&family=Nunito:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">
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
      <a href="#" id="shop-teaser">shop</a>
      <a href="/form-test.html">sign up</a>
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
"""


FOOT = """
<footer>
  <span>© Debbie Tan — Auckland, Aotearoa</span>
  <span class="foot-links"><a href="/privacy">Privacy</a> · <a href="/privacy#consent" data-consent-open>Cookie settings</a></span>
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
    <button type="submit">Post comment</button>
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
                f"/pulse/{issue['slug']}", "pulse")]
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
                "/", "pulse")]
    out.append(f'<main id="main" class="pulse-wrap issue home" data-issue="{latest["slug"]}">')
    out.append('<header class="brand"><span class="badge">💗 On the Pulse · monthly</span>'
               '<p>A monthly read on AI, data, measurement &amp; privacy from Auckland, Aotearoa. Every item dated and sourced.</p></header>')
    out.append(issue_body(latest, heading_level_link=f"/pulse/{latest['slug']}"))
    out.append(previous_list(issues, latest["slug"]))
    out.append("</main>")
    out.append(FOOT)
    return "\n".join(out)


def render_cooking(data):
    out = [head("What's Cooking — Debbie Tan", data["intro"], "/whats-cooking", "cooking")]
    out.append('<main id="main" class="pulse-wrap cooking">')
    out.append(f'<header class="brand"><span class="badge">🍳 fresh from the kitchen</span><h1>{e(data["title"])}</h1><p>{e(data["intro"])}</p></header>')
    out.append('<div class="dish-tools"><button type="button" data-expand="open">Open all</button>'
               '<button type="button" data-expand="close">Close all</button></div>')
    out.append('<ul class="dishes">')
    for p in data["projects"]:
        tags = "".join(f"<span>{e(t)}</span>" for t in p.get("tags", []))
        does = "".join(f"<li>{e(x)}</li>" for x in p.get("does", []))
        bens = "".join(f"<li>{e(x)}</li>" for x in p.get("benefits", []))
        link = f'<a class="dish-link" href="{e(p["link"]["url"])}">{e(p["link"]["label"])} →</a>' if p.get("link") else ""
        out.append(f"""<li class="dish" id="{slugify(p['name'])}">
  <details data-project="{slugify(p['name'])}">
    <summary>
      <span class="dish-emoji" aria-hidden="true">{e(p.get('emoji', '🍳'))}</span>
      <span class="dish-head">
        <span class="dish-tags">{tags}</span>
        <span class="dish-name">{e(p['name'])}</span>
        <span class="dish-sum">{e(p['summary'])}</span>
      </span>
      <span class="dish-toggle" aria-hidden="true"></span>
    </summary>
    <div class="dish-body">
      <div class="dish-col"><h3>What it does</h3><ul>{does}</ul></div>
      <div class="dish-col"><h3>Why it helps</h3><ul>{bens}</ul></div>
      {link}
    </div>
  </details>
</li>""")
    out.append("</ul>")
    if data.get("outro"):
        out.append(f'<p class="note">{e(data["outro"])}</p>')
    out.append("</main>")
    out.append(FOOT)
    return "\n".join(out)


def render_page(title, desc, path, body_html, extra_class=""):
    return "\n".join([head(title, desc, path, ""), f'<main id="main" class="pulse-wrap {extra_class}">', body_html, "</main>", FOOT])


def render_404():
    body = """<header class="brand"><span class="badge">🍜 oops</span><h1>This page wandered off</h1>
<p>It might have moved, or never existed. Try the <a href="/">latest edition of On the Pulse</a> or see <a href="/whats-cooking">what's cooking</a>.</p></header>"""
    return render_page("Page not found — Debbie Tan", "Page not found", "/404", body)


def render_sitemap(issues):
    urls = ["/", "/whats-cooking", "/about", "/privacy"] + [f"/pulse/{i['slug']}" for i in issues]
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
        (SITE / "whats-cooking.html").write_text(render_cooking(json.loads(cooking.read_text())))
    privacy = CONTENT / "privacy.html"
    if privacy.exists():
        (SITE / "privacy.html").write_text(render_page(
            "Privacy & cookies — Debbie Tan", "What this site collects, why, and how to change your cookie choices.",
            "/privacy", privacy.read_text(), "privacy"))
    (SITE / "404.html").write_text(render_404())
    (SITE / "sitemap.xml").write_text(render_sitemap(issues))
    (SITE / "robots.txt").write_text(f"User-agent: *\nDisallow: /admin.html\nDisallow: /api/\n\nSitemap: {SITE_URL}/sitemap.xml\n")
    print(f"Built {len(issues)} editions, homepage, feed, What's Cooking, privacy, 404, sitemap")


if __name__ == "__main__":
    main()
