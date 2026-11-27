// The engine with profiles that are incomplete or odd: an older plugin, a trimmed paste, a fresh
// account. Every part the page calls must still work (no exceptions, no broken text), and the
// small helpers the cards rely on give the numbers the game does.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidates, lockedContent, pickThree, pickMix, pickChallenge, slayerTask, goalProgress, goalTitle,
  completions, withinReach, compactProfile, sinceLast, profileIssues, missingSections, planRoute,
  analyse, petInfo, itemIndex, xpForLevel, fmt, hoursRangeText, caKillProgress, questRequirements,
  setQuestReqs,
} from "../web/recommender.js";
import { loadDropRates, sampleAccount, sampleGoals, fullAccount, FULL_GOALS } from "./test-account.mjs";
import { readFileSync } from "node:fs";

loadDropRates();
const clone = (x) => JSON.parse(JSON.stringify(x));
const BROKEN = /\bundefined\b|\bNaN\b|\[object Object\]/;
const ALL = { content: { minigames: true, wilderness: true, clues: true } };

/** Everything app.js asks the engine for when it shows a profile. */
function renderAll(snap, goals) {
  const list = candidates(snap, goals, ALL);
  const out = {
    list,
    three: pickThree(list, { seed: 7 }),
    mix: pickMix(list, { seed: 7 }),
    challenge: pickChallenge(list),
    locked: lockedContent(snap, ALL),
    slayer: slayerTask(snap, goals),
    done: completions(snap),
    reach: withinReach(snap, { prev: compactProfile(snap), marks: {} }),
    since: sinceLast(snap, compactProfile(snap), goals),
    issues: profileIssues(snap),
    missing: missingSections(snap),
    plan: planRoute(snap, goals),
    goals: goals.map((g) => ({ title: goalTitle(g), ...goalProgress(g, snap) })),
  };
  analyse(snap); petInfo(snap); itemIndex(snap);
  return out;
}

/** No text the page would show says "undefined" or "NaN". */
function assertClean(what, out) {
  const texts = [
    ...out.list.flatMap((c) => [c.title, c.detail, c.counter, ...c.why]),
    ...out.reach.flatMap((e) => [e.title, ...e.reqs.map((r) => r.label)]),
    ...out.plan.steps.map((s) => s.title),
    ...out.goals.map((g) => `${g.title} ${g.label}`),
    out.slayer?.title, out.slayer?.detail,
  ].filter((t) => t != null);
  for (const t of texts) assert.doesNotMatch(String(t), BROKEN, `${what}: "${t}"`);
  for (const g of out.goals) assert.ok(g.progress >= 0 && g.progress <= 1, `${what}: goal ${g.title} progress ${g.progress}`);
}

const SAMPLE = sampleAccount("main");
const GOALS = [...sampleGoals("main"), ...FULL_GOALS,
  { id: "x1", type: "item", item: "Something not in the log" },
  { id: "x2", type: "custom", text: "Get a Fire cape", done: false },
  { id: "x3", type: "xp", skill: "attack", xp: 50e6 },
  { id: "x4", type: "diary", region: "Varrock", tier: "elite" },
  { id: "x5", type: "ca", tier: "Master" },
];

for (const section of Object.keys(SAMPLE).filter((k) => k !== "player")) {
  test(`a profile without "${section}" still shows everything`, () => {
    const snap = clone(SAMPLE);
    delete snap[section];
    assertClean(`no ${section}`, renderAll(snap, GOALS));
  });
}

test("a brand-new account (name only, nothing synced) still shows everything", () => {
  const out = renderAll({ player: { name: "New Player" } }, GOALS);
  assertClean("empty", out);
  assert.deepEqual(out.issues, []);
});

test("a fresh account at level 1 everywhere gets suggestions", () => {
  const snap = clone(SAMPLE);
  for (const s of Object.values(snap.skills)) { s.level = 1; s.xp = 0; }
  snap.skills.hitpoints = { level: 10, xp: xpForLevel(10) };
  delete snap.skills.overall;
  const out = renderAll(snap, []);
  assertClean("level 1", out);
  assert.equal(out.three.length, 3);
});

