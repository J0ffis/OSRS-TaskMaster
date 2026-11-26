# OSRS TaskMaster

Type your OSRS name and get three things to grind next, based on your levels, quests,
achievement diaries, combat achievements, collection log, pets and your own goals
(including goals to obtain specific items).

**No third-party APIs.** All data comes from your own RuneLite client through the OSRS TaskMaster
plugin. Nothing calls the hiscores, the wiki, Wise Old Man, TempleOSRS or any other community
service.

**No wealth data.** The plugin never reads your bank, inventory or equipment, and both servers
refuse any profile that contains wealth data. Item goals are tracked through the collection
log, or ticked off by hand for items that aren't in it.

```
RuneLite + OSRS TaskMaster plugin ──"Copy my profile"──▶ paste on the website (kept in your browser)
   reads your client's memory   └──Automatic upload (opt-in)──▶ sync service ──▶ website, any browser
```

## For testers (no server needed)

Step-by-step instructions to send to testers are in **[TESTER-GUIDE.md](TESTER-GUIDE.md)**.

You need Windows and the project folder (download the repository as a ZIP from GitHub and
unzip it, or clone it).

1. **Double-click `Start TaskMaster.bat`.** It:
   - finds Java 17, or offers to download a private copy (no admin rights, nothing installed
     system-wide; it lives in `%LOCALAPPDATA%\Programs\jdk17`),
   - walks you through the one-time Jagex account step (below),
   - opens the website, then starts RuneLite with the plugin. The first start takes a few minutes.
2. **Log in**, open the **OSRS TaskMaster** panel on RuneLite's right-hand sidebar and click
   **Copy my profile**.
3. **Paste it on the website** (Ctrl+V anywhere on the page). Your profile and goals stay in
   that browser; nothing is uploaded. To refresh, copy again and use **Update profile**.

For a complete collection log, open it in-game and click **Search** once.

**Jagex accounts (one-time):** test builds of RuneLite can't open the Jagex Launcher. Search the
Start menu for **RuneLite (configure)**, put `--insecure-write-credentials` in *Client
arguments* and save, play RuneLite once through the Jagex Launcher, then clear the argument
again. This saves your login in `%USERPROFILE%\.runelite\credentials.properties`. Keep that file
private; **`Forget TaskMaster login.bat`** deletes it. Accounts that log in with an email and
password skip this step.

The plugin also keeps the latest profile in `%USERPROFILE%\.runelite\osrs-taskmaster\<name>.json`
(**Show profile file** in the panel); you can drop that file on the website instead of pasting.

## The website

`web/` is plain static files, published to GitHub Pages by `.github/workflows/pages.yml` on every
push to `main` that touches `web/`. One-time setup: on GitHub, **Settings → Pages → Source:
GitHub Actions**. The address is `https://j0ffis.github.io/OSRS-TaskMaster/` (also the plugin's
default *Website* setting).

Profiles reach the site three ways:
- **Pasted** (the default): kept in that browser's `localStorage`; nothing is uploaded.
- **Automatic upload** (opt-in in the plugin): loaded from the sync service by link
  (`#id=…`), or by name for public profiles. Goals are saved with the profile. See
  [sync/README.md](sync/README.md) for how it works and how to put it live on Cloudflare.
- **Local dev server**: when the page is served by `start-server.ps1` (http://localhost:8787),
  it also lists profiles saved in `server/data`.

## Automatic upload

The service lives in `sync/` (a Cloudflare Worker with a D1 database). Run and test it locally,
and deploy it, as described in [sync/README.md](sync/README.md). Until it's deployed, the
plugin's **Automatic upload** setting has nowhere to send to; copy and paste works regardless.

## Local dev server

`.\start-server.ps1` serves `web/` at http://localhost:8787 and shows any profiles saved in
`server/data/profiles`. `.\start-runelite-dev.ps1` starts RuneLite with the plugin. Pages
opened from this PC use the local sync service (`npm run dev` in `sync/`) automatically.

## What the plugin reads

| Data | Source in the client |
|---|---|
| Levels, XP | `Client.getRealSkillLevel` / `getSkillExperience` |
| Quests, quest points | `Quest.getState`, varp `QP` |
| Diaries | `*_DIARY_*_COMPLETE` varbits |
| Combat achievements | `CA_POINTS`, `CA_THRESHOLD_*` varbits, `CA_TASK_COMPLETED_*` varps + task names from the game cache |
| Collection log | `COLLECTION_COUNT*` varps, page layout from the game cache, obtained items when you click Search |
| Pets | The collection log's own "All Pets" page |
| Kill counts | "Your X kill count is: N" chat messages |

## Drop rates

`web/data/drop-rates.json` is a snapshot of collection log drop rates from the OSRS Wiki
(CC BY-NC-SA 3.0). The site only reads this local file; it never contacts the wiki. Refresh it
by hand after content updates (about 30 batched requests, paced):

```powershell
.\scripts\fetch-drop-rates.ps1
```

It looks up every collection log item (owned and missing) using the page layout from your
latest sync. Effort = expected hours = (1 ÷ chance per attempt) × minutes per attempt, using
`MINUTES_PER_ATTEMPT` and `EFFORT_HOURS` in `web/kb.js`. Fixed rules there (guaranteed rewards,
team content, raids, duplicate protection, clue tapering) take priority over the rates.

## Layout

- `plugin/` – RuneLite plugin (Java 11, Gradle). `gradlew build` / `gradlew run`.
- `sync/` – the Automatic upload service (Cloudflare Worker + D1), with end-to-end tests.
- `server/Server.java` – dependency-free JDK dev server. Binds to 127.0.0.1 only, rejects
  foreign `Host` headers and wealth data.
- `web/` – the site. `kb.js` is the hand-written knowledge base (quest requirements,
  diary rewards, quick collection logs, rare drops): edit it to tune suggestions.
  `engine.js` is the recommender.

## Plugin Hub

`plugin/` already has what the Hub needs: `runelite-plugin.properties`, `LICENSE` (BSD-2-Clause),
`icon.png` (48×72) and a player-facing `README.md`. The Hub only builds plugins from their own
repository, with the Gradle project at the root, so when the plugin is stable:

1. Create an empty GitHub repository, e.g. `J0ffis/osrs-taskmaster-plugin`.
2. Copy `plugin/` into it with its history:
   ```powershell
   git subtree split --prefix plugin -b plugin-hub
   git push https://github.com/J0ffis/osrs-taskmaster-plugin.git plugin-hub:main
   ```
3. Fork `runelite/plugin-hub` and add `plugins/osrs-taskmaster` containing:
   ```
   repository=https://github.com/J0ffis/osrs-taskmaster-plugin.git
   commit=<full commit hash from step 2>
   ```
4. Open a pull request and answer the reviewers. Each later plugin update is a new pull request
   with a new commit hash.

Before submitting, deploy the sync service and make sure `DEFAULT_UPLOAD_SERVER` and
`DEFAULT_WEBSITE` in `TaskMasterConfig.java` are the live addresses. Automatic upload is why
`runelite-plugin.properties` carries a `warning`.

## Known gaps

- Combat achievement and collection log layouts come from cache enums/structs
  (CA: 3981–3986, params 1306–1312; collection log: 2102, params 683/689/690). If a game
  update moves them, the site falls back to points and totals.
- Quest skill requirements and the rare-drop list in `kb.js` are hand-curated.
- Testers run the plugin from source in RuneLite's developer mode, until it's on the Plugin Hub.
