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

## Effort tiers

| Tier | Shown as | Roughly |
|---|---|---|
| `Quick` | Quick win | A session or two (3 hours or less) |
| `Medium` | Balanced | A few sessions (up to 20 hours) |
| `Long` | Long haul | Weeks of grinding or rare drops |
| `Challenge` | Challenge card | A huge collection log page, weeks to months. Shown on its own, never among the regular picks |

For collection log items the tier comes from the drop rate: expected hours =
(1 ÷ chance per kill) × minutes per kill. The hour limits are `EFFORT_HOURS`; the minutes are
`MINUTES_PER_ATTEMPT` (per boss) and `TAB_MINUTES` (fallback per collection log tab). Fixed rules
in `PAGE_EFFORT`, `MONSTER_EFFORT` and `ITEM_EFFORT` win over the maths, for things like the Fire
cape or team content.

## Within reach

The row under the summary lists notable quests and the next tier of each achievement diary that
you can do now (**Ready now**) or are at most two requirements from (**N to go**: each within 5
skill levels, 3 combat levels, 10 quest points or one quest). Requirements come from
`QUEST_PREREQS`, `QUESTS[...].reqs` and `DIARY_REQS` in the knowledge base (taken from the OSRS
Wiki). Quests a profile doesn't list are shown with a **?** and don't block.

Anything that just opened up ranks first and says why: a level reached since the previous sync, a
quest or the tier below finished since then, or something marked done by hand in the last two
weeks. The page keeps a small copy of each profile it has seen (`tm.seen:*` / `tm.prev:*` in
localStorage) to tell what changed between syncs.

## Marking progress by hand

**Mark progress by hand** (in the summary) adds *Mark done* buttons to quest, diary and combat
achievement cards, and toggles to the Quests and Diaries tabs. Marks are kept in this browser
(`tm.marks:*`), are laid over the synced profile everywhere (suggestions, goals, counts, Within
reach), and are dropped as soon as a sync shows the same thing done. Quest points don't change
until the next sync, since the profile doesn't say how many each quest is worth.

## Progress counters

Cards show a short counter beside the bar. Combat achievements that ask for a number of kills
("Kill Vorkath 50 times") compare against the synced kill count (`?/50 kills` when it hasn't
synced); tasks that need kills in one trip, in a row or under conditions don't. Other combat
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

## Where the data comes from

The profile is written by the RuneLite plugin; [data-sources.md](data-sources.md) lists exactly
what it reads. Drop rates are a saved snapshot from the OSRS Wiki in `web/data/drop-rates.json`,
refreshed by hand with `scripts/Update-DropRates.ps1`.