test("picking is repeatable: the same seed gives the same cards, and the three differ in category", () => {
  const list = candidates(fullAccount(), FULL_GOALS, ALL);
  const ids = (l) => l.map((c) => c.id);
  assert.deepEqual(ids(pickThree(list, { seed: 42 })), ids(pickThree(list, { seed: 42 })));
  assert.deepEqual(ids(pickMix(list, { seed: 42 })), ids(pickMix(list, { seed: 42 })));
  const three = pickThree(list.filter((c) => c.effort === "Medium"));
  assert.equal(new Set(three.map((c) => c.category)).size, 3);
  // Mixed: seven cards, Quick first and Long last.
  const mix = pickMix(list);
  assert.equal(mix.length, 7);
  const order = { Quick: 0, Medium: 1, Long: 2 };
  assert.deepEqual(mix.map((c) => order[c.effort]), [...mix.map((c) => order[c.effort])].sort());
  // Everything excluded: still a full set of cards rather than a blank page.
  assert.equal(pickThree(list, { exclude: new Set(list.map((c) => c.id)) }).length, 3);
});

test("XP table and number formats match the game", () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(2), 83);
  assert.equal(xpForLevel(50), 101333);
  assert.equal(xpForLevel(92), 6517253);
  assert.equal(xpForLevel(99), 13034431);
  assert.equal(xpForLevel(150), 13034431, "clamped at 99");
  assert.equal(fmt(950), "950");
  assert.equal(fmt(12345), "12K");
  assert.equal(fmt(13034431), "13M");
  assert.equal(fmt(1.5e6), "1.5M");
  assert.equal(fmt(200e6), "200M");
  assert.equal(fmt(-1), "?");
  assert.equal(hoursRangeText({ low: 0.2, high: 0.8 }), "under an hour");
  assert.equal(hoursRangeText({ low: 3, high: 3.2 }), "about 3 hours");
  assert.equal(hoursRangeText({ low: 12, high: 18 }), "about 10–20 hours");
});

test("kill-count combat achievements: how many kills, and which tasks don't count", () => {
  const snap = { killCounts: { Vorkath: 31 } };
  const t = (description, monster = "Vorkath") => caKillProgress({ description, monster }, snap);
  assert.deepEqual(t("Kill Vorkath 50 times."), { need: 50, have: 31 });
  assert.deepEqual(t("Defeat Vorkath 1,000 times."), { need: 1000, have: 31 });
  assert.deepEqual(t("Kill Zulrah 25 times.", "Zulrah"), { need: 25, have: null }, "no kill count synced");
  assert.equal(t("Kill Vorkath 5 times in a row without leaving."), null);
  assert.equal(t("Kill Vorkath in under 1:15."), null);
  assert.equal(t("Kill Vorkath."), null);
  assert.equal(t("Kill Vorkath 1 times."), null, "a single kill isn't a counter");
});

test("quest requirements: the wiki snapshot first, the hand tables when it isn't loaded", () => {
  const wiki = questRequirements("Dragon Slayer II");
  assert.equal(wiki.known, true);
  assert.ok(wiki.quests.length > 0 && wiki.questPoints >= 200);
  assert.ok(Object.keys(wiki.skills).length > 0);
  assert.equal(questRequirements("A quest that doesn't exist").known, false);
  try {
    setQuestReqs(null); // the page couldn't load the file
    const hand = questRequirements("Dragon Slayer II");
    assert.equal(hand.known, true, "the hand tables know Dragon Slayer II");
    assert.deepEqual(hand.other, []);
    // The planner still works, just from the hand tables (the main sample has started DT2).
    const dt2 = "Desert Treasure II - The Fallen Empire";
    const plan = planRoute(sampleAccount("main"), [{ id: "q", type: "quest", quest: dt2 }]);
    assert.equal(plan.steps.at(-1).title, `Finish ${dt2}`);
    assert.deepEqual(plan.unknown, []);
  } finally {
    setQuestReqs(JSON.parse(readFileSync(new URL("../web/data/quest-reqs.json", import.meta.url), "utf8")));
  }
});
