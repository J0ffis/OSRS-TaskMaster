// Test accounts for the suggestion tests. Nothing random: the same files always give the same
// account, so any change in the suggestions comes from a change in the code or the knowledge base.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setDropRates, setQuestReqs } from "../web/recommender.js";
import { CA_TIER_POINTS } from "../web/knowledge-base.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (...p) => JSON.parse(readFileSync(join(root, ...p), "utf8"));

/**
 * Loads the real wiki snapshots (drop rates and quest requirements) into the recommender, as the
 * website does at startup.
 */
export function loadDropRates() {
  setDropRates(readJson("web", "data", "drop-rates.json"));
  setQuestReqs(readJson("web", "data", "quest-reqs.json"));
}

/** The website's own sample profile ("Sample Iron"), unchanged. */
export function sampleAccount() {
  return readJson("web", "sample-profile.json");
}
export const SAMPLE_GOALS = [
  { id: "g1", type: "skill", skill: "slayer", level: 85 },
  { id: "g2", type: "quest", quest: "Dragon Slayer II" },
];

// The 24 quests the sample profile listed before it was filled in with every quest.
const SAMPLE_OWN_QUESTS = new Set(["Animal Magnetism", "Lost City", "Fairytale II - Cure a Queen", "Bone Voyage",
  "Priest in Peril", "Regicide", "Horror from the Deep", "Heroes' Quest", "Monkey Madness I", "Desert Treasure I",
  "Legends' Quest", "Family Crest", "Eagles' Peak", "A Kingdom Divided", "Sins of the Father", "Monkey Madness II",
  "Dragon Slayer II", "Song of the Elves", "Secrets of the North", "Desert Treasure II - The Fallen Empire",
  "Lunar Diplomacy", "Recipe for Disaster", "The Fremennik Exiles", "Cook's Assistant"]);

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

  // The quests the sample was first made with keep the sample's state; the rest come from the hash,
  // so this account stays a mix (the sample itself now lists every quest).
  const sampleQuests = Object.fromEntries((base.quests ?? []).filter((q) => SAMPLE_OWN_QUESTS.has(q.name)).map((q) => [q.name, q.state]));
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
