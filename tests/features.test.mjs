// "Since last time", account-type rules and kill-count time estimates.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { candidates, compactProfile, sinceLast, accountKind, showcaseOptions, showcaseChoices, showcasePicks, showcaseSuggestion, SHOWCASE_KINDS } from "../web/recommender.js";
import { loadDropRates, sampleAccount, SAMPLE_IDS, fullAccount } from "./test-account.mjs";
import { WILDERNESS_PAGES } from "../web/knowledge-base.js";

loadDropRates();
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---- Since last time ----------------------------------------------------------------------

test("since last time: lists levels, XP, quests, diaries, CAs, log slots, pets and goals", () => {
  const before = fullAccount();
  const goals = [{ id: "g1", type: "skill", skill: "slayer", level: 79 }];
  const prev = compactProfile(before, goals);
  const after = clone(before);
  after.skills.slayer = { level: 79, xp: before.skills.slayer.xp + 200_000 };
  after.skills.mining = { level: before.skills.mining.level + 2, xp: before.skills.mining.xp + 300_000 };
  const q = after.quests.find((x) => x.state !== "FINISHED");
  q.state = "FINISHED";
  const region = Object.keys(after.diaries).find((r) => !after.diaries[r].elite);
  const tier = ["easy", "medium", "hard", "elite"].find((t) => !after.diaries[region][t]);
  after.diaries[region][tier] = true;
  const task = after.combatAchievements.tasks.find((t) => !t.done);
  task.done = true;
  after.combatAchievements.points += 3;
  after.collectionLog.obtained += 2;
  after.syncedAt = (before.syncedAt ?? 0) + 864e5;

  const parts = sinceLast(after, prev, goals);
  const by = Object.fromEntries(parts.map((p) => [p.kind, p]));
  assert.equal(by.levels.text, `+${2 + (79 - before.skills.slayer.level)} levels`);
  assert.match(by.levels.detail, /Mining/);
  assert.equal(by.xp.text, "+500K XP");
  assert.equal(by.quests.text, "1 quest");
  assert.equal(by.quests.detail, q.name);
  assert.equal(by.diaries.detail, `${region} ${tier[0].toUpperCase()}${tier.slice(1)}`);
  assert.equal(by.combat.text, "1 combat achievement");
  assert.equal(by.clog.text, "2 new log slots");
  assert.equal(by.goals.text, "1 goal done");
  assert.equal(by.goals.detail, "79 Slayer");
});

test("since last time: nothing changed, no previous sync, or an older saved copy", () => {
  const snap = fullAccount();
  assert.deepEqual(sinceLast(snap, compactProfile(snap)), []);
  assert.deepEqual(sinceLast(snap, null), []);
  // Copies saved before this feature only had levels, quests and diaries: totals are skipped.
  const old = compactProfile(snap);
  for (const k of ["xp", "clog", "caPoints", "caDone", "pets", "goalsDone"]) delete old[k];
  old.skills.attack -= 1;
  const more = clone(snap);
  more.collectionLog.obtained += 5;
  assert.deepEqual(sinceLast(more, old).map((p) => p.kind), ["levels"]);
});

// ---- Account types --------------------------------------------------------------------------

const withType = (snap, accountType) => ({ ...snap, player: { ...snap.player, accountType } });

test("account kind is read from the profile's account type", () => {
  assert.deepEqual(accountKind({ player: { accountType: "Hardcore Group Ironman" } }),
    { type: "Hardcore Group Ironman", iron: true, hardcore: true, ultimate: false, group: true });
  assert.equal(accountKind({ player: { accountType: "Ultimate Ironman" } }).ultimate, true);
  assert.equal(accountKind({ player: {} }).iron, false);
  assert.equal(accountKind({ player: { accountType: "Normal" } }).iron, false);
});

