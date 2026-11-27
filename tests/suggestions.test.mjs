// Suggestion snapshots: what the recommender suggests for two fixed test accounts, written out
// as readable text and compared with the saved copy in suggestions.test.mjs.snapshot.
//
//   npm test                 fails if any suggestion, tier, score or wording changed
//   npm run test:update      accept the changes: rewrites the saved copy
//
// After changing knowledge-base.js or recommender.js on purpose, run `npm run test:update` and
// read the snapshot's diff in Git: it shows exactly which suggestions moved, appeared or went.

import { test, snapshot } from "node:test";
import {
  candidates, lockedContent, pickThree, pickMix, pickChallenge, slayerTask, withinReach, CHALLENGE,
} from "../web/recommender.js";
import { loadDropRates, sampleAccount, fullAccount, SAMPLE_GOALS, FULL_GOALS } from "./test-account.mjs";

// Plain text snapshots: one line per suggestion, so Git diffs read like a changelog.
snapshot.setDefaultSnapshotSerializers([(v) => (typeof v === "string" ? v : JSON.stringify(v, null, 2))]);

loadDropRates();
const NOW = Date.parse("2026-11-26T12:00:00Z");
const TIERS = ["Quick", "Medium", "Long", CHALLENGE];
const ALL_CONTENT = { minigames: true, wilderness: true, clues: true };

const line = (c) => `${c.effort.padEnd(9)} ${c.category.padEnd(7)} ${String(Math.round(c.score)).padStart(4)}  ${c.title}${c.detail ? `  | ${c.detail}` : ""}${c.wilderness ? "  [Wilderness]" : ""}`;

function report(snap, goals, content) {
  const list = candidates(snap, goals, { content });
  const out = [];
  const counts = TIERS.map((t) => `${t} ${list.filter((c) => c.effort === t).length}`).join(", ");
  out.push(`${list.length} suggestions (${counts})`);
  for (const t of TIERS) {
    const tier = list.filter((c) => c.effort === t);
    out.push("", `== ${t}: top ${Math.min(15, tier.length)} of ${tier.length}`);
    for (const c of tier.slice(0, 15)) out.push(line(c));
  }
  out.push("", "== Picks (no shuffle)");
  for (const t of ["Quick", "Medium", "Long"]) out.push(`${t}: ${pickThree(list.filter((c) => c.effort === t)).map((c) => c.title).join(" / ")}`);
  out.push(`Mixed: ${pickMix(list).map((c) => c.title).join(" / ")}`);
  out.push(`Challenge: ${pickChallenge(list)?.title ?? "none"}`);
  out.push(`Shuffled once (seed 7919): ${pickThree(list.filter((c) => c.effort === "Medium"), { seed: 7919 }).map((c) => c.title).join(" / ")}`);
  const s = slayerTask(snap, goals);
  out.push("", `== Slayer: ${s ? `${s.title ?? s.task?.name ?? "no task"}${s.effort ? ` (${s.effort})` : ""}` : "none"}`);
  out.push("", "== Within reach");
  const req = (r) => (r.kind === "quest" ? r.key : `${r.need} ${r.key ?? r.kind}`);
  for (const r of withinReach(snap, { now: NOW })) out.push(`${r.title ?? r.name}${r.missing?.length ? `  | missing: ${r.missing.map(req).join(", ")}` : ""}`);
  out.push("", "== Hidden until unlocked");
  for (const l of lockedContent(snap, { content })) out.push(`${l.content}: ${l.needs.join(", ")} (${l.hidden})`);
  return out.join("\n") + "\n";
}

test("sample account, default filters", (t) => {
  t.assert.snapshot(report(sampleAccount(), SAMPLE_GOALS, {}));
});

test("full test account, default filters", (t) => {
  t.assert.snapshot(report(fullAccount(), FULL_GOALS, {}));
});

test("full test account, minigames, Wilderness and clues on", (t) => {
  t.assert.snapshot(report(fullAccount(), FULL_GOALS, ALL_CONTENT));
});

test("suggestion ids are unique", () => {
  const list = candidates(fullAccount(), FULL_GOALS, { content: ALL_CONTENT });
  const seen = new Map();
  for (const c of list) {
    if (seen.has(c.id)) throw new Error(`Two suggestions share the id "${c.id}": "${seen.get(c.id)}" and "${c.title}"`);
    seen.set(c.id, c.title);
  }
});

test("a suggestion that is one of your goals only shows as the goal card", () => {
  const snap = fullAccount();
  const all = candidates(snap, [], { content: ALL_CONTENT });
  const first = (pred) => {
    const c = all.find(pred);
    if (!c) throw new Error("test account has no suggestion of this kind");
    return c;
  };
  const ca = first((c) => c.id.startsWith("ca:"));
  const quest = first((c) => c.id.startsWith("quest:") && c.meta?.quest);
  const page = first((c) => c.id.startsWith("clogpage:"));
  const diary = first((c) => c.id.startsWith("diary:"));
  const lvl = first((c) => c.id.startsWith("lvl:"));
  const goals = [
    { id: "a", type: "catask", task: ca.meta.task, name: ca.meta.taskName, monster: ca.meta.monster, tier: ca.meta.tier },
    { id: "b", type: "quest", quest: quest.meta.quest },
    { id: "c", type: "clog", page: page.meta.page },
    { id: "d", type: "diary", region: diary.meta.region, tier: diary.meta.tier },
    { id: "e", type: "skill", skill: lvl.meta.skill, level: lvl.meta.target },
  ];
  const ids = [ca, quest, page, diary, lvl].map((c) => c.id);
  const withGoals = candidates(snap, goals, { content: ALL_CONTENT });
  for (const id of ids) if (withGoals.some((c) => c.id === id)) throw new Error(`"${id}" still shows next to its goal card`);
  for (const g of goals) if (!withGoals.some((c) => c.id === `goal:${g.id}`)) throw new Error(`no goal card for goal ${g.id}`);
  // A step towards a goal stays: a lower level target for the same skill.
  const lower = all.find((c) => c.meta?.skill === lvl.meta.skill && c.id.startsWith("lvl:") && c.meta.target < lvl.meta.target);
  if (lower && !withGoals.some((c) => c.id === lower.id)) throw new Error("a step towards the goal was removed");
  // With goal cards filtered out, the suggestions come back rather than vanishing.
  const noGoalCards = candidates(snap, goals, { content: ALL_CONTENT, categories: new Set(["levels", "quests", "diaries", "combat", "clog", "pets"]) });
  for (const id of ids) if (!noGoalCards.some((c) => c.id === id)) throw new Error(`"${id}" vanished with goal cards filtered out`);
});

test("every suggestion has a known tier, a title and a reason", () => {
  for (const c of candidates(fullAccount(), FULL_GOALS, { content: ALL_CONTENT })) {
    if (!TIERS.includes(c.effort)) throw new Error(`"${c.title}" has tier "${c.effort}"`);
    if (!c.title) throw new Error(`Suggestion ${c.id} has no title`);
    if (!Array.isArray(c.why)) throw new Error(`"${c.title}" has no reasons list`);
  }
});
