# How suggestions work

Everything here happens in the browser, in [`web/recommender.js`](../web/recommender.js), using
your profile and the hand-written game facts in [`web/knowledge-base.js`](../web/knowledge-base.js).
Nothing is fetched from the internet.

## The pipeline

1. **Generate.** One function per category looks at your profile and lists everything it could
   suggest:

   | Category | Generator | Examples |
   |---|---|---|
   | Levels | `levelCandidates` | Next milestone (70, 80, 99...) for a skill, XP past 99 |
   | Quests | `questCandidates` | Notable quests from `QUESTS`, started quests, the last few for the cape |
   | Achievement diaries | `diaryCandidates` | The next tier of each region |
   | Combat achievements | `combatCandidates` | Single tasks, or "every Easy task at a boss" |
   | Collection log | `clogCandidates` | Finish a page, get a missing item or a group of similar items |
   | Pets | `petCandidates` | Missing pets |
   | Goals | `goalCandidates` | A card for each unfinished goal you set yourself |

   Each suggestion gets a **base score** (higher is better) and an **effort tier**.
2. **Filter.** Minigames, Wilderness and clue content are removed unless you switch them on
   under *Also include*. Content you can't access yet (for example Vorkath before Dragon Slayer II,
   listed in `CONTENT_REQS`) is hidden and counted under *hidden until unlocked*. That list's
   **Make it a goal** adds what unlocks a row: the quest itself for a locked quest, otherwise a
   goal per missing quest or skill level (noted as "Unlocks Vorkath"). Closing the list after
   adding goals asks whether to plan a route to them.
3. **Score.** A suggestion that moves one of your goals forward gets +25 for each goal, and the
   card says which goal.
4. **Pick.** The list is sorted by score. `pickThree` takes the top cards but prefers different
   categories, then different bosses or pages, so you don't get three Zulrah cards. **Shuffle**
   adds a small, repeatable bit of randomness (the `seed`).

## Account types

The plugin records the account type, and suggestions follow it (`applyAccountType` in
`recommender.js`, tables in `knowledge-base.js`):

