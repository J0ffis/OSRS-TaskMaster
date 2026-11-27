// Writes tests/fixtures/game-names.json: the game's own names (collection log pages and items,
// quests, diary regions, combat achievement tasks), taken from a synced profile.
//
// Only game data is kept: no levels, no obtained items, no kill counts, no player name. The
// checker (check-knowledge-base.mjs) uses it to catch misspelt names in knowledge-base.js, and
// the suggestion tests build their test account on it.
//
// Run it again after a game update adds pages, items, quests or tasks:
//   node tests/make-game-names.mjs                  # newest profile in server/data/profiles
//   node tests/make-game-names.mjs path/to/profile.json

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "tests", "fixtures", "game-names.json");

let path = process.argv[2];
if (!path) {
  const dir = join(root, "server", "data", "profiles");
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  files.sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs);
  if (!files.length) {
    console.error("No synced profile found. Pass one: node tests/make-game-names.mjs path/to/profile.json");
    process.exit(1);
  }
  path = join(dir, files[0]);
}

const snap = JSON.parse(readFileSync(path, "utf8"));
const pages = {};
for (const [name, p] of Object.entries(snap.collectionLog?.pages ?? {})) {
  pages[name] = { tab: p.tab, items: (p.items ?? []).map((i) => ({ id: i.id, name: i.name })) };
}
if (Object.keys(pages).length < 50) {
  console.error(`That profile only has ${Object.keys(pages).length} collection log pages; use one synced with the current plugin.`);
  process.exit(1);
}

const data = {
  about: "Game names only (no player progress), from a synced profile by tests/make-game-names.mjs.",
  generated: new Date().toISOString().slice(0, 10),
  quests: (snap.quests ?? []).map((q) => q.name).sort(),
  diaries: Object.keys(snap.diaries ?? {}).sort(),
  combatAchievements: (snap.combatAchievements?.tasks ?? []).map(({ id, name, description, tier, type, monster }) =>
    ({ id, name, description, tier, type, monster })),
  pages,
};

// One entry per line keeps diffs readable when the game adds things.
const lines = JSON.stringify(data, null, 1)
  .replace(/\{\s*"id": (\d+),\s*"name": ("(?:[^"\\]|\\.)*")\s*\}/g, '{ "id": $1, "name": $2 }')
  .replace(/\{\s*("id": \d+,\s*"name"[^{}]*?)\}/g, (m, body) => `{ ${body.replace(/\s*\n\s*/g, " ").trim()} }`);
writeFileSync(out, lines + "\n");
const items = Object.values(pages).reduce((n, p) => n + p.items.length, 0);
console.log(`Wrote ${out}: ${Object.keys(pages).length} pages, ${items} item slots, ${data.quests.length} quests, ${data.combatAchievements.length} combat achievements.`);
