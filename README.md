<div align="center">
  <a href="https://j0ffis.github.io/OSRS-TaskMaster/">
    <img src="web/icon.svg" alt="OSRS TaskMaster" width="96" height="96">
  </a>
  <h1>OSRS TaskMaster</h1>
  <p>Not sure what to grind next? Get three suggestions picked for your account.</p>

  <a href="https://j0ffis.github.io/OSRS-TaskMaster/"><img src="https://img.shields.io/badge/Website-GitHub%20Pages-blue" alt="Website"></a>
  <a href="plugin/LICENSE"><img src="https://img.shields.io/badge/Plugin%20license-BSD--2--Clause-green" alt="Plugin license: BSD-2-Clause"></a>
</div>

OSRS TaskMaster looks at your own Old School RuneScape account and suggests what to do next,
from quick wins you can finish tonight to long hauls for the month ahead.

Suggestions are based on your levels, quests, achievement diaries, combat achievements,
collection log, pets and any goals you set yourself, including goals to get specific items.

Your data comes from a small RuneLite plugin that reads your own game client. By default you
copy your profile from the plugin and paste it on the website, which keeps it in your browser.
**Automatic upload**, which skips the copy and paste, is in testing and not live yet. Nothing calls
the hiscores, the wiki, Wise Old Man, TempleOSRS or any other community service, and the plugin
never reads your bank, inventory or equipment.

## Testing it

Follow the step-by-step **[tester guide](TESTER-GUIDE.md)**. One download covers both ways of
testing; the plugin is the same, and the file you double-click picks the mode:

| | `Start TaskMaster.bat` | `Test Auto-Upload.bat` (optional) |
|---|---|---|
| Mode | Copy and paste | Automatic upload |
| Website | The live site (GitHub Pages, built from `main`) | This download's `web/`, served on http://127.0.0.1:8790/ |
| Upload service | None | A local copy of `sync/` on http://127.0.0.1:8789, data in `sync\.wrangler` |
| Plugin settings | Saved settings (Automatic upload off by default) | Automatic upload on and pointed at the local service, for that run only |
| Needs | Java (downloaded if missing) | Java and Node.js (both downloaded if missing) |

Neither launcher changes the other's settings, so a tester can switch back and forth. Nothing in
the test mode reaches the live website or any server off the PC. Website changes in a test build
show up with `Test Auto-Upload.bat` straight away, and with copy and paste only once they're on
`main` (and so on the live site).

## How it works

```
RuneLite + plugin  ──"Copy my profile"──▶  website (paste with Ctrl+V)
reads your client                          keeps your profile in this browser
        └──Automatic upload (opt-in)──▶  sync service  ──▶  website on any browser,
                                                             and "Your next grinds" in RuneLite
```

1. The plugin reads your progress from the game client's memory and the game cache.
2. **Copy my profile** puts it on your clipboard and saves a copy in
   `%USERPROFILE%\.runelite\osrs-taskmaster\<name>.json`.
3. The website turns it into suggestions. It runs entirely in your browser; your profile and
   goals live in `localStorage`.