- **Ironmen** (every kind): quests and diary regions in `IRON_PRIORITIES` that help you supply
  yourself (Barrows gloves, Ava's device, Fossil Island, fairy rings...) get extra score, and the
  card says why.
- **Group Ironmen**: team content (raids and `TEAM_PAGES` such as Nex) gets `GROUP_CONTENT_BOOST`
  and a note that it suits the group.
- **Hardcore** accounts: Wilderness cards and the Wilderness toggle carry a stronger warning, since
  a death there also ends Hardcore status. Wilderness stays opt-in as for everyone.

The website shows the game's helm for the account type in front of the player's name. To compare
account types, load the sample data and use **View the sample as**: a made-up main, Ironman,
Hardcore, Ultimate, Group or Hardcore Group Ironman (`#sample=main`, `iron`, `hcim`, `uim`, `gim`,
`hcgim`). Each is its own account at its own stage of the game (`web/samples/`, made by
`npm run samples` from `tests/make-sample-profiles.mjs`); hardcore samples have no Wilderness
progress. The engine has no rules of its own for Ultimate Ironmen yet: they're treated as Ironmen.

## Not for me

Every suggestion card (and the Challenge card) has **Not for me**, which hides it **for a week**
or **for good**; the slot is refilled like Swap. Hidden suggestions are kept per player in this
browser (`tm.hidden:*` in localStorage), are left out of every tier and the Challenge card, and
are listed under **N hidden by you** in the filters row, where **Show again** brings one back.
Week-long ones come back by themselves. Goal cards don't have it: remove the goal instead.

## Effort tiers

| Tier | Shown as | Roughly |
|---|---|---|
| `Quick` | Quick win | A session or two (3 hours or less) |
| `Medium` | Balanced | A few sessions (up to 20 hours) |
| `Long` | Long haul | Weeks of grinding or rare drops |
| `Challenge` | Challenge card | A huge collection log page, weeks to months. Shown on its own, never among the regular picks |

For collection log items the tier comes from the drop rate: expected hours =
(1 ÷ chance per kill) × minutes per kill. Kill-count combat achievements ("Kill Vorkath 50
times") show the time for the kills left (kills left × minutes per kill), and their tier is the
harder of the task's own tier and that time. The hour limits are `EFFORT_HOURS`; the minutes are
`MINUTES_PER_ATTEMPT` (per boss) and `TAB_MINUTES` (fallback per collection log tab). Fixed rules
in `PAGE_EFFORT`, `MONSTER_EFFORT` and `ITEM_EFFORT` win over the maths, for things like the Fire
cape or team content.

Level cards ("Train Cooking to 70") show a time range when the skill has rates in `XP_RATES`:
XP/hour ranges for one mainstream method per level band, copied from the OSRS Wiki's training
guides, e.g. "1.2M XP to go. About 5–7 hours." with "Time based on karambwans" in the reasons. A
band's method keeps applying until the next band starts. The card's tier then follows the middle
of that range instead of the XP gap. Skills whose guides gave no usable figure (the melee skills,
Hitpoints, Magic, Slayer, Hunter, Construction, Farming, Fletching), and levels below a skill's
first band, keep the XP-gap tier and show no time.

## Within reach

The row under the summary lists notable quests and the next tier of each achievement diary that
you can do now (**Ready now**) or are at most two requirements from (**N to go**: each within 5
skill levels, 3 combat levels, 10 quest points or one quest). Requirements come from
`QUEST_PREREQS`, `QUESTS[...].reqs` and `DIARY_REQS` in the knowledge base (taken from the OSRS
Wiki). Quests a profile doesn't list are shown with a **?** and don't block.

Anything that just opened up ranks first and says why: a level reached in the last 8 hours, a
quest or the tier below finished in that time, or something marked done by hand in the last two
weeks. "Recent" uses the same 8-hour history as the next section.

## Since last time (the last 8 hours)

Under your name, a line sums up your progress over a rolling 8 hours: levels (hover for which),
XP, quests, diary tiers, combat achievements, new collection log slots, pets and goals finished,
e.g. "Last 8 hours: +3 levels · +1.9M XP · 2 new log slots". It compares the synced profile with
how it was 8 hours earlier, so frequent syncs (Automatic upload sends one every few minutes) add
up instead of resetting it. When this browser hasn't seen a profile that old yet, it says so
("Last 3 h").

The page keeps a short history of compact profiles it has seen in `tm.history:*`
(`compactProfile`): at most one every 30 minutes plus the newest, trimmed to the one 8 hours back.
It compares synced profiles only, so progress marked by hand counts once a sync confirms it.

## Route planner

**Plan a route** (in the Goals panel, once you have an unfinished goal) turns the goals you tick
into one ordered list of steps (`planRoute` in `recommender.js`):

1. Each goal is expanded into what it needs. Quests come from `web/data/quest-reqs.json`, a
   snapshot of every quest's and miniquest's requirements from the OSRS Wiki: skills, quest
   points, combat level and prerequisite quests, followed all the way down the chain (Recipe for
   Disaster's parts included). Diary tiers use `DIARY_REQS` (skills, quests, quest points, combat
   level), and collection log pages, pets, items and combat achievements their access gates
   (`CONTENT_REQS`). Requirements you already meet are dropped. Anything else a quest needs that
   isn't a level or a quest ("100 Kudos", "Access to Keldagrim") is shown on its step; what you
   must be able to fight is kept in the file but not shown.
2. Shared requirements become one step ("shared by 2"), and one skill's targets are trained in
   order (Cooking to 90, then to 95, each timed from the one before). Each step says what asks
   for it directly ("Train Crafting to 49 · Needed for The Hand in the Sand"), not only which
   goal it's on the way to.
   - A skill you can't train until a quest is done (`SKILL_UNLOCK_QUESTS`: Herblore needs Druidic
     Ritual, Sailing needs Pandemonium) gets that quest before its first training step.
   - **Reach N quest points** counts the quests earlier on the route that don't wait for the
     points themselves, then adds the quickest quests you can start right now (every requirement
     met) for the rest: fewest hours per point by the wiki's quest length, more points first on
     a tie. The step says how the total is made up, and anything still short.
3. Steps are ordered so every step comes after what it depends on, and among the steps that are
   ready, the one on the way to the goal that's closest to done goes first (quests weighed by
   their wiki length). Goals therefore finish
   one by one instead of all at the end.

Training steps show a time when the skill has wiki rates (`XP_RATES`); quests and other steps
don't, and the total says how many steps have no time. A quest the profile doesn't list (a
trimmed profile, or a quest newer than the plugin) isn't guessed at: it's named below the route
instead. Quests the snapshot doesn't cover are listed too, to check on the wiki; custom goals
aren't planned. The planner only reads, so it's available on view-only pages too.

**Pin this route to the page** keeps it in a **Your route** panel above the Goals panel: the
next few steps, how many are done and the time left, with **See all steps**, **Change goals** and
**Unpin**. Only the chosen goals are saved (per profile, in this browser, `tm.route:*`); the steps
are planned again on every load, so finished ones drop off and the count goes up as you sync.
A step counts as done only when the profile shows it (a level reached, a quest finished), so
removing a goal from the route doesn't count its steps as done.

## Combat achievement planner

**Plan a tier** (in the Combat tab, or **Pick bosses** on a CA tier goal) plans a combat
achievement reward tier (`caTierPlan` in `recommender.js`):

1. Pick a reward tier you haven't reached, and the hardest task tier to count (**Count tasks up
   to**, the reward tier by default). Going for Elite counts Easy to Elite tasks only, so the
   plan stays below Master and Grandmaster content; set it lower to stay further down.
