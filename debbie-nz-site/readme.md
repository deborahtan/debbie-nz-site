debbie.nz
Personal site — writing, mission-scored search, shop teaser. Static HTML,
no build step, deploys via Cloudflare Pages.
Deploy (Cloudflare Pages)
Push this repo to GitHub.
Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.
Select this repo. Build settings: no build command, output directory `/`.
Deploy. Live at `<project-name>.pages.dev` immediately — no custom domain
required to start.
To attach debbie.nz later: Pages project → Custom domains → add it, then
update DNS wherever the domain is registered.
Every branch/PR gets its own preview URL automatically before merging to
`main` — that's the sandbox.
GTM setup
Create a container at tagmanager.google.com if you haven't already.
Note your Account ID and Container ID (visible in the container's
admin/URL).
Open `gtm-container-export.json` (in the parent folder) and replace:
`REPLACE_ACCOUNT_ID`
`REPLACE_CONTAINER_ID`
`GTM-REPLACE` → your real container's public ID
`G-REPLACE_MEASUREMENT_ID` → your GA4 measurement ID
GTM → Admin → Import Container → upload the file → choose
Merge, workspace Overwrite (safe on a fresh container) → Confirm.
If any single tag/trigger/variable errors on import, skip it and recreate
that one piece manually using `gtm-data-dictionary.md` as the spec — the
rest of the import will still have worked.
In `index.html`, replace both instances of `GTM-REPLACE` with your real
container ID (head snippet and noscript body snippet).
In GA4 admin, complete the two manual steps noted in the data dictionary
(custom dimension for `visitor_mission`, mark `shop_teaser_click` as a
conversion).
Publish the GTM workspace, push the HTML change, done.
Files
`index.html` — the site, GTM snippets already inserted (placeholder ID)
`../gtm-data-dictionary.md` — event/parameter spec, source of truth
`../gtm-container-export.json` — importable GTM container
