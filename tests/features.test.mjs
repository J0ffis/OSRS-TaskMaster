// "Since last time", account-type rules and kill-count time estimates.

import { test } from "node:test";
import assert from "node:assert/strict";
import { candidates, compactProfile, sinceLast, accountKind } from "../web/recommender.js";
import { loadDropRates, sampleAccount, fullAccount } from "./test-account.mjs";

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
