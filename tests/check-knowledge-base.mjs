// Checks web/knowledge-base.js for mistakes the website would otherwise ignore silently:
// a misspelt item, page, quest or boss name, a tier that doesn't exist ("Long-Haul" instead of
// "Long"), or a pattern that no longer matches anything.
//
//   node tests/check-knowledge-base.mjs     (or: npm run check)
//
// Names are compared with tests/fixtures/game-names.json, the game's own names. If the game
// added a page, item or quest since that file was made, regenerate it with
// `node tests/make-game-names.mjs` after syncing a profile. Exits with code 1 when there are
// errors, so the website isn't published with them.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const loadGameNames = () => JSON.parse(readFileSync(join(root, "tests", "fixtures", "game-names.json"), "utf8"));
export const loadDropRates = () => JSON.parse(readFileSync(join(root, "web", "data", "drop-rates.json"), "utf8"));
export const loadQuestReqs = () => JSON.parse(readFileSync(join(root, "web", "data", "quest-reqs.json"), "utf8"));

// Bosses that are real but have no combat achievements or collection log page of their own
// (the Wilderness singles-plus versions share their page with the original boss).
const OTHER_BOSSES = ["Artio", "Spindel", "Calvar'ion"];

// Closest name, for "did you mean" hints.
function distance(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
function hint(name, list) {
  let best = null, d = Infinity;
  for (const n of list) { const x = distance(name, n); if (x < d) { d = x; best = n; } }
  return best && d <= Math.max(3, name.length / 4) ? ` Did you mean "${best}"?` : "";
}

/** Splits /^(A|B|C)$/ into one pattern per choice, so one misspelt name among many is caught. */
function alternatives(re) {
  const s = re.source;
  if (!s.startsWith("^(")) return [];
  let depth = 0, end = -1;
  const parts = [];
  let start = 2;
  for (let i = 1; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") { i++; continue; }
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) { end = i; break; } }
    else if (c === "|" && depth === 1) { parts.push(s.slice(start, i)); start = i + 1; }
  }
  if (end < 0 || !parts.length) return [];
  parts.push(s.slice(start, end));
  const rest = s.slice(end + 1);
  return parts.map((p) => ({ text: p, re: new RegExp(`^(?:${p})${rest}`, re.flags) }));
}

