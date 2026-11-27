// Snapshot of every quest's and miniquest's requirements from the OSRS Wiki, kept in
// web/data/quest-reqs.json. The route planner and "Within reach" use it so a plan has no gaps.
//
// Run by hand after a game update (Update-GameData.ps1 does it for you); the site never contacts
// the wiki itself. By default the wiki is only asked when tests/fixtures/game-names.json has a
// quest the file doesn't cover yet, so a re-run usually sends nothing. When it does ask, it's one
// request to the wiki's "quest" bucket. The file only changes (and only gets a new date) when the
// requirements themselves changed.
//
//   node scripts/update-quest-reqs.mjs            # ask the wiki only if there are new quests
//   node scripts/update-quest-reqs.mjs --dry-run  # say whether it would ask; contact nothing
//   node scripts/update-quest-reqs.mjs --full     # ask anyway (e.g. after a quest's requirements changed)
//
// Data from the OSRS Wiki, licensed CC BY-NC-SA 3.0.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "web", "data", "quest-reqs.json");
const GAME_NAMES = join(root, "tests", "fixtures", "game-names.json");
const API = "https://oldschool.runescape.wiki/api.php";
const UA = "OSRS-TaskMaster/0.1 (personal quest planner; one-off quest requirement snapshot)";

// The wiki's skill names, as our profile keys.
const SKILLS = new Set(["attack", "strength", "defence", "ranged", "prayer", "magic", "runecraft", "hitpoints",
  "crafting", "mining", "smithing", "fishing", "cooking", "firemaking", "woodcutting", "agility", "herblore",
  "thieving", "fletching", "slayer", "farming", "construction", "hunter", "sailing"]);

const decode = (s) => s.replace(/&#0*39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");

/** "[[Barbarian_Training#Pyre|pyre ship]]" -> "Barbarian Training". */
const linkTarget = (t) => decode(t.split("|")[0].split("#")[0].replace(/_/g, " ").trim());

/** Wiki markup to plain text: links to their label, tags, templates and file links dropped. */
export function plainText(s) {
  return decode(s
    .replace(/<sup[^>]*>.*?<\/sup>/g, "")
    .replace(/\[\[File:[^\]]*\]\]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
    .replace(/'{2,}/g, ""))
    .replace(/\s+/g, " ").replace(/^[\s*:]+|\s+$/g, "");
}

/**
 * One quest's `requirements` text (rendered wiki list) -> { skills, questPoints, combat, quests,
 * other }. `isQuest(name)` says whether a link is to a quest or miniquest.
 *  - quests: direct prerequisites only (links not nested under another quest link); the planner
 *    follows the chain through each quest's own entry.
 *  - skills / questPoints / combat: from the wiki's skill tags, outside the prerequisite chain
 *    (a prerequisite's own levels belong to that quest's entry). Highest wins.
 *  - other: anything else that has to be true ("100 Kudos", "Access to Keldagrim").
 *  - fights: what you must be able to fight ("The ability to defeat a level 83 dragon").
 */
export function parseRequirements(text, isQuest) {
  const out = { skills: {}, questPoints: 0, combat: 0, quests: [], other: [], fights: [] };
  if (!text || /^\s*none\.?\s*$/i.test(plainText(text))) return out;
  const stack = []; // [{ depth, quest }] for the lines above this one
  for (const raw of text.split("\n")) {
    const m = raw.match(/^(\*+|:+)?\s*(.*)$/);
    const depth = m[1]?.length ?? 0;
    const body = m[2];
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    const underQuest = stack.some((s) => s.quest);
    const links = [...body.matchAll(/\[\[([^\]]+)\]\]/g)].map((x) => linkTarget(x[1])).filter((t) => !/^File:/i.test(t));
    const quests = links.filter(isQuest);
    // A line that is about quests: its own first link is a quest ("[[Legends' Quest]]",
    // "Completion of [[Cook's Assistant]]").
    // ("Completion of" lines carry an empty quest point icon; only tags with a level are skills.)
    const questLine = quests.length > 0 && !/data-level=/.test(body);
    stack.push({ depth, quest: questLine });
    if (underQuest) continue;
    if (questLine) {
      for (const q of quests) if (!out.quests.includes(q)) out.quests.push(q);
      continue;
    }
    let tagged = false;
    for (const t of body.matchAll(/data-skill="([^"]+)"\s+data-level="(\d+)"/g)) {
      tagged = true;
      const name = t[1].toLowerCase(), lvl = Number(t[2]);
      if (name === "quest points" || name === "quest") out.questPoints = Math.max(out.questPoints, lvl);
      else if (name === "combat" || name === "combat level") out.combat = Math.max(out.combat, lvl);
      else if (SKILLS.has(name)) out.skills[name] = Math.max(out.skills[name] ?? 0, lvl);
    }
    if (tagged) continue;
    const plain = plainText(body);
    // Headers ("Completion of the following quests:"), notes and advice aren't requirements.
    if (!plain || /:$/.test(plain) || NOT_A_REQUIREMENT.test(plain)) continue;
    const list = FIGHT.test(plain) ? out.fights : out.other;
    if (!list.includes(plain)) list.push(plain);
  }
  return out;
}
const NOT_A_REQUIREMENT = /^(none|note|the following|completion of the following|all prerequisite)|beneficial|recommended|could help|you do not need|is a requirement for the/i;
// "The ability to defeat a level 83 dragon": real, but not something a route can plan.
const FIGHT = /\b(defeat|kill|killing|withstand|survive|evade|defend|run past|run away|run from|get past)\b/i;

/**
 * The wiki's page name -> the name the game (and so the profile) uses, or null for pages that
 * aren't a quest of their own. Recipe for Disaster's parts: "Recipe for Disaster/Freeing King
 * Awowogei" -> "Recipe for Disaster - King Awowogei".
 */
export function gameName(page) {
  const n = page.replace(/\s*\(miniquest\)$/, "");
  const m = n.match(/^Recipe for Disaster\/(.+)$/);
  if (!m) return n;
  if (/full guide/i.test(m[1])) return null;
  if (/goblin generals/i.test(m[1])) return "Recipe for Disaster - Wartface & Bentnoze";
  return `Recipe for Disaster - ${m[1].replace(/^(Freeing|Defeating) (the )?/, "")}`;
}

/** The parsed bucket rows -> the file's `quests` object (sorted, empty fields dropped). */
export function buildQuests(rows) {
  const names = new Set(rows.map((r) => decode(r.page_name)));
  const isQuest = (n) => names.has(n);
  const quests = {};
  const byGame = rows.map((r) => ({ ...r, name: gameName(decode(r.page_name)) })).filter((r) => r.name);
  for (const r of byGame.sort((x, y) => x.name.localeCompare(y.name))) {
    const name = r.name;
    const p = parseRequirements(r.requirements ?? "", isQuest);
    p.quests = p.quests.map(gameName).filter(Boolean);
    const e = {};
    if (Object.keys(p.skills).length) e.skills = Object.fromEntries(Object.entries(p.skills).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])));
    if (p.questPoints) e.questPoints = p.questPoints;
    if (p.combat) e.combat = p.combat;
    if (p.quests.length) e.quests = p.quests.filter((q) => q !== name);
    if (p.other.length) e.other = p.other;
    if (p.fights.length) e.fights = p.fights;
    if (r.official_length) e.length = plainText(r.official_length);
    quests[name] = e;
  }
  return quests;
}

