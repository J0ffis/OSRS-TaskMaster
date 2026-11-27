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
- **Who can change what:** only a request with the edit token can change goals or picks; anyone
  else gets 403, and the website shows such visitors a *View only* page: the owner's own view
  (grind style, category filters, opt-in content and the suggestions they hid with *Not for me*,
  saved as `view` with the picks) with no tiers, Shuffle, Swap, filters or goal controls. Owners
  can preview it with *See it as others do*. The owner's
  *Copy share link* (in the plugin and on the website) only ever contains the id.
- **Reset my links** in the plugin revokes a leaked owner link: the plugin makes a new key and
  `POST /v1/profile/rotate` moves the profile, goals and picks to the id and edit token derived
  from it. Every old link (the owner's and shared ones) then returns 404. Only the holder of the
  current key can do this, and the plugin pauses uploads meanwhile so the old id can't be
  recreated.
- **Delete my uploaded data** in the plugin deletes the row, switches uploads off and retires
  the key, so old links stop working.

| Request | Who | What |
|---|---|---|
| `PUT /v1/profile` | plugin (`Authorization: Bearer <key>`) | upload `{ profile, public, account }` |
| `DELETE /v1/profile` | plugin (`Authorization: Bearer <key>`) | delete everything for this key |
| `POST /v1/profile/rotate` | plugin (`Authorization: Bearer <old key>`) | `{ newKey }`: move everything to the new key; old links stop working |
| `GET /v1/profile/:id` | website | profile + goals |
| `GET /v1/public/:name` | website | the same, for public profiles |
| `PUT /v1/goals/:id` | website (`X-Edit-Token`) | replace the goals list; with `{ goals, known }`, goals added elsewhere since the page loaded are kept |
| `POST /v1/goals/:id` | plugin (`X-Edit-Token`) | `{ pick }`: add the goal that saved pick carries (the panel's *Make it a goal*) |
| `PUT /v1/picks/:id` | website (`X-Edit-Token`) | save its current top picks per tier, the pinned route and the owner's view |
| `GET /v1/picks/:id` | plugin | those picks and the route, for the panel's *Your next grinds* and *Your route* |

**Why picks come from the website:** the recommendation engine (`web/recommender.js`) needs about
9–12 ms of CPU per run (≈ 30 ms cold), over the free Workers plan's 10 ms per request. So the
owner's browser works the suggestions out and saves the top 15 per tier (5 Challenge); the plugin
only displays them. Picks follow the site's filters and goals and refresh whenever the owner
opens the website. Running the engine here instead would need the $5/month Workers Paid plan.

**Goals from the panel:** each saved pick carries the goal the website's *Make it a goal* would
build for it. The plugin derives the edit token from its key and sends only the pick's id, so the
service adds exactly that website-made goal (never one the plugin built). The website sends
`known` (every goal id it has seen) when saving, so a page left open can't wipe a goal the panel
added meanwhile.

**The pinned route:** when the owner pins a route in the website's route planner, the picks
also carry `route` (its next 30 steps with titles, times, which goals they're for and other
needs, plus steps done and total) for the panel, and `view.route` (the goal ids and step keys)
so visitors of a share link see the same route, planned in their browser from the owner's goals.

Limits: profiles up to 1.5 MB, 200 goals, 15 picks per tier (fields trimmed to what the panel shows, plus each pick's goal up to 1.5 KB), a route of up to 30 steps, picks 128 KB in all, uploads at most every 30 seconds per key, browsers
only from the sites in `ALLOWED_ORIGINS` (`wrangler.toml`), and no wealth data.

## Try it on your PC (one click)

Double-click **`Test Auto-Upload.bat`** in the project folder. It starts this service
(http://127.0.0.1:8789, local database in `sync/.wrangler`), this branch's website
(http://127.0.0.1:8790, served like GitHub Pages) and RuneLite with this branch's plugin, then
shows what to set in the plugin (Website, Upload server, Automatic upload). Closing RuneLite
stops everything. Nothing leaves your PC and no Cloudflare account is needed. The first run
installs the service's tools with npm.

- `Test Auto-Upload.bat -Reset` starts with an empty local database.
- `Test Auto-Upload.bat -NoRuneLite` starts only the service and the website.

The plugin settings it asks you to change are shared with `Start TaskMaster.bat`: reset
**Website** and **Upload server** (right-click > Reset) or switch Automatic upload off afterwards.

## Run it locally (by hand)

Needs Node.js (a portable copy lives in `%LOCALAPPDATA%\Programs\node`):

```powershell
$env:Path = "$env:LOCALAPPDATA\Programs\node;$env:Path"
cd sync
npm install
npm run db:local   # create the local database (once)
npm run dev        # http://127.0.0.1:8789
npm test           # in a second terminal: end-to-end tests against the running service
```

`package.json` approves the setup scripts of `esbuild` and `workerd` (wrangler's bundler and
local runtime) at their exact versions (`allowScripts`, newer npm). After updating wrangler,
npm lists any new versions; approve them with `npm install-scripts approve esbuild workerd`.

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
