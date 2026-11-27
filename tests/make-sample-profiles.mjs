// Builds the website's sample profiles, one per account type, into web/samples/<id>.json.
// Run with `npm run samples` after changing an account below or refreshing
// tests/fixtures/game-names.json (`npm run game-names`).
//
// The accounts are made up, but every name in them (quests, diaries, collection log pages and
// items, combat achievements) comes from the game names fixture, so they look like a real
// synced profile. Nothing is random: which of the "rest" is done is decided by a fixed hash, so
// running this again without changes gives the same files.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SKILLS, QUESTS, QUEST_PREREQS, CA_TIER_POINTS, WILDERNESS_PAGES, WILDERNESS_MONSTERS } from "../web/knowledge-base.js";
import { xpForLevel } from "../web/recommender.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const game = JSON.parse(readFileSync(join(root, "tests", "fixtures", "game-names.json"), "utf8"));
const outDir = join(root, "web", "samples");

// Combat achievement point thresholds per tier, as the plugin reports them.
const CA_THRESHOLDS = { Easy: 41, Medium: 161, Hard: 416, Elite: 1064, Master: 1904, Grandmaster: 2630 };

// Late-game quests that never count as "the rest": an account only has them done when it says so.
const LATE_QUESTS = [
  ...Object.keys(QUESTS), ...Object.keys(QUEST_PREREQS),
  "While Guthix Sleeps", "The Fremennik Exiles", "Beneath Cursed Sands", "Mourning's End Part II",
  "Dream Mentor", "Making Friends with My Arm", "The Path of Glouphrie", "King's Ransom",
  "Grim Tales", "Perilous Moons", "Twilight's Promise", "At First Light", "Children of the Sun",
  "The Final Dawn", "The Curse of Arrav", "Defender of Varrock", "Meat and Greet", "Death on the Isle",
  "Ethically Acquired Antiquities", "Shadows of Custodia", "Scrambled!", "Pandemonium",
  "Prying Times", "Current Affairs", "Troubled Tortugans", "The Red Reef", "Sleeping Giants",
];

// Skill levels in SKILLS order: attack hitpoints mining strength agility smithing defence herblore
// fishing ranged thieving cooking prayer crafting firemaking magic fletching woodcutting runecraft
// slayer farming construction hunter sailing.
const levels = (...l) => Object.fromEntries(SKILLS.map((s, i) => [s, l[i]]));
// Diary tiers done per region, in game-names order: Ardougne Desert Falador Fremennik Kandarin
// Karamja Kourend Lumbridge Morytania Varrock Western Wilderness (0 = none .. 4 = elite).
const diaries = (...t) => Object.fromEntries(game.diaries.map((d, i) => [d, t[i]]));

/**
 * The accounts. `rest` is the share of quests not named here that are finished; `ca` the share
 * of tasks done per tier; `tabs` / `pages` the share of collection log items obtained per tab or
 * page; `pets` by name. Hardcore accounts never have Wilderness progress.
 */
