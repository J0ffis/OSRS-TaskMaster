// OSRS TaskMaster recommendation engine.
// Pure functions: (snapshot, goals, options) -> ranked suggestions. No network access.

import {
  SKILLS, MILESTONES, QUESTS, DIARIES, DIARY_TIER_TOTAL,
  CA_TIER_POINTS, CA_TIERS, CLOG_EASE, RARE_ITEMS,
  PAGE_EFFORT, MONSTER_EFFORT, PROTECTED_ITEMS, CLUE_PAGE_BASE, KC_REWARDS,
  WILDERNESS_PAGES, WILDERNESS_MONSTERS, CONTENT_REQS,
  MINUTES_PER_ATTEMPT, TAB_MINUTES, EFFORT_HOURS, SOURCE_RULES, ITEM_EFFORT,
} from "./kb.js";

// Item names are matched without caring about capitalisation.
const ITEM_EFFORT_LC = Object.fromEntries(Object.entries(ITEM_EFFORT).map(([k, v]) => [k.toLowerCase(), v]));

// ---- Drop rates -------------------------------------------------------------------------
let DROP_RATES = {};
/** Load the wiki snapshot (web/data/drop-rates.json) once at startup. */
export function setDropRates(data) {
  // Keyed by lower-case name: the wiki and the game don't always capitalise the same way.
  DROP_RATES = {};
  for (const [name, rows] of Object.entries(data?.items ?? {})) DROP_RATES[name.toLowerCase()] = rows;
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
/**
 * The best chance per attempt of getting `item` for the activity behind collection log `page`.
 * Prefers sources that match the page ("Callisto" for "Callisto and Artio"); otherwise the best
 * source anywhere, since players farm the easiest one. Returns { p, from, rarity } or null.
 */
export function dropChance(itemName, page) {
  // "Always" rows are rewards or follow-up mechanics, not the drop you grind for; guaranteed
  // rewards are handled by the hand rules in kb.js instead.
  const rows = (DROP_RATES[String(itemName).toLowerCase()] ?? []).filter((r) => r.p > 0 && r.p < 1);
  if (!rows.length) return null;
  const pg = norm(page);
  // A source belongs to the page if one name contains the other ("Callisto" / "Callisto and
  // Artio") or a rule in kb.js links them ("Unsired" -> "Abyssal Sire").
  const matched = rows.filter((r) => {
    const f = norm(r.from);
    return f && (pg.includes(f) || f.includes(pg) || SOURCE_RULES[r.from]?.page === page);
  });
  const pool = matched.length ? matched : rows;
  const chance = (r) => (1 - Math.pow(1 - Math.min(1, r.p), Math.max(1, r.rolls || 1))) * (SOURCE_RULES[r.from]?.perAttempt ?? 1);
  const best = pool.reduce((x, y) => (chance(y) > chance(x) ? y : x));
  return { p: chance(best), from: best.from, rarity: best.rarity, minutes: SOURCE_RULES[best.from]?.minutes };
}

/** Expected hours to get an item: attempts needed x minutes per attempt. */
function expectedHours(chance, page, tab) {
  const minutes = chance.minutes ?? MINUTES_PER_ATTEMPT[page] ?? TAB_MINUTES[tab] ?? 2.5;
  return (1 / chance.p) * minutes / 60;
}
const hoursToEffort = (h) => (h <= EFFORT_HOURS.Quick ? "Quick" : h <= EFFORT_HOURS.Medium ? "Medium" : "Long");

/** "very rare", "rare" or null for a collection log item name. */
export function rarity(name) {
  return RARE_ITEMS.find((r) => r.match.test(name ?? ""))?.band ?? null;
}
// How many "ordinary" slots one missing item is worth when judging how close a log is.
const RARITY_COST = { rare: 4, "very rare": 8 };

export const CATEGORIES = {
  levels: "Levels",
  quests: "Quests",
  diaries: "Achievement diaries",
  combat: "Combat achievements",
  clog: "Collection log",
  pets: "Pets",
  goals: "Goals",
};

const DIARY_TIERS = ["easy", "medium", "hard", "elite"];
const XP_MILESTONES = [25e6, 50e6, 100e6, 200e6];

// ---- XP table -------------------------------------------------------------------------
const XP = [0, 0];
{
  let pts = 0;
  for (let lvl = 1; lvl < 99; lvl++) {
    pts += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    XP[lvl + 1] = Math.floor(pts / 4);
  }
}
export const xpForLevel = (lvl) => XP[Math.max(1, Math.min(99, lvl))];

export const fmt = (n) => {
  if (n == null || n < 0) return "?";
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 2).replace(/\.?0+$/, "") + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1e4) return Math.round(n / 1e3) + "K";
  return n.toLocaleString();
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---- Derived facts about the account ---------------------------------------------------

/**
 * Per-snapshot memo: these derived views are rebuilt only when a new snapshot object arrives
 * (a sync or a profile switch), not on every shuffle or every suggestion that asks for them.
 */
function memoBySnap(fn) {
  const cache = new WeakMap();
  return (snap) => {
    if (!cache.has(snap)) cache.set(snap, fn(snap));
    return cache.get(snap);
  };
}
export const analyse = memoBySnap(analyseRaw);
export const petInfo = memoBySnap(petInfoRaw);
export const itemIndex = memoBySnap(itemIndexRaw);

function analyseRaw(snap) {
  const lvl = (s) => snap.skills?.[s]?.level ?? 1;
  const questState = {};
  for (const q of snap.quests ?? []) questState[q.name] = q.state;
  const done = (q) => questState[q] === "FINISHED";
  const total = snap.skills?.overall?.level ?? SKILLS.reduce((a, s) => a + lvl(s), 0);

  const ca = snap.combatAchievements ?? {};
  const caTasks = ca.tasks ?? [];
  const caByTier = {};
  for (const t of CA_TIERS) caByTier[t] = { done: 0, total: 0 };
  for (const t of caTasks) {
    const b = caByTier[t.tier];
    if (!b) continue;
    b.total++;
    if (t.done) b.done++;
  }
  // Highest reward tier whose threshold is reached.
  let caRank = "None";
  let caNext = null;
  for (const t of CA_TIERS) {
    const need = ca.thresholds?.[t];
    if (!need) continue;
    if ((ca.points ?? 0) >= need) caRank = t;
    else if (!caNext) caNext = { tier: t, need, gap: need - (ca.points ?? 0) };
  }

  const missingReqs = (reqs) =>
    Object.entries(reqs ?? {}).filter(([s, l]) => lvl(s) < l).map(([s, l]) => ({ skill: s, level: l, have: lvl(s) }));

  return { snap, lvl, questState, done, total, caByTier, caRank, caNext, missingReqs };
}

// ---- Candidate generators --------------------------------------------------------------
// Each returns { id, category, title, detail, why: [..], progress (0..1)|null, effort, base }

