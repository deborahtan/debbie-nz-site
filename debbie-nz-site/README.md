# debbie.nz

Personal site — On the Pulse (homepage), writing, mission-scored search, shop
teaser. Static HTML served by a small Cloudflare Worker that also runs the
likes/comments API.

## On the Pulse (homepage)

- One edition per month, named for the month it covers:
  `content/pulse/YYYY-MM.json` (repo root, not served).
- `content/whats-cooking.json` drives the What's Cooking page.
- `python3 scripts/build_pulse.py` regenerates `index.html` (full latest
  edition + previous editions), `pulse/YYYY-MM.html`, `pulse/feed.xml` and
  `whats-cooking.html`. Commit the output.
- New edition: add e.g. `2026-11.json`, run the script, push.

## Likes + comments — one-time setup

1. Deploy (push and let Workers Builds deploy). The D1 database
   `debbie-nz-pulse` is created automatically on first deploy, and the Worker
   creates its tables on first request.
2. Add two secrets (any long random strings) in Cloudflare → Workers →
   debbie-nz-site → Settings → Variables and Secrets: `ADMIN_TOKEN` and
   `HASH_SALT`. (Or `npx wrangler secret put <NAME>`.) Without `HASH_SALT`
   nothing about IPs is stored and rate limiting is off.
3. Comments publish instantly and need an email from a mainstream provider
   (list in `worker/index.js`); only a masked version is shown. Delete any
   comment at `/admin.html` with the ADMIN_TOKEN.

Privacy: no accounts; commenter emails are stored but only ever shown masked, and never sent to analytics. IPs are salted + hashed (never stored raw) and
only used for rate limiting. Local dev: `npm run dev` (uses `.dev.vars`).

## Deploy (Cloudflare Pages)

1. Push this repo to GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.
3. Select this repo. Build settings: **no build command**, output directory `/`.
4. Deploy. Live at `<project-name>.pages.dev` immediately — no custom domain
   required to start.
5. To attach debbie.nz later: Pages project → Custom domains → add it, then
   update DNS wherever the domain is registered.

Every branch/PR gets its own preview URL automatically before merging to
`main` — that's the sandbox.

## GTM setup

1. Create a container at tagmanager.google.com if you haven't already.
2. Note your **Account ID** and **Container ID** (visible in the container's
   admin/URL).
3. Open `gtm-container-export.json` (in the parent folder) and replace:
   - `REPLACE_ACCOUNT_ID`
   - `REPLACE_CONTAINER_ID`
   - `GTM-REPLACE` → your real container's public ID
   - `G-REPLACE_MEASUREMENT_ID` → your GA4 measurement ID
4. GTM → Admin → Import Container → upload the file → choose
   **Merge**, workspace **Overwrite** (safe on a fresh container) → Confirm.
5. If any single tag/trigger/variable errors on import, skip it and recreate
   that one piece manually using `gtm-data-dictionary.md` as the spec — the
   rest of the import will still have worked.
6. In `index.html`, replace both instances of `GTM-REPLACE` with your real
   container ID (head snippet and noscript body snippet).
7. In GA4 admin, complete the two manual steps noted in the data dictionary
   (custom dimension for `visitor_mission`, mark `shop_teaser_click` as a
   conversion).
8. Publish the GTM workspace, push the HTML change, done.

## Files

- `index.html` — the site, GTM snippets already inserted (placeholder ID)
- `../gtm-data-dictionary.md` — event/parameter spec, source of truth
- `../gtm-container-export.json` — importable GTM container
