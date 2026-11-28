// OSRS TaskMaster recommendation engine.
// Pure functions: (snapshot, goals, options) -> ranked suggestions. No network access.
//
// How a suggestion is made (docs/how-suggestions-work.md explains this in more detail):
//   1. Generate: each "candidate generator" (levels, quests, diaries, combat, collection log, pets)
//      turns the snapshot into possible suggestions, each with a base score and an effort tier.
//   2. Filter:   opt-in content (minigames, Wilderness, clues) that's switched off, and content
//      you can't access yet (see CONTENT_REQS), is removed.
//   3. Score:    each suggestion that moves one of your goals forward gets +25 per goal.
//   4. Pick:     pickThree / pickMix / pickChallenge choose varied cards from the sorted list.
//
// Sections below, in order: drop rates, quest requirements, XP table, derived facts about the
// account, candidate generators, Slayer task, completion badges, items, goals, progress marked by
// hand, Within reach, Since last time, ranking, missing sections and impossible values, account
// type, picking, route planner.
// Game facts and tuning numbers live in knowledge-base.js, not here.

import {
  SKILLS, MILESTONES, QUESTS, DIARIES, DIARY_TIER_TOTAL,
  CA_TIER_POINTS, CA_TIERS, CLOG_EASE, RARE_ITEMS,
  PAGE_EFFORT, MONSTER_EFFORT, PROTECTED_ITEMS, CLUE_PAGE_BASE, KC_REWARDS,
  WILDERNESS_PAGES, WILDERNESS_MONSTERS, CONTENT_REQS, SLAYER_BOSSES,
  SLAYER_KILLS_PER_HOUR, SLAYER_DEFAULT_KILLS_PER_HOUR, SLAYER_EFFORT_MINUTES,
  MINUTES_PER_ATTEMPT, TAB_MINUTES, EFFORT_HOURS, EFFORT_FALLBACK_HOURS, SOURCE_RULES, ITEM_EFFORT,
  QUEST_PREREQS, DIARY_REQS, IRON_PRIORITIES, GROUP_CONTENT_BOOST, TEAM_PAGES, XP_RATES,
} from "./knowledge-base.js";

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

// ---- Quest requirements -----------------------------------------------------------------
let QUEST_REQS = {};
/** Load the wiki snapshot (web/data/quest-reqs.json) once at startup. */
export function setQuestReqs(data) {
  QUEST_REQS = data?.quests ?? {};
}

/**
 * Everything a quest needs: { skills (incl. combat), quests, questPoints, other, known }.
 * The wiki snapshot covers every quest and miniquest; the hand tables (QUESTS, QUEST_PREREQS) are
 * the fallback when it isn't loaded. `known` is false when neither has the quest.
 */
