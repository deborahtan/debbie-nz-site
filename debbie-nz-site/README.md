# debbie.nz

Personal site — On the Pulse (homepage), writing, mission-scored search, shop
teaser. Static HTML served by a small Cloudflare Worker that also runs the
likes/comments API.

## On the Pulse (homepage)

- Content lives in `content/pulse/issue-XX.json` (repo root, not served).
- `python3 scripts/build_pulse.py` regenerates `index.html`,
  `pulse/issue-XX.html` and `pulse/feed.xml` (RSS). Commit the output.
- New edition: add `issue-10.json` in the same shape, run the script, push.

## Likes + comments — one-time setup

1. `npm install`
2. `npx wrangler d1 create debbie-nz-pulse` → paste the `database_id` into
   `wrangler.jsonc`.
3. `npx wrangler d1 migrations apply debbie-nz-pulse --remote`
4. Secrets (any long random strings):
   `npx wrangler secret put ADMIN_TOKEN` and `npx wrangler secret put HASH_SALT`
5. Deploy (`npm run deploy`, or push and let Workers Builds deploy).
6. Moderate at `/admin.html` with the ADMIN_TOKEN. Set
   `COMMENTS_MODERATED` to `"false"` in `wrangler.jsonc` to publish instantly.

Privacy: no emails or accounts. IPs are salted + hashed (never stored raw) and
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