function levelCandidates(snap, a) {
  const out = [];
  // Skill gaps that block notable quests or money-makers.
  const blockers = {};
  const addBlock = (skill, level, label) => {
    const b = (blockers[skill] ??= []);
    b.push({ level, label });
  };
  for (const [name, q] of Object.entries(QUESTS)) {
    if (a.done(name)) continue;
    for (const m of a.missingReqs(q.reqs)) addBlock(m.skill, m.level, name);
  }

  const levels = SKILLS.map((s) => a.lvl(s));
  const avg = levels.reduce((x, y) => x + y, 0) / levels.length;

  for (const skill of SKILLS) {
    if (!snap.skills?.[skill]) continue;
    const cur = a.lvl(skill);
    if (cur >= 99) {
      // Past 99: aim for the next XP milestone, favouring the skills with the least XP.
      const xp = snap.skills[skill].xp ?? 0;
      const target = XP_MILESTONES.find((m) => m > xp);
      if (!target) continue;
      const prev = [...XP_MILESTONES].reverse().find((m) => m <= xp) ?? xpForLevel(99);
      const allMaxed = levels.every((l) => l >= 99);
      out.push({
        id: `xp:${skill}:${target}`,
        category: "levels",
        title: `Push ${cap(skill)} to ${fmt(target)} XP`,
        detail: `${fmt(xp)} → ${fmt(target)}: ${fmt(target - xp)} XP to go.`,
        why: [allMaxed ? "You're maxed, so XP milestones are the next frontier" : "Already 99; keep the XP climbing",
          target === 200e6 ? "200M is the hard cap" : null].filter(Boolean),
        progress: (xp - prev) / (target - prev),
        effort: target - xp < 500e3 ? "Quick" : target - xp < 3e6 ? "Medium" : "Long",
        base: allMaxed ? 30 - Math.log10(Math.max(1, xp)) : 5,
        meta: { skill, xpTarget: target },
      });
      continue;
    }
    const xp = snap.skills[skill].xp ?? xpForLevel(cur);

    // Nearest unlock above the current level, if any.
    const blocks = (blockers[skill] ?? []).filter((b) => b.level > cur).sort((x, y) => x.level - y.level);
    let target, why = [];
    if (blocks.length && blocks[0].level - cur <= 12) {
      target = blocks[0].level;
      const names = blocks.filter((b) => b.level === target).map((b) => b.label);
      why.push(`Unlocks ${names.slice(0, 3).join(", ")}`);
    } else {
      target = MILESTONES.find((m) => m > cur) ?? 99;
    }
    const xpGap = xpForLevel(target) - xp;
    const fromXp = xpForLevel(cur);
    const progress = Math.max(0, Math.min(1, (xp - fromXp) / (xpForLevel(target) - fromXp || 1)));
    if (cur < avg - 10) why.push(`${cap(skill)} is well below your average level (${Math.round(avg)})`);
    if (target === 99) why.push("A skillcape is waiting at the end of this one");
    const effort = xpGap < 150e3 ? "Quick" : xpGap < 1.5e6 ? "Medium" : "Long";
    const base = 30 + (blocks.length ? 25 : 0) + Math.max(0, avg - cur) * 0.8 + (target === 99 && progress > 0.6 ? 20 : 0);
    out.push({
      id: `lvl:${skill}:${target}`,
      category: "levels",
      title: `Train ${cap(skill)} to ${target}`,
      detail: `${cur} → ${target}: ${fmt(xpGap)} XP to go.`,
      why: why.length ? why : ["Steady progress toward your next milestone"],
      progress, effort, base,
      meta: { skill, target },
    });
  }
  return out;
}

function questCandidates(snap, a) {
  const out = [];
  const qp = snap.questPoints ?? 0;
  const unfinished = (snap.quests ?? []).filter((q) => q.state !== "FINISHED");
  const nearCape = unfinished.length > 0 && unfinished.length <= 10;
  for (const q of unfinished) {
    const kb = QUESTS[q.name];
    const missing = kb ? a.missingReqs(kb.reqs) : [];
    const inProgress = q.state === "IN_PROGRESS";
    // Keep the list focused on notable or started quests, unless only a handful are left.
    if (!kb && !inProgress && !nearCape) continue;
    const why = [];
    if (kb) why.push(kb.why);
    if (inProgress) why.push("You've already started it");
    if (nearCape) why.push(`One of your last ${unfinished.length} unfinished quests and miniquests`);
    if (kb?.note) why.push(kb.note);
    let base = (kb?.weight ?? 3) * 5 + (inProgress ? 18 : 0) + (nearCape ? 12 : 0);
    let detail;
    if (missing.length === 0) {
      detail = kb ? "You meet the main skill requirements." : inProgress ? "Pick up where you left off." : "Not started yet.";
      base += 20;
    } else {
      const gap = missing.reduce((s, m) => s + (m.level - m.have), 0);
      detail = "Needs " + missing.map((m) => `${m.level} ${cap(m.skill)} (you: ${m.have})`).join(", ") + ".";
      base -= Math.min(40, gap * 1.5);
    }
    const reqCount = kb ? Object.keys(kb.reqs).length : 0;
    const progress = reqCount ? (reqCount - missing.length) / reqCount : inProgress ? 0.5 : null;
    out.push({
      id: `quest:${q.name}`,
      category: "quests",
      title: `${inProgress ? "Finish" : "Complete"} ${q.name}`,
      detail, why, progress,
      effort: missing.length === 0 ? "Medium" : "Long",
      base,
      meta: { quest: q.name, missing },
    });
  }
  if (!out.length && (snap.quests ?? []).length) {
    const left = snap.quests.filter((q) => q.state !== "FINISHED").length;
    if (left) out.push({
      id: "quest:cape", category: "quests", title: "Work toward the Quest cape",
      detail: `${left} quests left, ${qp} quest points so far.`, why: ["Every notable quest is done; the cape is next"],
      progress: 1 - left / snap.quests.length, effort: "Long", base: 25, meta: {},
    });
  }
  return out;
}

function diaryCandidates(snap, a) {
  const out = [];
  for (const [region, tiers] of Object.entries(snap.diaries ?? {})) {
    const next = DIARY_TIERS.find((t) => !tiers[t]);
    if (!next) continue;
    const kb = DIARIES[region] ?? { reward: "diary reward", weight: 5, highlight: "" };
    const idx = DIARY_TIERS.indexOf(next);
    const reach = a.total >= DIARY_TIER_TOTAL[next];
    const why = [`${kb.reward} ${idx + 1}: ${kb.highlight}`];
    if (!reach) why.push(`Usually comfortable around ${DIARY_TIER_TOTAL[next]} total level (you: ${a.total})`);
    out.push({
      id: `diary:${region}:${next}`,
      category: "diaries",
      title: `${region} ${cap(next)} diary`,
      detail: `${idx} of 4 tiers done. Open the diary in-game for the exact task list.`,
      why,
      progress: idx / 4,
      effort: next === "easy" ? "Quick" : next === "medium" ? "Medium" : "Long",
      base: kb.weight * 4 + (reach ? 25 : -15) + (3 - idx) * 6,
      meta: { region, tier: next },
    });
  }
  return out;
}