4. With **Automatic upload** on (testing only for now: see [Testing it](#testing-it)), the
   plugin also uploads the profile to the sync service
   (`sync/`): the website then loads it from a link on any browser, goals are saved with it, and
   the plugin's panel shows the website's latest picks. Profiles are private by default, with an
   optional public lookup by name. Details in [sync/README.md](sync/README.md).

For a complete collection log, open it in game and click **Search** once. Kill counts are picked
up from chat messages as you play, and from a boss's collection log page when you open it. The
full list of what the plugin reads is in [docs/data-sources.md](docs/data-sources.md).

## Project structure

- `plugin/` – the RuneLite plugin (Java 11, Gradle). It has its own player-facing
  [README](plugin/README.md).
- `web/` – the website, plain static files with no build step.
  - `recommender.js` – picks the suggestions: profile + goals in, ranked suggestions out.
  - `knowledge-base.js` – hand-written game facts (quest requirements, diary rewards, effort
    estimates). Edit this to tune suggestions.
  - `app.js` – the page itself: importing profiles, rendering cards, managing goals.
  - `config.js` – where the Automatic upload service runs (local or live), and `UPLOAD_LIVE`,
    whether the site mentions Automatic upload (only on the local test site until it's deployed).
  - `samples/` – the made-up accounts behind **Load sample data**, one per account type (made by
    `tests/make-sample-profiles.mjs`, `npm run samples`).
  - `data/drop-rates.json` – a snapshot of collection log drop rates from the OSRS Wiki.
  - `data/quest-reqs.json` – a snapshot of every quest's requirements, length and quest point
    reward from the OSRS Wiki (the route planner and **Within reach** use it).
  - `icons/game/` and `game-icons.js` – game icons exported from the game cache (see
    [Game icons](#game-icons)).
- `sync/` – the Automatic upload service (Cloudflare Worker + D1 database), with end-to-end tests.
  How it works, running it locally and deploying it: [sync/README.md](sync/README.md).
- `tests/` – checks for the website, run with Node.js (`npm run check`, `npm test`): the
  knowledge-base checker, suggestion snapshots, and `fixtures/game-names.json` (the game's own
  page, item, quest and task names, no player progress).
- `tools/game-icons/` – the Java tool behind `Update-GameIcons.ps1` (not part of the plugin).
- `server/` – an optional, dependency-free local server (`Server.java`) for development.
- `scripts/` – PowerShell scripts:
  - `Start-TaskMaster.ps1` – the tester launcher behind `Start TaskMaster.bat`.
  - `Start-RuneLiteDev.ps1` – starts RuneLite with the plugin, for development.
  - `Start-LocalServer.ps1` – starts the optional local server.
  - `Update-DropRates.ps1` – adds new items' drop rates from the OSRS Wiki to
    `web/data/drop-rates.json`.
  - `Update-GameIcons.ps1` – exports the website's game icons from the game cache on this PC.
  - `update-quest-reqs.mjs` – adds new quests' requirements from the OSRS Wiki to
    `web/data/quest-reqs.json` (Node.js).
  - `Update-GameData.ps1` – after a game update: game names, icons, drop rates, quest
    requirements and checks in one go.
  - `Format-Json.ps1` – lays JSON files out one entry per line so they're easy to read.
- `docs/` – reference notes: [how suggestions work](docs/how-suggestions-work.md) (start here
  to tune them), [what the plugin reads](docs/data-sources.md), and
  [publishing to the Plugin Hub](docs/plugin-hub.md).
- `Start TaskMaster.bat` / `Forget TaskMaster login.bat` – double-click entry points for testers.
- `Test Auto-Upload.bat` – try Automatic upload on this PC (`scripts/Start-AutoUploadTest.ps1`).
- `.editorconfig` / `.gitattributes` – formatting and line-ending rules, so every editor and
  checkout stays consistent.

## Development

### Prerequisites

- Windows (the launcher scripts are PowerShell).
- [Java 17](https://adoptium.net/). `Start TaskMaster.bat` can download a private copy to
  `%LOCALAPPDATA%\Programs\jdk17`, which the other scripts also use.

### Running the plugin

```powershell
.\scripts\Start-RuneLiteDev.ps1
```

This runs `gradlew run` in `plugin/`, which starts RuneLite in developer mode with the plugin
side-loaded. The first start takes a few minutes. Jagex accounts need the one-time login step
described in the [tester guide](TESTER-GUIDE.md#2-first-start-both-ways).

### Running the website

The hosted site is published to GitHub Pages from `web/` by
[`.github/workflows/pages.yml`](.github/workflows/pages.yml) on every push to `main` that touches
`web/` or `tests/`. Locally, any static file server works, or use the local server below. Pages
opened from this PC (`localhost` / `127.0.0.1`) talk to the local sync service, not the live one.

### Checks and tests

With [Node.js](https://nodejs.org/) installed (no packages needed):

```powershell
npm run check         # web/knowledge-base.js: misspelt names, tiers that don't exist, game data over 90 days old
npm test              # the checker's tests, the suggestion snapshots and the data guards
npm run test:update   # accept intended changes to the suggestions, then review the snapshot diff
```

The publish workflow runs the same checks first and doesn't publish if they fail. The data guards
(`tests/guards.test.mjs`) fail if any suggestion shows "undefined", "NaN" or a progress outside
0–100%, and check that `profileIssues` flags impossible profiles (a level that doesn't match its XP,
combat achievement points that don't add up); the website then tells the player their
suggestions may be off.
[How suggestions work](docs/how-suggestions-work.md#checking-an-edit) explains them.

### Running the Automatic upload service

To try the whole thing on your PC (service, website and RuneLite with the plugin), double-click
**`Test Auto-Upload.bat`**; see [sync/README.md](sync/README.md#try-it-on-your-pc-one-click).
By hand:

```powershell
cd sync
npm install
npm run db:local   # once
npm run dev        # http://127.0.0.1:8789
npm test           # end-to-end tests, in a second terminal
```

Set the plugin's **Upload server** setting to `http://127.0.0.1:8789` to test against it (the
one-click test sets it for that run only, without changing your settings).
Deploying it to Cloudflare is covered in [sync/README.md](sync/README.md).

**Until it's deployed**, the plugin's *Automatic upload* settings section is closed and marked
"not live yet", the panel's copy-and-paste note points testers to `Test Auto-Upload.bat`, and the
website only mentions Automatic upload on the local test site (`UPLOAD_LIVE` in `web/config.js`).
After deploying, undo all three: `TaskMasterConfig.java`, `HELP_MANUAL` in `TaskMasterPanel.java`
and `UPLOAD_LIVE`.

### Running the local server (optional)

The local server serves the website at http://localhost:8787 and lists any profiles saved in
`server/data/profiles`. (On this branch the plugin no longer sends to it: Automatic upload, above,
replaced that.)

```powershell
.\scripts\Start-LocalServer.ps1
```

Use `.\scripts\Start-LocalServer.ps1 -Port 8788` if port 8787 is taken.

The server binds to 127.0.0.1 only, rejects foreign `Host` headers and refuses any profile that
contains wealth data. Saved profiles and goals are kept in `server/data/`, which is not committed.

### After a game update

One command brings the website's game data up to date:

```powershell
.\scripts\Update-GameData.ps1
```

Log in once with the plugin first, so its saved profile and RuneLite's game cache are current.
It then refreshes, in order: the game names in `tests/fixtures/game-names.json` (read from the
newest profile the plugin saved in `%USERPROFILE%\.runelite\osrs-taskmaster`), the game icons
(below), the drop rates for new items (below), the requirements of new quests (below), and runs
the checks and tests. At the end it says **Nothing new** (nothing to commit) or lists what
changed; review that, commit and push to `main` to republish the website.

The wiki steps only ask about what the files don't cover yet, so a run after an update with no
new items or quests doesn't contact the wiki at all. `-DryRun` says what they would look up and
contacts nothing; `-Full` re-asks about everything (rarely needed, see below); `-SkipDropRates`,
`-SkipQuestReqs` and `-SkipIcons` leave those steps out. Each part can also be run on its own.

### Drop rates

`web/data/drop-rates.json` is refreshed by hand after content updates:

```powershell
.\scripts\Update-DropRates.ps1
```

It takes the collection log item names from the newest profile the plugin saved (or
`-Profile <file>`) and asks the OSRS Wiki only about the ones the file doesn't cover yet, in
paced, batched requests. Items the wiki has no drops for are remembered too (`noDrops`), so a
re-run with nothing new sends no requests at all.
To be kind to the wiki, stick to the default and use the other modes only when you need them:

```powershell
.\scripts\Update-DropRates.ps1 -DryRun           # list what would be looked up; contacts nothing
.\scripts\Update-DropRates.ps1 -RecheckNoDrops   # also re-ask about the items with no drops
.\scripts\Update-DropRates.ps1 -Full             # re-ask about everything (about 30 requests)
```

Use `-Full` when existing drop rates have changed, for example after a drop table rework,
since the default never re-checks items it already has. The website only ever reads the local
file. Effort is estimated as (1 ÷ chance per attempt) × minutes per attempt, using
`MINUTES_PER_ATTEMPT` and `EFFORT_HOURS` in `web/knowledge-base.js`; fixed rules there
(guaranteed rewards, raids, duplicate protection and so on) take priority over the rates.

### Quest requirements

`web/data/quest-reqs.json` holds every quest's and miniquest's requirements, length and quest
point reward from the OSRS Wiki (the route planner and **Within reach** use it):

```powershell
npm run quest-reqs                                  # only if the game has quests the file doesn't
node scripts/update-quest-reqs.mjs --dry-run        # say whether it would ask; contacts nothing
node scripts/update-quest-reqs.mjs --full           # ask anyway, e.g. after a quest's requirements changed
```

It compares the quests in `tests/fixtures/game-names.json` with the file and sends three requests
(the wiki's whole quest bucket, plus the free-to-play and members quest lists for quest points)
only when there's a new one. Game names the wiki has no page for
are remembered in `notOnWiki`, so they don't send a request every time.

If you edit a JSON file by hand, `.\scripts\Format-Json.ps1 <file>` puts it back in the same
layout.

### Game icons

The website's icons (the PvP skull, skill, quest, diary and collection log icons, combat
achievement tier swords, and an icon for every collection log item) are PNGs in `web/icons/game`,
exported from the game cache RuneLite keeps on your PC:

```powershell
.\scripts\Update-GameIcons.ps1
```

It reads `%USERPROFILE%\.runelite\jagexcache\oldschool\LIVE` with RuneLite's cache library
(`tools/game-icons`, a small Java tool run through the plugin's Gradle wrapper) and writes the
icons plus `index.json`. Nothing is downloaded apart from that library on the first run. Run it by
hand after a game update that adds collection log items (refresh `tests/fixtures/game-names.json`
first with `npm run game-names`), then commit `web/icons/game`; `npm test` fails if an item has no
icon. The website only loads these local files, and shows text where an icon is missing.

The RuneLite panel doesn't need them: it loads the same sprites live from the game client.

## Publishing to the Plugin Hub

Not done yet. The steps are written up in [docs/plugin-hub.md](docs/plugin-hub.md).

## Credits

Drop rates, XP rates and quest requirements are from the
[Old School RuneScape Wiki](https://oldschool.runescape.wiki/), licensed CC BY-NC-SA 3.0.

Game images (in `web/icons/game` and the icons the plugin shows) are © Jagex Ltd. OSRS
TaskMaster is a free, non-commercial fan-made tool and isn't made by or affiliated with Jagex.
