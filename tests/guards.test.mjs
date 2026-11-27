// Guards that the site serves sensible data: no broken text on any suggestion, and profiles with
// impossible values are flagged instead of quietly trusted.

import { test } from "node:test";
import assert from "node:assert/strict";
import { candidates, profileIssues, xpForLevel, STYLE_EFFORT } from "../web/recommender.js";
import { CATEGORIES } from "../web/recommender.js";
import { loadDropRates, sampleAccount, fullAccount, SAMPLE_GOALS, FULL_GOALS } from "./test-account.mjs";

loadDropRates();
const clone = (x) => JSON.parse(JSON.stringify(x));
const ALL_CONTENT = { content: { minigames: true, wilderness: true, clues: true } };
const TIERS = [...Object.values(STYLE_EFFORT), "Challenge"];
// Text that only shows up when a value is missing or the wrong type. ("Infinity" isn't here: the
// Infinity robes are real. Numbers are checked with Number.isFinite instead.)
const BROKEN = /\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/;

for (const [name, snap, goals] of [["sample", sampleAccount(), SAMPLE_GOALS], ["full", fullAccount(), FULL_GOALS]]) {
  test(`every ${name} account suggestion reads cleanly and has sane numbers`, () => {
    const list = candidates(snap, goals, ALL_CONTENT);
    assert.ok(list.length > 20);
    for (const c of list) {
      for (const [field, text] of [["title", c.title], ["detail", c.detail], ["counter", c.counter], ...c.why.map((w) => ["why", w])]) {
        if (text == null) continue;
        assert.equal(typeof text, "string", `${c.id} ${field}`);
        assert.doesNotMatch(text, BROKEN, `${c.id} ${field}: "${text}"`);
      }
      assert.ok(c.title.trim(), `${c.id} has a title`);
      assert.ok(TIERS.includes(c.effort), `${c.id} tier ${c.effort}`);
      assert.ok(c.category in CATEGORIES || c.category === "goals", `${c.id} category ${c.category}`);
      if (c.progress != null) assert.ok(c.progress >= 0 && c.progress <= 1, `${c.id} progress ${c.progress}`);
      assert.ok(Number.isFinite(c.score ?? 0), `${c.id} score`);
    }
  });
}

test("profile issues: none for real-shaped profiles", () => {
  assert.deepEqual(profileIssues(fullAccount()), []);
  assert.deepEqual(profileIssues(sampleAccount()), [], "a short CA task list isn't flagged");
  assert.deepEqual(profileIssues(null), []);
});

test("profile issues: impossible values are named", () => {
  const snap = clone(fullAccount());
  snap.skills.attack = { level: 120, xp: 1 };
  snap.skills.mining = { level: 50, xp: xpForLevel(70) };
  snap.killCounts = { ...snap.killCounts, Zulrah: -3 };
  snap.questPoints = -1;
  snap.combatAchievements.points += 10;
  snap.syncedAt = Date.now() + 7 * 864e5;
  const keys = profileIssues(snap).map((i) => i.key);
  assert.deepEqual(keys, ["skills", "combatAchievements", "killCounts", "questPoints", "syncedAt"]);
  const skills = profileIssues(snap)[0].text;
  assert.match(skills, /Attack level 120/);
  assert.match(skills, /Mining \(level 50 with/);
  for (const { text } of profileIssues(snap)) assert.doesNotMatch(text, /[:,][A-Za-z]/, `missing space after punctuation: ${text}`);
  // Short task lists: only "more ticked than possible" can be told.
  const short = clone(sampleAccount());
  for (const t of short.combatAchievements.tasks) t.done = true;
  short.combatAchievements.points = 0;
  assert.deepEqual(profileIssues(short).map((i) => i.key), ["combatAchievements"]);
});

test("stale game data is reported, fresh data isn't", async () => {
  const { staleData, STALE_DAYS } = await import("./check-knowledge-base.mjs");
  const now = Date.parse("2027-06-01T00:00:00Z");
  assert.deepEqual(staleData({ Fresh: "2027-05-20" }, now), []);
  const [old, none] = staleData({ Old: "2027-01-01", Missing: undefined }, now);
  assert.match(old, /^Old is 151 days old\. Run scripts\/Update-GameData\.ps1/);
  assert.match(none, /no date recorded/);
  assert.equal(STALE_DAYS, 90);
});