const ACCOUNTS = [
  {
    id: "main", name: "Sample Main", accountType: "Normal", world: 330,
    skills: levels(90, 92, 80, 94, 80, 80, 85, 85, 82, 94, 82, 92, 77, 85, 90, 94, 85, 85, 77, 93, 90, 84, 80, 55),
    questPoints: 284,
    finished: ["Dragon Slayer II", "Song of the Elves", "Monkey Madness II", "Recipe for Disaster", "Lunar Diplomacy",
      "Desert Treasure I", "Legends' Quest", "A Kingdom Divided", "Sins of the Father", "Secrets of the North",
      "The Fremennik Exiles", "Bone Voyage", "Fairytale II - Cure a Queen", "Animal Magnetism", "Lost City",
      "Heroes' Quest", "Regicide", "Horror from the Deep", "Monkey Madness I", "Priest in Peril"],
    inProgress: ["Desert Treasure II - The Fallen Empire"],
    rest: 0.8,
    diaries: diaries(3, 3, 3, 3, 4, 4, 3, 3, 4, 4, 3, 3),
    ca: { Easy: 1, Medium: 0.95, Hard: 0.8, Elite: 0.45, Master: 0.1, Grandmaster: 0 },
    tabs: { Bosses: 0.45, Raids: 0.3, Clues: 0.25, Minigames: 0.2, Other: 0.15 },
    pages: { "Vorkath": 0.7, "Zulrah": 0.6, "Chambers of Xeric": 0.35, "Theatre of Blood": 0.2, "Tombs of Amascut": 0.4,
      "Callisto and Artio": 0.5, "Revenants": 0.3, "The Fight Caves": 1, "The Inferno": 0, "Corporeal Beast": 0.2, "Nex": 0.1 },
    pets: ["Vorki", "TzRek-Jad", "Callisto cub"],
    killCounts: { "Vorkath": 640, "Zulrah": 410, "Chambers of Xeric": 58, "Theatre of Blood": 14, "Tombs of Amascut": 85,
      "Callisto": 120, "Barrows": 260, "TzTok-Jad": 3 },
    slayer: { points: 1450, streak: 612, masterId: 8, task: { name: "Abyssal demons", boss: false, remaining: 140, initial: 220, location: "the Catacombs of Kourend", wilderness: false } },
    goals: [{ id: "g1", type: "skill", skill: "slayer", level: 99 }, { id: "g2", type: "clog", page: "Chambers of Xeric" }],
  },
  {
    id: "iron", name: "Sample Iron", accountType: "Ironman", world: 302,
    skills: levels(80, 82, 72, 82, 70, 68, 75, 66, 70, 85, 64, 75, 70, 61, 75, 80, 70, 71, 55, 78, 74, 62, 63, 34),
    questPoints: 182,
    finished: ["Animal Magnetism", "Lost City", "Fairytale II - Cure a Queen", "Bone Voyage", "Priest in Peril", "Regicide",
      "Horror from the Deep", "Heroes' Quest", "Monkey Madness I", "Desert Treasure I", "Legends' Quest", "Lunar Diplomacy"],
    inProgress: ["A Kingdom Divided", "Recipe for Disaster"],
    rest: 0.55,
    diaries: diaries(2, 1, 2, 1, 3, 3, 2, 2, 3, 2, 1, 0),
    ca: { Easy: 0.9, Medium: 0.55, Hard: 0.2, Elite: 0.02, Master: 0, Grandmaster: 0 },
    tabs: { Bosses: 0.15, Raids: 0.05, Clues: 0.2, Minigames: 0.3, Other: 0.2 },
    pages: { "Barrows Chests": 0.85, "Zulrah": 0.5, "Wintertodt": 0.8, "Tempoross": 0.6, "Giant Mole": 0.6 },
    pets: [],
    killCounts: { "Zulrah": 87, "Barrows": 214, "Giant Mole": 31, "Wintertodt": 410 },
    slayer: { points: 412, streak: 137, masterId: 5, task: { name: "Hellhounds", boss: false, remaining: 118, initial: 184, location: "the Catacombs of Kourend", wilderness: false } },
    goals: [{ id: "g1", type: "skill", skill: "slayer", level: 85 }, { id: "g2", type: "quest", quest: "Dragon Slayer II" }],
  },
  {
    id: "hcim", name: "Sample HCIM", accountType: "Hardcore Ironman", world: 302,
    skills: levels(70, 72, 60, 72, 55, 50, 65, 48, 65, 75, 55, 70, 52, 55, 70, 70, 65, 66, 40, 60, 55, 50, 52, 20),
    questPoints: 118,
    finished: ["Priest in Peril", "Lost City", "Animal Magnetism", "Horror from the Deep", "Monkey Madness I", "Bone Voyage"],
    inProgress: ["Fairytale II - Cure a Queen", "Recipe for Disaster"],
    rest: 0.4,
    diaries: diaries(2, 1, 2, 1, 2, 2, 1, 2, 1, 2, 1, 0),
    ca: { Easy: 0.7, Medium: 0.25, Hard: 0.03, Elite: 0, Master: 0, Grandmaster: 0 },
    tabs: { Bosses: 0.05, Raids: 0, Clues: 0.15, Minigames: 0.2, Other: 0.15 },
    pages: { "Wintertodt": 0.7, "Tempoross": 0.5, "Barrows Chests": 0.4, "Giant Mole": 0.3, "Obor": 1, "Bryophyta": 0.8 },
    pets: [],
    killCounts: { "Barrows": 40, "Giant Mole": 12, "Obor": 30, "Bryophyta": 25, "Wintertodt": 160, "Tempoross": 90 },
    slayer: { points: 120, streak: 46, masterId: 4, task: { name: "Fire giants", boss: false, remaining: 64, initial: 120, location: "the Stronghold Slayer Cave", wilderness: false } },
    goals: [{ id: "g1", type: "quest", quest: "Recipe for Disaster" }, { id: "g2", type: "skill", skill: "prayer", level: 70 }],
  },
  {
    id: "uim", name: "Sample UIM", accountType: "Ultimate Ironman", world: 302,
    skills: levels(75, 78, 72, 78, 72, 55, 70, 60, 76, 80, 80, 76, 55, 62, 80, 77, 70, 72, 70, 68, 58, 55, 70, 30),
    questPoints: 150,
    finished: ["Priest in Peril", "Lost City", "Animal Magnetism", "Bone Voyage", "Fairytale II - Cure a Queen",
      "Lunar Diplomacy", "Monkey Madness I", "Regicide", "Desert Treasure I"],
    inProgress: ["Recipe for Disaster"],
    rest: 0.5,
    diaries: diaries(2, 2, 2, 2, 3, 2, 2, 2, 2, 2, 1, 1),
    ca: { Easy: 0.8, Medium: 0.4, Hard: 0.1, Elite: 0, Master: 0, Grandmaster: 0 },
    tabs: { Bosses: 0.08, Raids: 0, Clues: 0.15, Minigames: 0.35, Other: 0.25 },
    pages: { "Hallowed Sepulchre": 0.4, "Guardians of the Rift": 0.6, "Wintertodt": 0.9, "Tempoross": 0.7, "Volcanic Mine": 0.5,
      "Barbarian Assault": 0.2, "Rooftop Agility": 0.5, "Barrows Chests": 0.3 },
    pets: ["Rift guardian"],
    killCounts: { "Barrows": 60, "Wintertodt": 600, "Tempoross": 220, "Guardians of the Rift": 310 },
    slayer: { points: 300, streak: 98, masterId: 5, task: { name: "Kurask", boss: false, remaining: 90, initial: 160, location: "the Fremennik Slayer Dungeon", wilderness: false } },
    goals: [{ id: "g1", type: "skill", skill: "agility", level: 80 }, { id: "g2", type: "clog", page: "Hallowed Sepulchre" }],
  },
  {
    id: "gim", name: "Sample GIM", accountType: "Group Ironman", world: 330,
    skills: levels(85, 86, 78, 88, 75, 75, 80, 78, 78, 88, 75, 82, 74, 75, 80, 85, 80, 78, 66, 85, 82, 80, 75, 45),
    questPoints: 236,
    finished: ["Desert Treasure I", "Recipe for Disaster", "Lunar Diplomacy", "Legends' Quest", "A Kingdom Divided",
      "Sins of the Father", "Song of the Elves", "Monkey Madness II", "Bone Voyage", "Fairytale II - Cure a Queen",
      "Animal Magnetism", "Lost City", "Heroes' Quest", "Regicide", "Horror from the Deep", "Monkey Madness I", "Priest in Peril"],
    inProgress: ["Dragon Slayer II"],
    rest: 0.7,
    diaries: diaries(3, 2, 3, 2, 3, 3, 3, 3, 3, 3, 2, 1),
    ca: { Easy: 0.98, Medium: 0.85, Hard: 0.55, Elite: 0.15, Master: 0.02, Grandmaster: 0 },
    tabs: { Bosses: 0.3, Raids: 0.15, Clues: 0.2, Minigames: 0.3, Other: 0.2 },
    pages: { "Chambers of Xeric": 0.3, "Theatre of Blood": 0.1, "Tombs of Amascut": 0.15, "Corporeal Beast": 0.1, "Nex": 0.05, "The Nightmare": 0.1 },
    pets: [],
    killCounts: { "Chambers of Xeric": 35, "Theatre of Blood": 6, "Tombs of Amascut": 22, "Corporeal Beast": 18, "Nex": 4,
      "The Nightmare": 9, "Zulrah": 250 },
    slayer: { points: 900, streak: 320, masterId: 8, task: { name: "Gargoyles", boss: false, remaining: 150, initial: 200, location: "the Slayer Tower", wilderness: false } },
    goals: [{ id: "g1", type: "clog", page: "Chambers of Xeric" }, { id: "g2", type: "quest", quest: "Dragon Slayer II" }],
  },
  {
    id: "hcgim", name: "Sample HCGIM", accountType: "Hardcore Group Ironman", world: 330,
    skills: levels(80, 80, 72, 82, 70, 70, 75, 70, 74, 82, 70, 78, 70, 70, 75, 80, 75, 74, 60, 78, 74, 72, 68, 38),
    questPoints: 205,
    finished: ["Desert Treasure I", "Lunar Diplomacy", "Legends' Quest", "A Kingdom Divided", "Monkey Madness I",
      "Bone Voyage", "Fairytale II - Cure a Queen", "Animal Magnetism", "Lost City", "Heroes' Quest", "Regicide",
      "Horror from the Deep", "Priest in Peril"],
    inProgress: ["Recipe for Disaster"],
    rest: 0.6,
    diaries: diaries(2, 2, 2, 2, 3, 3, 2, 2, 3, 2, 2, 0),
    ca: { Easy: 0.9, Medium: 0.6, Hard: 0.25, Elite: 0.03, Master: 0, Grandmaster: 0 },
    tabs: { Bosses: 0.2, Raids: 0.03, Clues: 0.15, Minigames: 0.3, Other: 0.2 },
    pages: { "Chambers of Xeric": 0.08, "Corporeal Beast": 0, "Barrows Chests": 0.9, "Zulrah": 0.3, "The Fight Caves": 1 },
    pets: [],
    killCounts: { "Chambers of Xeric": 8, "Barrows": 300, "Zulrah": 60, "TzTok-Jad": 1 },
    slayer: { points: 560, streak: 210, masterId: 6, task: { name: "Dust devils", boss: false, remaining: 110, initial: 180, location: "the Catacombs of Kourend", wilderness: false } },
    goals: [{ id: "g1", type: "quest", quest: "Recipe for Disaster" }, { id: "g2", type: "clog", page: "Chambers of Xeric" }],
  },
];