test("Ironmen get their priorities raised, with the reason on the card", () => {
  const base = fullAccount();
  const find = (snap) => candidates(snap, [], {}).find((c) => c.meta?.quest === "Recipe for Disaster");
  const iron = find(withType(base, "Ironman"));
  const normal = find(withType(base, "Normal"));
  assert.ok(iron && normal, "the test account is offered Recipe for Disaster");
  assert.equal(iron.score - normal.score, 12);
  assert.match(iron.why[0], /as an Ironman/, "shown first, so it's on the card");
  assert.ok(!normal.why.some((w) => /as an Ironman/.test(w)));
});

test("Group Ironmen get team content raised; other Ironmen don't", () => {
  const base = fullAccount();
  const raid = (snap) => candidates(snap, [], {}).find((c) => c.id === "clogpage:Chambers of Xeric");
  const gim = raid(withType(base, "Group Ironman"));
  const iron = raid(withType(base, "Ironman"));
  assert.equal(gim.score - iron.score, 5);
  assert.ok(gim.why.some((w) => /Ironman group/.test(w)));
});

// ---- Sample accounts ---------------------------------------------------------------------------

test("there's a sample account for each of the six account types, each with its own progress", () => {
  const samples = SAMPLE_IDS.map((id) => sampleAccount(id));
  assert.deepEqual(samples.map((s) => s.player.accountType),
    ["Normal", "Ironman", "Hardcore Ironman", "Ultimate Ironman", "Group Ironman", "Hardcore Group Ironman"]);
  const fingerprint = (s) => JSON.stringify([s.skills.overall, s.questPoints, s.combatAchievements.points, s.collectionLog.obtained]);
  assert.equal(new Set(samples.map(fingerprint)).size, samples.length, "no two samples have the same progress");
});

test("sample accounts show their account type's rules", () => {
  const why = (id) => candidates(sampleAccount(id), [], {}).flatMap((c) => c.why);
  assert.ok(!why("main").some((w) => /Ironman/.test(w)), "a main gets no Ironman reasons");
  assert.ok(why("iron").some((w) => /an Ironman/.test(w)), "an Ironman gets Ironman priorities");
  for (const id of ["gim", "hcgim"]) assert.ok(why(id).some((w) => /Ironman group/.test(w)), `${id} gets team content raised`);
  for (const id of ["hcim", "hcgim"]) {
    const s = sampleAccount(id);
    const wild = Object.entries(s.collectionLog.pages).filter(([p]) => WILDERNESS_PAGES.has(p)).flatMap(([, p]) => p.items);
    assert.ok(wild.every((i) => !i.quantity), `${id} has no Wilderness drops`);
    assert.ok(!Object.values(s.diaries.Wilderness).some(Boolean), `${id} has no Wilderness diary`);
  }
});

// ---- Kill-count time estimates ----------------------------------------------------------------

test("kill-count tasks say how long the kills left take, and are never a lower tier than that", () => {
  const snap = fullAccount();
  snap.killCounts = { ...snap.killCounts, Zulrah: 10 };
  const list = candidates(snap, [], { content: { minigames: true, wilderness: true, clues: true } });
  const zulrah = list.filter((c) => c.id.startsWith("ca:") && c.meta.monster === "Zulrah" && /\b\d+ times\b/.test(c.detail));
  assert.ok(zulrah.length, "the test account has a Zulrah kill-count task");
  for (const c of zulrah) {
    const need = +c.detail.match(/(\d[\d,]*) times/)[1].replace(/,/g, "");
    const line = c.why.find((w) => w.startsWith("About "));
    if (need <= 10) { assert.equal(line, undefined, `${c.title}: kills already done`); continue; }
    assert.ok(line, `${c.title} has a time estimate`);
    assert.match(line, new RegExp(`for the ${need - 10} kills left \\(2 min each\\)`));
    const hours = (need - 10) * 2 / 60;
    if (hours > 20) assert.equal(c.effort, "Long", `${c.title}: ${hours} h is a long haul`);
    else if (hours > 3) assert.notEqual(c.effort, "Quick", `${c.title}: ${hours} h isn't a quick win`);
  }
});

