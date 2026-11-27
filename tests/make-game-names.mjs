// Writes tests/fixtures/game-names.json: the game's own names (collection log pages and items,
// quests, diary regions, combat achievement tasks), taken from a synced profile.
//
// Only game data is kept: no levels, no obtained items, no kill counts, no player name. The
// checker (check-knowledge-base.mjs) uses it to catch misspelt names in knowledge-base.js, and
// the suggestion tests build their test account on it.
//
// Run it again after a game update adds pages, items, quests or tasks:
//   node tests/make-game-names.mjs                  # newest profile on this PC (see below)
//   node tests/make-game-names.mjs path/to/profile.json
//
// Without a path it uses the newest of: the profiles the plugin saves on this PC
// (%USERPROFILE%\.runelite\osrs-taskmaster\*.json, written by Copy my profile and on login) and
// profiles synced to the local server (server/data/profiles).

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "tests", "fixtures", "game-names.json");

/** The newest profile file on this PC, or null. */
export function newestProfile() {
  const dirs = [join(homedir(), ".runelite", "osrs-taskmaster"), join(root, "server", "data", "profiles")];
  const files = dirs.flatMap((d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => join(d, f)) : []));
  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
}

let path = process.argv[2] || newestProfile();
if (!path) {
  console.error("No profile found on this PC. In RuneLite, click Copy my profile once, or pass a path: node tests/make-game-names.mjs path/to/profile.json");
  process.exit(1);
}
console.log(`Reading game names from ${path}`);

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
const layout = (d) => JSON.stringify(d, null, 1)
  .replace(/\{\s*"id": (\d+),\s*"name": ("(?:[^"\\]|\\.)*")\s*\}/g, '{ "id": $1, "name": $2 }')
  .replace(/\{\s*("id": \d+,\s*"name"[^{}]*?)\}/g, (m, body) => `{ ${body.replace(/\s*\n\s*/g, " ").trim()} }`) + "\n";

// Same names as last time: keep the file (and its date) as it is, so there's nothing to commit.
const items = Object.values(pages).reduce((n, p) => n + p.items.length, 0);
const summary = `${Object.keys(pages).length} pages, ${items} item slots, ${data.quests.length} quests, ${data.combatAchievements.length} combat achievements`;
if (existsSync(out)) {
  const old = JSON.parse(readFileSync(out, "utf8"));
  if (layout({ ...data, generated: old.generated }) === layout(old)) {
    console.log(`No new game names (${summary}); ${out} is unchanged.`);
    process.exit(0);
  }
}
writeFileSync(out, layout(data));
console.log(`Wrote ${out}: ${summary}.`);