function combatCandidates(snap, a) {
  const out = [];
  const ca = snap.combatAchievements ?? {};
  const tasks = (ca.tasks ?? []).filter((t) => !t.done);
  if (!ca.tasks?.length) {
    if (a.caNext) out.push({
      id: "ca:points", category: "combat", title: `Reach the ${a.caNext.tier} CA tier`,
      detail: `${a.caNext.gap} more points needed.`, why: ["Combat achievement rewards unlock at each tier"],
      progress: (ca.points ?? 0) / a.caNext.need, effort: "Medium", base: 30, meta: {},
    });
    return out;
  }
  const kc = snap.killCounts ?? {};
  // Bundles: "finish every Easy task at Royal Titans", one tier harder than a single task.
  const bundles = {};
  for (const t of tasks) (bundles[`${t.monster}|${t.tier}`] ??= []).push(t);
  for (const [key, list] of Object.entries(bundles)) {
    if (list.length < 2) continue; // a single task is already its own suggestion
    const [monster, tier] = key.split("|");
    if (monster === "Other") continue;
    const tierIdx = CA_TIERS.indexOf(tier);
    const taskEffort = tierIdx <= 1 ? 0 : tierIdx <= 3 ? 1 : 2;
    const pts = list.reduce((s, t) => s + (CA_TIER_POINTS[t.tier] ?? 1), 0);
    out.push({
      id: `cabundle:${key}`,
      category: "combat",
      title: `Finish every ${tier} task at ${monster}`,
      detail: list.slice(0, 3).map((t) => t.name).join(", ") + (list.length > 3 ? ` and ${list.length - 3} more` : ""),
      why: [`${list.length} tasks worth ${pts} points`, a.caNext ? `${a.caNext.gap} points to the ${a.caNext.tier} reward tier` : null].filter(Boolean),
      progress: null,
      effort: MONSTER_EFFORT[monster] ?? EFFORTS[Math.min(2, taskEffort + 1)],
      group: monster,
      base: 36 + Math.min(20, pts * 2) - tierIdx * 8,
      meta: { monster, tier },
    });
  }
  // One suggestion per unfinished task.
  for (const t of tasks) {
    const tierIdx = CA_TIERS.indexOf(t.tier);
    const pts = CA_TIER_POINTS[t.tier] ?? 1;
    const tierStats = a.caByTier[t.tier];
    const kcKey = Object.keys(kc).find((k) => k.toLowerCase() === String(t.monster).toLowerCase());
    const why = [`${t.tier} task worth ${pts} point${pts > 1 ? "s" : ""}`];
    if (a.caNext) why.push(`${a.caNext.gap} points to the ${a.caNext.tier} reward tier`);
    if (kcKey) why.push(`You already have kills here (${kc[kcKey]})`);
    out.push({
      id: `ca:${t.id}`,
      category: "combat",
      title: `${t.name}`,
      detail: `${t.monster === "Other" ? "" : `${t.monster}: `}${t.description}`,
      why,
      progress: tierStats?.total ? tierStats.done / tierStats.total : null,
      effort: MONSTER_EFFORT[t.monster] ?? (tierIdx <= 1 ? "Quick" : tierIdx <= 3 ? "Medium" : "Long"),
      group: t.monster,
      base: 40 + pts * 2 - tierIdx * 9 + (kcKey ? 10 : 0) + (t.monster === "Other" ? -10 : 0),
      meta: { monster: t.monster, tier: t.tier, task: t.id, taskName: t.name },
    });
  }
  return out;
}

// The game's own "All Pets" collection log page is the source of truth for what counts as a pet.
const PET_PAGES = new Set(["All Pets", "Skilling Pets"]);

/** Every pet with whether it's owned and the collection log page it drops on. */
function petInfoRaw(snap) {
  const pages = snap.collectionLog?.pages ?? {};
  const all = pages["All Pets"]?.items ?? [];
  const ids = new Set(all.map((i) => i.id));
  const source = {};
  for (const [name, p] of Object.entries(pages)) {
    if (PET_PAGES.has(name)) continue;
    for (const i of p.items) if (ids.has(i.id) && !source[i.id]) source[i.id] = name;
  }
  for (const i of pages["Skilling Pets"]?.items ?? []) source[i.id] ??= "Skilling Pets";
  const pets = all.map((i) => ({ id: i.id, name: i.name, owned: i.quantity > 0, source: source[i.id] ?? null }));
  return { ids, pets, owned: pets.filter((p) => p.owned).length };
}

const EFFORTS = ["Quick", "Medium", "Long"];

/**
 * The tier above Long haul. Only "Complete the log" suggestions that would be Long haul anyway
 * and still miss more than BONUS_MIN_MISSING items that are each a Long haul get it (a whole raid log can be thousands of completions). Bonus picks never show
 * under any grind style or in Mixed: the page offers one on its own, apart from the regular picks.
 */
export const BONUS = "Bonus";
const BONUS_MIN_MISSING = 4;

const isKcReward = (name) => KC_REWARDS.some((re) => re.test(name));
// "Living record (tier 3)" -> "living record"; Xeric's capes share one series.
const kcSeries = (name) => /^xeric's /i.test(name) ? "xeric's"
  : name.toLowerCase().replace(/\s*\((tier )?\d+\)$|\s+tier \d+$/, "");
/** "the Zulrah log", but "The Leviathan log" rather than "the The Leviathan log". */
const theLog = (name) => (/^the /i.test(name) ? `${name} log` : `the ${name} log`);
const FAMILY_STOP = new Set(["with", "from", "piece", "pieces"]);

// Equipment slot words, longest first. What's left of a name once its slot is removed is the
// set it belongs to: "Iron platelegs (t)" -> "Iron" + trimmed.
const SLOT_WORDS = ["full helm", "robe top", "robe bottoms", "robe bottom", "robe legs", "wizard hat", "wizard robe",
  "platebody", "platelegs", "plateskirt", "kiteshield", "chainbody", "chestplate", "tassets", "cuirass", "chausses",
  "helmet", "helm", "shield", "chaps", "body", "coif", "vambraces", "bracers", "greaves", "top", "bottoms", "bottom",
  "legs", "skirt", "shirt", "blouse", "jacket", "trousers", "pants", "tabard", "hat", "hood", "mask", "kasa", "robe",
  "boots", "shoes", "gloves", "cuffs", "cape", "cloak"];
const SLOT_RE = new RegExp(`\\b(${SLOT_WORDS.join("|")})\\b`, "i");
const ARMOUR_SLOTS = new Set(["full helm", "platebody", "platelegs", "plateskirt", "kiteshield", "chainbody", "chestplate",
  "tassets", "cuirass", "chausses", "helmet", "helm", "shield", "chaps", "body", "coif", "vambraces", "greaves"]);
const TRIMS = { t: "trimmed", g: "gold-trimmed", h: "heraldic" };

