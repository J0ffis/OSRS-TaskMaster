# What the plugin reads

Everything comes from your own game client. The plugin makes no calls to the hiscores, the
wiki or any community service, and it never reads your bank, inventory or equipment. The local
server also refuses any snapshot that contains wealth data.

| Data | Source in the client |
|---|---|
| Levels, XP | `Client.getRealSkillLevel` / `getSkillExperience` |
| Quests, quest points | `Quest.getState`, varp `QP` |
| Achievement diaries | `*_DIARY_*_COMPLETE` varbits per tier, and `STARTED_*_DIARY` varbits per region (any task done) |
| Combat achievements | `CA_POINTS` and `CA_THRESHOLD_*` varbits, `CA_TASK_COMPLETED_*` varps, task names from the game cache |
| Collection log | `COLLECTION_COUNT*` varps, page layout from the game cache, obtained items when you click **Search** |
| Pets | The collection log's own "All Pets" page |
| Kill counts | "Your X kill count is: N" chat messages |

Collection log items and kill counts are only visible at certain moments, so the plugin
remembers them per account in RuneLite's own config (`ProgressStore.java`).

Item goals on the website are tracked through the collection log. Items that aren't in it can be
ticked off by hand.

## Known gaps

- Combat achievement and collection log layouts come from cache enums and structs
  (combat achievements: 3981–3986, params 1306–1312; collection log: 2102, params 683/689/690).
  If a game update moves them, the website falls back to points and totals.
- Quest skill requirements and the rare-drop list in `web/knowledge-base.js` are hand-curated, so they
  need updating when new content comes out.
- Until the plugin is on the Plugin Hub, testers run it from source in RuneLite's developer mode.