// ---- Sections missing from a profile --------------------------------------------------------

test("missing sections: none for a current profile, named for one from an older plugin", async () => {
  const { missingSections } = await import("../web/recommender.js");
  assert.deepEqual(missingSections(fullAccount()), []);
  const old = clone(fullAccount());
  delete old.slayer;
  delete old.diaryStarted;
  assert.deepEqual(missingSections(old).map((m) => m.key), ["slayer", "diaryStarted"]);
  assert.deepEqual(missingSections(null), []);
});

// ---- Level time estimates -------------------------------------------------------------------

test("level hours: sums each band at its own rate and names the methods", async () => {
  const { levelHours, hoursRangeText, xpForLevel } = await import("../web/recommender.js");
  // Cooking 50 -> 70 is all karambwans at 180k-218k XP/h.
  const gap = xpForLevel(70) - xpForLevel(50);
  const t = levelHours("cooking", xpForLevel(50), xpForLevel(70));
  assert.ok(Math.abs(t.low - gap / 218000) < 1e-9 && Math.abs(t.high - gap / 180000) < 1e-9);
  assert.deepEqual(t.methods, ["karambwans"]);
  // Across bands: Woodcutting 60 -> 80 is teak until 71, then sulliuscep.
  const wc = levelHours("woodcutting", xpForLevel(60), xpForLevel(80));
  assert.deepEqual(wc.methods, ["teak trees", "sulliuscep"]);
  const expectHigh = (xpForLevel(71) - xpForLevel(60)) / 46000 + (xpForLevel(80) - xpForLevel(71)) / 86300;
  assert.ok(Math.abs(wc.high - expectHigh) < 1e-9);
  // No rates, below the first band, or already there: no estimate.
  assert.equal(levelHours("attack", 0, xpForLevel(50)), null);
  assert.equal(levelHours("prayer", xpForLevel(10), xpForLevel(40)), null);
  assert.equal(levelHours("cooking", xpForLevel(70), xpForLevel(60)), null);
  assert.equal(hoursRangeText({ low: 0.2, high: 0.6 }), "under an hour");
  assert.equal(hoursRangeText({ low: 3.2, high: 4.6 }), "about 3–5 hours");
  assert.equal(hoursRangeText({ low: 41, high: 44 }), "about 40–45 hours");
  assert.equal(hoursRangeText({ low: 1, high: 1.2 }), "about 1 hour");
});

test("level cards: time in the detail, method in the reasons, and the tier follows the time", () => {
  const list = candidates(fullAccount(), [], { content: { minigames: true, wilderness: true, clues: true } });
  const levels = list.filter((c) => c.category === "levels");
  const timed = levels.filter((c) => c.meta.hours);
  assert.ok(timed.length, "some skills on the test account have rates");
  for (const c of timed) {
    assert.match(c.detail, /XP to go\. (Under an hour|About [\d,]+(–[\d,]+)? hours?)\.$/, c.title);
    assert.ok(c.why.some((w) => /^Time based on .+ OSRS Wiki/.test(w)), c.title);
    const h = (c.meta.hours.low + c.meta.hours.high) / 2;
    assert.equal(c.effort, h <= 3 ? "Quick" : h <= 20 ? "Medium" : "Long", `${c.title}: ${h.toFixed(1)} h`);
  }
  for (const c of levels.filter((c) => !c.meta.hours)) assert.doesNotMatch(c.detail, /hour/, c.title);
});

// ---- Route planner ----------------------------------------------------------------------------