/** "Iron platelegs (t)" -> { stem: "Iron", variant: "t", slot: "platelegs" }, or null if it has no slot. */
function setPart(name) {
  let rest = name, variant = "";
  const v = rest.match(/\s*\(([^)]+)\)\s*$/);
  if (v) { variant = v[1].toLowerCase().replace(/^h[1-5]$/, "h"); rest = rest.slice(0, v.index); }
  const slot = rest.match(SLOT_RE);
  if (!slot) return null;
  const stem = (rest.slice(0, slot.index) + rest.slice(slot.index + slot[0].length)).replace(/\s+/g, " ").trim();
  if (!stem) return null;
  return { stem, variant, slot: slot[0].toLowerCase() };
}

/** What to call a group of pieces: armour, robes, clothing or a set. */
function setNoun(items, parts) {
  // Boots, gloves and capes go with anything; the other pieces decide.
  const decisive = parts.filter((p) => !/boots|shoes|gloves|cape|cloak/.test(p.slot));
  if (decisive.length && decisive.every((p) => ARMOUR_SLOTS.has(p.slot))) return "armour";
  if (items.some((i) => /wizard/i.test(i.name))) return "wizard robes";
  if (parts.some((p) => /shirt|blouse/.test(p.slot))) return "clothing";
  if (parts.some((p) => /robe/.test(p.slot))) return "robes";
  return "set";
}

/** "Iron trimmed armour", "Black gold-trimmed wizard robes", "Dusk mystic robes", "Gold elegant clothing". */
function setLabel(stem, variant, noun) {
  if (TRIMS[variant]) return `${stem} ${TRIMS[variant]} ${noun}`;
  if (variant && !/^\d+$|tier/.test(variant)) return `${cap(variant)} ${stem.toLowerCase()} ${noun}`;
  return `${stem} ${noun}`;
}

/**
 * Groups missing items into named sets when at least three pieces are missing, so cards read
 * "Get any missing piece of Iron trimmed armour" rather than "any missing iron piece".
 * 1) Pieces of one set: same stem, same trim or variant, all armour or all clothing.
 * 2) Whatever's left falls back to a shared distinctive word ("Get any missing pearl").
 * Each item joins at most one family.
 */
function itemFamilies(items) {
  const out = [];
  const taken = new Set();

  const sets = {};
  for (const i of items) {
    const p = setPart(i.name);
    if (!p) continue;
    const kind = ARMOUR_SLOTS.has(p.slot) ? "armour" : "outfit";
    (sets[`${p.stem.toLowerCase()}|${p.variant}|${kind}`] ??= { stem: p.stem, variant: p.variant, items: [], parts: [] });
    const s = sets[`${p.stem.toLowerCase()}|${p.variant}|${kind}`];
    s.items.push(i); s.parts.push(p);
  }
  for (const [key, s] of Object.entries(sets)) {
    if (s.items.length < 3) continue;
    s.items.forEach((i) => taken.add(i.id));
    const label = setLabel(s.stem, s.variant, setNoun(s.items, s.parts));
    out.push({ key, label, title: `Get any missing piece of ${label}`, items: s.items });
  }

  const rest = items.filter((i) => !taken.has(i.id));
  const wordsOf = (i) => [...new Set(i.name.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/)
    .filter((w) => w.length >= 4 && !FAMILY_STOP.has(w)))];
  const count = {};
  for (const i of rest) for (const w of wordsOf(i)) count[w] = (count[w] ?? 0) + 1;
  for (const [word, n] of Object.entries(count).sort((x, y) => y[1] - x[1])) {
    if (n < 3) break;
    const members = rest.filter((i) => !taken.has(i.id) && wordsOf(i).includes(word));
    if (members.length < 3) continue;
    members.forEach((i) => taken.add(i.id));
    const label = wordLabel(word, members);
    out.push({ key: word, label, title: `Get any missing ${label}`, items: members });
  }
  return out;
}

/**
 * A name for items grouped only by a shared word, taken from the words their names share:
 * "Red cavalier", "Navy cavalier" -> "cavalier"; "Evil chicken head", "Evil chicken legs" ->
 * "Evil chicken piece"; "Golden Armadyl special attack" -> "Golden special attack".
 */
function wordLabel(word, members) {
  if (SLOT_WORDS.includes(word)) return word; // "Get any missing cape"
  const words = members.map((i) => i.name.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+tier \d+$/i, "").split(/\s+/));
  const parts = members.map((i) => setPart(i.name));
  // Same kind of piece in several colours: "Blue tricorn hat", "Red tricorn hat" -> "tricorn hat".
  const ending = words.every((ws) => ws.length >= 2 && ws.slice(-2).join(" ").toLowerCase() === words[0].slice(-2).join(" ").toLowerCase());
  if (parts.every(Boolean) && !ending) {
    const shown = members[0].name.match(new RegExp(word, "i"))?.[0] ?? word;
    return `piece of ${shown} ${setNoun(members, parts)}`; // "piece of elegant clothing"
  }
  const shared = (pick) => {
    const out = [];
    for (let k = 0; ; k++) {
      const w = pick(words[0], k);
      if (!w || !words.every((ws) => pick(ws, k)?.toLowerCase() === w.toLowerCase()) || k >= Math.min(...words.map((ws) => ws.length))) break;
      out.push(w);
    }
    return out;
  };
  const prefix = shared((ws, k) => ws[k]);
  const suffix = shared((ws, k) => ws[ws.length - 1 - k]).reverse();
  if (prefix.length === words[0].length) return prefix.join(" "); // every item has the same name
  if (prefix.at(-1)?.toLowerCase() === "of") prefix.pop();      // "Remnant of ..." -> "Remnant"
  if (prefix.length && suffix.length) return `${prefix.join(" ")} ${suffix.join(" ")}`;
  if (suffix.length) return suffix.join(" ");
  if (prefix.length) return `${prefix.join(" ")} piece`;
  return `${word} piece`;
}

/**
 * Effort for one collection log item. Rules, first match wins:
 * fixed item effort (superior drops) > fixed page effort (guaranteed rewards, team content) > raids are Long > duplicate-protected
 * items are Balanced > clue pages taper up as they fill > the wiki drop rate (expected hours) >
 * the hand-made rare list > easy content is Quick > everything else is Balanced.
 */
function itemEffort(item, page, tab, pageRatio) {
  const fixed = ITEM_EFFORT_LC[String(item.name).toLowerCase()];
  if (fixed) return fixed.effort;
  if (PAGE_EFFORT[page]) return PAGE_EFFORT[page];
  if (tab === "Raids") return "Long";
  if (PROTECTED_ITEMS.some((re) => re.test(item.name))) return "Medium";
  if (tab === "Clues") {
    const base = CLUE_PAGE_BASE[page] ?? 1;
    const taper = pageRatio >= 0.9 ? 2 : pageRatio >= 0.6 ? 1 : 0;
    return EFFORTS[Math.min(2, base + taper)];
  }
  const chance = tab !== "Minigames" ? dropChance(item.name, page) : null;
  if (chance) return hoursToEffort(expectedHours(chance, page, tab));
  if (rarity(item.name)) return "Long";
  return (CLOG_EASE[page] ?? 0) >= 6 ? "Quick" : "Medium";
}