export function questRequirements(name) {
  const w = QUEST_REQS[name];
  if (w) {
    const skills = { ...(w.skills ?? {}) };
    if (w.combat) skills.combat = w.combat;
    return { skills, quests: w.quests ?? [], questPoints: w.questPoints ?? 0, other: w.other ?? [], known: true };
  }
  const known = !!(QUESTS[name] || QUEST_PREREQS[name]);
  return { skills: { ...(QUESTS[name]?.reqs ?? {}) }, quests: QUEST_PREREQS[name]?.quests ?? [], questPoints: QUEST_PREREQS[name]?.questPoints ?? 0, other: [], known };
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
/**
 * The best chance per attempt of getting `item` for the activity behind collection log `page`.
 * Prefers sources that match the page ("Callisto" for "Callisto and Artio"); otherwise the best
 * source anywhere, since players farm the easiest one. Returns { p, from, rarity } or null.
 */
function dropChance(itemName, page) {
  // "Always" rows are rewards or follow-up mechanics, not the drop you grind for; guaranteed
  // rewards are handled by the hand rules in knowledge-base.js instead.
  const rows = (DROP_RATES[String(itemName).toLowerCase()] ?? []).filter((r) => r.p > 0 && r.p < 1);
  if (!rows.length) return null;
  const pg = norm(page);
  // A source belongs to the page if one name contains the other ("Callisto" / "Callisto and
  // Artio") or a rule in knowledge-base.js links them ("Unsired" -> "Abyssal Sire").
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
/**
 * Effort from an XP gap alone, for skills without XP_RATES: a level target below 99, or an XP
 * milestone past it (where the same XP is a smaller share of the journey).
 */
const xpGapEffort = (gap, past99 = false) =>
  gap < (past99 ? 500e3 : 150e3) ? "Quick" : gap < (past99 ? 3e6 : 1.5e6) ? "Medium" : "Long";
/** A diary tier's effort: Easy is a quick win, Medium a session or two, Hard and Elite long hauls. */
const DIARY_TIER_EFFORT = { easy: "Quick", medium: "Medium", hard: "Long", elite: "Long" };

/** "very rare", "rare" or null for a collection log item name. */
function rarity(name) {
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

/**
 * Rough time from `xp` to `targetXp` in a skill, from the wiki guide rates in XP_RATES:
 * { low, high, methods } in hours (low = at the top of each band's range), or null when the skill
 * has no rates or `xp` is below its first band.
 */
export function levelHours(skill, xp, targetXp) {
  const bands = XP_RATES[skill];
  if (!bands || !(targetXp > xp) || xp < xpForLevel(bands[0][0])) return null;
  let low = 0, high = 0;
  const methods = [];
  bands.forEach(([from, slow, fast, method], i) => {
    const start = xpForLevel(from);
    const end = i + 1 < bands.length ? xpForLevel(bands[i + 1][0]) : Infinity;
    const gained = Math.min(targetXp, end) - Math.max(xp, start);
    if (gained <= 0) return;
    low += gained / fast;
    high += gained / slow;
    if (!methods.includes(method)) methods.push(method);
  });
  return { low, high, methods };
}

/** "under an hour", "about 3 hours", "about 12–18 hours". */
export function hoursRangeText({ low, high }) {
  const r = (h) => (h < 10 ? Math.round(h) : Math.round(h / 5) * 5);
  if (high < 1) return "under an hour";
  const a = Math.max(1, r(low)), b = Math.max(1, r(high));
  return a === b ? `about ${a.toLocaleString()} hour${a === 1 ? "" : "s"}` : `about ${a.toLocaleString()}–${b.toLocaleString()} hours`;
}

/** What a level card adds from levelHours: { hours, detail, why }, or null. */
function levelTime(skill, xp, targetXp) {
  const t = levelHours(skill, xp, targetXp);
  if (!t) return null;
  return {
    hours: t,
    detail: ` ${cap(hoursRangeText(t))}.`,
    why: `Time based on ${t.methods.join(", then ")}, at the OSRS Wiki training guide's rates`,
  };
}

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
      const time = levelTime(skill, xp, target);
      out.push({
        id: `xp:${skill}:${target}`,
        category: "levels",
        title: `Push ${cap(skill)} to ${fmt(target)} XP`,
        detail: `${fmt(xp)} → ${fmt(target)}: ${fmt(target - xp)} XP to go.${time?.detail ?? ""}`,
        why: [allMaxed ? "You're maxed, so XP milestones are the next frontier" : "Already 99; keep the XP climbing",
          target === 200e6 ? "200M is the hard cap" : null, time?.why].filter(Boolean),
        progress: (xp - prev) / (target - prev),
        effort: time ? hoursToEffort((time.hours.low + time.hours.high) / 2) : xpGapEffort(target - xp, true),
        base: allMaxed ? 30 - Math.log10(Math.max(1, xp)) : 5,
        meta: { skill, xpTarget: target, hours: time?.hours ?? null },
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
    const base = 30 + (blocks.length ? 25 : 0) + Math.max(0, avg - cur) * 0.8 + (target === 99 && progress > 0.6 ? 20 : 0);
    const time = levelTime(skill, xp, xpForLevel(target));
    // The time sets the tier when the skill has rates (1M Prayer XP is quicker than 1M Agility XP);
    // otherwise the XP gap does.
    const effort = time ? hoursToEffort((time.hours.low + time.hours.high) / 2) : xpGapEffort(xpGap);
    if (!why.length) why.push("Steady progress toward your next milestone");
    if (time) why.push(time.why);
    out.push({
      id: `lvl:${skill}:${target}`,
      category: "levels",
      title: `Train ${cap(skill)} to ${target}`,
      detail: `${cur} → ${target}: ${fmt(xpGap)} XP to go.${time?.detail ?? ""}`,
      why,
      progress, effort, base,
      meta: { skill, target, hours: time?.hours ?? null },
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
    const questInfo = QUESTS[q.name];
    const missing = questInfo ? a.missingReqs(questInfo.reqs) : [];
    const inProgress = q.state === "IN_PROGRESS";
    // Keep the list focused on notable or started quests, unless only a handful are left.
    if (!questInfo && !inProgress && !nearCape) continue;
    const why = [];
    if (questInfo) why.push(questInfo.why);
    if (inProgress) why.push("You've already started it");
    if (nearCape) why.push(`One of your last ${unfinished.length} unfinished quests and miniquests`);
    if (questInfo?.note) why.push(questInfo.note);
    let base = (questInfo?.weight ?? 3) * 5 + (inProgress ? 18 : 0) + (nearCape ? 12 : 0);
    let detail;
    if (missing.length === 0) {
      detail = questInfo ? "You meet the main skill requirements." : inProgress ? "Pick up where you left off." : "Not started yet.";
      base += 20;
    } else {
      const gap = missing.reduce((s, m) => s + (m.level - m.have), 0);
      detail = "Needs " + missing.map((m) => `${m.level} ${cap(m.skill)} (you: ${m.have})`).join(", ") + ".";
      base -= Math.min(40, gap * 1.5);
    }
    const reqCount = questInfo ? Object.keys(questInfo.reqs).length : 0;
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
    const diaryInfo = DIARIES[region] ?? { reward: "diary reward", weight: 5, highlight: "" };
    const idx = DIARY_TIERS.indexOf(next);
    const reach = a.total >= DIARY_TIER_TOTAL[next];
    const why = [`${diaryInfo.reward} ${idx + 1}: ${diaryInfo.highlight}`];
    if (!reach) why.push(`Usually comfortable around ${DIARY_TIER_TOTAL[next]} total level (you: ${a.total})`);
    out.push({
      id: `diary:${region}:${next}`,
      category: "diaries",
      title: `${region} ${cap(next)} diary`,
      detail: `${idx} of 4 tiers done. Open the diary in-game for the exact task list.`,
      why,
      progress: idx / 4,
      counter: `${idx}/4 tiers`,
      effort: DIARY_TIER_EFFORT[next],
      base: diaryInfo.weight * 4 + (reach ? 25 : -15) + (3 - idx) * 6,
      meta: { region, tier: next },
    });
  }
  return out;
}

/** "409 more points until the Master reward tier", or null once every tier is reached. */
const caNextLine = (a) => (a.caNext ? `${a.caNext.gap} more points until the ${a.caNext.tier} reward tier` : null);

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
  // Bundles: "finish every Easy task at Royal Titans", one tier harder than a single task.
  const bundles = {};
  for (const t of tasks) (bundles[`${t.monster}|${t.tier}`] ??= []).push(t);
  for (const [key, list] of Object.entries(bundles)) {
    if (list.length < 2) continue; // a single task is already its own suggestion
    const [monster, tier] = key.split("|");
    if (monster === "Other") continue;
    const all = ca.tasks.filter((t) => t.monster === monster && t.tier === tier);
    const doneHere = all.length - list.length;
    const tierIdx = CA_TIERS.indexOf(tier);
    const taskEffort = tierIdx <= 1 ? 0 : tierIdx <= 3 ? 1 : 2;
    const pts = list.reduce((s, t) => s + (CA_TIER_POINTS[t.tier] ?? 1), 0);
    out.push({
      id: `cabundle:${key}`,
      category: "combat",
      title: `Finish every ${tier} task at ${monster}`,
      // Task names are titles ("Let them fight"), so quote them to keep a list of them readable.
      detail: "Tasks: " + list.slice(0, 3).map((t) => `“${t.name}”`).join(", ") + (list.length > 3 ? ` and ${list.length - 3} more` : ""),
      why: [`${list.length} tasks, worth ${pts} points together`, caNextLine(a)].filter(Boolean),
      progress: doneHere / all.length,
      counter: `${doneHere}/${all.length} tasks`,
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
    const kills = killCountOf(snap, t.monster);
    const why = [`${/^[AEIOU]/.test(t.tier) ? "An" : "A"} ${t.tier} task, worth ${pts} point${pts > 1 ? "s" : ""}`];
    if (a.caNext) why.push(caNextLine(a));
    // Kill-count tasks ("Kill Vorkath 50 times") track kills; any other task shows how much of
    // its tier is done, so the bar always says what it measures.
    const kp = caKillProgress(t, snap);
    if (kills != null && !kp) why.push(`You already have ${fmt(kills)} kills here`);
    const bar = kp ? killBar(kp)
      : tierStats?.total ? { progress: tierStats.done / tierStats.total, counter: `${tierStats.done}/${tierStats.total} ${t.tier} tasks` }
      : { progress: null };
    // Kill-count tasks: time for the kills left, and the tier is the harder of the task's tier and
    // that time (50 Vorkath kills isn't a quick win just because the task is Medium).
    const tierEffort = tierIdx <= 1 ? "Quick" : tierIdx <= 3 ? "Medium" : "Long";
    const est = kp ? killHours(kp, t.monster, snap) : null;
    if (est) why.push(est.line);
    const effort = MONSTER_EFFORT[t.monster]
      ?? (est ? EFFORTS[Math.max(EFFORTS.indexOf(tierEffort), EFFORTS.indexOf(hoursToEffort(est.hours)))] : tierEffort);
    out.push({
      id: `ca:${t.id}`,
      category: "combat",
      title: `${t.name}`,
      detail: `${t.monster === "Other" ? "" : `${t.monster}: `}${t.description}`,
      why,
      ...bar,
      effort,
      group: t.monster,
      base: 40 + pts * 2 - tierIdx * 9 + (kills != null ? 10 : 0) + (t.monster === "Other" ? -10 : 0),
      meta: { monster: t.monster, tier: t.tier, task: t.id, taskName: t.name },
    });
  }
  return out;
}

/** The synced kill count for a boss or monster (any capitalisation), or null if not synced. */
function killCountOf(snap, monster) {
  const kc = snap.killCounts ?? {};
  const key = Object.keys(kc).find((k) => k.toLowerCase() === String(monster ?? "").toLowerCase());
  return key ? kc[key] : null;
}

// Tasks that need N kills within one trip, in a row, or under conditions aren't counted by the
// overall kill count, so they get no kill bar.
const NOT_CUMULATIVE = /\b(in (one|a single) (trip|run|kill|attempt)|in a row|without|in under|within|at once|before|while|using only|solo)\b/i;

/**
 * For a combat achievement that asks for a number of kills ("Kill Vorkath 50 times"):
 * { need, have }, where `have` is the synced kill count or null when it hasn't synced.
 * Null for any other kind of task.
 */
export function caKillProgress(task, snap) {
  const d = String(task?.description ?? "");
  if (!/\b(kill|defeat|complete|subdue|finish|loot)\b/i.test(d) || NOT_CUMULATIVE.test(d)) return null;
  const m = d.match(/\b(\d[\d,]*)\s+times\b/i);
  const need = m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
  if (!need || need < 2) return null;
  return { need, have: killCountOf(snap, task.monster) };
}

/** "under an hour", "1 hour", "12 hours". */
const hoursText = (h) => (h < 1 ? "under an hour" : `${Math.round(h)} hour${Math.round(h) === 1 ? "" : "s"}`);

/**
 * Rough time for the kills a kill-count task still needs: kills left x minutes per kill, from
 * MINUTES_PER_ATTEMPT (or the boss's collection log tab). Null when there's nothing to go on or
 * the kills are done. { hours, line }.
 */
function killHours({ need, have }, monster, snap) {
  const tab = snap.collectionLog?.pages?.[monster]?.tab;
  const minutes = MINUTES_PER_ATTEMPT[monster] ?? (tab ? TAB_MINUTES[tab] : null);
  if (!minutes) return null;
  const left = have == null ? need : need - have;
  if (left <= 0) return null;
  const hours = left * minutes / 60;
  const each = minutes >= 1 ? `${minutes} min` : `${Math.round(minutes * 60)} s`;
  return { hours, line: `About ${hoursText(hours)} for the ${left.toLocaleString()} kill${left === 1 ? "" : "s"} ${have == null ? "needed" : "left"} (${each} each)` };
}

/** Bar and counter for a kill-count task. */
function killBar({ need, have }) {
  if (have == null) return { progress: 0, counter: `?/${need} kills`, counterTip: "Kill count not synced yet. Check it in-game, or sync after your next kill." };
  return {
    progress: Math.min(1, have / need),
    counter: `${Math.min(have, need).toLocaleString()}/${need.toLocaleString()} kills`,
    counterTip: have >= need ? `${have.toLocaleString()} kills: past the target, so sync again (or mark it done) once it shows complete in-game.` : `${(need - have).toLocaleString()} kills to go`,
  };
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
 * and still miss more than CHALLENGE_MIN_MISSING items that are each a Long haul get it (a whole raid log can be thousands of completions). Challenges never show
 * under any grind style or in Mixed: the page offers one on its own, apart from the regular picks.
 */
export const CHALLENGE = "Challenge";
const CHALLENGE_MIN_MISSING = 4;

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

/**
 * Rough hours to get one collection log item, for ordering cards under "Fastest logs first": the
 * wiki drop rate when there is one, otherwise a typical time for its tier (EFFORT_FALLBACK_HOURS).
 * Where a hand rule sets the effort because the raw rate understates the grind (superior drops,
 * raids, team content, duplicate protection), the estimate is at least that tier's lower limit.
 */
function itemHours(item, page, tab, effort) {
  const chance = tab === "Clues" || tab === "Minigames" ? null : dropChance(item.name, page);
  const forced = ITEM_EFFORT_LC[String(item.name).toLowerCase()] || PAGE_EFFORT[page] || tab === "Raids"
    || PROTECTED_ITEMS.some((re) => re.test(item.name));
  const tier = effort === CHALLENGE ? "Long" : effort;
  if (!chance) return EFFORT_FALLBACK_HOURS[tier] ?? EFFORT_FALLBACK_HOURS.Medium;
  const h = expectedHours(chance, page, tab);
  return forced ? Math.max(h, tierFloor(effort)) : h;
}
/** The fewest hours a suggestion in effort tier `effort` can take (EFFORT_HOURS). */
const tierFloor = (effort) => ({ Medium: EFFORT_HOURS.Quick, Long: EFFORT_HOURS.Medium, [CHALLENGE]: EFFORT_HOURS.Medium }[effort] ?? 0);
/**
 * `{ hours, hoursRaw }` for a card: the estimate shown is never below its tier's floor (a log
 * that's a Long haul because it has many slots shouldn't read "under 1 h"); the raw estimate
 * still orders cards that share the floor.
 */
const timeFields = (h, effort) => ({ hours: Math.max(h, tierFloor(effort)), hoursRaw: h });

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
    // Challenge: a Long haul log where more than CHALLENGE_MIN_MISSING of the missing items are each a
    // Long haul themselves (raids, Barrows, Nex). Logs that are long only because they're big
    // (Easy clues, Random Events) stay Long haul.
    const longMissing = missing.filter((i) => effortOf(i) === "Long").length;
    const pageEffort = usual === "Long" && longMissing > CHALLENGE_MIN_MISSING ? CHALLENGE : usual;
    const rares = missing.filter((i) => rarity(i.name));
    const hoursOf = (i) => itemHours(i, name, p.tab, effortOf(i));
    out.push({
      id: `clogpage:${name}`,
      category: "clog",
      title: `Complete ${theLog(name)}`,
      detail: `${shownGot}/${p.items.length} slots. Missing: ${missing.slice(0, 4).map((i) => i.name).join(", ")}${missing.length > 4 ? ` and ${missing.length - 4} more` : ""}${petMissing > 0 ? " (plus the pet)" : ""}.`,
      why: [
        missing.length === 1 ? "One slot from a green log" : `${missing.length} slots from a green log`,
        rares.length ? `Includes ${rares.length > 1 ? "rare drops" : "a rare drop"}: ${rares.slice(0, 2).map((i) => i.name).join(", ")}` : null,
        `In the ${p.tab} tab of the collection log`,
      ].filter(Boolean),
      progress: ratio, counter: `${shownGot}/${p.items.length}`,
      effort: pageEffort,
      // Every missing slot, one after another (a rough upper bound: drops overlap in practice).
      ...timeFields(missing.reduce((n, i) => n + hoursOf(i), 0), pageEffort),
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
        progress: ratio, counter: `${shownGot}/${p.items.length}`,
        effort,
        ...timeFields(Math.min(...fam.items.map(hoursOf)), effort), // any one of them counts
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
        why.push(`${chance.rarity} from ${chance.from}: about ${hoursText(h)} on average`);
      } else if (band) why.push(`A ${band} drop: plan for a long haul`);
      else if (ease >= 6) why.push(`${name} is one of the quicker logs to fill`);
      why.push(progressLine);
      out.push({
        id: `clog:${item.id}`,
        category: "clog",
        title: `Get ${item.name}`,
        detail: `From ${/^the /i.test(name) ? name : `the ${name}`} collection log page (${p.tab} tab).`,
        why,
        progress: ratio, counter: `${shownGot}/${p.items.length}`,
        effort: kc && rank > 0 ? "Long" : effortOf(item),
        // Later kill-count ranks need that many more completions again.
        ...timeFields(kc ? EFFORT_FALLBACK_HOURS[rank ? "Long" : effortOf(item)] * (1 + rank) : hoursOf(item), kc && rank > 0 ? "Long" : effortOf(item)),
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
  const out = [];
  for (const pet of pets) {
    if (pet.owned) continue;
    const page = pet.source ? pages[pet.source] : null;
    // Pets from content you've otherwise finished rank higher: you're likely farming it anyway.
    const others = page ? page.items.filter((i) => i.id !== pet.id) : [];
    const otherRatio = others.length ? others.filter((i) => i.quantity > 0).length / others.length : 0;
    const kills = pet.source ? killCountOf(snap, pet.source) : null;
    const why = ["Pets are rare drops: plan for a long haul"];
    if (page && otherRatio === 1) why.push(`It's the last slot on your ${pet.source} log`);
    else if (page && otherRatio >= 0.5) why.push(`You have ${Math.round(otherRatio * 100)}% of the rest of that log`);
    if (kills != null) why.push(`${kills} kills so far`);
    out.push({
      id: `pet:${pet.id}`,
      category: "pets",
      title: `Hunt ${pet.name}`,
      detail: pet.source ? `Drops from ${pet.source === "Skilling Pets" ? "skilling" : pet.source}.` : "Source page not synced.",
      why,
      progress: null,
      effort: "Long",
      ...timeFields(itemHours(pet, pet.source ?? "", page?.tab, "Long"), "Long"),
      base: 14 + otherRatio * 18 + (kills != null ? 4 : 0),
      meta: { pet: pet.name, page: pet.source },
    });
  }
  return out;
}

// ---- Slayer task -----------------------------------------------------------------------

/** "under 5 minutes", "40 minutes", "1 h 45 min", rounded to 5 minutes. */
function fmtMinutes(m) {
  if (m < 5) return "under 5 minutes";
  const r = Math.round(m / 5) * 5;
  if (r < 60) return `${r} minutes`;
  const h = Math.floor(r / 60), min = r % 60;
  return min ? `${h} h ${min} min` : `${h} hour${h > 1 ? "s" : ""}`;
}

/**
 * The Slayer assignment the player has right now, as a standalone card (never one of the regular
 * picks): { title, detail, why, progress, effort, task, stored, wilderness } or null without a task.
 * Ties the task to unfinished combat achievements and collection log pages for the same monster.
 */
export function slayerTask(snap, goals = []) {
  const s = snap.slayer;
  const t = s?.task;
  // Name and amount are only known once the player has opened the Slayer rewards interface.
  const stored = s?.storage?.unlocked && s.storage.raw
    ? { name: s.storage.name ?? null, amount: s.storage.amount ?? null } : null;
  if (!t?.name || !(t.remaining > 0)) return stored ? { task: null, stored } : null;

  const done = Math.max(0, (t.initial ?? t.remaining) - t.remaining);
  const total = Math.max(t.initial ?? t.remaining, t.remaining);
  // "Abyssal demons" -> "abyssal demon", so it matches "Abyssal demon" pages and CA monsters.
  // Both sides are singularised the same way, so "Cerberus" still equals "Cerberus".
  const single = (x) => norm(x).replace(/ies$/, "y").replace(/(?<!s)s$/, "");
  const stem = single(t.name);
  const related = (name) => {
    const n = single(name);
    return n && (n === stem || n.includes(stem) || (n.length > 3 && stem.includes(n)));
  };

  const why = [];
  const cas = (snap.combatAchievements?.tasks ?? []).filter((c) => !c.done && c.monster !== "Other" && related(c.monster));
  if (cas.length) why.push(`${cas.length} unfinished combat achievement${cas.length > 1 ? "s" : ""} here: ${cas.slice(0, 2).map((c) => c.name).join(", ")}${cas.length > 2 ? "…" : ""}`);
  const pages = Object.entries(snap.collectionLog?.pages ?? {}).filter(([name, p]) => related(name) && p.items.some((i) => !(i.quantity > 0)));
  for (const [name, p] of pages.slice(0, 2)) {
    const missing = p.items.filter((i) => !(i.quantity > 0)).length;
    why.push(`${missing} slot${missing > 1 ? "s" : ""} still open on ${theLog(name)}`);
  }
  const lvl = snap.skills?.slayer?.level ?? 1;
  const goal = goals.find((g) => (g.type === "skill" && g.skill === "slayer" && lvl < g.level) || (g.type === "xp" && g.skill === "slayer"));
  if (goal) why.push(`Moves your goal "${goalTitle(goal)}" forward`);
  if (s.streak) why.push(`${s.streak}-task streak${s.points != null ? ` · ${fmt(s.points)} Slayer points` : ""}`);

  const perHour = SLAYER_KILLS_PER_HOUR[String(t.name).toLowerCase()]
    ?? (t.boss ? SLAYER_DEFAULT_KILLS_PER_HOUR.boss : SLAYER_DEFAULT_KILLS_PER_HOUR.task);
  const minutesLeft = (t.remaining / perHour) * 60;

  // Bosses that also count for this task, each with what still locks it (empty when open).
  const a = analyse(snap);
  const bosses = t.boss ? [] : (SLAYER_BOSSES[String(t.name).toLowerCase()] ?? []).map((b) => {
    const req = CONTENT_REQS.find((r) => r.match.test(b.name)) ?? {};
    const needs = [
      ...(req.quests ?? []).filter((q) => !a.done(q)),
      ...a.missingReqs({ ...req.skills, ...b.skills }).map((x) => `${x.level} ${cap(x.skill)}`),
    ];
    return { name: b.name, needs, wilderness: WILDERNESS_MONSTERS.has(b.name) };
  });

  return {
    task: t,
    bosses,
    title: `${t.boss ? "Slayer boss task" : "Slayer task"}: ${t.remaining} ${t.name} left`,
    detail: `${done}/${total} killed${t.location ? ` in ${t.location}` : ""}. About ${fmtMinutes(minutesLeft)} of killing left.`,
    why,
    progress: total ? done / total : null,
    minutesLeft,
    // By estimated time, not kill count: 150 Rockslugs is minutes, 150 Gargoyles over an hour.
    effort: minutesLeft <= SLAYER_EFFORT_MINUTES.Quick ? "Quick" : minutesLeft <= SLAYER_EFFORT_MINUTES.Medium ? "Medium" : "Long",
    wilderness: !!t.wilderness,
    stored,
    meta: { monster: t.name, skill: "slayer" },
  };
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

// ---- Showcase ------------------------------------------------------------------------------

// Clue casket rates are per reward roll, not per clue, so they'd look far rarer than boss drops.
const isCluePage = (page) => /Treasure Trails/i.test(page ?? "");

/**
 * Everything the player could show off next to their name: each owned collection log item and
 * pet once, as { id, name, pet, page, p, rarity }. `p` is the best chance per attempt from the
 * drop-rate snapshot, null when it has none or when it's a clue reward (see isCluePage).
 * Pets first, then rarest first, clue rewards last, then A–Z (the first is the picker's suggestion).
 */
function showcaseOptionsRaw(snap) {
  const pets = petInfo(snap).ids;
  const out = [];
  for (const i of itemIndex(snap).values()) {
    if (!i.owned) continue;
    const d = isCluePage(i.page) ? null : dropChance(i.name, i.page ?? "");
    out.push({ id: i.id, name: i.name, pet: pets.has(i.id), page: i.page ?? null, p: d?.p ?? null, rarity: d?.rarity ?? null, from: d?.from ?? null });
  }
  const rank = (o) => (o.p ?? (isCluePage(o.page) ? 3 : 2));
  return out.sort((a, b) => Number(b.pet) - Number(a.pet) || rank(a) - rank(b) || a.name.localeCompare(b.name));
}
export const showcaseOptions = memoBySnap(showcaseOptionsRaw);

/** What can go in the showcase, in the order the picker and the banner show them. */
export const SHOWCASE_KINDS = ["item", "boss", "quest", "skill"];
const BOSS_TABS = new Set(["Bosses", "Raids"]);

/**
 * Everything the player could pick for one showcase slot, as { key, name, detail, itemId?,
 * sprite?, ... }. `key` is what gets saved. Items: only ones they own. Bosses: boss and raid log
 * pages and anything with a kill count, most killed first. Quests: finished first. Skills: game order.
 */
function showcaseChoicesRaw(snap) {
  const kc = snap.killCounts ?? {};
  const pages = snap.collectionLog?.pages ?? {};
  const petByPage = {};
  for (const p of petInfo(snap).pets) if (p.source && !petByPage[p.source]) petByPage[p.source] = p.id;
  const bossNames = new Set([...Object.keys(pages).filter((n) => BOSS_TABS.has(pages[n].tab)), ...Object.keys(kc)]);
  const boss = [...bossNames].map((n) => ({
    key: n, name: n, kc: kc[n] ?? null,
    detail: kc[n] != null ? `${kc[n].toLocaleString()} KC` : "",
    // The boss's pet if it has one, otherwise the first item on its log page.
    itemId: petByPage[n] ?? pages[n]?.items?.[0]?.id ?? null,
  })).sort((a, b) => (b.kc ?? -1) - (a.kc ?? -1) || a.name.localeCompare(b.name));
  const quest = (snap.quests ?? []).map((q) => ({
    key: q.name, name: q.name, finished: q.state === "FINISHED", sprite: "cat-quests",
    detail: q.state === "FINISHED" ? "Finished" : q.state === "IN_PROGRESS" ? "In progress" : "Not started",
  })).sort((a, b) => Number(b.finished) - Number(a.finished) || a.name.localeCompare(b.name));
  const skill = SKILLS.filter((k) => snap.skills?.[k]).map((k) => ({
    key: k, name: cap(k), level: snap.skills[k].level, xp: snap.skills[k].xp ?? 0, sprite: `skill-${k}`,
    detail: `Level ${snap.skills[k].level}`,
  }));
  const item = showcaseOptions(snap).map((o) => ({ ...o, key: o.name, itemId: o.id }));
  return { item, boss, quest, skill };
}
const showcaseChoicesMemo = memoBySnap(showcaseChoicesRaw);
export const showcaseChoices = (snap, kind) => showcaseChoicesMemo(snap)[kind] ?? [];

/**
 * The player's picks, resolved against this profile: { item, boss, quest, skill }, each a choice
 * from showcaseChoices or null. Nothing is ever picked for them: an empty or unknown pick (an item
 * they don't own, a boss from another account) is simply not shown.
 */
export function showcasePicks(snap, saved) {
  const out = {};
  for (const kind of SHOWCASE_KINDS) {
    const want = String(saved?.[kind] ?? "").toLowerCase();
    out[kind] = (want && showcaseChoices(snap, kind).find((c) => c.key.toLowerCase() === want)) || null;
  }
  return out;
}

/**
 * The one choice the picker offers first for a slot, or null: the rarest pet (else rarest item),
 * the most-killed boss, the skill with the most XP. Quests have no obvious favourite.
 */
export function showcaseSuggestion(snap, kind) {
  const list = showcaseChoices(snap, kind);
  if (kind === "item") return list[0] ?? null;
  if (kind === "boss") return list.find((b) => b.kc > 0) ?? null;
  if (kind === "skill") return list.reduce((x, y) => (!x || y.xp > x.xp ? y : x), null);
  return null;
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
      if (t?.done) return { progress: 1, done: true, label: "complete" };
      // Kill-count tasks show kills so far, so there's no need to check the boss's counter in-game.
      const kp = t ? caKillProgress(t, snap) : null;
      if (kp) return { ...killBar(kp), done: false, label: killBar(kp).counter };
      return { progress: 0, done: false, label: `${goal.tier} task` };
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
 * Is candidate `c` the very thing goal `g` asks for (not just a step towards it)? "Train Slayer to
 * 80" helps a goal of 85 Slayer and stays; "Sit Rat" is the goal "Sit Rat" and goes.
 */
function isGoalItself(c, g, a) {
  const m = c.meta ?? {};
  switch (g.type) {
    case "skill": return m.skill === g.skill && m.target === g.level;
    case "xp": return m.skill === g.skill && m.xpTarget === g.xp;
    case "quest": return m.quest === g.quest;
    case "diary": return m.region === g.region && m.tier === g.tier;
    case "clog": return c.id === `clogpage:${g.page}`;
    case "pet": return m.pet === g.pet;
    case "item": {
      const it = itemIndex(a.snap).get(String(g.item).toLowerCase());
      return !!it && (m.item === it.name || m.pet === it.name);
    }
    case "family": return c.id === `clogfam:${g.page}:${g.family}`;
    case "catask": return m.task === g.task;
    case "cabundle": return c.id === `cabundle:${g.monster}|${g.tier}`;
    default: return false;
  }
}

/**
 * Effort for a goal card, judged by what the goal is rather than how far along it is, using the
 * same rules as the matching suggestions. `byId` holds the other suggestions for reuse.
 */
function goalEffort(g, snap, a, byId, byItem) {
  switch (g.type) {
    case "skill": return xpGapEffort(xpForLevel(g.level) - (snap.skills?.[g.skill]?.xp ?? 0));
    case "xp": return xpGapEffort(g.xp - (snap.skills?.[g.skill]?.xp ?? 0), true);
    case "quest": return a.missingReqs(QUESTS[g.quest]?.reqs).length ? "Long" : "Medium";
    case "diary": return DIARY_TIER_EFFORT[g.tier] ?? "Long";
    // Reaching a reward tier takes many tasks: Hard and above are long hauls.
    case "ca": return { Easy: "Quick", Medium: "Medium" }[g.tier] ?? "Long";
    case "pet": return "Long";
    // A log you chose as a goal shows as a Long haul, even if the suggestion was a Challenge.
    case "clog": { const e = byId.get(`clogpage:${g.page}`)?.effort; return e && e !== CHALLENGE ? e : "Long"; }
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

// ---- Progress marked by hand -------------------------------------------------------------

/**
 * The snapshot with progress the player marked by hand laid over it, for players who don't sync
 * after every session. `marks` is { quests: { name: time }, diaries: { "Region|tier": time },
 * ca: { taskId: time } }, times in ms. Returns a new object, so every per-snapshot memo rebuilds,
 * or the snapshot itself when nothing is marked. Quest points aren't added: the profile doesn't
 * say how many each quest gives, so they update on the next sync.
 */
export function applyManual(snap, marks) {
  const q = marks?.quests ?? {}, d = marks?.diaries ?? {}, c = marks?.ca ?? {};
  if (!Object.keys(q).length && !Object.keys(d).length && !Object.keys(c).length) return snap;
  const out = { ...snap };
  out.quests = (snap.quests ?? []).map((x) => (q[x.name] && x.state !== "FINISHED" ? { ...x, state: "FINISHED", manual: true } : x));
  out.diaries = Object.fromEntries(Object.entries(snap.diaries ?? {}).map(([region, tiers]) =>
    [region, { ...tiers, ...Object.fromEntries(DIARY_TIERS.filter((t) => d[`${region}|${t}`]).map((t) => [t, true])) }]));
  const ca = snap.combatAchievements;
  if (ca?.tasks) {
    let extra = 0;
    const tasks = ca.tasks.map((t) => {
      if (t.done || !c[t.id]) return t;
      extra += CA_TIER_POINTS[t.tier] ?? 0;
      return { ...t, done: true, manual: true };
    });
    out.combatAchievements = { ...ca, tasks, points: (ca.points ?? 0) + extra };
  }
  return out;
}

// ---- Within reach ------------------------------------------------------------------------
// Quests and diary tiers you can do now, or nearly can, judged from their full requirement lists
// (QUEST_PREREQS and DIARY_REQS). Recent progress (a level reached since the previous sync, a
// quest or tier just finished or marked done) is called out and ranks first.

/** How far short a requirement may be and still count as "nearly there". */
const REACH_CLOSE = { skill: 5, combat: 3, questPoints: 10, quest: 1, quests: 3 };
const REACH_MAX_MISSING = 2;
const REACH_RECENT_MS = 14 * 864e5; // marks made by hand count as recent for two weeks

/**
 * Every requirement in a { skills, quests, questPoints, allQuests } list with whether it's met:
 * [{ kind, key, label, need, have, met, gap, unknown }]. Quests missing from the profile are
 * shown as unknown and don't block.
 */
function requirementList(snap, a, req) {
  const out = [];
  const skills = { ...(req.skills ?? {}) };
  const qpNeed = req.questPoints ?? skills.questPoints;
  delete skills.questPoints;
  for (const [k, need] of Object.entries(skills)) {
    if (k === "combat") {
      const have = snap.player?.combatLevel ?? null;
      out.push({ kind: "combat", key: k, label: `Combat level ${need}`, need, have, met: have != null && have >= need, gap: have == null ? 0 : Math.max(0, need - have), unknown: have == null });
      continue;
    }
    const have = a.lvl(k);
    out.push({ kind: "skill", key: k, label: `${need} ${cap(k)}`, need, have, met: have >= need, gap: Math.max(0, need - have) });
  }
  if (qpNeed) {
    const have = snap.questPoints ?? 0;
    out.push({ kind: "questPoints", key: "qp", label: `${qpNeed} quest points`, need: qpNeed, have, met: have >= qpNeed, gap: Math.max(0, qpNeed - have) });
  }
  for (const q of req.quests ?? []) {
    const st = a.questState[q];
    out.push({ kind: "quest", key: q, label: q, have: st ?? null, met: st == null || st === "FINISHED", unknown: st == null, gap: st === "FINISHED" || st == null ? 0 : 1 });
  }
  if (req.allQuests) {
    const left = (snap.quests ?? []).filter((x) => x.state !== "FINISHED").length;
    out.push({ kind: "quests", key: "all", label: "Every quest (Quest point cape)", have: left, met: left === 0, gap: left });
  }
  // Unmet first (closest first), then met; skills before quests within each.
  const order = { skill: 0, combat: 1, questPoints: 2, quest: 3, quests: 4 };
  return out.sort((x, y) => Number(x.met) - Number(y.met) || order[x.kind] - order[y.kind] || x.gap - y.gap);
}

/**
 * Quests and diary tiers that are ready to do or one or two requirements away, best first:
 * [{ id, kind: "quest"|"diary", title, ready, reqs, missing, triggers, category, effort, meta }].
 * `prev` is a compact earlier profile { skills: { skill: level }, quests: { name: state },
 * diaries } (what the page saw before the latest sync), and `marks` the progress marked by hand;
 * both only decide what counts as "just happened".
 */
export function withinReach(snap, { prev = null, marks = null, now = Date.now(), max = 10 } = {}) {
  const a = analyse(snap);
  const markedRecently = (bucket, key) => {
    const at = marks?.[bucket]?.[key];
    return !!at && now - at < REACH_RECENT_MS;
  };
  // What just happened that this requirement is now met because of, if anything.
  const triggerFor = (r) => {
    if (!r.met || r.unknown) return null;
    if (r.kind === "skill" && prev?.skills?.[r.key] != null && prev.skills[r.key] < r.need) return `You just reached ${r.need} ${cap(r.key)}`;
    if (r.kind === "quest") {
      if (markedRecently("quests", r.key)) return `You marked ${r.key} as done`;
      if (prev?.quests?.[r.key] != null && prev.quests[r.key] !== "FINISHED") return `You just finished ${r.key}`;
    }
    return null;
  };
  const isClose = (r) => r.met || (!r.unknown && r.gap <= REACH_CLOSE[r.kind]);

  const entries = [];
  const consider = (base) => {
    const missing = base.reqs.filter((r) => !r.met);
    const ready = missing.length === 0;
    if (!ready && (missing.length > REACH_MAX_MISSING || !missing.every(isClose))) return;
    const triggers = [...base.reqs.map(triggerFor).filter(Boolean), ...(base.extraTriggers ?? [])];
    const gap = missing.reduce((s, r) => s + (r.kind === "quest" ? 4 : r.kind === "questPoints" ? r.gap / 3 : r.gap), 0);
    // Count only what can be checked; quests missing from the profile are listed separately.
    const known = base.reqs.filter((r) => !r.unknown);
    const met = known.filter((r) => r.met).length;
    entries.push({
      ...base, ready, missing, triggers,
      progress: known.length ? met / known.length : 1,
      counter: `${met}/${known.length} requirements`,
      score: (ready ? 100 : 40) + triggers.length * 60 + (base.weight ?? 5) * 2 - gap * 4,
    });
  };

  // Quests: only the notable ones have full requirement lists.
  for (const [name, info] of Object.entries(QUESTS)) {
    const st = a.questState[name];
    if (st == null || st === "FINISHED") continue;
    const req = questRequirements(name);
    consider({
      id: `reach:quest:${name}`, kind: "quest", category: "quests", title: name,
      why: info.why, weight: info.weight, inProgress: st === "IN_PROGRESS",
      // A quest's own parts (Recipe for Disaster's subquests) are doing the quest, not a requirement.
      reqs: requirementList(snap, a, { ...req, quests: req.quests.filter((q) => !q.startsWith(`${name} - `)) }),
      effort: "Medium", meta: { quest: name },
    });
  }

  // Diaries: the lowest tier not yet done in each region.
  for (const [region, tiers] of Object.entries(snap.diaries ?? {})) {
    const next = DIARY_TIERS.find((t) => !tiers[t]);
    const req = next && DIARY_REQS[region]?.[next];
    if (!req) continue;
    const idx = DIARY_TIERS.indexOf(next);
    const below = DIARY_TIERS[idx - 1];
    const extraTriggers = [];
    if (below && (markedRecently("diaries", `${region}|${below}`) || (prev?.diaries?.[region] && !prev.diaries[region][below]))) {
      extraTriggers.push(`You just finished the ${cap(below)} tier`);
    }
    const info = DIARIES[region];
    consider({
      id: `reach:diary:${region}:${next}`, kind: "diary", category: "diaries", title: `${region} ${cap(next)} diary`,
      why: info ? `${info.reward} ${idx + 1}: ${info.highlight}` : null, weight: info?.weight,
      reqs: requirementList(snap, a, req), extraTriggers,
      effort: DIARY_TIER_EFFORT[next], meta: { region, tier: next },
    });
  }
  return entries.sort((x, y) => y.score - x.score).slice(0, max);
}

// ---- Since last time ----------------------------------------------------------------------

/**
 * A small copy of a profile, kept by the page between syncs: levels, quests and diaries (for
 * "Within reach") plus totals and the goals already done (for "Since last time").
 */
export function compactProfile(snap, goals = []) {
  const tasks = snap.combatAchievements?.tasks ?? [];
  return {
    syncedAt: snap.syncedAt ?? 0,
    skills: Object.fromEntries(Object.entries(snap.skills ?? {}).map(([k, v]) => [k, v.level])),
    xp: Object.values(snap.skills ?? {}).reduce((n, v) => n + (v.xp ?? 0), 0),
    quests: Object.fromEntries((snap.quests ?? []).map((q) => [q.name, q.state])),
    diaries: snap.diaries ?? {},
    clog: snap.collectionLog?.obtained ?? null,
    caPoints: snap.combatAchievements?.points ?? null,
    caDone: tasks.length ? tasks.filter((t) => t.done).length : null,
    pets: petInfo(snap).pets.length ? petInfo(snap).owned : null,
    goalsDone: goals.filter((g) => goalProgress(g, snap).done).map((g) => g.id),
  };
}

/**
 * What changed between the previous sync (`prev`, a compactProfile) and this one:
 * [{ kind, text, detail? }] in a fixed order, empty when nothing did. Totals missing from an
 * older saved copy are skipped rather than guessed.
 */
export function sinceLast(snap, prev, goals = []) {
  if (!prev) return [];
  const now = compactProfile(snap, goals);
  const out = [];
  const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
  const ups = Object.entries(now.skills)
    .filter(([k, lvl]) => prev.skills?.[k] != null && lvl > prev.skills[k])
    .map(([k, lvl]) => ({ skill: k, from: prev.skills[k], to: lvl }))
    .sort((x, y) => y.to - y.from - (x.to - x.from));
  if (ups.length) {
    const levels = ups.reduce((n, u) => n + u.to - u.from, 0);
    out.push({
      kind: "levels",
      text: `+${plural(levels, "level")}`,
      detail: ups.map((u) => `${cap(u.skill)} ${u.from} → ${u.to}`).join(", "),
    });
  }
  if (prev.xp != null && now.xp > prev.xp) out.push({ kind: "xp", text: `+${fmt(now.xp - prev.xp)} XP` });
  const quests = Object.entries(now.quests).filter(([q, st]) => st === "FINISHED" && prev.quests?.[q] != null && prev.quests[q] !== "FINISHED").map(([q]) => q);
  if (quests.length) out.push({ kind: "quests", text: plural(quests.length, "quest"), detail: quests.join(", ") });
  const tiers = [];
  for (const [region, t] of Object.entries(now.diaries)) {
    for (const [tier, done] of Object.entries(t ?? {})) if (done && prev.diaries?.[region] && !prev.diaries[region][tier]) tiers.push(`${region} ${cap(tier)}`);
  }
  if (tiers.length) out.push({ kind: "diaries", text: plural(tiers.length, "diary tier"), detail: tiers.join(", ") });
  if (prev.caDone != null && now.caDone > prev.caDone) {
    out.push({ kind: "combat", text: plural(now.caDone - prev.caDone, "combat achievement"), detail: `+${now.caPoints - (prev.caPoints ?? now.caPoints)} points` });
  }
  if (prev.clog != null && now.clog > prev.clog) out.push({ kind: "clog", text: plural(now.clog - prev.clog, "new log slot") });
  if (prev.pets != null && now.pets > prev.pets) out.push({ kind: "pets", text: plural(now.pets - prev.pets, "new pet") });
  if (prev.goalsDone) {
    const done = goals.filter((g) => now.goalsDone.includes(g.id) && !prev.goalsDone.includes(g.id));
    if (done.length) out.push({ kind: "goals", text: `${plural(done.length, "goal")} done`, detail: done.map(goalTitle).join(", ") });
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
  // `goals`: what to aim for to unlock it. A quest is its own goal (the planner adds its
  // requirements); other content gets a goal per missing quest or skill level.
  if (m.quest && m.missing?.length) {
    return { content: m.quest, needs: m.missing.map((x) => `${x.level} ${cap(x.skill)}`), goals: [{ type: "quest", quest: m.quest }] };
  }
  const name = m.page ?? m.monster;
  if (!name) return null;
  const req = CONTENT_REQS.find((r) => r.match.test(name));
  if (!req) return null;
  const quests = (req.quests ?? []).filter((q) => !a.done(q));
  const skills = a.missingReqs(req.skills);
  const needs = [...quests, ...skills.map((x) => `${x.level} ${cap(x.skill)}`)];
  const goals = [
    ...quests.map((quest) => ({ type: "quest", quest })),
    ...skills.filter((x) => SKILLS.includes(x.skill)).map((x) => ({ type: "skill", skill: x.skill, level: x.level })),
  ];
  return needs.length ? { content: name, needs, goals } : null;
}

/**
 * Content hidden because you can't access it yet:
 *   [{ content, needs: [..], goals: [goal without an id, ..], hidden: n }].
 * `goals` are what to aim for to unlock it (see lockOf).
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
  // Extra score per effort tier. All zero today: a knob for nudging the mix without touching
  // every generator.
  const effortBias = { Quick: 0, Medium: 0, Long: 0, [CHALLENGE]: 0 };

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
  applyAccountType(list, snap);
  const enabled = opts.categories;
  if (opts.includeGoals !== false) {
    // A suggestion that is exactly one of your goals would show twice (the goal card and the
    // suggestion): keep only the goal card. Not when goal cards are filtered out, or it'd vanish.
    if (open.length && (!enabled || enabled.has("goals"))) list = list.filter((c) => !open.some((g) => isGoalItself(c, g, a)));
    list.push(...goalCandidates(snap, open, generated).map((c) => ({ ...c, score: c.base + effortBias[c.effort] })));
  }
  if (enabled) list = list.filter((c) => enabled.has(c.category));
  if (style) list = list.filter((c) => c.effort === STYLE_EFFORT[style]);
  const locked = [...locks.values()].sort((x, y) => x.content.localeCompare(y.content));
  return { list: list.sort((x, y) => y.score - x.score), locked };
}

// ---- Sections missing from a profile -------------------------------------------------------
// Profiles come from different plugin versions, pasted by hand or uploaded automatically, so a
// section the site knows about can be absent. List each section a newer plugin added here, and the
// site says what's missing instead of leaving that part blank.
export const PROFILE_SECTIONS = [
  { key: "slayer", label: "Slayer task", detail: "your current Slayer task and any task in storage" },
  { key: "diaryStarted", label: "Diaries in progress", detail: "which diaries you've started (yellow on the Diaries tab)" },
];

/** The PROFILE_SECTIONS this profile doesn't have. */
export function missingSections(snap) {
  return snap ? PROFILE_SECTIONS.filter((s) => snap[s.key] == null) : [];
}

/**
 * Values in a profile that can't be right (a damaged paste, a hand-edited file, a plugin bug), so
 * the page can say its suggestions may be off instead of quietly building on them:
 * [{ key, text }]. Empty for a normal profile. Checks only what the game guarantees.
 */
export function profileIssues(snap, now = Date.now()) {
  if (!snap) return [];
  const out = [];
  const bad = [];
  for (const [skill, v] of Object.entries(snap.skills ?? {})) {
    if (skill === "overall" || !v) continue;
    const { level, xp } = v;
    if (!Number.isInteger(level) || level < 1 || level > 99) bad.push(`${cap(skill)} level ${level}`);
    else if (xp != null && (!(xp >= 0 && xp <= 200e6) || xp < xpForLevel(level) || (level < 99 && xp >= xpForLevel(level + 1)))) {
      bad.push(`${cap(skill)} (level ${level} with ${fmt(xp)} XP)`);
    }
  }
  if (bad.length) out.push({ key: "skills", text: `Skill levels or XP that can't be right: ${bad.slice(0, 4).join(", ")}${bad.length > 4 ? ` and ${bad.length - 4} more` : ""}` });

  const ca = snap.combatAchievements;
  if (ca?.tasks?.length && ca.points != null) {
    const sum = ca.tasks.filter((t) => t.done).reduce((n, t) => n + (CA_TIER_POINTS[t.tier] ?? 0), 0);
    // The plugin sends every task, so the ticked ones add up to the points exactly. A short list
    // (an old or trimmed profile) can only be checked one way: ticked tasks can't exceed the points.
    if (sum > ca.points || (ca.tasks.length >= 400 && sum !== ca.points)) {
      out.push({ key: "combatAchievements", text: `Combat achievement points (${ca.points}) don't match the tasks marked done (${sum})` });
    }
  }
  const kcBad = Object.entries(snap.killCounts ?? {}).filter(([, n]) => !Number.isInteger(n) || n < 0).map(([k]) => k);
  if (kcBad.length) out.push({ key: "killCounts", text: `Kill counts that aren't whole numbers: ${kcBad.slice(0, 3).join(", ")}` });
  if (snap.questPoints != null && !(Number.isInteger(snap.questPoints) && snap.questPoints >= 0)) {
    out.push({ key: "questPoints", text: `Quest points of ${snap.questPoints}` });
  }
  if (snap.syncedAt > now + 864e5) out.push({ key: "syncedAt", text: "A sync time in the future (check this PC's clock)" });
  return out;
}

/**
 * The account type from the profile ("Hardcore Group Ironman" etc.) as flags. Unknown or missing
 * types count as a normal account.
 */
export function accountKind(snap) {
  const t = String(snap?.player?.accountType ?? snap?.accountType ?? "");
  const iron = /iron/i.test(t);
  return { type: t || "Normal", iron, hardcore: iron && /hardcore/i.test(t), ultimate: /ultimate/i.test(t), group: iron && /group/i.test(t) };
}

/**
 * Ironman priorities (IRON_PRIORITIES) and Group Ironman team content (GROUP_CONTENT_BOOST):
 * extra score and a reason on the card. Hardcore accounts get the Hardcore Wilderness warning on
 * the website (app.js); their suggestions aren't changed here.
 */
function applyAccountType(list, snap) {
  const k = accountKind(snap);
  if (!k.iron) return;
  const pages = snap.collectionLog?.pages ?? {};
  // Cards show the first three reasons: put this one first, after a "Moves your goal" line.
  const addWhy = (c, text) => {
    const at = c.why[0]?.startsWith("Moves your goal") ? 1 : 0;
    c.why = [...c.why.slice(0, at), text, ...c.why.slice(at)];
  };
  for (const c of list) {
    const m = c.meta ?? {};
    const rule = (m.quest && IRON_PRIORITIES.quests[m.quest]) || (c.category === "diaries" && m.region && IRON_PRIORITIES.diaries[m.region]);
    if (rule) {
      c.score += rule.boost;
      addWhy(c, rule.why);
    }
    const team = (m.page && (pages[m.page]?.tab === "Raids" || TEAM_PAGES.has(m.page))) || TEAM_PAGES.has(m.monster);
    if (k.group && team) {
      c.score += GROUP_CONTENT_BOOST;
      addWhy(c, "Team content: a good fit for your Ironman group");
    }
  }
}

// ---- Fastest logs first ---------------------------------------------------------------------
// For collection log hunters: log and pet cards come in order of their rough time estimate
// (`hours`), quickest first, instead of by score. Other categories keep their usual order.

/** The categories "Fastest logs first" reorders: the collection log and its pets. */
export const HUNT_CATEGORIES = new Set(["clog", "pets"]);
const isHunt = (c) => HUNT_CATEGORIES.has(c.category) && c.hours != null;
const byHours = (x, y) => x.hours - y.hours || (x.hoursRaw ?? x.hours) - (y.hoursRaw ?? y.hours) || y.score - x.score;

/**
 * `list` with its collection log and pet suggestions put in time order, quickest first. They keep
 * the places they had, so other categories still sit where their score puts them.
 */
export function fastestFirst(list) {
  const hunt = list.filter(isHunt).sort(byHours);
  let k = 0;
  return list.map((c) => (isHunt(c) ? hunt[k++] : c));
}

/**
 * Pick `n` suggestions from different categories. `seed` adds a small, repeatable shuffle so
 * "Shuffle" gives fresh but still sensible picks. `exclude` removes ids the user skipped.
 * `fastest` serves collection log and pet suggestions quickest first (see fastestFirst); Shuffle
 * then moves on to the next quickest, since the cards already shown are excluded.
 */
export function pickThree(list, { seed = 0, exclude = new Set(), keep = [], n = 3, fastest = false } = {}) {
  const rand = mulberry32(seed);
  let jittered = list
    .filter((c) => !exclude.has(c.id))
    .map((c) => ({ c, s: c.score + (seed ? rand() * 30 : 0) }))
    .sort((x, y) => y.s - x.s)
    .map((x) => x.c);
  if (fastest) jittered = fastestFirst(jittered);
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
  for (const c of fastest ? fastestFirst(list) : list) {
    if (picked.length >= n) break;
    if (!has(c)) picked.push(c);
  }
  return fastest ? fastestFirst(picked) : picked;
}

/** How the 7-card Mixed carousel is split across the three tiers. */
const MIX_QUOTA = { Quick: 2, Medium: 3, Long: 2 };

/**
 * Seven picks spanning every tier, ordered Quick -> Balanced -> Long. Each tier keeps the usual
 * variety rules, and categories already picked in earlier tiers are avoided where possible. If a
 * tier runs short, the other tiers fill the gap so the carousel stays full.
 */
export function pickMix(list, { seed = 0, exclude = new Set(), quota = MIX_QUOTA, fastest = false } = {}) {
  const total = Object.values(quota).reduce((a, b) => a + b, 0);
  const tiers = Object.keys(quota);
  let picked = [];
  tiers.forEach((tier, k) => {
    const sub = list.filter((c) => c.effort === tier);
    const next = pickThree(sub, { seed: seed ? seed + k * 101 : 0, exclude, keep: picked, n: picked.length + quota[tier], fastest });
    picked = next;
  });
  // Top up from any tier if one ran short.
  if (picked.length < total) picked = pickThree(list.filter((c) => c.effort !== CHALLENGE), { seed, exclude, keep: picked, n: total, fastest });
  return tiers.flatMap((t) => {
    const inTier = picked.filter((c) => c.effort === t);
    return fastest ? fastestFirst(inTier) : inTier;
  });
}

/** One Challenge suggestion (a huge log completion), shown apart from the regular picks. */
export function pickChallenge(list, { seed = 0, exclude = new Set(), fastest = false } = {}) {
  return pickThree(list.filter((c) => c.effort === CHALLENGE), { seed, exclude, n: 1, fastest })[0] ?? null;
}

/**
 * A tiny seeded random number generator (the "Mulberry32" algorithm): the same seed always gives
 * the same sequence, so a Shuffle can be repeated. Returns a function giving numbers in [0, 1).
 */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Route planner ----------------------------------------------------------------------------
// Pick several goals and get one ordered list of steps: the skill levels, quests (with their
// prerequisite chains), quest points and combat level they need, with requirements shared between
// goals done once. Quests come from the wiki snapshot (web/data/quest-reqs.json, every quest and
// miniquest, followed down the whole prerequisite chain); diaries from DIARY_REQS and other goals
// from CONTENT_REQS. Anything none of these cover is listed as "not in our tables" rather than
// guessed. Times come from XP_RATES (levels only).

/** Rough internal cost (hours) for ordering steps that have no time estimate. Never shown. */
const PLAN_ORDER_COST = { quest: 1.5, qp: 4, combat: 4, goal: 2, levelUnknown: 0.5 };

/**
 * planRoute(snap, goals) -> { steps, done, skipped, unknown, unchecked, total }
 *   steps:   [{ key, kind: "skill"|"quest"|"qp"|"combat"|"goal", title, forGoals: [title],
 *              shared, completes: [title], hours: {low, high}|null, note }] in order
 *   done:    titles of goals already complete
 *   skipped: titles of goals the planner can't plan (custom goals)
 *   unknown: quests whose requirements aren't in our tables (check the wiki)
 *   unchecked: quests needed on the way that the profile doesn't list, so their state is unknown
 *   total:   { low, high, timed, untimed } summed over the steps
 */
export function planRoute(snap, goals = []) {
  const a = analyse(snap);
  const nodes = new Map();
  const unknown = new Set(), unchecked = new Set();
  const node = (key, init) => {
    if (!nodes.has(key)) nodes.set(key, { key, deps: new Set(), completes: [], ...init });
    return nodes.get(key);
  };
  const xpOf = (s) => snap.skills?.[s]?.xp ?? xpForLevel(a.lvl(s));

  // A skill target (level or XP); null when it's already reached.
  const skillNode = (skill, targetXp, title) => {
    if (!snap.skills?.[skill] || xpOf(skill) >= targetXp) return null;
    return node(`skill:${skill}:${targetXp}`, { kind: "skill", skill, targetXp, title });
  };
  const levelNode = (skill, level) => skillNode(skill, xpForLevel(level), `Train ${cap(skill)} to ${level}`);

  let qpNeed = 0, combatNeed = 0;
  // Requirements { skills (incl. combat / questPoints), quests, questPoints } become deps of `n`.
  const addReqs = (n, req, seen) => {
    for (const [k, lvl] of Object.entries(req?.skills ?? {})) {
      if (k === "combat") { if ((snap.player?.combatLevel ?? 0) < lvl) { combatNeed = Math.max(combatNeed, lvl); n.deps.add("combat"); } continue; }
      if (k === "questPoints") { addQp(n, lvl); continue; }
      const s = levelNode(k, lvl);
      if (s) n.deps.add(s.key);
    }
    if (req?.questPoints) addQp(n, req.questPoints);
    for (const q of req?.quests ?? []) {
      const qn = questNode(q, seen);
      if (qn) n.deps.add(qn.key);
    }
  };
  const addQp = (n, need) => {
    if ((snap.questPoints ?? 0) >= need) return;
    qpNeed = Math.max(qpNeed, need);
    n.deps.add("qp");
  };
  const questNode = (q, seen = new Set(), isGoal = false) => {
    const st = a.questState[q];
    if (st === "FINISHED" || seen.has(q)) return null;
    // Not in the profile (a trimmed profile, or a quest newer than the plugin): can't tell if it's
    // done, so it's named rather than planned. A goal is still planned.
    if (st == null && !isGoal && snap.quests?.length) { unchecked.add(q); return null; }
    const n = node(`quest:${q}`, { kind: "quest", quest: q, title: `${st === "IN_PROGRESS" ? "Finish" : "Do"} ${q}` });
    if (n.expanded) return n;
    n.expanded = true;
    const req = questRequirements(q);
    if (!req.known) unknown.add(q);
    if (req.other.length) n.note = `Also needs: ${req.other.join("; ")}.`;
    addReqs(n, req, new Set([...seen, q]));
    return n;
  };
  const contentReqs = (name) => CONTENT_REQS.filter((r) => name && r.match.test(name));

  const done = [], skipped = [], goalRoots = [];
  for (const g of goals) {
    const title = goalTitle(g);
    if (goalProgress(g, snap).done) { done.push(title); continue; }
    let root = null;
    switch (g.type) {
      case "skill": root = levelNode(g.skill, g.level); break;
      case "xp": root = skillNode(g.skill, g.xp, `Push ${cap(g.skill)} to ${fmt(g.xp)} XP`); break;
      case "quest": root = questNode(g.quest, new Set(), true); break;
      case "diary": {
        root = node(`goal:${g.id}`, { kind: "goal", title });
        const req = DIARY_REQS[g.region]?.[g.tier];
        if (req) addReqs(root, { skills: req.skills, quests: req.quests, questPoints: req.questPoints });
        else unknown.add(title);
        const questsLeft = (snap.quests ?? []).filter((q) => q.state !== "FINISHED").length;
        if (req?.allQuests && questsLeft) {
          node("allquests", { kind: "quest", title: `Finish every remaining quest (${questsLeft} left)`, note: "For the Quest point cape." });
          root.deps.add("allquests");
        }
        break;
      }
      case "custom": skipped.push(title); continue;
      default: {
        // Collection log, pets, items and combat achievements: the access gates in CONTENT_REQS.
        const page = g.page ?? (g.type === "item" || g.type === "pet" ? itemIndex(snap).get(String(g.item ?? g.pet).toLowerCase())?.page : null);
        const monster = g.monster ?? (g.type === "catask" ? (snap.combatAchievements?.tasks ?? []).find((t) => t.id === g.task)?.monster : null);
        root = node(`goal:${g.id}`, { kind: "goal", title });
        for (const r of [...contentReqs(page), ...(monster !== page ? contentReqs(monster) : [])]) addReqs(root, r);
      }
    }
    if (!root) { done.push(title); continue; }
    root.completes.push(title);
    goalRoots.push({ title, key: root.key });
  }
  if (qpNeed) node("qp", { kind: "qp", title: `Reach ${qpNeed} quest points`, note: `You have ${snap.questPoints ?? 0}; any quests count.` });
  if (combatNeed) node("combat", { kind: "combat", title: `Reach combat level ${combatNeed}`, note: `You're level ${snap.player?.combatLevel ?? "?"}.` });

  // A skill's targets are trained in order: each one after the one below it.
  const bySkill = {};
  for (const n of nodes.values()) if (n.kind === "skill") (bySkill[n.skill] ??= []).push(n);
  for (const list of Object.values(bySkill)) {
    list.sort((x, y) => x.targetXp - y.targetXp);
    list.forEach((n, i) => {
      const from = i ? list[i - 1].targetXp : xpOf(n.skill);
      if (i) n.deps.add(list[i - 1].key);
      n.hours = levelHours(n.skill, from, n.targetXp);
      n.cost = n.hours ? (n.hours.low + n.hours.high) / 2 : PLAN_ORDER_COST.levelUnknown * Math.max(1, levelOf(n.targetXp) - levelOf(from));
    });
  }
  for (const n of nodes.values()) n.cost ??= PLAN_ORDER_COST[n.kind] ?? 1;

  // Which goals each step serves (everything a goal's root depends on, directly or not).
  const closure = (key, out = new Set()) => {
    if (out.has(key) || !nodes.has(key)) return out;
    out.add(key);
    for (const d of nodes.get(key).deps) closure(d, out);
    return out;
  };
  const goalSets = goalRoots.map((g) => ({ ...g, keys: closure(g.key) }));
  for (const n of nodes.values()) n.forGoals = goalSets.filter((g) => g.keys.has(n.key)).map((g) => g.title);

  // Order: of the steps that are ready, take the one on the way to the goal that's closest to
  // done (so goals finish early, one by one), preferring steps shared by more goals.
  const left = new Set([...nodes.keys()].filter((k) => nodes.get(k).forGoals.length));
  const steps = [];
  const remaining = (g) => [...g.keys].reduce((s, k) => s + (left.has(k) ? nodes.get(k).cost : 0), 0);
  while (left.size) {
    const ready = [...left].map((k) => nodes.get(k)).filter((n) => [...n.deps].every((d) => !left.has(d)));
    if (!ready.length) break; // a loop in the tables; the checker would catch it
    const goalCost = new Map(goalSets.map((g) => [g.title, remaining(g)]));
    const score = (n) => Math.min(...n.forGoals.map((t) => goalCost.get(t)));
    ready.sort((x, y) => score(x) - score(y) || y.forGoals.length - x.forGoals.length || x.cost - y.cost || x.key.localeCompare(y.key));
    const n = ready[0];
    left.delete(n.key);
    steps.push({
      key: n.key, kind: n.kind, title: n.title, forGoals: n.forGoals, shared: n.forGoals.length > 1,
      completes: n.completes, hours: n.hours ?? null, note: n.note ?? null,
    });
  }
  const timed = steps.filter((s) => s.hours);
  return {
    steps, done, skipped, unknown: [...unknown], unchecked: [...unchecked].sort(),
    total: { low: timed.reduce((t, s) => t + s.hours.low, 0), high: timed.reduce((t, s) => t + s.hours.high, 0), timed: timed.length, untimed: steps.length - timed.length },
  };
}

/** The level a total XP amount is (1-99). */
function levelOf(xp) {
  let l = 1;
  while (l < 99 && xpForLevel(l + 1) <= xp) l++;
  return l;
}