test("planner: shared requirements come once, before everything that needs them", async () => {
  const { planRoute } = await import("../web/recommender.js");
  const snap = sampleAccount();
  const goals = [
    { id: "a", type: "quest", quest: "Dragon Slayer II" },
    { id: "b", type: "clog", page: "Vorkath" },
    { id: "c", type: "skill", skill: "agility", level: 80 },
    { id: "d", type: "custom", text: "Fire cape" },
  ];
  const plan = planRoute(snap, goals);
  const at = (key) => plan.steps.findIndex((s) => s.key === key);
  const keys = plan.steps.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length, "every step appears once");
  // Vorkath is gated behind Dragon Slayer II, so the quest and its requirements serve both goals.
  const ds2 = plan.steps[at("quest:Dragon Slayer II")];
  assert.deepEqual(ds2.forGoals.sort(), ["Dragon Slayer II", "Vorkath collection log"]);
  assert.ok(ds2.shared);
  assert.ok(at("quest:Dragon Slayer II") < at("goal:b"), "the quest before the log it unlocks");
  // Every step comes after the steps it depends on (prerequisite quests, lower skill targets).
  for (const s of plan.steps.filter((s) => s.kind === "quest")) {
    for (const pre of ["A Tail of Two Cats", "Dream Mentor"]) {
      if (s.key === "quest:Dragon Slayer II" && at(`quest:${pre}`) >= 0) assert.ok(at(`quest:${pre}`) < at(s.key), `${pre} before ${s.title}`);
    }
  }
  const agility = plan.steps.find((s) => s.key.startsWith("skill:agility:"));
  assert.deepEqual(agility.completes, ["80 Agility"]);
  assert.ok(agility.hours, "Agility has wiki rates");
  assert.deepEqual(plan.skipped, ["Fire cape"]);
  assert.ok(plan.total.timed >= 1 && plan.total.low <= plan.total.high);
});

test("planner: follows the whole quest chain from the wiki snapshot, with no gaps", async () => {
  const { planRoute } = await import("../web/recommender.js");
  const plan = planRoute(fullAccount(), [{ id: "a", type: "quest", quest: "Dragon Slayer II" }]);
  assert.deepEqual(plan.unknown, [], "every quest on the way has known requirements");
  const at = (key) => plan.steps.findIndex((s) => s.key === key);
  // Every quest step comes after the quests it needs that aren't finished yet.
  const reqs = JSON.parse(readFileSync(new URL("../web/data/quest-reqs.json", import.meta.url), "utf8")).quests;
  for (const s of plan.steps.filter((s) => s.key.startsWith("quest:"))) {
    for (const p of reqs[s.key.slice(6)]?.quests ?? []) {
      if (at(`quest:${p}`) >= 0) assert.ok(at(`quest:${p}`) < at(s.key), `${p} before ${s.title}`);
    }
  }
  // Requirements that aren't a level or a quest are shown on the step.
  const bone = plan.steps.find((s) => s.key === "quest:Bone Voyage");
  if (bone) assert.match(bone.note, /100 Kudos/);
});

test("planner: finished goals and met requirements are left out", async () => {
  const { planRoute, xpForLevel } = await import("../web/recommender.js");
  const snap = clone(sampleAccount());
  snap.skills.agility = { level: 99, xp: xpForLevel(99) };
  const plan = planRoute(snap, [{ id: "a", type: "skill", skill: "agility", level: 80 }]);
  assert.deepEqual(plan.steps, []);
  assert.deepEqual(plan.done, ["80 Agility"]);
  // Two targets in one skill: trained in order, the second timed from the first.
  const two = planRoute(sampleAccount(), [
    { id: "x", type: "skill", skill: "cooking", level: 95 },
    { id: "y", type: "skill", skill: "cooking", level: 90 },
  ]);
  const cooking = two.steps.filter((s) => s.kind === "skill").map((s) => s.title);
  assert.deepEqual(cooking, ["Train Cooking to 90", "Train Cooking to 95"]);
});