function clogCandidates(snap) {
  const out = [];
  const log = snap.collectionLog ?? {};
  const pages = Object.entries(log.pages ?? {});
  const { ids: petIds } = petInfo(snap);
  const seen = new Set();
  for (const [name, p] of pages) {
    if (PET_PAGES.has(name)) continue; // pets have their own category
    // Pets are left out: a missing pet is a Pets suggestion, never a collection log one.
    const nonPet = p.items.filter((i) => !petIds.has(i.id));
    const missing = nonPet.filter((i) => !(i.quantity > 0));
    if (!missing.length) continue;
    const got = nonPet.length - missing.length;
    const ratio = got / nonPet.length;
    const ease = CLOG_EASE[name] ?? 0;
    const effortOf = (i) => itemEffort(i, name, p.tab, ratio);
    // Show the game's own counts (pets included) so numbers match the in-game log; effort and
    // scoring above still leave pets out.
    const shownGot = p.items.filter((i) => i.quantity > 0).length;
    const petMissing = p.items.length - nonPet.length - (shownGot - got);
    const progressLine = `${shownGot}/${p.items.length} of ${theLog(name)} done`;

    // 1) Completing the whole log: one tier harder than its hardest missing item, but a single
    //    missing slot is never a quick win (completing a log is at least Balanced).
    const hardest = Math.max(...missing.map((i) => EFFORTS.indexOf(effortOf(i))));
    const usual = PAGE_EFFORT[name] ?? (p.tab === "Raids" ? "Long"
      : EFFORTS[missing.length > 6 ? 2 : missing.length === 1 ? Math.max(1, hardest) : Math.min(2, hardest + 1)]);
    // Bonus: a Long haul log where more than BONUS_MIN_MISSING of the missing items are each a
    // Long haul themselves (raids, Barrows, Nex). Logs that are long only because they're big
    // (Easy clues, Random Events) stay Long haul.
    const longMissing = missing.filter((i) => effortOf(i) === "Long").length;
    const pageEffort = usual === "Long" && longMissing > BONUS_MIN_MISSING ? BONUS : usual;
    const rares = missing.filter((i) => rarity(i.name));
    out.push({
      id: `clogpage:${name}`,
      category: "clog",
      title: `Complete ${theLog(name)}`,
      detail: `${shownGot}/${p.items.length} slots. Missing: ${missing.slice(0, 4).map((i) => i.name).join(", ")}${missing.length > 4 ? ` and ${missing.length - 4} more` : ""}${petMissing > 0 ? " (plus the pet)" : ""}.`,
      why: [
        missing.length === 1 ? "One slot from a green log" : `${missing.length} slots from a green log`,
        rares.length ? `Includes ${rares.length > 1 ? "rare drops" : "a rare drop"}: ${rares.slice(0, 2).map((i) => i.name).join(", ")}` : null,
        `${p.tab} tab`,
      ].filter(Boolean),
      progress: ratio,
      effort: pageEffort,
      group: name,
      base: 22 + ratio * 30 + ease + (missing.length <= 2 ? 10 : 0) - rares.length * 3,
      meta: { page: name },
    });
    // A single missing slot is the same task as completing the log, so don't list it twice.
    if (missing.length === 1) { seen.add(missing[0].id); continue; }

    // 2) Families of similar items ("any elegant piece") become one broad suggestion.
    const fresh = missing.filter((i) => !seen.has(i.id));
    // Kill-count rewards always stay single suggestions.
    for (const fam of itemFamilies(fresh.filter((i) => !rarity(i.name) && !isKcReward(i.name)))) {
      fam.items.forEach((i) => seen.add(i.id));
      const effort = effortOf(fam.items[0]);
      out.push({
        id: `clogfam:${name}:${fam.key}`,
        category: "clog",
        title: fam.title,
        detail: `${fam.items.length} still missing from ${name}: ${fam.items.slice(0, 4).map((i) => i.name).join(", ")}${fam.items.length > 4 ? "…" : ""}`,
        why: [ease >= 6 ? `${name} is one of the quicker logs to fill` : "Any one of these counts", progressLine],
        progress: ratio,
        effort,
        group: name,
        base: 24 + ratio * 15 + ease + Math.min(10, fam.items.length),
        meta: { page: name, family: fam.key, familyTitle: fam.title, items: fam.items.map((i) => i.name) },
      });
    }

    // 3) Everything else, one suggestion per item.
    for (const item of missing) {
      if (seen.has(item.id)) continue; // shared items (e.g. clue rewards) appear once
      seen.add(item.id);
      const band = rarity(item.name);
      const chance = p.tab === "Clues" || p.tab === "Minigames" ? null : dropChance(item.name, name);
      const why = [];
      const fixed = ITEM_EFFORT_LC[String(item.name).toLowerCase()];
      // Kill-count rewards: rank within their series (tier 1 first). Past the first rank they're Long.
      const kc = isKcReward(item.name);
      const rank = kc ? nonPet.filter((i) => isKcReward(i.name) && kcSeries(i.name) === kcSeries(item.name)).findIndex((i) => i.id === item.id) : 0;
      if (fixed?.why) why.push(fixed.why);
      else if (kc) why.push(rank ? "A kill-count reward: needs many more completions than the last rank" : "A kill-count reward: unlocks after a set number of completions");
      else if (chance) {
        const h = expectedHours(chance, name, p.tab);
        why.push(`${chance.rarity} from ${chance.from}: about ${h < 1 ? "under an hour" : `${Math.round(h)} hour${Math.round(h) === 1 ? "" : "s"}`} on average`);
      } else if (band) why.push(`A ${band} drop: plan for a long haul`);
      else if (ease >= 6) why.push(`${name} is one of the quicker logs to fill`);
      why.push(progressLine);
      out.push({
        id: `clog:${item.id}`,
        category: "clog",
        title: `Get ${item.name}`,
        detail: `From ${/^the /i.test(name) ? name : `the ${name}`} collection log page (${p.tab} tab).`,
        why,
        progress: ratio,
        effort: kc && rank > 0 ? "Long" : effortOf(item),
        group: name,
        base: 20 + ratio * 20 + ease - (band ? RARITY_COST[band] : 0) - rank * 3,
        meta: { page: name, item: item.name },
      });
    }
  }
  if (!pages.length && log.total > 0) {
    out.push({
      id: "clog:unknown", category: "clog", title: "Show OSRS TaskMaster your collection log",
      detail: `${log.obtained}/${log.total} slots logged, but the page layout hasn't synced yet.`,
      why: ["Update the plugin and sync again so suggestions can point at specific pages"],
      progress: log.obtained / log.total, effort: "Quick", base: 10, meta: {},
    });
  }
  return out;
}

