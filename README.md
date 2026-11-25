# OSRS TaskMaster

Type your OSRS name and get three things to grind next, based on your levels, quests,
achievement diaries, combat achievements, collection log, pets and your own goals
(including goals to obtain specific items).

**No third-party APIs.** All data comes from your own RuneLite client through the OSRS TaskMaster
plugin and goes to a small server on your own PC. Nothing calls the hiscores, the wiki,
Wise Old Man, TempleOSRS or any other community service.

**No wealth data.** The plugin never reads your bank, inventory or equipment, and the server
refuses any snapshot that contains wealth data. Item goals are tracked through the collection
log, or ticked off by hand for items that aren't in it.

```
RuneLite + OSRS TaskMaster plugin ──POST /api/sync──▶ server (127.0.0.1:8787) ◀── browser
   reads your client's memory                         stores JSON in server/data
```

## Run it

1. **Start the server** (serves the site and receives syncs):
   ```powershell
   .\start-server.ps1
   ```
   It prints a sync token (also saved in `server/data/token.txt`). Open http://localhost:8787.
2. **Start RuneLite with the plugin** (developer mode, side-loaded):
   ```powershell
   .\start-runelite-dev.ps1
   ```
   In RuneLite: Configuration → OSRS TaskMaster → paste the token into **Sync token**. Log in.
   Jagex Accounts need RuneLite's one-time `--insecure-write-credentials` handoff first.
3. **Fill in the gaps** once: open the collection log and click **Search** so every obtained
   item is recorded. Kill counts are picked up from chat as you play.

Use the plugin's side-panel **Sync now** button any time; auto-sync runs on login and at most
every 5 minutes after something changes (configurable).

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
- `server/Server.java` – dependency-free JDK server. Binds to 127.0.0.1 only, checks the
  sync token, rejects foreign `Host` headers and wealth data.
- `web/` – the site. `kb.js` is the hand-written knowledge base (quest requirements,
  diary rewards, quick collection logs, rare drops): edit it to tune suggestions.
  `engine.js` is the recommender.

## Known gaps

- Combat achievement and collection log layouts come from cache enums/structs
  (CA: 3981–3986, params 1306–1312; collection log: 2102, params 683/689/690). If a game
  update moves them, the site falls back to points and totals.
- Quest skill requirements and the rare-drop list in `kb.js` are hand-curated.
- Publishing to the Plugin Hub would need a hosted server and the hub's third-party
  data warning; this setup is personal/local only.
