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

Your data comes from a small RuneLite plugin that reads your own game client. You copy your
profile from the plugin and paste it on the website, which keeps it in your browser. Nothing
calls the hiscores, the wiki, Wise Old Man, TempleOSRS or any other community service, and the
plugin never reads your bank, inventory or equipment.

**Testing it?** Follow the step-by-step **[tester guide](TESTER-GUIDE.md)**.

## How it works

```
RuneLite + plugin  ──"Copy my profile"──▶  website (paste with Ctrl+V)
reads your client                          keeps your profile in this browser
```

1. The plugin reads your progress from the game client's memory and the game cache.
2. **Copy my profile** puts it on your clipboard and saves a copy in
   `%USERPROFILE%\.runelite\osrs-taskmaster\<name>.json`.
3. The website turns it into suggestions. It runs entirely in your browser; your profile and
   goals live in `localStorage`.

For a complete collection log, open it in game and click **Search** once. Kill counts are picked
up from chat messages as you play, and from a boss's collection log page when you open it. The full list of what the plugin reads is in
[docs/data-sources.md](docs/data-sources.md).

## Project structure

- `plugin/` – the RuneLite plugin (Java 11, Gradle). It has its own player-facing
  [README](plugin/README.md).
- `web/` – the website, plain static files with no build step.
  - `recommender.js` – picks the suggestions: profile + goals in, ranked suggestions out.
  - `knowledge-base.js` – hand-written game facts (quest requirements, diary rewards, effort
    estimates). Edit this to tune suggestions.
  - `app.js` – the page itself: importing profiles, rendering cards, managing goals.
  - `samples/` – the made-up accounts behind **Load sample data**, one per account type (made by
    `tests/make-sample-profiles.mjs`, `npm run samples`).
  - `data/drop-rates.json` – a snapshot of collection log drop rates from the OSRS Wiki.
  - `icons/game/` and `game-icons.js` – game icons exported from the game cache (see
    [Game icons](#game-icons)).
- `tests/` – checks for the website, run with Node.js (`npm run check`, `npm test`): the
  knowledge-base checker, suggestion snapshots, and `fixtures/game-names.json` (the game's own
  page, item, quest and task names, no player progress).
- `tools/game-icons/` – the Java tool behind `Update-GameIcons.ps1` (not part of the plugin).
- `server/` – an optional, dependency-free local server (`Server.java`) for automatic syncing.
- `scripts/` – PowerShell scripts:
  - `Start-TaskMaster.ps1` – the tester launcher behind `Start TaskMaster.bat`.
  - `Start-RuneLiteDev.ps1` – starts RuneLite with the plugin, for development.
  - `Start-LocalServer.ps1` – starts the optional local server.
  - `Update-DropRates.ps1` – adds new items' drop rates from the OSRS Wiki to `web/data/drop-rates.json`.
  - `Update-GameIcons.ps1` – exports the website's game icons from the game cache on this PC.
  - `Update-GameData.ps1` – after a game update: game names, icons, drop rates and checks in one go.
  - `Format-Json.ps1` – lays JSON files out one entry per line so they're easy to read.
- `docs/` – reference notes: [how suggestions work](docs/how-suggestions-work.md) (start here
  to tune them), [what the plugin reads](docs/data-sources.md), and
  [publishing to the Plugin Hub](docs/plugin-hub.md).
- `Start TaskMaster.bat` / `Forget TaskMaster login.bat` – double-click entry points for testers.
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
described in the [tester guide](TESTER-GUIDE.md#2-start-it).

### Running the website

The hosted site is published to GitHub Pages from `web/` by
[`.github/workflows/pages.yml`](.github/workflows/pages.yml) on every push to `main` that touches
`web/` or `tests/`. Locally, any static file server works, or use the local server below.

### Checks and tests

With [Node.js](https://nodejs.org/) installed (no packages needed):

```powershell
npm run check         # web/knowledge-base.js: misspelt names, tiers that don't exist
npm test              # the checker's tests and the suggestion snapshots
npm run test:update   # accept intended changes to the suggestions, then review the snapshot diff
```

The publish workflow runs the same checks first and doesn't publish if they fail.
[How suggestions work](docs/how-suggestions-work.md#checking-an-edit) explains them.

### Running the local server (optional)

The local server serves the website and receives profiles straight from the plugin, so you don't
have to copy and paste.

```powershell
.\scripts\Start-LocalServer.ps1
```

It prints a sync token (also saved in `server/data/token.txt`) and serves the site at
http://localhost:8787 (use `-Port 8788` if that port is taken, and point the plugin's server
address at the same port). In RuneLite, open **Configuration → OSRS TaskMaster → Your own server
(advanced)**, switch on **Send to my own server** and paste the token into **Sync token**.

The plugin then syncs on login and at most every 5 minutes after something changes. The server
binds to 127.0.0.1 only, checks the token, rejects foreign `Host` headers and refuses any snapshot
that contains wealth data. Synced profiles and goals are kept in `server/data/`, which is not
committed.

### After a game update

One command brings the website's game data up to date:

```powershell
.\scripts\Update-GameData.ps1
```

Log in once with the plugin first, so its saved profile and RuneLite's game cache are current.
It then refreshes, in order: the game names in `tests/fixtures/game-names.json` (read from the
newest profile the plugin saved in `%USERPROFILE%\.runelite\osrs-taskmaster`), the game icons
(below), the drop rates for new items (below), and runs the checks and tests. At the end it says
**Nothing new** (nothing to commit) or lists what changed; review that, commit and push to `main`
to republish the website. `-DryRun` contacts nothing for drop rates, `-SkipDropRates` and
`-SkipIcons` leave those out. Each part can also be run on its own, as below.

### Drop rates

`web/data/drop-rates.json` is refreshed by hand after content updates:

```powershell
.\scripts\Update-DropRates.ps1
```

It takes the collection log item names from your latest synced profile and asks the OSRS Wiki
only about the ones the file doesn't cover yet, in paced, batched requests. Items the wiki has no
drops for are remembered too (`noDrops`), so a re-run with nothing new sends no requests at all.
To be kind to the wiki, stick to the default and use the other modes only when you need them:

```powershell
.\scripts\Update-DropRates.ps1 -DryRun           # list what would be looked up; contacts nothing
.\scripts\Update-DropRates.ps1 -RecheckNoDrops   # also re-ask about the items with no drops
.\scripts\Update-DropRates.ps1 -Full             # re-ask about everything (about 30 requests)
```

Use `-Full` when existing drop rates have changed, for example after a drop table rework,
since the default never re-checks items it already has. The website only ever reads the local file. Effort is estimated as
(1 ÷ chance per attempt) × minutes per attempt, using `MINUTES_PER_ATTEMPT` and `EFFORT_HOURS` in
`web/knowledge-base.js`; fixed rules there (guaranteed rewards, raids, duplicate protection and
so on) take priority over the rates.

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

Drop rates are from the [Old School RuneScape Wiki](https://oldschool.runescape.wiki/), licensed
CC BY-NC-SA 3.0.

Game images (in `web/icons/game` and the icons the plugin shows) are © Jagex Ltd. OSRS
TaskMaster is a free, non-commercial fan-made tool and isn't made by or affiliated with Jagex.