function petCandidates(snap) {
  const { pets } = petInfo(snap);
  const pages = snap.collectionLog?.pages ?? {};
  const kc = snap.killCounts ?? {};
  const out = [];
  for (const pet of pets) {
    if (pet.owned) continue;
    const page = pet.source ? pages[pet.source] : null;
    // Pets from content you've otherwise finished rank higher: you're likely farming it anyway.
    const others = page ? page.items.filter((i) => i.id !== pet.id) : [];
    const otherRatio = others.length ? others.filter((i) => i.quantity > 0).length / others.length : 0;
    const kcKey = pet.source && Object.keys(kc).find((k) => k.toLowerCase() === pet.source.toLowerCase());
    const why = ["Pets are rare drops: plan for a long haul"];
    if (page && otherRatio === 1) why.push(`It's the last slot on your ${pet.source} log`);
    else if (page && otherRatio >= 0.5) why.push(`You have ${Math.round(otherRatio * 100)}% of the rest of that log`);
    if (kcKey) why.push(`${kc[kcKey]} kills so far`);
    out.push({
      id: `pet:${pet.id}`,
      category: "pets",
      title: `Hunt ${pet.name}`,
      detail: pet.source ? `Drops from ${pet.source === "Skilling Pets" ? "skilling" : pet.source}.` : "Source page not synced.",
      why,
      progress: null,
      effort: "Long",
      base: 14 + otherRatio * 18 + (kcKey ? 4 : 0),
      meta: { pet: pet.name, page: pet.source },
    });
  }
  return out;
}

// ---- Completion -------------------------------------------------------------------------

/** Which categories are finished (nothing left to suggest) and which milestones to celebrate. */
export function completions(snap) {
  const a = analyse(snap);
  const quests = snap.quests ?? [];
  const diaries = Object.values(snap.diaries ?? {});
  const tasks = snap.combatAchievements?.tasks ?? [];
  const log = snap.collectionLog ?? {};
  const skills = SKILLS.filter((s) => snap.skills?.[s]);
  const done = {
    quests: quests.length > 0 && quests.every((q) => q.state === "FINISHED"),
    diaries: diaries.length > 0 && diaries.every((d) => DIARY_TIERS.every((t) => d[t])),
    combat: tasks.length > 0 && tasks.every((t) => t.done),
    clog: log.total > 0 && log.obtained >= log.total,
    pets: (() => { const p = petInfo(snap); return p.pets.length > 0 && p.owned === p.pets.length; })(),
    levels: skills.length > 0 && skills.every((s) => (snap.skills[s].xp ?? 0) >= 200e6),
  };
  const maxed = skills.length > 0 && skills.every((s) => a.lvl(s) >= 99);
  const badges = [];
  if (maxed) badges.push({ label: "Maxed", detail: `Every skill at 99 (${a.total} total)` });
  if (done.quests) badges.push({ label: "Quest cape", detail: "Every quest complete" });
  if (done.diaries) badges.push({ label: "Achievement Diary cape", detail: `All ${diaries.length * 4} diary tiers complete` });
  if (["Elite", "Master", "Grandmaster"].includes(a.caRank)) badges.push({ label: `${a.caRank} combat achievements`, detail: `${snap.combatAchievements.points} points` });
  if (done.combat) badges.push({ label: "Every combat achievement", detail: `${tasks.length} tasks` });
  if (done.clog) badges.push({ label: "Collection log complete", detail: `${log.obtained}/${log.total}` });
  if (done.pets) badges.push({ label: "Every pet", detail: "All pets obtained" });
  return { done, maxed, badges };
}

// ---- Items -------------------------------------------------------------------------------

/**
 * Every collection log item by lower-case name: { id, name, owned, page }.
 * Item goals use it to track "obtain X" automatically. Ownership comes only from the collection
 * log; banks are never read.
 */
function itemIndexRaw(snap) {
  const out = new Map();
  for (const [page, p] of Object.entries(snap.collectionLog?.pages ?? {})) {
    if (PET_PAGES.has(page)) continue;
    for (const i of p.items) {
      const key = String(i.name).toLowerCase();
      const prev = out.get(key);
      if (!prev) out.set(key, { id: i.id, name: i.name, owned: i.quantity > 0, page });
      else if (i.quantity > 0) prev.owned = true;
    }
  }
  for (const pet of petInfo(snap).pets) {
    const key = pet.name.toLowerCase();
    if (!out.has(key)) out.set(key, { id: pet.id, name: pet.name, owned: pet.owned, page: pet.source });
  }
  return out;
}

// ---- Goals -----------------------------------------------------------------------------

/** Returns { progress 0..1, done, label } for a goal against the snapshot. */
export function goalProgress(goal, snap) {
  const a = analyse(snap);
  switch (goal.type) {
    case "skill": {
      const xp = snap.skills?.[goal.skill]?.xp ?? 0;
      const lvl = a.lvl(goal.skill);
      return { progress: Math.min(1, xp / xpForLevel(goal.level)), done: lvl >= goal.level, label: `${lvl}/${goal.level} ${cap(goal.skill)}` };
    }
    case "xp": {
      const xp = snap.skills?.[goal.skill]?.xp ?? 0;
      return { progress: Math.min(1, xp / goal.xp), done: xp >= goal.xp, label: `${fmt(xp)}/${fmt(goal.xp)} XP` };
    }
    case "quest": {
      const st = a.questState[goal.quest];
      return { progress: st === "FINISHED" ? 1 : st === "IN_PROGRESS" ? 0.5 : 0, done: st === "FINISHED", label: st ? st.replace("_", " ").toLowerCase() : "unknown" };
    }
    case "diary": {
      const d = snap.diaries?.[goal.region] ?? {};
      const need = DIARY_TIERS.indexOf(goal.tier) + 1;
      const have = DIARY_TIERS.filter((t) => d[t]).length;
      return { progress: Math.min(1, have / need), done: !!d[goal.tier], label: `${have}/4 tiers` };
    }
    case "ca": {
      const ca = snap.combatAchievements ?? {};
      const need = ca.thresholds?.[goal.tier] ?? 0;
      const pts = ca.points ?? 0;
      return { progress: need ? Math.min(1, pts / need) : 0, done: need > 0 && pts >= need, label: `${pts}/${need || "?"} pts` };
    }
    case "pet": {
      const pet = petInfo(snap).pets.find((p) => p.name === goal.pet);
      return { progress: pet?.owned ? 1 : 0, done: !!pet?.owned, label: pet?.owned ? "obtained" : "not yet" };
    }
    case "clog": {
      const p = snap.collectionLog?.pages?.[goal.page];
      if (!p) return { progress: 0, done: false, label: "page not synced" };
      const got = p.items.filter((i) => i.quantity > 0).length;
      return { progress: got / p.items.length, done: got === p.items.length, label: `${got}/${p.items.length}` };
    }
    case "family": {
      // "Any missing elegant piece": done as soon as one of the pieces it listed is logged.
      const items = itemIndex(snap);
      const got = goal.items.filter((n) => items.get(n.toLowerCase())?.owned).length;
      return { progress: got ? 1 : 0, done: got > 0, label: got ? "obtained one" : `${goal.items.length} to choose from` };
    }
    case "catask": {
      const t = snap.combatAchievements?.tasks?.find((x) => x.id === goal.task);
      return { progress: t?.done ? 1 : 0, done: !!t?.done, label: t?.done ? "complete" : `${goal.tier} task` };
    }
    case "cabundle": {
      const list = (snap.combatAchievements?.tasks ?? []).filter((t) => t.monster === goal.monster && t.tier === goal.tier);
      const got = list.filter((t) => t.done).length;
      return { progress: list.length ? got / list.length : 0, done: list.length > 0 && got === list.length, label: `${got}/${list.length} tasks` };
    }
    case "item": {
      // Collection log items track themselves; anything else is ticked off by hand.
      const it = itemIndex(snap).get(String(goal.item).toLowerCase());
      if (!it) return { progress: goal.done ? 1 : 0, done: !!goal.done, label: goal.done ? "obtained" : "tick when obtained", manual: true };
      return { progress: it.owned ? 1 : 0, done: it.owned, label: it.owned ? "in your collection log" : `from ${it.page}` };
    }
    default:
      return { progress: goal.done ? 1 : 0, done: !!goal.done, label: goal.done ? "done" : "manual" };
  }
}

