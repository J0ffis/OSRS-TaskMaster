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
Players who'd rather skip that can switch on **Automatic upload** in the plugin. Nothing calls
the hiscores, the wiki, Wise Old Man, TempleOSRS or any other community service, and the plugin
never reads your bank, inventory or equipment.

**Testing it?** Follow the step-by-step **[tester guide](TESTER-GUIDE.md)**.

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
4. With **Automatic upload** on, the plugin also uploads the profile to the sync service
   (`sync/`): the website then loads it from a link on any browser, goals are saved with it, and
   the plugin's panel shows the website's latest picks. Profiles are private by default, with an
   optional public lookup by name. Details in [sync/README.md](sync/README.md).

For a complete collection log, open it in game and click **Search** once. Kill counts are picked
up from chat messages as you play. The full list of what the plugin reads is in
[docs/data-sources.md](docs/data-sources.md).

## Project structure

- `plugin/` – the RuneLite plugin (Java 11, Gradle). It has its own player-facing
  [README](plugin/README.md).
- `web/` – the website, plain static files with no build step.
  - `recommender.js` – picks the suggestions: profile + goals in, ranked suggestions out.
  - `knowledge-base.js` – hand-written game facts (quest requirements, diary rewards, effort
    estimates). Edit this to tune suggestions.
  - `app.js` – the page itself: importing profiles, rendering cards, managing goals.
  - `config.js` – where the Automatic upload service runs (local or live).
  - `sample-profile.json` – the made-up account behind **Load sample data**.
  - `data/drop-rates.json` – a snapshot of collection log drop rates from the OSRS Wiki.
- `sync/` – the Automatic upload service (Cloudflare Worker + D1 database), with end-to-end tests.
  How it works, running it locally and deploying it: [sync/README.md](sync/README.md).
- `server/` – an optional, dependency-free local server (`Server.java`) for development.
- `scripts/` – PowerShell scripts:
  - `Start-TaskMaster.ps1` – the tester launcher behind `Start TaskMaster.bat`.
  - `Start-RuneLiteDev.ps1` – starts RuneLite with the plugin, for development.
  - `Start-LocalServer.ps1` – starts the optional local server.
  - `Update-DropRates.ps1` – refreshes `web/data/drop-rates.json` from the OSRS Wiki.
  - `Format-Json.ps1` – lays JSON files out one entry per line so they're easy to read.
- `docs/` – reference notes: what the plugin reads, and publishing to the Plugin Hub.
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
`web/`. Locally, any static file server works, or use the local server below. Pages opened from
this PC (`localhost` / `127.0.0.1`) talk to the local sync service, not the live one.

### Running the Automatic upload service

```powershell
cd sync
npm install
npm run db:local   # once
npm run dev        # http://127.0.0.1:8789
npm test           # end-to-end tests, in a second terminal
```

Set the plugin's **Upload server** setting to `http://127.0.0.1:8789` to test against it.
Deploying it to Cloudflare is covered in [sync/README.md](sync/README.md).

### Running the local server (optional)

The local server serves the website at http://localhost:8787 and lists any profiles saved in
`server/data/profiles`. (On this branch the plugin no longer sends to it: Automatic upload, above,
replaced that.)

```powershell
.\scripts\Start-LocalServer.ps1
```

The server binds to 127.0.0.1 only, rejects foreign `Host` headers and refuses any profile that
contains wealth data. Saved profiles and goals are kept in `server/data/`, which is not committed.

### Drop rates

`web/data/drop-rates.json` is refreshed by hand after content updates:

```powershell
.\scripts\Update-DropRates.ps1
```

It looks up every collection log item from your latest synced profile on the OSRS Wiki, in about
30 paced, batched requests. The website only ever reads the local file. Effort is estimated as
(1 ÷ chance per attempt) × minutes per attempt, using `MINUTES_PER_ATTEMPT` and `EFFORT_HOURS` in
`web/knowledge-base.js`; fixed rules there (guaranteed rewards, raids, duplicate protection and
so on) take priority over the rates.

If you edit a JSON file by hand, `.\scripts\Format-Json.ps1 <file>` puts it back in the same
layout.

## Publishing to the Plugin Hub

Not done yet. The steps are written up in [docs/plugin-hub.md](docs/plugin-hub.md).

## Credits

Drop rates are from the [Old School RuneScape Wiki](https://oldschool.runescape.wiki/), licensed
CC BY-NC-SA 3.0.