/** Every problem in a knowledge base: { errors: [...], warnings: [...] } as readable lines. */
export function checkKnowledgeBase(KB, game = loadGameNames(), drops = loadDropRates(), questReqs = loadQuestReqs()) {
const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

// ---- What the game calls things ---------------------------------------------------------
const TIERS = ["Quick", "Medium", "Long"];
const pages = Object.keys(game.pages);
const tabs = [...new Set(Object.values(game.pages).map((p) => p.tab))];
const items = [...new Set(Object.values(game.pages).flatMap((p) => p.items.map((i) => i.name)))];
const itemsLc = new Set(items.map((n) => n.toLowerCase()));
const quests = new Set(game.quests);
const diaries = new Set(game.diaries);
const monsters = [...new Set([...game.combatAchievements.map((t) => t.monster).filter(Boolean), ...OTHER_BOSSES])];
const skills = new Set(KB.SKILLS);
const DIARY_TIERS = ["easy", "medium", "hard", "elite"];

const isPage = (n) => game.pages[n] != null;
function needPage(where, name) {
  if (!isPage(name)) err(where, `"${name}" isn't a collection log page.${hint(name, pages)}`);
}
function needItem(where, name) {
  if (!itemsLc.has(name.toLowerCase())) err(where, `"${name}" isn't a collection log item.${hint(name, items)}`);
}
function needQuest(where, name) {
  if (!quests.has(name)) err(where, `"${name}" isn't a quest.${hint(name, quests)}`);
}
function needTier(where, tier) {
  if (!TIERS.includes(tier)) err(where, `tier "${tier}" doesn't exist; use one of ${TIERS.join(", ")}.`);
}
function needSkills(where, obj, extra = []) {
  for (const k of Object.keys(obj ?? {})) {
    if (!skills.has(k) && !extra.includes(k)) err(where, `"${k}" isn't a skill.${hint(k, [...skills, ...extra])}`);
  }
}
// A boss or monster: a combat achievement monster or a collection log page.
function needMonster(where, name) {
  if (!monsters.includes(name) && !isPage(name)) err(where, `"${name}" isn't a boss in the combat achievements or collection log.${hint(name, [...monsters, ...pages])}`);
}

/**
 * A pattern must match at least one name. For patterns like /^(A|B|C)$/ each choice is checked
 * on its own too, so one misspelt name among many is still caught.
 */
function needMatches(where, re, names) {
  if (!names.some((n) => re.test(n))) {
    err(where, `${re} matches nothing.`);
    return;
  }
  for (const alt of alternatives(re)) {
    if (!names.some((n) => alt.re.test(n))) err(where, `"${alt.text}" in ${re} matches nothing.${hint(alt.text.replace(/[$^\\]/g, ""), names)}`);
  }
}

// ---- Tiers ------------------------------------------------------------------------------
for (const [k, v] of Object.entries(KB.PAGE_EFFORT)) { needPage(`PAGE_EFFORT`, k); needTier(`PAGE_EFFORT "${k}"`, v); }
for (const [k, v] of Object.entries(KB.MONSTER_EFFORT)) { needMonster(`MONSTER_EFFORT`, k); needTier(`MONSTER_EFFORT "${k}"`, v); }
for (const [k, v] of Object.entries(KB.ITEM_EFFORT)) {
  needItem(`ITEM_EFFORT`, k);
  needTier(`ITEM_EFFORT "${k}"`, v?.effort);
  if (!v?.why) warn(`ITEM_EFFORT "${k}"`, "has no `why`, so the card won't say why it has this tier.");
}
for (const k of Object.keys(KB.EFFORT_HOURS)) if (!["Quick", "Medium"].includes(k)) err("EFFORT_HOURS", `"${k}" should be Quick or Medium.`);
for (const k of Object.keys(KB.SLAYER_EFFORT_MINUTES)) if (!["Quick", "Medium"].includes(k)) err("SLAYER_EFFORT_MINUTES", `"${k}" should be Quick or Medium.`);

// ---- Tables keyed by collection log page -------------------------------------------------
for (const k of Object.keys(KB.CLOG_EASE)) needPage("CLOG_EASE", k);
for (const k of Object.keys(KB.CLUE_PAGE_BASE)) needPage("CLUE_PAGE_BASE", k);
for (const k of Object.keys(KB.MINUTES_PER_ATTEMPT)) needPage("MINUTES_PER_ATTEMPT", k);
for (const k of KB.WILDERNESS_PAGES) needPage("WILDERNESS_PAGES", k);
for (const k of KB.WILDERNESS_MONSTERS) needMonster("WILDERNESS_MONSTERS", k);
for (const k of Object.keys(KB.TAB_MINUTES)) if (!tabs.includes(k)) err("TAB_MINUTES", `"${k}" isn't a collection log tab (${tabs.join(", ")}).`);
const dropSources = new Set(Object.values(drops.items).flatMap((rows) => rows.map((r) => r.from)));
for (const [k, v] of Object.entries(KB.SOURCE_RULES)) {
  if (v.page) needPage(`SOURCE_RULES "${k}"`, v.page);
  if (!dropSources.has(k)) warn("SOURCE_RULES", `no drop in drop-rates.json comes from "${k}", so this rule does nothing.`);
}

// ---- Patterns tested against item names ----------------------------------------------------
KB.RARE_ITEMS.forEach((r, i) => needMatches(`RARE_ITEMS[${i}]`, r.match, items));
KB.KC_REWARDS.forEach((re, i) => needMatches(`KC_REWARDS[${i}]`, re, items));
KB.PROTECTED_ITEMS.forEach((re, i) => needMatches(`PROTECTED_ITEMS[${i}]`, re, items));
for (const r of KB.RARE_ITEMS) if (!["rare", "very rare"].includes(r.band)) err("RARE_ITEMS", `band "${r.band}" should be "rare" or "very rare".`);

// ---- Quests, diaries and requirements -----------------------------------------------------
for (const [k, q] of Object.entries(KB.QUESTS)) { needQuest("QUESTS", k); needSkills(`QUESTS "${k}"`, q.reqs); }
for (const [k, q] of Object.entries(KB.QUEST_PREREQS)) {
  needQuest("QUEST_PREREQS", k);
  for (const p of q.quests ?? []) needQuest(`QUEST_PREREQS "${k}"`, p);
}
for (const k of Object.keys(KB.DIARIES)) if (!diaries.has(k)) err("DIARIES", `"${k}" isn't a diary region.${hint(k, diaries)}`);
for (const [region, tiers] of Object.entries(KB.DIARY_REQS)) {
  if (!diaries.has(region)) err("DIARY_REQS", `"${region}" isn't a diary region.${hint(region, diaries)}`);
  for (const [tier, req] of Object.entries(tiers)) {
    const where = `DIARY_REQS ${region} ${tier}`;
    if (!DIARY_TIERS.includes(tier)) err(where, `tier should be one of ${DIARY_TIERS.join(", ")}.`);
    needSkills(where, req.skills, ["combat", "questPoints"]);
    for (const q of req.quests ?? []) needQuest(where, q);
  }
}
for (const t of Object.keys(KB.DIARY_TIER_TOTAL)) if (!DIARY_TIERS.includes(t)) err("DIARY_TIER_TOTAL", `"${t}" isn't a diary tier.`);
KB.CONTENT_REQS.forEach((r, i) => {
  const where = `CONTENT_REQS[${i}]`;
  needMatches(where, r.match, [...pages, ...monsters]);
  for (const q of r.quests ?? []) needQuest(where, q);
  needSkills(where, r.skills);
});

// ---- Account types ----------------------------------------------------------------------------
for (const [q, r] of Object.entries(KB.IRON_PRIORITIES?.quests ?? {})) {
  needQuest("IRON_PRIORITIES.quests", q);
  if (!(r.boost > 0) || !r.why) err(`IRON_PRIORITIES.quests "${q}"`, "needs a boost above 0 and a why.");
}
for (const [region, r] of Object.entries(KB.IRON_PRIORITIES?.diaries ?? {})) {
  if (!diaries.has(region)) err("IRON_PRIORITIES.diaries", `"${region}" isn't a diary region.${hint(region, diaries)}`);
  if (!(r.boost > 0) || !r.why) err(`IRON_PRIORITIES.diaries "${region}"`, "needs a boost above 0 and a why.");
}
for (const p of KB.TEAM_PAGES ?? []) needPage("TEAM_PAGES", p);

// ---- XP rates ---------------------------------------------------------------------------------
needSkills("XP_RATES", KB.XP_RATES);
for (const [skill, bands] of Object.entries(KB.XP_RATES ?? {})) {
  let last = 0;
  for (const band of bands) {
    const [from, low, high, method] = band;
    const where = `XP_RATES.${skill} [${from}]`;
    if (band.length !== 4 || !Number.isInteger(from) || from < 1 || from > 99) err(where, "each band is [from level 1-99, low XP/h, high XP/h, method].");
    if (from <= last) err(where, "bands must be in rising level order.");
    if (!(low > 0) || !(high >= low)) err(where, "needs 0 < low <= high.");
    // Nothing trains faster than ~1.2M XP/h without a lamp; a bigger figure is a typo (extra 0).
    if (high > 1.2e6) err(where, `${high.toLocaleString()} XP/h looks like a typo.`);
    if (typeof method !== "string" || !method) err(where, "needs the method's name (shown on the card).");
    last = from;
  }
}

// ---- Slayer ---------------------------------------------------------------------------------
for (const [task, bosses] of Object.entries(KB.SLAYER_BOSSES)) {
  for (const b of bosses) { needMonster(`SLAYER_BOSSES "${task}"`, b.name); needSkills(`SLAYER_BOSSES "${task}"`, b.skills); }
}
for (const [k, v] of Object.entries(KB.SLAYER_KILLS_PER_HOUR)) {
  if (k !== k.toLowerCase()) err("SLAYER_KILLS_PER_HOUR", `"${k}" must be lower case (tasks are looked up in lower case).`);
  if (!(v > 0)) err("SLAYER_KILLS_PER_HOUR", `"${k}" needs a number of kills per hour above 0.`);
}
for (const k of Object.keys(KB.SLAYER_BOSSES)) if (k !== k.toLowerCase()) err("SLAYER_BOSSES", `"${k}" must be lower case.`);

// ---- Hand quest tables vs the wiki snapshot (web/data/quest-reqs.json) -----------------------
// The snapshot wins wherever it has a quest, so a hand entry that disagrees with it is either out
// of date or a typo. Hand lists may name a prerequisite further down the chain; that's fine.
const wiki = questReqs?.quests ?? {};
const chain = (q, out = new Set()) => {
  for (const p of wiki[q]?.quests ?? []) if (!out.has(p)) { out.add(p); chain(p, out); }
  return out;
};
for (const [k, q] of Object.entries(KB.QUESTS)) {
  const w = wiki[k];
  if (!w) { warn("quest-reqs.json", `has no entry for "${k}" (QUESTS); re-run scripts/update-quest-reqs.mjs.`); continue; }
  for (const [s, lvl] of Object.entries(q.reqs ?? {})) {
    const wl = s === "combat" ? w.combat : w.skills?.[s];
    if (wl !== lvl) warn(`QUESTS "${k}"`, `${lvl} ${s} here, ${wl ? `${wl} on the wiki` : "not needed on the wiki"}. The wiki's figure is used.`);
  }
}
for (const [k, q] of Object.entries(KB.QUEST_PREREQS)) {
  if (!wiki[k]) continue;
  const all = chain(k);
  for (const p of q.quests ?? []) if (!all.has(p)) warn(`QUEST_PREREQS "${k}"`, `needs "${p}" here, but the wiki doesn't list it anywhere in the chain.`);
  if ((q.questPoints ?? 0) !== (wiki[k].questPoints ?? 0)) warn(`QUEST_PREREQS "${k}"`, `${q.questPoints ?? 0} quest points here, ${wiki[k].questPoints ?? 0} on the wiki.`);
}
for (const [region, tiers] of Object.entries(KB.DIARY_REQS)) {
  for (const [tier, req] of Object.entries(tiers)) {
    for (const q of req.quests ?? []) if (Object.keys(wiki).length && !wiki[q]) warn(`DIARY_REQS ${region} ${tier}`, `"${q}" has no entry in quest-reqs.json, so the planner can't follow its chain.`);
  }
}

// ---- Drop rates coverage (information only) -------------------------------------------------
const covered = new Set([...Object.keys(drops.items), ...(drops.noDrops ?? [])].map((n) => n.toLowerCase()));
const uncovered = items.filter((n) => !covered.has(n.toLowerCase()));
if (uncovered.length) {
  warn("drop-rates.json", `${uncovered.length} collection log items have no drop data, so their tier comes from the hand rules only `
    + `(e.g. ${uncovered.slice(0, 3).map((n) => `"${n}"`).join(", ")}). Normal for points-shop and guaranteed rewards; `
    + "run scripts/Update-DropRates.ps1 after a game update to fill in new items.");
}

return { errors, warnings };
}

// ---- Report (when run from the command line) ---------------------------------------------
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const KB = await import("../web/knowledge-base.js");
  const game = loadGameNames();
  const { errors, warnings } = checkKnowledgeBase(KB, game);
  for (const w of warnings) console.log(`warning  ${w}`);
  for (const e of errors) console.log(`ERROR    ${e}`);
  console.log(errors.length
    ? `\n${errors.length} error(s) in web/knowledge-base.js. The website ignores these entries until they're fixed.`
    : `knowledge-base.js looks good (${warnings.length} warning(s)). Checked against game names from ${game.generated}.`);
  process.exit(errors.length ? 1 : 0);
}