export function goalTitle(g) {
  switch (g.type) {
    case "skill": return `${g.level} ${cap(g.skill)}`;
    case "xp": return `${fmt(g.xp)} ${cap(g.skill)} XP`;
    case "quest": return g.quest;
    case "diary": return `${g.region} ${cap(g.tier)} diary`;
    case "ca": return `${g.tier} combat achievements`;
    case "clog": return `${g.page} collection log`;
    case "pet": return g.pet;
    case "item": return `Obtain ${g.item}`;
    case "family": return `${g.title ?? `Get any missing ${g.family} piece`} (${g.page})`;
    case "catask": return g.name;
    case "cabundle": return `Finish every ${g.tier} task at ${g.monster}`;
    default: return g.text;
  }
}

/** Does candidate `c` move goal `g` forward? */
function advances(c, g, a) {
  const m = c.meta ?? {};
  switch (g.type) {
    case "skill":
    case "xp": return m.skill === g.skill;
    case "quest": {
      if (m.quest === g.quest) return true;
      const need = QUESTS[g.quest]?.reqs?.[m.skill] ?? 0;
      return !!m.skill && a.lvl(m.skill) < need;
    }
    case "diary": return m.region === g.region;
    case "ca": return c.category === "combat";
    case "clog": return m.page === g.page;
    case "pet": return m.pet === g.pet;
    case "item": {
      const it = itemIndex(a.snap).get(String(g.item).toLowerCase());
      return !!it && (m.item === it.name || m.pet === it.name);
    }
    case "family": return m.family === g.family && m.page === g.page || (m.page === g.page && g.items.includes(m.item));
    case "catask": return m.task === g.task;
    case "cabundle": return m.monster === g.monster && m.tier === g.tier;
    default: return false;
  }
}

/**
 * Effort for a goal card, judged by what the goal is rather than how far along it is, using the
 * same rules as the matching suggestions. `byId` holds the other suggestions for reuse.
 */
function goalEffort(g, snap, a, byId, byItem) {
  switch (g.type) {
    case "skill": {
      const gap = xpForLevel(g.level) - (snap.skills?.[g.skill]?.xp ?? 0);
      return gap < 150e3 ? "Quick" : gap < 1.5e6 ? "Medium" : "Long";
    }
    case "xp": {
      const gap = g.xp - (snap.skills?.[g.skill]?.xp ?? 0);
      return gap < 500e3 ? "Quick" : gap < 3e6 ? "Medium" : "Long";
    }
    case "quest": return a.missingReqs(QUESTS[g.quest]?.reqs).length ? "Long" : "Medium";
    case "diary": return { easy: "Quick", medium: "Medium" }[g.tier] ?? "Long";
    // Reaching a reward tier takes many tasks: Hard and above are long hauls.
    case "ca": return { Easy: "Quick", Medium: "Medium" }[g.tier] ?? "Long";
    case "pet": return "Long";
    // A log you chose as a goal shows as a Long haul, even if the suggestion was a Bonus.
    case "clog": { const e = byId.get(`clogpage:${g.page}`)?.effort; return e && e !== BONUS ? e : "Long"; }
    case "item": {
      const it = itemIndex(snap).get(String(g.item).toLowerCase());
      if (!it) return "Medium"; // not in the collection log: ticked off by hand
      if (petInfo(snap).ids.has(it.id)) return "Long";
      return byItem.get(it.name)?.effort ?? (rarity(it.name) ? "Long" : "Medium");
    }
    // These keep the tier their suggestion had when it was made into a goal.
    case "family": return byId.get(`clogfam:${g.page}:${g.family}`)?.effort ?? g.effort ?? "Medium";
    case "catask": return byId.get(`ca:${g.task}`)?.effort ?? g.effort ?? "Medium";
    case "cabundle": return byId.get(`cabundle:${g.monster}|${g.tier}`)?.effort ?? g.effort ?? "Medium";
    default: return "Medium";
  }
}

function goalCandidates(snap, goals, others = []) {
  const out = [];
  const items = itemIndex(snap);
  const a = analyse(snap);
  const byId = new Map(others.map((c) => [c.id, c]));
  const byItem = new Map(others.filter((c) => c.meta?.item).map((c) => [c.meta.item, c]));
  for (const g of goals) {
    const p = goalProgress(g, snap);
    if (p.done) continue;
    let detail = `Currently ${p.label}.`;
    const effort = goalEffort(g, snap, a, byId, byItem);
    if (g.type === "item") {
      const it = items.get(String(g.item).toLowerCase());
      detail = it ? `Drops on the ${it.page} collection log page.` : "Not a collection log item, so tick it off yourself when you get it.";
    } else if (g.type === "family") {
      detail = `Any one of: ${g.items.slice(0, 4).join(", ")}${g.items.length > 4 ? "…" : ""}`;
    } else if (g.type === "catask") {
      detail = byId.get(`ca:${g.task}`)?.detail ?? `${g.tier} combat achievement.`;
    }
    out.push({
      id: `goal:${g.id}`, category: "goals", title: `Goal: ${goalTitle(g)}`,
      detail, why: ["You set this goal on your profile"],
      progress: p.progress, effort, base: 45 + p.progress * 30,
      meta: { goalId: g.id }, goal: g,
      // Goals are never hidden by the Wilderness toggle, but still carry the warning.
      wilderness: WILDERNESS_PAGES.has(g.page ?? items.get(String(g.item ?? "").toLowerCase())?.page)
        || WILDERNESS_MONSTERS.has(g.monster) || g.region === "Wilderness",
    });
  }
  return out;
}

// ---- Ranking ---------------------------------------------------------------------------

/** Each grind style shows exactly one effort tier, so the three never share a suggestion. */
export const STYLE_EFFORT = { quick: "Quick", balanced: "Medium", long: "Long" };