2. Every boss with unfinished tasks in that range is listed with its points, tasks by tier, an
   effort label and any access gate (`CONTENT_REQS`). Tasks not tied to a boss ("Other") are one
   row. Bosses are ordered by points for the work: each task costs more the harder its tier
   (`CA_TASK_COST`) and each boss adds a fixed cost (`CA_BOSS_COST`), so a boss with several
   tasks beats several bosses with one each. Locked bosses come last.
3. **Pick for me** ticks the fewest bosses, in that order, that cover the points still needed
   (dropping any the others make redundant); when even all of them fall short it ticks them all
   and says by how much.
4. **Add as goals and plan a route** adds the tier as a goal plus one goal per boss ("Every task
   up to Elite at Vorkath", type `caboss`, remembering the tier it's for), reusing goals you
   already have, and opens the route planner with them ticked. The route puts each boss's quest
   and Slayer unlocks before it, and the tier goal after its bosses.

The quest snapshot (requirements, length and quest point reward) is refreshed by
`scripts/update-quest-reqs.mjs` (`npm run quest-reqs`, also run by `Update-GameData.ps1`). It asks
the wiki only when the game has a quest the file doesn't cover yet (`--full` asks anyway), in three
requests (the quest bucket, and the free-to-play and members quest lists for quest points), and the file only changes when the requirements
did. `npm run check` warns when the hand tables (`QUESTS`, `QUEST_PREREQS`)
disagree with it; the snapshot wins wherever it has the quest, and the hand tables are the
fallback if it fails to load. The same snapshot drives the quest cards under **Within reach**.

## Marking progress by hand

**Mark progress by hand** (in the summary) adds *Mark done* buttons to quest, diary and combat
achievement cards, and toggles to the Quests and Diaries tabs. Marks are kept in this browser
(`tm.marks:*`), are laid over the synced profile everywhere (suggestions, goals, counts, Within
reach), and are dropped as soon as a sync shows the same thing done. Quest points don't change
until the next sync, since the profile doesn't say how many each quest is worth.

## Progress counters

Cards show a short counter beside the bar. Combat achievements that ask for a number of kills
("Kill Vorkath 50 times") compare against the synced kill count (`?/50 kills` when it hasn't
synced). The plugin records kill counts from kill-count chat messages and from the header of a
boss's collection log page when it's opened, so opening the page is enough for old kills. Tasks
that need kills in one trip, in a row or under conditions don't. Other combat
achievements show how much of their tier is done; collection log cards show slots, diaries tiers.

## Tuning it

Most changes only need [`web/knowledge-base.js`](../web/knowledge-base.js), which is plain data.

- **Suggest a quest more (or less):** change its `weight` in `QUESTS`, or add a new entry:
  ```js
  "Lost City": { why: "Zanaris access and dragon longsword/dagger.", reqs: { crafting: 31, woodcutting: 36 }, weight: 6 },
  ```
  `why` is shown on the card, `reqs` are the main skill requirements, and `weight` is how
  important it is (about 3–10).
- **Make a collection log page feel easier:** add it to `CLOG_EASE` with a bonus score.
- **A boss is slower or faster than assumed:** change its minutes in `MINUTES_PER_ATTEMPT`.
- **Hide content until a requirement is met:** add a line to `CONTENT_REQS`.

After an edit, reload the page. With **Load sample data** you can check the result without a
real profile.

### Checking an edit

The website silently ignores a rule it can't use: a misspelt item, page, quest or boss name, or a
tier that doesn't exist (`"Long-Haul"` instead of `"Long"`). Two checks catch that (they need
[Node.js](https://nodejs.org/), nothing else):

```powershell
npm run check   # knowledge-base.js against the game's own names, with "did you mean" hints
npm test        # the checker's tests, the suggestion snapshots and the other website tests
```

- **The checker** (`tests/check-knowledge-base.mjs`) compares every name in the knowledge base
  with `tests/fixtures/game-names.json`: the game's collection log pages and items, quests,
  diary regions and combat achievements, without any player's progress. After a game update adds
  pages, items or quests, log in with the plugin and run `scripts\Update-GameData.ps1` (or just
  `npm run game-names`), which refreshes that file from the profile the plugin saved.
- **The suggestion snapshots** (`tests/suggestions.test.mjs`) list what the recommender suggests
  for two fixed test accounts: the sample profile, and a made-up account with every page, quest
  and task. A change to the suggestions fails the test until you accept it with
  `npm run test:update`; the diff of `tests/suggestions.test.mjs.snapshot` then shows exactly
  which suggestions moved, appeared or went, with their tier and score.

Both run before every publish of the website, so a mistake stops the deploy instead of reaching
players.

## Where the data comes from

The profile is written by the RuneLite plugin; [data-sources.md](data-sources.md) lists exactly
what it reads. Drop rates are a saved snapshot from the OSRS Wiki in `web/data/drop-rates.json`,
refreshed by hand with `scripts/Update-DropRates.ps1`. Quest requirements are another wiki
snapshot, `web/data/quest-reqs.json`, refreshed with `scripts/update-quest-reqs.mjs`. Both
scripts only ask the wiki about what the files don't cover yet, so re-running them is cheap.
