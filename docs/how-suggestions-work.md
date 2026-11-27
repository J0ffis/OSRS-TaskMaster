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
   listed in `CONTENT_REQS`) is hidden and counted under *hidden until unlocked*.
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
boss's collection log page when it's opened, so opening the page is enough for old kills. Tasks that need kills in one trip, in a row or under conditions don't. Other combat
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
npm test        # the checker's tests plus the suggestion snapshots
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
refreshed by hand with `scripts/Update-DropRates.ps1`.