/** Opt-in content: off unless the player switches it on. */
export const CONTENT_TOGGLES = { minigames: "Minigames", wilderness: "Wilderness", clues: "Clues" };

/** Which opt-in content a suggestion belongs to, if any. */
function contentTag(c, snap) {
  const m = c.meta ?? {};
  const tab = m.page ? snap.collectionLog?.pages?.[m.page]?.tab : null;
  if (tab === "Minigames") return "minigames";
  if (tab === "Clues") return "clues";
  if (WILDERNESS_PAGES.has(m.page) || WILDERNESS_MONSTERS.has(m.monster) || m.region === "Wilderness") return "wilderness";
  return null;
}

/** What still blocks access to a suggestion's content, or null if it's open to you. */
function lockOf(c, a) {
  const m = c.meta ?? {};
  if (m.quest && m.missing?.length) {
    return { content: m.quest, needs: m.missing.map((x) => `${x.level} ${cap(x.skill)}`) };
  }
  const name = m.page ?? m.monster;
  if (!name) return null;
  const req = CONTENT_REQS.find((r) => r.match.test(name));
  if (!req) return null;
  const needs = [
    ...(req.quests ?? []).filter((q) => !a.done(q)),
    ...a.missingReqs(req.skills).map((x) => `${x.level} ${cap(x.skill)}`),
  ];
  return needs.length ? { content: name, needs } : null;
}

/**
 * Content hidden because you can't access it yet: [{ content, needs: [..], hidden: n }].
 * Opt-in toggles are applied first, so switched-off content isn't listed.
 */
export function lockedContent(snap, opts = {}) {
  return evaluate(snap, [], opts).locked;
}

export function candidates(snap, goals = [], opts = {}) {
  return evaluate(snap, goals, opts).list;
}

/** Every suggestion for a snapshot, before filters, goals and tiers. Built once per snapshot. */
const generateAll = memoBySnap((snap) => {
  const a = analyse(snap);
  return [
    ...levelCandidates(snap, a),
    ...questCandidates(snap, a),
    ...diaryCandidates(snap, a),
    ...combatCandidates(snap, a),
    ...clogCandidates(snap),
    ...petCandidates(snap),
  ];
});

function evaluate(snap, goals, opts) {
  const a = analyse(snap);
  const style = opts.style; // quick | balanced | long; omit for every tier
  const content = opts.content ?? {}; // { minigames, wilderness, clues }: opt-in, off by default
  const effortBias = { Quick: 0, Medium: 0, Long: 0, [BONUS]: 0 };

  const locks = new Map();
  // Copies, because scoring below adds goal reasons to `why`.
  const generated = generateAll(snap).map((c) => ({ ...c, why: [...c.why] }));
  let list = generated.filter((c) => {
    const tag = contentTag(c, snap);
    if (tag && !content[tag]) return false;
    // Flag Wilderness content so the card can warn about PvP risk.
    if (tag === "wilderness") c.wilderness = true;
    const lock = lockOf(c, a);
    if (lock) {
      const entry = locks.get(lock.content) ?? { ...lock, hidden: 0 };
      entry.hidden++;
      locks.set(lock.content, entry);
      return false;
    }
    return true;
  });
  const open = goals.filter((g) => !goalProgress(g, snap).done);
  for (const c of list) {
    c.score = c.base + effortBias[c.effort];
    const helps = open.filter((g) => advances(c, g, a));
    if (helps.length) {
      c.score += 25 * helps.length;
      c.why = [`Moves your goal "${goalTitle(helps[0])}" forward`, ...c.why];
    }
  }
  if (opts.includeGoals !== false) list.push(...goalCandidates(snap, open, generated).map((c) => ({ ...c, score: c.base + effortBias[c.effort] })));
  const enabled = opts.categories;
  if (enabled) list = list.filter((c) => enabled.has(c.category));
  if (style) list = list.filter((c) => c.effort === STYLE_EFFORT[style]);
  const locked = [...locks.values()].sort((x, y) => x.content.localeCompare(y.content));
  return { list: list.sort((x, y) => y.score - x.score), locked };
}

/**
 * Pick `n` suggestions from different categories. `seed` adds a small, repeatable shuffle so
 * "Shuffle" gives fresh but still sensible picks. `exclude` removes ids the user skipped.
 */
export function pickThree(list, { seed = 0, exclude = new Set(), keep = [], n = 3 } = {}) {
  const rand = mulberry32(seed);
  const jittered = list
    .filter((c) => !exclude.has(c.id))
    .map((c) => ({ c, s: c.score + (seed ? rand() * 30 : 0) }))
    .sort((x, y) => y.s - x.s)
    .map((x) => x.c);
  const picked = [...keep];
  const has = (c) => picked.some((p) => p.id === c.id);
  const groupOf = (c) => `${c.category}:${c.group ?? c.id}`;
  // 1) different categories, 2) same category but a different page/boss, 3) anything left.
  const passes = [
    (c) => !picked.some((p) => p.category === c.category),
    (c) => !picked.some((p) => groupOf(p) === groupOf(c)),
    () => true,
  ];
  for (const ok of passes) {
    for (const c of jittered) {
      if (picked.length >= n) break;
      if (!has(c) && ok(c)) picked.push(c);
    }
  }
  // Still short (everything left was skipped or shuffled past): reuse skipped suggestions rather
  // than show fewer cards than the filters allow.
  for (const c of list) {
    if (picked.length >= n) break;
    if (!has(c)) picked.push(c);
  }
  return picked;
}

/** How the 7-card Mixed carousel is split across the three tiers. */
export const MIX_QUOTA = { Quick: 2, Medium: 3, Long: 2 };

/**
 * Seven picks spanning every tier, ordered Quick -> Balanced -> Long. Each tier keeps the usual
 * variety rules, and categories already picked in earlier tiers are avoided where possible. If a
 * tier runs short, the other tiers fill the gap so the carousel stays full.
 */
export function pickMix(list, { seed = 0, exclude = new Set(), quota = MIX_QUOTA } = {}) {
  const total = Object.values(quota).reduce((a, b) => a + b, 0);
  const tiers = Object.keys(quota);
  let picked = [];
  tiers.forEach((tier, k) => {
    const sub = list.filter((c) => c.effort === tier);
    const next = pickThree(sub, { seed: seed ? seed + k * 101 : 0, exclude, keep: picked, n: picked.length + quota[tier] });
    picked = next;
  });
  // Top up from any tier if one ran short.
  if (picked.length < total) picked = pickThree(list.filter((c) => c.effort !== BONUS), { seed, exclude, keep: picked, n: total });
  return tiers.flatMap((t) => picked.filter((c) => c.effort === t));
}

/** One Bonus suggestion (a huge log completion), shown apart from the regular picks. */
export function pickBonus(list, { seed = 0, exclude = new Set() } = {}) {
  return pickThree(list.filter((c) => c.effort === BONUS), { seed, exclude, n: 1 })[0] ?? null;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