/**
 * The game's quest names (from tests/fixtures/game-names.json) that the file doesn't cover yet.
 * Names the wiki was asked about before and had no entry for (`notOnWiki`) count as covered, so
 * one odd name doesn't send a request on every run.
 */
export function missingQuests(gameQuests, file) {
  const have = new Set([...Object.keys(file?.quests ?? {}), ...(file?.notOnWiki ?? [])]);
  return gameQuests.filter((q) => !have.has(q));
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const full = process.argv.includes("--full");
  const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  const game = JSON.parse(readFileSync(GAME_NAMES, "utf8")).quests ?? [];

  // Requirements of quests already in the file almost never change, so by default the wiki is
  // only asked when the game has a quest the file doesn't know yet. --full asks anyway.
  const todo = missingQuests(game, old);
  if (!full && old && !todo.length) {
    console.log(`All ${game.length} quests in the game names are already in web/data/quest-reqs.json; the wiki was not contacted (--full to re-check).`);
    return;
  }
  const why = full ? "--full" : !old ? "no file yet" : `${todo.length} new quest(s): ${todo.slice(0, 5).join(", ")}${todo.length > 5 ? ", ..." : ""}`;
  const query = "bucket('quest').select('page_name','requirements','official_length').limit(1000).run()";
  const url = `${API}?action=bucket&format=json&query=${encodeURIComponent(query)}`;
  if (dry) { console.log(`Dry run: would send 1 request to ${API} (the "quest" bucket) because of ${why}.`); return; }
  console.log(`Asking the wiki for quest requirements (1 request) because of ${why}.`);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Wiki request failed: HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`Wiki query failed: ${json.error}`);
  const rows = json.bucket ?? [];
  if (rows.length < 150) throw new Error(`Only ${rows.length} quests came back; expected over 150. Not writing.`);
  const quests = buildQuests(rows);
  const notOnWiki = game.filter((q) => !quests[q]).sort();

  if (old && JSON.stringify(old.quests) === JSON.stringify(quests)
    && JSON.stringify(old.notOnWiki ?? []) === JSON.stringify(notOnWiki)) {
    console.log(`Quest requirements unchanged (${rows.length} quests and miniquests). Nothing written.`);
    return;
  }
  const file = {
    generated: new Date().toISOString().slice(0, 10),
    source: "OSRS Wiki (oldschool.runescape.wiki), CC BY-NC-SA 3.0",
    quests,
  };
  if (notOnWiki.length) file.notOnWiki = notOnWiki;
  writeFileSync(OUT, JSON.stringify(file, null, 1) + "\n");
  const withChain = Object.values(quests).filter((q) => q.quests?.length).length;
  console.log(`web/data/quest-reqs.json: ${Object.keys(quests).length} quests and miniquests (${withChain} with prerequisite quests).`);
  if (notOnWiki.length) console.log(`  Not on the wiki under the game's name (remembered, not asked again): ${notOnWiki.join(", ")}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
