# OSRS TaskMaster sync service

The optional **Automatic upload** service: a Cloudflare Worker with a D1 (SQLite) database.
Players switch it on in the RuneLite plugin; the website then loads their latest profile and
goals from a link, on any browser. Copy and paste keeps working for everyone else.

## How it works

- The plugin creates one random **upload key** per OSRS account and keeps it in that account's
  RuneLite profile. It's never shown or sent anywhere except as the upload's `Authorization`.
- From the key, the plugin, this service and the website all derive:
  - a **profile id**: the read-only link `…/#id=<id>`, safe to share;
  - an **edit token**: only in the link the plugin's *Open website* button opens, so the owner
    can save goals. The website keeps it in that browser and strips it from the address bar.
- The database stores the profile, the goals, a SHA-256 of the edit token and a SHA-256 of the
  RuneLite account hash (used only so two accounts can't show the same name publicly).
  It never stores the upload key, and the service doesn't log IP addresses.
- **Public profiles** (the plugin's *Show my profile publicly*) can be looked up by name. A name
  stays with the account that holds it until that account hasn't uploaded for 30 days.
- **Delete my uploaded data** in the plugin deletes the row, switches uploads off and retires
  the key, so old links stop working.

| Request | Who | What |
|---|---|---|
| `PUT /v1/profile` | plugin (`Authorization: Bearer <key>`) | upload `{ profile, public, account }` |
| `DELETE /v1/profile` | plugin (`Authorization: Bearer <key>`) | delete everything for this key |
| `GET /v1/profile/:id` | website | profile + goals |
| `GET /v1/public/:name` | website | the same, for public profiles |
| `PUT /v1/goals/:id` | website (`X-Edit-Token`) | replace the goals list |
| `PUT /v1/picks/:id` | website (`X-Edit-Token`) | save its current top picks per tier |
| `GET /v1/picks/:id` | plugin | those picks, for the panel's *Your next grinds* list |

**Why picks come from the website:** the recommendation engine (`web/engine.js`) needs about
9–12 ms of CPU per run (≈ 30 ms cold), over the free Workers plan's 10 ms per request. So the
owner's browser works the suggestions out and saves the top 10 per tier (3 Bonus); the plugin
only displays them. Picks follow the site's filters and goals and refresh whenever the owner
opens the website. Running the engine here instead would need the $5/month Workers Paid plan.

Limits: profiles up to 1.5 MB, 200 goals, 15 picks per tier (fields trimmed to what the panel shows), uploads at most every 30 seconds per key, browsers
only from the sites in `ALLOWED_ORIGINS` (`wrangler.toml`), and no wealth data.

## Run it locally

Needs Node.js (a portable copy lives in `%LOCALAPPDATA%\Programs\node`):

```powershell
$env:Path = "$env:LOCALAPPDATA\Programs\node;$env:Path"
cd sync
npm install
npm run db:local   # create the local database (once)
npm run dev        # http://127.0.0.1:8789
npm test           # in a second terminal: end-to-end tests against the running service
```

Pages opened from this PC (`127.0.0.1`/`localhost`) use the local service automatically
(`web/config.js`). To test the plugin against it, set the plugin's **Upload server** setting to
`http://127.0.0.1:8789`.

## Go live (one-time)

1. Create a free Cloudflare account at https://dash.cloudflare.com/sign-up.
2. Sign wrangler in (opens your browser; you sign in yourself):
   ```powershell
   npx wrangler login
   ```
3. Create the database and copy the `database_id` it prints into `wrangler.toml`:
   ```powershell
   npx wrangler d1 create taskmaster
   npm run db:remote
   ```
4. Deploy:
   ```powershell
   npm run deploy
   ```
   It prints the service address, e.g. `https://osrs-taskmaster-sync.<your-subdomain>.workers.dev`.
5. If that address differs from the one in the project, update it in both places and push:
   - `web/config.js` → `SYNC_API`
   - `plugin/.../TaskMasterConfig.java` → `DEFAULT_UPLOAD_SERVER`
6. Check it: open `<address>/v1` in a browser; it should say `"ok": true`.

Redeploy with `npm run deploy` whenever `src/index.js` changes. Free-tier limits (requests and
database reads/writes per day) are visible in the Cloudflare dashboard; a rate-limiting rule
can be added there under **Security → WAF** if needed.
