// Test accounts for the suggestion tests. Nothing random: the same files always give the same
// account, so any change in the suggestions comes from a change in the code or the knowledge base.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setDropRates } from "../web/recommender.js";
import { CA_TIER_POINTS } from "../web/knowledge-base.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (...p) => JSON.parse(readFileSync(join(root, ...p), "utf8"));

/** Loads the real drop-rate snapshot into the recommender, as the website does at startup. */
export function loadDropRates() {
  setDropRates(readJson("web", "data", "drop-rates.json"));
}

/** One of the website's sample profiles (web/samples/<id>.json), unchanged. "iron" is "Sample Iron". */
export function sampleAccount(id = "iron") {
  return readJson("web", "samples", `${id}.json`);
}
const sampleIndex = () => readJson("web", "samples", "index.json").accounts;
/** The sample accounts' ids, in the website's order. */
export const SAMPLE_IDS = sampleIndex().map((a) => a.id);
/** The goals a sample account starts with on the website. */
export const sampleGoals = (id = "iron") => sampleIndex().find((a) => a.id === id).goals;

// A small fixed hash: spreads ids evenly over 0..99.
const bucket = (n) => (((n * 2654435761) >>> 0) % 1000) % 100;

/**
 * A mid-game account with every collection log page, quest and combat achievement the game has
 * (from tests/fixtures/game-names.json). Levels, diaries and kill counts come from the sample
 * profile; which items, quests and tasks are done is decided by a fixed hash of their ids.
 */
export function fullAccount() {
  const base = sampleAccount();
  const game = readJson("tests", "fixtures", "game-names.json");

  const pages = {};
  const obtainedById = {};
  const cats = {};
  for (const [name, p] of Object.entries(game.pages)) {
    pages[name] = {
      tab: p.tab,
      items: p.items.map((i) => {
        const quantity = bucket(i.id) < 45 ? 1 + (bucket(i.id + 7) % 5) : 0;
        if (quantity) obtainedById[i.id] = quantity;
        return { id: i.id, name: i.name, quantity };
      }),
    };
    const c = (cats[p.tab] ??= { obtained: 0, total: 0 });
    for (const i of pages[name].items) { c.total++; if (i.quantity) c.obtained++; }
  }
  const total = Object.values(cats).reduce((n, c) => n + c.total, 0);
  const obtained = Object.values(cats).reduce((n, c) => n + c.obtained, 0);

  const sampleQuests = Object.fromEntries((base.quests ?? []).map((q) => [q.name, q.state]));
  const quests = game.quests.map((name, i) => ({
    name,
    state: sampleQuests[name] ?? (bucket(i + 1000) < 55 ? "FINISHED" : bucket(i + 2000) < 30 ? "IN_PROGRESS" : "NOT_STARTED"),
  }));

  const tasks = game.combatAchievements.map((t) => ({ ...t, done: t.tier === "Easy" ? bucket(t.id) < 85 : t.tier === "Medium" ? bucket(t.id) < 60 : bucket(t.id) < 20 }));
  const points = tasks.filter((t) => t.done).reduce((n, t) => n + (CA_TIER_POINTS[t.tier] ?? 0), 0);

  return {
    ...base,
    sample: undefined,
    player: { ...base.player, name: "Test Account" },
    quests,
    questPoints: base.questPoints,
    combatAchievements: { ...base.combatAchievements, points, tasks },
    collectionLog: { obtained, total, categories: cats, pages, items: obtainedById },
  };
}
export const FULL_GOALS = [
  { id: "g1", type: "skill", skill: "slayer", level: 85 },
  { id: "g2", type: "quest", quest: "Dragon Slayer II" },
  { id: "g3", type: "clog", page: "Zulrah" },
];