test("hidden until unlocked: each row says which goals unlock it, and the planner can route to them", async () => {
  const { lockedContent, planRoute, goalTitle } = await import("../web/recommender.js");
  const snap = sampleAccount();
  const locked = lockedContent(snap, { content: { minigames: true, wilderness: true, clues: true } });
  assert.ok(locked.length, "the sample account has locked content");
  for (const l of locked) {
    assert.ok(l.goals.length, `${l.content} has goals`);
    for (const g of l.goals) assert.match(g.type, /^(quest|skill)$/, `${l.content}: ${g.type}`);
    // A locked quest is its own goal; everything else gets one goal per need.
    if (!l.goals.some((g) => g.quest === l.content)) assert.deepEqual(l.goals.map(goalTitle), l.needs, l.content);
    const plan = planRoute(snap, l.goals.map((g, i) => ({ id: `t${i}`, ...g })));
    assert.ok(plan.steps.length, `${l.content}: the route has steps`);
    assert.deepEqual(plan.done, [], `${l.content}: none of its goals are done yet`);
  }
});

// ---- Clog hunting ------------------------------------------------------------------------------

test("stale baguette: a random-event rarity is a Long haul, not Balanced", () => {
  const snap = clone(sampleAccount());
  const page = snap.collectionLog.pages["Random Events"];
  for (const i of page.items) if (i.name === "Stale baguette") i.quantity = 0;
  const c = candidates(snap, [], {}).find((x) => x.title === "Get Stale baguette");
  assert.ok(c, "the baguette is suggested");
  assert.equal(c.effort, "Long");
  assert.match(c.why[0], /random events/i);
  assert.ok(c.hours >= 100, `about ${c.hours} hours`);
});

test("fastest logs first: log and pet cards come quickest first, other categories keep their places", async () => {
  const { pickThree, pickMix, fastestFirst, HUNT_CATEGORIES } = await import("../web/recommender.js");
  for (const id of SAMPLE_IDS) {
    const all = candidates(sampleAccount(id), [], {});
    for (const c of all.filter((x) => HUNT_CATEGORIES.has(x.category))) {
      assert.ok(c.hours > 0 && Number.isFinite(c.hours), `${id}: ${c.title} has a time estimate`);
    }
    // Only collection log cards: the picks are the quickest ones, in order, even after Shuffle.
    const clog = all.filter((c) => c.category === "clog" && c.effort === "Medium");
    for (const seed of [0, 7]) {
      const picks = pickThree(clog, { seed, fastest: true });
      const hours = picks.map((c) => c.hours);
      assert.deepEqual(hours, [...hours].sort((a, b) => a - b), `${id}: in time order`);
      // Quickest per page: no unpicked card on a page not already shown is quicker than the last pick.
      const shown = new Set(picks.map((c) => c.group));
      const quicker = clog.filter((c) => !picks.includes(c) && !shown.has(c.group) && c.hours < Math.min(...hours));
      assert.deepEqual(quicker.map((c) => c.title), [], `${id}: nothing quicker was skipped`);
    }
    // Mixed: each tier's log cards in time order, and the tiers stay Quick -> Balanced -> Long.
    const mix = pickMix(all.filter((c) => HUNT_CATEGORIES.has(c.category)), { fastest: true });
    for (const t of ["Quick", "Medium", "Long"]) {
      const h = mix.filter((c) => c.effort === t).map((c) => c.hours);
      assert.deepEqual(h, [...h].sort((a, b) => a - b), `${id}: ${t} in time order`);
    }
    assert.deepEqual(mix.map((c) => c.effort), [...mix.map((c) => c.effort)].sort((a, b) => ["Quick", "Medium", "Long"].indexOf(a) - ["Quick", "Medium", "Long"].indexOf(b)));
  }
  // Other categories stay where they were; only the log and pet slots are reordered.
  const list = [
    { id: "a", category: "levels", score: 9 },
    { id: "b", category: "clog", score: 8, hours: 40 },
    { id: "c", category: "quests", score: 7 },
    { id: "d", category: "pets", score: 6, hours: 5 },
  ];
  assert.deepEqual(fastestFirst(list).map((c) => c.id), ["a", "d", "c", "b"]);
  // Off by default: picks are unchanged.
  const all = candidates(sampleAccount(), [], {});
  assert.deepEqual(pickThree(all, { seed: 3 }).map((c) => c.id), pickThree(all, { seed: 3, fastest: false }).map((c) => c.id));
});