// A small fixed hash of a number and a text: spreads evenly over 0..1.
function share(n, salt) {
  let h = 2166136261 ^ n;
  for (const c of salt) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2654435761);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

// The game's combat level formula.
function combatLevel(s) {
  const base = 0.25 * (s.defence + s.hitpoints + Math.floor(s.prayer / 2));
  const melee = 0.325 * (s.attack + s.strength);
  const range = 0.325 * Math.floor(1.5 * s.ranged);
  const mage = 0.325 * Math.floor(1.5 * s.magic);
  return Math.floor(base + Math.max(melee, range, mage));
}

const problems = [];

function build(a) {
  const hc = /hardcore/i.test(a.accountType);
  const skills = {};
  let total = 0;
  let totalXp = 0;
  for (const s of SKILLS) {
    const lvl = a.skills[s];
    // Somewhere inside the level, not exactly on it.
    const xp = lvl >= 99 ? xpForLevel(99) : Math.round(xpForLevel(lvl) + (xpForLevel(lvl + 1) - xpForLevel(lvl)) * share(lvl * 31 + s.length, a.id + s) * 0.9);
    skills[s] = { level: lvl, xp };
    total += lvl;
    totalXp += xp;
  }
  skills.overall = { level: total, xp: totalXp };

  // Quests: named ones, their prerequisites, then a share of the rest.
  const state = {};
  const finish = (q) => {
    if (state[q] === "FINISHED") return;
    if (!game.quests.includes(q)) return problems.push(`${a.id}: no quest called "${q}"`);
    state[q] = "FINISHED";
    for (const p of QUEST_PREREQS[q]?.quests ?? []) finish(p);
  };
  a.finished.forEach(finish);
  for (const q of a.inProgress) {
    if (!game.quests.includes(q)) problems.push(`${a.id}: no quest called "${q}"`);
    else if (!state[q]) state[q] = "IN_PROGRESS";
    for (const p of QUEST_PREREQS[q]?.quests ?? []) finish(p);
  }
  const late = new Set(LATE_QUESTS);
  const quests = game.quests.map((name, i) => ({
    name,
    state: state[name] ?? (late.has(name) ? "NOT_STARTED" : share(i, a.id + "q") < a.rest ? "FINISHED" : share(i, a.id + "p") < 0.15 ? "IN_PROGRESS" : "NOT_STARTED"),
  }));

  const tiers = ["easy", "medium", "hard", "elite"];
  const diaryOut = {};
  const diaryStarted = {};
  for (const [region, done] of Object.entries(a.diaries)) {
    const n = hc && region === "Wilderness" ? 0 : done;
    diaryOut[region] = Object.fromEntries(tiers.map((t, i) => [t, i < n]));
    diaryStarted[region] = n > 0 || share(region.length, a.id + region) < 0.5;
  }

  const tasks = game.combatAchievements.map((t) => ({
    ...t,
    done: !(hc && WILDERNESS_MONSTERS.has(t.monster)) && share(t.id, a.id + "ca") < (a.ca[t.tier] ?? 0),
  }));
  const points = tasks.filter((t) => t.done).reduce((n, t) => n + (CA_TIER_POINTS[t.tier] ?? 0), 0);

  // Collection log: decide per item (an item on two pages is obtained on both), pets by name.
  const petIds = new Set(game.pages["All Pets"].items.map((i) => i.id));
  const petByName = new Map(game.pages["All Pets"].items.map((i) => [i.name.toLowerCase(), i.id]));
  const ownedPets = new Set();
  for (const p of a.pets) {
    const id = petByName.get(p.toLowerCase());
    if (id == null) problems.push(`${a.id}: no pet called "${p}"`);
    else ownedPets.add(id);
  }
  for (const p of Object.keys(a.pages)) if (!game.pages[p]) problems.push(`${a.id}: no collection log page "${p}"`);
  const want = {};
  for (const [name, p] of Object.entries(game.pages)) {
    const f = hc && WILDERNESS_PAGES.has(name) ? 0 : a.pages[name] ?? a.tabs[p.tab] ?? 0;
    for (const i of p.items) want[i.id] = Math.max(want[i.id] ?? 0, f);
  }
  const have = (id) => (petIds.has(id) ? ownedPets.has(id) : share(id, a.id + "clog") < want[id]);
  const pages = {};
  const cats = {};
  const itemsById = {};
  for (const [name, p] of Object.entries(game.pages)) {
    pages[name] = {
      tab: p.tab,
      items: p.items.map((i) => {
        const quantity = have(i.id) ? 1 + Math.floor(share(i.id, a.id + "n") * 4) : 0;
        if (quantity) itemsById[i.id] = quantity;
        return { id: i.id, name: i.name, quantity };
      }),
    };
  }
  // Category and overall counts count each item once, as the game does.
  const counted = new Set();
  for (const p of Object.values(pages)) {
    const c = (cats[p.tab] ??= { obtained: 0, total: 0 });
    for (const i of p.items) {
      const key = `${p.tab}:${i.id}`;
      if (counted.has(key)) continue;
      counted.add(key);
      c.total++;
      if (i.quantity) c.obtained++;
    }
  }
  const all = new Set(Object.values(pages).flatMap((p) => p.items.map((i) => i.id)));

  const monsters = new Set([...game.combatAchievements.map((t) => t.monster), ...Object.keys(game.pages)]);
  for (const k of Object.keys(a.killCounts)) if (!monsters.has(k)) problems.push(`${a.id}: kill count for "${k}", which no page or combat achievement uses`);

  return {
    schema: 1,
    syncedAt: 0,
    sample: true,
    player: { name: a.name, combatLevel: combatLevel(a.skills), accountType: a.accountType, world: a.world },
    skills,
    questPoints: a.questPoints,
    quests,
    diaries: diaryOut,
    diaryStarted,
    combatAchievements: { points, thresholds: CA_THRESHOLDS, tasks },
    collectionLog: {
      obtained: [...all].filter((id) => itemsById[id]).length,
      total: all.size,
      categories: cats,
      pages,
      items: itemsById,
    },
    killCounts: a.killCounts,
    slayer: { ...a.slayer, storage: { unlocked: false } },
  };
}

mkdirSync(outDir, { recursive: true });
const index = [];
for (const a of ACCOUNTS) {
  const snap = build(a);
  writeFileSync(join(outDir, `${a.id}.json`), JSON.stringify(snap) + "\n");
  index.push({ id: a.id, name: a.name, accountType: a.accountType, goals: a.goals });
  console.log(`${a.id}: ${a.name}, ${a.accountType}, combat ${snap.player.combatLevel}, total ${snap.skills.overall.level}, ` +
    `CA ${snap.combatAchievements.points} pts, log ${snap.collectionLog.obtained}/${snap.collectionLog.total}`);
}
writeFileSync(join(outDir, "index.json"), JSON.stringify({
  about: "Made-up sample accounts, one per account type. Made by tests/make-sample-profiles.mjs (npm run samples); don't edit by hand.",
  accounts: index,
}, null, 2) + "\n");
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