// ---- Showcase ----------------------------------------------------------------------------

test("showcase: strictly opt-in, so nothing is shown until the player picks it", () => {
  const snap = sampleAccount("main");
  for (const saved of [undefined, null, {}, { item: "", boss: "" }]) {
    assert.deepEqual(showcasePicks(snap, saved), { item: null, boss: null, quest: null, skill: null });
  }
});

test("showcase: picks resolve against the profile, ignoring capitalisation", () => {
  const snap = sampleAccount("main");
  const p = showcasePicks(snap, { item: "abyssal WHIP", boss: "vorkath", quest: snap.quests[0].name, skill: "slayer" });
  assert.equal(p.item.name, "Abyssal whip");
  assert.equal(p.boss.name, "Vorkath");
  assert.equal(p.boss.kc, 640);
  assert.equal(p.quest.name, snap.quests[0].name);
  assert.equal(p.skill.name, "Slayer");
  assert.equal(p.skill.level, snap.skills.slayer.level);
  // Not owned, or not in this profile: not shown (and never swapped for something else).
  const gone = showcasePicks(snap, { item: "Twisted bow", boss: "Not a boss", quest: "Not a quest", skill: "sorcery" });
  assert.deepEqual(gone, { item: null, boss: null, quest: null, skill: null });
});

test("showcase: suggestions are the rarest pet, the most-killed boss and the top skill", () => {
  const main = sampleAccount("main");
  assert.equal(showcaseSuggestion(main, "item").name, "Vorki", "rarest of Vorki 1/3,000, Callisto cub 1/1,500 and TzRek-Jad 1/200");
  assert.equal(showcaseSuggestion(main, "boss").name, "Vorkath", "640 KC, the most");
  const top = Object.entries(main.skills).filter(([k]) => k !== "overall").sort((a, b) => b[1].xp - a[1].xp)[0][0];
  assert.equal(showcaseSuggestion(main, "skill").key, top);
  assert.equal(showcaseSuggestion(main, "quest"), null);
  // No pets: the rarest item, and never a clue reward (their rates are per roll, not per clue).
  const iron = sampleAccount("iron");
  const item = showcaseSuggestion(iron, "item");
  assert.ok(!item.pet && item.p != null && !/Treasure Trails/.test(item.page), `${item.name} from ${item.page}`);
  assert.ok(showcaseOptions(iron).filter((o) => o.p != null).every((o) => o.p >= item.p));
  assert.ok(showcaseOptions(iron).filter((o) => /Treasure Trails/.test(o.page)).every((o) => o.p == null));
});

test("showcase: choices are owned items once each, bosses most-killed first, every quest and skill", () => {
  const snap = fullAccount();
  const items = showcaseChoices(snap, "item");
  assert.equal(new Set(items.map((o) => o.key.toLowerCase())).size, items.length);
  // By name: an item on several pages counts as owned when any of them has it.
  const owned = new Set(Object.values(snap.collectionLog.pages).flatMap((p) => p.items.filter((i) => i.quantity > 0).map((i) => i.name.toLowerCase())));
  assert.ok(items.every((o) => owned.has(o.key.toLowerCase())));
  const bosses = showcaseChoices(snap, "boss");
  assert.ok(bosses.length > 20);
  const kcs = bosses.map((b) => b.kc ?? -1);
  assert.deepEqual(kcs, [...kcs].sort((a, b) => b - a));
  assert.equal(showcaseChoices(snap, "quest").length, snap.quests.length);
  assert.ok(showcaseChoices(snap, "skill").length >= 23);
  assert.deepEqual(SHOWCASE_KINDS, ["item", "boss", "quest", "skill"]);
});

test("showcase: an empty profile has nothing to pick and nothing to suggest", () => {
  for (const kind of SHOWCASE_KINDS) {
    assert.deepEqual(showcaseChoices({}, kind), []);
    assert.equal(showcaseSuggestion({}, kind), null);
  }
});
