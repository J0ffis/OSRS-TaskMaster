// OSRS TaskMaster knowledge base.
// Hand-curated game facts the recommender uses on top of your synced data.
// Skill requirements are the main skill gates only; prerequisite quests are listed in `note`.
// Edit freely: everything here is plain data. docs/how-suggestions-work.md explains what each
// table changes.
//
// Sections, in order:
//   Game basics            SKILLS, MILESTONES, QUESTS, DIARIES, combat achievement tiers,
//                          CLOG_EASE (quick logs), RARE_ITEMS
//   Effort rules           fixed Quick / Balanced / Long haul tiers for pages, bosses and items
//   Drop rates -> effort   minutes per kill and the hour limits for each tier
//   Opt-in content         what counts as Wilderness
//   Access requirements    content hidden until a quest or level is done
//   Slayer                 kills per hour and the bosses each task can be done at

// ---- Game basics -------------------------------------------------------------------------
export const SKILLS = [
  "attack", "hitpoints", "mining", "strength", "agility", "smithing", "defence", "herblore",
  "fishing", "ranged", "thieving", "cooking", "prayer", "crafting", "firemaking", "magic",
  "fletching", "woodcutting", "runecraft", "slayer", "farming", "construction", "hunter", "sailing",
];

// Level milestones the recommender aims for (in order).
export const MILESTONES = [10, 20, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95, 99];

// Notable quests: why they matter and their main skill requirements.
export const QUESTS = {
  "Animal Magnetism": { why: "Unlocks Ava's attractor/accumulator, a must for ranged.", reqs: { ranged: 30, slayer: 18, crafting: 19, woodcutting: 35 }, weight: 8 },
  "Lost City": { why: "Zanaris access and dragon longsword/dagger.", reqs: { crafting: 31, woodcutting: 36 }, weight: 6 },
  "Fairytale II - Cure a Queen": { why: "Fairy rings: one of the best transport networks in the game.", reqs: { thieving: 40, farming: 49, herblore: 57 }, weight: 10, note: "Can use fairy rings after starting it." },
  "Bone Voyage": { why: "Fossil Island: birdhouse runs, Volcanic Mine, amber herbs.", reqs: {}, weight: 8, note: "Needs 100 Varrock Museum kudos." },
  "Priest in Peril": { why: "Opens Morytania (Barrows, Slayer Tower, Canifis).", reqs: {}, weight: 7 },
  "Regicide": { why: "Gateway to Prifddinas questline and Zulrah (via later quests).", reqs: { agility: 56, crafting: 10 }, weight: 6, note: "Needs Underground Pass." },
  "Horror from the Deep": { why: "God books and Dagannoth access.", reqs: { agility: 35 }, weight: 5 },
  "Heroes' Quest": { why: "Heroes' Guild, amulet of glory recharging, dragon battleaxe/mace.", reqs: { cooking: 53, fishing: 53, herblore: 25, mining: 50 }, weight: 6, note: "Needs 55 quest points." },
  "Monkey Madness I": { why: "Dragon scimitar, Ape Atoll and big combat XP.", reqs: {}, weight: 7 },
  "Desert Treasure I": { why: "Ancient Magicks: ice barrage for bursting and barraging.", reqs: { thieving: 53, firemaking: 50, magic: 50, slayer: 10 }, weight: 9 },
  "Legends' Quest": { why: "Legends' Guild and unlocks the Lunar/Mage Arena II path.", reqs: { agility: 50, crafting: 50, herblore: 45, magic: 56, mining: 52, prayer: 42, smithing: 50, strength: 50, thieving: 50, woodcutting: 50 }, weight: 5, note: "Needs 107 quest points." },
  "A Kingdom Divided": { why: "Kourend favour rewards and the Arceuus spell upgrades.", reqs: { agility: 54, thieving: 52, woodcutting: 52, herblore: 50, mining: 42, crafting: 38, magic: 35 }, weight: 6 },
  "Sins of the Father": { why: "Darkmeyer: blood shards, vyre thieving and the Ivandis flail upgrade.", reqs: { woodcutting: 62, fletching: 60, crafting: 56, agility: 52, attack: 50, slayer: 50, magic: 49 }, weight: 6 },
  "Monkey Madness II": { why: "Demonic gorillas (zenyte) and the heavy ballista.", reqs: { slayer: 69, crafting: 70, hunter: 60, agility: 55, thieving: 55, firemaking: 60 }, weight: 8 },
  "Dragon Slayer II": { why: "Vorkath, Myths' Guild, rune and adamant dragons.", reqs: { magic: 75, smithing: 70, mining: 68, crafting: 62, agility: 60, thieving: 60, construction: 50, hitpoints: 50 }, weight: 10, note: "Needs 200 quest points." },
  "Song of the Elves": { why: "Prifddinas: Gauntlet, Zalcano, crystal armour, best agility course.", reqs: { agility: 70, construction: 70, farming: 70, herblore: 70, hunter: 70, mining: 70, smithing: 70, woodcutting: 70 }, weight: 10 },
  "Secrets of the North": { why: "Unlocks the Phantom Muspah boss.", reqs: { agility: 69, thieving: 64, hunter: 56 }, weight: 5 },
  "Desert Treasure II - The Fallen Empire": { why: "Four new bosses and the ancient ring/virtus path.", reqs: { firemaking: 75, magic: 75, thieving: 70, herblore: 62, runecraft: 60, construction: 60 }, weight: 9 },
  "Lunar Diplomacy": { why: "Lunar spellbook: vengeance, NPC contact, plank make.", reqs: { herblore: 5, crafting: 61, defence: 40, firemaking: 49, magic: 65, mining: 60, woodcutting: 55 }, weight: 6 },
  "Recipe for Disaster": { why: "Barrows gloves: best-in-slot gloves for most of the game.", reqs: { cooking: 70, agility: 48, mining: 50, fishing: 53, thieving: 53, herblore: 25, magic: 59, smithing: 40, firemaking: 50, ranged: 40, crafting: 40, fletching: 10, woodcutting: 36 }, weight: 10, note: "Needs 175 quest points for the final subquest." },
};

// Achievement diary rewards per region. Each tier upgrades the item (e.g. "Ardougne cloak 2").
export const DIARIES = {
  "Ardougne": { reward: "Ardougne cloak", weight: 8, highlight: "Monastery teleports and better Ardougne knight pickpocketing." },
  "Desert": { reward: "Desert amulet", weight: 5, highlight: "Nardah teleports and relief from desert heat." },
  "Falador": { reward: "Falador shield", weight: 6, highlight: "Daily prayer restores and Giant Mole perks." },
  "Fremennik": { reward: "Fremennik sea boots", weight: 5, highlight: "Rellekka teleports and Fremennik-province perks." },
  "Kandarin": { reward: "Kandarin headgear", weight: 7, highlight: "Extra Catherby herbs and Seers' Village perks." },
  "Karamja": { reward: "Karamja gloves", weight: 6, highlight: "Cheaper, then free, Brimhaven Dungeon and gem mine teleports." },
  "Kourend & Kebos": { reward: "Rada's blessing", weight: 7, highlight: "Kourend Woodland and Mount Karuulm teleports." },
  "Lumbridge & Draynor": { reward: "Explorer's ring", weight: 8, highlight: "Run energy restores, free alchemy casts and cabbage teleports." },
  "Morytania": { reward: "Morytania legs", weight: 8, highlight: "Morytania teleports and Barrows perks." },
  "Varrock": { reward: "Varrock armour", weight: 7, highlight: "Chance of extra ore while mining and Smithing perks." },
  "Western Provinces": { reward: "Western banner", weight: 6, highlight: "Pest Control and chinchompa/chompy perks." },
  "Wilderness": { reward: "Wilderness sword", weight: 5, highlight: "Fountain of Rune teleports and Wilderness perks." },
};

// Rough total level where a diary tier is usually within reach.
export const DIARY_TIER_TOTAL = { easy: 0, medium: 750, hard: 1300, elite: 1750 };

// Combat achievement points per task tier.
export const CA_TIER_POINTS = { Easy: 1, Medium: 2, Hard: 3, Elite: 4, Master: 5, Grandmaster: 6 };
export const CA_TIERS = ["Easy", "Medium", "Hard", "Elite", "Master", "Grandmaster"];


// Collection log pages that are relatively quick to fill (bonus added to their score).
// Keys must match the page names the plugin reads from the game.
export const CLOG_EASE = {
  "Beginner Treasure Trails": 14,
  "Easy Treasure Trails": 12,
  "Medium Treasure Trails": 8,
  "Hard Treasure Trails": 4,
  "Wintertodt": 6,
  "Tempoross": 6,
  "Giant Mole": 6,
  "Barrows Chests": 5,
  "Scurrius": 8,
  "Bryophyta": 8,
  "Obor": 8,
  "Shooting Stars": 6,
  "Champion's Challenge": 4,
};

// Collection log items that are rare drops (pets are detected separately from the All Pets page).
// Drop rates aren't in the game data the plugin can read, so this is hand-curated.
// `rare` is roughly 1/500 to 1/3000; `very rare` is rarer than that or a raid/mega-rare unique.
// `match` is a regular expression tested against the item's collection log name.
export const RARE_ITEMS = [
  // Boss jars (e.g. Jar of chemicals, Jar of swamp)
  { match: /^Jar of /i, band: "rare" },
  // Desert Treasure II ring vestiges
  { match: / vestige$/i, band: "rare" },
  // Wilderness and DKS rings
  { match: /^(Ring of the gods|Tyrannical ring|Treasonous ring|Berserker ring|Archers ring|Seers ring|Warrior ring)$/i, band: "rare" },
  // Boss rares
  { match: /^(Dragon warhammer|Draconic visage|Skeletal visage|Wyvern visage|Amulet of eternal glory|Uncut onyx)$/i, band: "very rare" },
  { match: /^(Tome of fire|Tome of water|Tome of earth|Dragon axe|Dragon pickaxe|Dragon harpoon|Tanzanite mutagen|Magma mutagen|Pegasian crystal|Primordial crystal|Eternal crystal|Smouldering stone)/i, band: "rare" },
  // Raid uniques
  { match: /^(Twisted bow|Kodai insignia|Elder maul|Dragon claws|Ancestral |Dinh's bulwark|Dexterous prayer scroll|Arcane prayer scroll|Twisted buckler|Dragon hunter crossbow)/i, band: "very rare" },
  { match: /^(Scythe of vitur|Ghrazi rapier|Sanguinesti staff|Justiciar |Avernic defender hilt)/i, band: "very rare" },
  { match: /^(Tumeken's shadow|Masori |Elidinis' ward|Osmumten's fang|Lightbearer)/i, band: "very rare" },
  // Clue mega-rares and notable rares
  { match: /^(3rd age |Ring of 3rd age$)/i, band: "very rare" },
  { match: /^(Gilded |Ranger boots$|Holy sandals$)/i, band: "rare" },
];

// ---- Effort rules ----------------------------------------------------------------------
// Pages whose effort is fixed regardless of drop rates.
//  - Guaranteed rewards: the item comes from finishing a challenge, not a drop.
//  - Team content that is seldom soloed: always a long haul (solo contribution assumed).
// Raids (the collection log's Raids tab) are always long hauls and need no entry here.
export const PAGE_EFFORT = {
  "The Fight Caves": "Medium", // Fire cape: a good goal for any player
  "The Inferno": "Long", // end-game achievement
  "Fortis Colosseum": "Long", // end-game achievement
  "Corporeal Beast": "Long", // team content
  "Nex": "Long", // team content
  "The Nightmare": "Long", // team content
};
// Combat achievement bosses that follow the same rule as the pages above.
export const MONSTER_EFFORT = {
  "TzKal-Zuk": "Long",
  "Fortis Colosseum": "Long",
  "Corporeal Beast": "Long",
  "Nex": "Long",
  "The Nightmare": "Long",
};

// Fixed effort for single items; these win over every other rule.
// Superior Slayer creature drops: the wiki rate is per superior, but superiors only spawn
// occasionally, so the raw rate hides the real grind.
const SUPERIOR_RARE = "Only drops from superior Slayer creatures, which spawn rarely: a long haul";
const SUPERIOR_COMMON = "Drops from superior Slayer creatures; common once one spawns";
const MOON_KEYS = "Requires a skilling and combat half of key, combat keys are easier to come by, but skilling keys can take several hours to amass";
export const ITEM_EFFORT = {
  "Eternal gem": { effort: "Long", why: SUPERIOR_RARE },
  "Imbued heart": { effort: "Long", why: SUPERIOR_RARE },
  "Mist battlestaff": { effort: "Medium", why: SUPERIOR_COMMON },
  "Dust battlestaff": { effort: "Medium", why: SUPERIOR_COMMON },
  "Helmet of the moon": { effort: "Long", why: MOON_KEYS },
};

// Kill-count rewards: unlocked by reaching a number of completions (raid shrouds and records,
// Xeric's capes, Victor's capes). Always suggested one at a time, never grouped into a family;
// only "Complete the log" covers several. `series` strips the rank so tiers can be ordered.
export const KC_REWARDS = [
  /^Living record \(tier \d\)$/i,
  /^Icthlarin's shroud \(tier \d\)$/i,
  /^Sinhaza shroud tier \d$/i,
  /^Xeric's (guard|warrior|sentinel|general|champion)$/i,
  /^Victor's cape \(\d+\)$/i,
];

// Items with duplicate protection (you always get a piece you're missing): always Balanced.
export const PROTECTED_ITEMS = [
  /^Bludgeon (spine|claw|axon)$/i, // Abyssal Sire / Unsired
  /^Hydra's (eye|fang|heart)$/i, // Alchemical Hydra ring pieces
  /^Noxious (point|blade|pommel)$/i, // Araxxor halberd pieces
];

// Clue pages: base effort per tier. When the clues toggle is on, effort tapers up as a page
// fills, because the remaining slots compete with duplicates from every casket.
export const CLUE_PAGE_BASE = {
  "Beginner Treasure Trails": 0,
  "Easy Treasure Trails": 0,
  "Medium Treasure Trails": 0,
  "Hard Treasure Trails": 1,
  "Elite Treasure Trails": 1,
  "Master Treasure Trails": 2,
  "Hard Treasure Trails (Rare)": 2,
  "Elite Treasure Trails (Rare)": 2,
  "Master Treasure Trails (Rare)": 2,
  "Shared Treasure Trail Rewards": 1,
  "Scroll Cases": 1,
};

// ---- Drop rates -> effort ---------------------------------------------------------------
// Drop rates come from web/data/drop-rates.json (a one-off OSRS Wiki snapshot). Effort is
// expected hours = attempts needed / attempts per hour. These are typical minutes per kill or
// per run for a reasonably geared player; adjust to taste. Barrows and Moons assume a full run.
export const MINUTES_PER_ATTEMPT = {
  "Abyssal Sire": 2.5, "Alchemical Hydra": 2, "Amoxliatl": 1.5, "Araxxor": 2, "Barrows Chests": 5,
  "Bryophyta": 1.5, "Callisto and Artio": 2, "Cerberus": 1.5, "Chaos Elemental": 1.5, "Chaos Fanatic": 1,
  "Commander Zilyana": 2, "Crazy Archaeologist": 1, "Dagannoth Kings": 2, "Deranged Archaeologist": 1,
  "Duke Sucellus": 2.5, "General Graardor": 2, "Giant Mole": 1.5, "Grotesque Guardians": 2,
  "Hespori": 3, "The Hueycoatl": 4, "Kalphite Queen": 3, "King Black Dragon": 1.5, "Kraken": 0.75,
  "Kree'arra": 2, "K'ril Tsutsaroth": 2, "The Leviathan": 2.5, "Moons of Peril": 5, "Obor": 1.5,
  "Phantom Muspah": 2.5, "Royal Titans": 1.5, "Sarachnis": 1.5, "Scorpia": 1.5, "Scurrius": 1,
  "Skotizo": 3, "Tempoross": 7, "Thermonuclear Smoke Devil": 0.75, "The Gauntlet": 7, "Vardorvis": 2.5,
  "Venenatis and Spindel": 2, "Vet'ion and Calvar'ion": 2, "Vorkath": 2, "The Whisperer": 3,
  "Wintertodt": 6, "Yama": 4, "Zalcano": 4, "Zulrah": 2,
};
// Wiki sources that are a second roll or a reward table rather than a kill. `page` links the
// source to its collection log page, `perAttempt` is the chance of reaching that table per
// kill, and `minutes` overrides minutes per roll.
export const SOURCE_RULES = {
  "Unsired": { page: "Abyssal Sire", perAttempt: 1 / 100 },
  "Reward pool": { page: "Tempoross", minutes: 1.2 },
};
// Used when a page isn't listed above.
export const TAB_MINUTES = { Bosses: 2.5, Raids: 30, Clues: 10, Minigames: 10, Other: 1 };
// Expected hours at or under these limits count as Quick / Balanced; anything longer is a Long haul.
export const EFFORT_HOURS = { Quick: 3, Medium: 20 };

// ---- Opt-in content --------------------------------------------------------------------
// Minigames and clues follow the collection log's own tabs. Wilderness content is listed here.
export const WILDERNESS_PAGES = new Set([
  "Callisto and Artio", "Venenatis and Spindel", "Vet'ion and Calvar'ion", "Chaos Elemental",
  "Chaos Fanatic", "Crazy Archaeologist", "Scorpia", "King Black Dragon", "Revenants", "Elder Chaos Druids",
]);
export const WILDERNESS_MONSTERS = new Set([
  "Callisto", "Artio", "Venenatis", "Spindel", "Vet'ion", "Calvar'ion", "Chaos Elemental",
  "Chaos Fanatic", "Crazy Archaeologist", "Scorpia", "King Black Dragon", "Revenants",
]);

// Skills you can't train at all until a quest is done (OSRS Wiki, November 2026). The route
// planner puts the quest before any training step for the skill.
export const SKILL_UNLOCK_QUESTS = {
  herblore: "Druidic Ritual",
  sailing: "Pandemonium",
};

// ---- Access requirements ---------------------------------------------------------------
// Content that is hidden until you meet its requirement. `match` is tested against collection
// log page names and combat achievement boss names. Only well-known gates are listed.
export const CONTENT_REQS = [
  { match: /^Vorkath$/, quests: ["Dragon Slayer II"] },
  { match: /^Zulrah$/, quests: ["Regicide"] },
  { match: /^(The Gauntlet|Zalcano|Crystalline Hunllef|Corrupted Hunllef)$/, quests: ["Song of the Elves"] },
  { match: /^Phantom Muspah$/, quests: ["Secrets of the North"] },
  { match: /^(Duke Sucellus|The Leviathan|The Whisperer|Vardorvis)$/, quests: ["Desert Treasure II - The Fallen Empire"] },
  { match: /^Moons of Peril$/, quests: ["Perilous Moons"] },
  { match: /^Demonic Gorilla$/, quests: ["Monkey Madness II"] },
  { match: /^Tormented Demons?$/, quests: ["While Guthix Sleeps"] },
  { match: /^(Barrows|Barrows Chests|Theatre of Blood.*|The Nightmare|Phosani's Nightmare)$/, quests: ["Priest in Peril"] },
  { match: /^Grotesque Guardians$/, skills: { slayer: 75 } },
  { match: /^Abyssal Sire$/, skills: { slayer: 85 } },
  { match: /^Kraken$/, skills: { slayer: 87 } },
  { match: /^Cerberus$/, skills: { slayer: 91 } },
  { match: /^Araxxor$/, skills: { slayer: 92 } },
  { match: /^Thermonuclear Smoke Devil$/, skills: { slayer: 93 } },
  { match: /^Alchemical Hydra$/, skills: { slayer: 95 } },
];

// ---- Slayer task speed -------------------------------------------------------------------
// Rough kills per hour for a mid-to-high level account using standard methods (no cannon or
// barraging), keyed by task name in lower case. Rough guides only: they set the card's effort tier
// and time estimate. Unlisted tasks use the defaults.
export const SLAYER_KILLS_PER_HOUR = {
  "aberrant spectres": 120, "abyssal demons": 120, "adamant dragons": 40, "ankou": 150, "araxytes": 150,
  "aviansies": 100, "bandits": 200, "banshees": 250, "basilisks": 150, "bats": 300, "bears": 200,
  "birds": 400, "black demons": 90, "black dragons": 60, "bloodveld": 180, "blue dragons": 80,
  "brine rats": 200, "bronze dragons": 80, "cave bugs": 400, "cave crawlers": 300, "cave horrors": 120,
  "cave kraken": 200, "cave slimes": 300, "cockatrice": 250, "cows": 400, "crawling hands": 300,
  "crocodiles": 200, "dagannoth": 150, "dark beasts": 90, "dogs": 300, "drakes": 100, "dust devils": 250,
  "dwarves": 300, "earth warriors": 250, "elves": 120, "fever spiders": 250, "fire giants": 120,
  "fossil island wyverns": 90, "gargoyles": 120, "ghosts": 250, "ghouls": 250, "goblins": 500,
  "greater demons": 120, "hellhounds": 150, "hill giants": 250, "hobgoblins": 300, "hydras": 100,
  "ice giants": 200, "ice warriors": 250, "icefiends": 400, "infernal mages": 200, "iron dragons": 80,
  "jellies": 250, "jungle horrors": 200, "kalphite": 250, "killerwatts": 250, "kurask": 150,
  "lesser demons": 200, "lizardmen": 120, "lizards": 300, "minotaurs": 400, "mithril dragons": 40,
  "mogres": 200, "molanisks": 250, "monkeys": 500, "moss giants": 250, "mutated zygomites": 200,
  "nechryael": 150, "ogres": 250, "otherworldly beings": 250, "pyrefiends": 300, "rats": 500,
  "red dragons": 80, "revenants": 100, "rockslugs": 400, "rune dragons": 35, "scabarites": 150,
  "scorpions": 400, "sea snakes": 150, "shades": 200, "skeletal wyverns": 70, "skeletons": 300,
  "smoke devils": 200, "sourhogs": 250, "spiders": 400, "spiritual creatures": 150, "steel dragons": 70,
  "suqahs": 120, "terror dogs": 250, "trolls": 150, "turoth": 250, "tzhaar": 150, "vampyres": 200,
  "wall beasts": 200, "warped creatures": 200, "waterfiends": 120, "wolves": 300, "wyrms": 150,
  "zombies": 300,
  // Boss tasks, by boss name.
  "abyssal sire": 25, "alchemical hydra": 25, "cerberus": 40, "dagannoth kings": 40, "giant mole": 50,
  "grotesque guardians": 25, "kalphite queen": 20, "king black dragon": 50, "kraken": 80,
  "sarachnis": 50, "thermonuclear smoke devil": 60, "vorkath": 25, "zulrah": 25,
};
export const SLAYER_DEFAULT_KILLS_PER_HOUR = { task: 150, boss: 20 };
// Effort tiers for a Slayer task by estimated minutes left (travel and banking not included).
export const SLAYER_EFFORT_MINUTES = { Quick: 30, Medium: 90 };

// ---- Slayer task bosses -----------------------------------------------------------------
// Bosses that count toward a Slayer task, keyed by the task name in lower case. Requirements come
// from CONTENT_REQS above (matched by boss name) plus any listed here. Only well-known ones.
export const SLAYER_BOSSES = {
  "hellhounds": [{ name: "Cerberus" }],
  "abyssal demons": [{ name: "Abyssal Sire" }],
  "cave kraken": [{ name: "Kraken" }],
  "smoke devils": [{ name: "Thermonuclear Smoke Devil" }],
  "hydras": [{ name: "Alchemical Hydra" }],
  "gargoyles": [{ name: "Grotesque Guardians" }],
  "araxytes": [{ name: "Araxxor" }],
  "spiders": [{ name: "Sarachnis" }, { name: "Venenatis" }, { name: "Spindel" }],
  "kalphite": [{ name: "Kalphite Queen" }],
  "black dragons": [{ name: "King Black Dragon" }],
  "blue dragons": [{ name: "Vorkath" }],
  "dagannoth": [{ name: "Dagannoth Kings" }],
  "aviansies": [{ name: "Kree'arra", skills: { ranged: 70 } }],
  "greater demons": [{ name: "K'ril Tsutsaroth", skills: { hitpoints: 70 } }],
  "bears": [{ name: "Callisto" }, { name: "Artio" }],
  "scorpions": [{ name: "Scorpia" }],
};

// ---- Account types -------------------------------------------------------------------------
// Ironmen (every type: regular, Hardcore, Ultimate, Group) can't trade, so unlocks that help them
// supply themselves are worth more. Each entry adds `boost` to a quest or diary region's
// suggestions and puts `why` on the card. Diaries match every tier of the region.
export const IRON_PRIORITIES = {
  quests: {
    "Recipe for Disaster": { boost: 12, why: "Barrows gloves: as an Ironman you can't buy better gloves" },
    "Animal Magnetism": { boost: 10, why: "Ava's device saves arrows you'd otherwise have to make yourself" },
    "Bone Voyage": { boost: 10, why: "Fossil Island: birdhouses and Volcanic Mine supply an Ironman for a long time" },
    "Fairytale II - Cure a Queen": { boost: 8, why: "Fairy rings make every herb and supply run faster" },
    "Lunar Diplomacy": { boost: 8, why: "NPC Contact, Plank Make and String Jewellery do a lot of an Ironman's chores" },
    "Monkey Madness II": { boost: 6, why: "Demonic gorillas: your own route to zenyte" },
  },
  diaries: {
    "Lumbridge & Draynor": { boost: 6, why: "Free alchemy casts from the Explorer's ring help an Ironman's cash" },
    "Kandarin": { boost: 6, why: "Extra Catherby herbs and flax: supplies an Ironman has to gather" },
    "Varrock": { boost: 5, why: "Varrock armour's extra ore speeds up gathering your own bars" },
    "Ardougne": { boost: 5, why: "Ardougne cloak teleports and better pickpocketing for an Ironman's cash" },
  },
};
// Group Ironman: team content is a natural fit for the group. Applied to collection log pages
// on the Raids tab and to the team bosses below (and their combat achievements).
export const GROUP_CONTENT_BOOST = 5;
export const TEAM_PAGES = new Set(["Corporeal Beast", "Nex", "The Nightmare"]);

// ---- Requirements for "Within reach" -----------------------------------------------------
// Quests: web/data/quest-reqs.json (every quest, made by scripts/update-quest-reqs.mjs) is used
// first; QUEST_PREREQS and QUESTS[].reqs are the fallback if it fails to load, and
// `npm run check` warns when they disagree with it.
// Taken from the OSRS Wiki (November 2026). Used to tell how close a quest or diary tier is and
// what's still missing. Skill levels are the highest needed anywhere in the quest or tier; boosts
// can cover some of them. `combat` is combat level and `questPoints` quest points.

// Quests that must be finished first (direct prerequisites only) and quest points needed.
// Subquests the game doesn't list as their own quest (Recipe for Disaster's "Freeing King
// Awowogei", needed for Monkey Madness II) are left out, since their state can't be checked.
export const QUEST_PREREQS = {
  "Animal Magnetism": { quests: ["The Restless Ghost", "Ernest the Chicken", "Priest in Peril"] },
  "Lost City": { quests: [] },
  "Fairytale II - Cure a Queen": { quests: ["Fairytale I - Growing Pains"] },
  "Bone Voyage": { quests: ["The Dig Site"] },
  "Priest in Peril": { quests: [] },
  "Regicide": { quests: ["Underground Pass"] },
  "Horror from the Deep": { quests: ["Alfred Grimhand's Barcrawl"] },
  "Heroes' Quest": { quests: ["Shield of Arrav", "Lost City", "Merlin's Crystal", "Dragon Slayer I"], questPoints: 55 },
  "Monkey Madness I": { quests: ["The Grand Tree", "Tree Gnome Village"] },
  "Desert Treasure I": { quests: ["The Dig Site", "Temple of Ikov", "The Tourist Trap", "Troll Stronghold", "Priest in Peril", "Waterfall Quest"] },
  "Legends' Quest": { quests: ["Family Crest", "Heroes' Quest", "Shilo Village", "Underground Pass", "Waterfall Quest"], questPoints: 107 },
  "A Kingdom Divided": { quests: ["The Depths of Despair", "The Queen of Thieves", "The Ascent of Arceuus", "The Forsaken Tower", "Tale of the Righteous"] },
  "Sins of the Father": { quests: ["Vampyre Slayer", "A Taste of Hope"] },
  "Monkey Madness II": { quests: ["Enlightened Journey", "The Eyes of Glouphrie", "Troll Stronghold", "Watchtower"] },
  "Dragon Slayer II": { quests: ["Legends' Quest", "Dream Mentor", "A Tail of Two Cats", "Animal Magnetism", "Ghosts Ahoy", "Bone Voyage", "Client of Kourend"], questPoints: 200 },
  "Song of the Elves": { quests: ["Mourning's End Part II", "Making History", "Druidic Ritual"] },
  "Secrets of the North": { quests: ["Making Friends with My Arm", "The General's Shadow", "Devious Minds", "Hazeel Cult"] },
  "Desert Treasure II - The Fallen Empire": { quests: ["Desert Treasure I", "Secrets of the North", "Enakhra's Lament", "Temple of the Eye", "The Garden of Death", "Below Ice Mountain", "His Faithful Servants"] },
  "Lunar Diplomacy": { quests: ["The Fremennik Trials", "Lost City", "Rune Mysteries", "Shilo Village"] },
  // The final subquest's own requirements; every earlier subquest is needed too.
  "Recipe for Disaster": { quests: ["Desert Treasure I", "Horror from the Deep"], questPoints: 175 },
};

// Everything a diary tier needs: skills (plus combat / questPoints) and quests to have finished.
// `allQuests` means every quest (Lumbridge & Draynor Elite needs the Quest point cape).
// Subquests (Recipe for Disaster's "Freeing King Awowogei" for Western Provinces) are left out.
export const DIARY_REQS = {
  "Ardougne": {
    easy: { skills: { thieving: 5 }, quests: ["Biohazard", "Rune Mysteries"] },
    medium: { skills: { agility: 39, strength: 38, ranged: 21, farming: 31, magic: 51, firemaking: 50, thieving: 38 }, quests: ["Enlightened Journey", "The Hand in the Sand", "Plague City", "Rune Mysteries", "Tower of Life", "Underground Pass"] },
    hard: { skills: { magic: 66, thieving: 72, hunter: 59, farming: 70, smithing: 68, construction: 50, runecraft: 65 }, quests: ["Enlightened Journey", "The Hand in the Sand", "Legends' Quest", "Monkey Madness I", "Mourning's End Part II", "Rune Mysteries", "Tower of Life", "Watchtower"] },
    elite: { skills: { fishing: 81, cooking: 91, thieving: 82, crafting: 10, smithing: 91, fletching: 69, farming: 85, agility: 90, magic: 94 }, quests: ["Desert Treasure I", "Enlightened Journey", "The Hand in the Sand", "Haunted Mine", "Legends' Quest", "Monkey Madness I", "Mourning's End Part II", "Rune Mysteries", "Tower of Life", "Watchtower"] },
  },
  "Desert": {
    easy: { skills: { hunter: 5, thieving: 21 }, quests: [] },
    medium: { skills: { agility: 30, slayer: 22, hunter: 47, thieving: 25, herblore: 36, construction: 20, woodcutting: 35 }, quests: ["Eagles' Peak", "Enakhra's Lament", "The Golem", "Spirits of the Elid"] },
    hard: { skills: { thieving: 65, mining: 45, magic: 68, agility: 70, slayer: 65, defence: 10, attack: 50, firemaking: 60, smithing: 68 }, quests: ["Contact!", "Desert Treasure I", "Dream Mentor", "Eagles' Peak", "Enakhra's Lament", "The Feud", "The Golem", "Spirits of the Elid"] },
    elite: { skills: { cooking: 85, magic: 94, fletching: 95, construction: 78, thieving: 91, prayer: 85 }, quests: ["Contact!", "Desert Treasure I", "Dream Mentor", "Eagles' Peak", "Enakhra's Lament", "The Feud", "The Golem", "Priest in Peril", "Spirits of the Elid"] },
  },
  "Falador": {
    easy: { skills: { construction: 16, agility: 5, mining: 10, smithing: 13 }, quests: ["Doric's Quest", "The Knight's Sword"] },
    medium: { skills: { firemaking: 49, magic: 37, farming: 23, slayer: 32, agility: 42, strength: 37, ranged: 19, thieving: 40, prayer: 10, defence: 20, crafting: 40, mining: 40, woodcutting: 30 }, quests: ["Doric's Quest", "The Knight's Sword", "Recruitment Drive", "Skippy and the Mogres"] },
    hard: { skills: { runecraft: 56, prayer: 70, construction: 16, slayer: 72, agility: 50, mining: 60, thieving: 50, defence: 50 }, quests: ["Doric's Quest", "Grim Tales", "Heroes' Quest", "The Knight's Sword", "Skippy and the Mogres", "The Slug Menace"] },
    elite: { skills: { runecraft: 88, farming: 91, woodcutting: 75, agility: 80, herblore: 81 }, quests: ["Doric's Quest", "Grim Tales", "Heroes' Quest", "The Knight's Sword", "Skippy and the Mogres", "The Slug Menace", "Wanted!"] },
  },
  "Fremennik": {
    easy: { skills: { hunter: 11, crafting: 23, mining: 20, smithing: 20, thieving: 5, woodcutting: 15, firemaking: 15 }, quests: ["The Fremennik Trials"] },
    medium: { skills: { slayer: 47, mining: 40, thieving: 42, hunter: 45, construction: 37, defence: 30 }, quests: ["Between a Rock...", "Eagles' Peak", "Horror from the Deep", "The Fremennik Trials"] },
    hard: { skills: { magic: 72, hunter: 55, herblore: 66, thieving: 75, woodcutting: 56, mining: 70, smithing: 60 }, quests: ["Between a Rock...", "Eadgar's Ruse", "Eagles' Peak", "Horror from the Deep", "Lunar Diplomacy", "Throne of Miscellania"] },
    elite: { skills: { runecraft: 82, crafting: 80, agility: 80, hitpoints: 70, strength: 70, ranged: 70, slayer: 83 }, quests: ["Between a Rock...", "Eadgar's Ruse", "Eagles' Peak", "Horror from the Deep", "Lunar Diplomacy", "Throne of Miscellania"] },
  },
  "Kandarin": {
    easy: { skills: { fishing: 16, farming: 13, agility: 20 }, quests: [] },
    medium: { skills: { agility: 36, herblore: 48, ranged: 40, strength: 22, fishing: 46, cooking: 43, magic: 45, fletching: 50, farming: 26, thieving: 47, mining: 30 }, quests: ["Alfred Grimhand's Barcrawl", "Waterfall Quest"] },
    hard: { skills: { fishing: 70, agility: 60, strength: 50, fletching: 70, woodcutting: 60, prayer: 70, defence: 70, magic: 56, firemaking: 65, thieving: 53, construction: 50, smithing: 75 }, quests: ["Alfred Grimhand's Barcrawl", "King's Ransom"] },
    elite: { skills: { farming: 79, fishing: 76, cooking: 80, herblore: 86, agility: 60, smithing: 90, firemaking: 85, crafting: 85, magic: 87 }, quests: ["Alfred Grimhand's Barcrawl", "Family Crest", "Lunar Diplomacy"] },
  },
  "Karamja": {
    easy: { skills: { mining: 40, agility: 15 }, quests: [] },
    medium: { skills: { woodcutting: 50, cooking: 16, fishing: 65, farming: 27, hunter: 41, agility: 12, mining: 40 }, quests: ["Jungle Potion", "Shilo Village", "The Grand Tree"] },
    hard: { skills: { cooking: 50, runecraft: 44, agility: 53, thieving: 50, mining: 52, strength: 50, ranged: 42, slayer: 50, woodcutting: 10, combat: 100 }, quests: ["Shilo Village", "Tai Bwo Wannai Trio", "The Grand Tree"] },
    elite: { skills: { runecraft: 91, farming: 72, herblore: 87 }, quests: ["Tai Bwo Wannai Trio", "The Grand Tree"] },
  },
  "Kourend & Kebos": {
    easy: { skills: { mining: 15, thieving: 25, construction: 25, herblore: 12, fishing: 20 }, quests: ["Druidic Ritual"] },
    medium: { skills: { mining: 42, farming: 45, crafting: 30, construction: 30, fishing: 43, hunter: 53, agility: 49, firemaking: 50, woodcutting: 50 }, quests: ["The Ascent of Arceuus", "The Depths of Despair", "The Forsaken Tower", "The Queen of Thieves", "Tale of the Righteous"] },
    hard: { skills: { woodcutting: 60, smithing: 70, mining: 65, farming: 74, thieving: 49, slayer: 62, magic: 66 }, quests: ["The Ascent of Arceuus", "The Depths of Despair", "Dream Mentor", "The Forsaken Tower", "The Queen of Thieves", "Tale of the Righteous"] },
    elite: { skills: { runecraft: 77, mining: 38, crafting: 38, woodcutting: 90, fishing: 82, cooking: 84, slayer: 95, magic: 90, farming: 85, fletching: 40 }, quests: ["The Ascent of Arceuus", "The Depths of Despair", "Dream Mentor", "The Forsaken Tower", "The Queen of Thieves", "Tale of the Righteous"] },
  },
  "Lumbridge & Draynor": {
    easy: { skills: { slayer: 7, runecraft: 5, woodcutting: 15, firemaking: 15, fishing: 15, mining: 15 }, quests: ["Cook's Assistant", "Rune Mysteries"] },
    medium: { skills: { agility: 20, strength: 19, ranged: 50, magic: 31, fishing: 30, crafting: 38, woodcutting: 30, thieving: 38, hunter: 42, runecraft: 23, combat: 70 }, quests: ["Animal Magnetism", "Cook's Assistant", "Lost City", "Rune Mysteries"] },
    hard: { skills: { magic: 60, agility: 46, runecraft: 59, woodcutting: 57, farming: 63, firemaking: 65, prayer: 52, crafting: 70 }, quests: ["Animal Magnetism", "Another Slice of H.A.M.", "Lost City", "Recipe for Disaster", "Rune Mysteries", "Tears of Guthix"] },
    elite: { skills: { thieving: 78, agility: 70, ranged: 70, strength: 70, woodcutting: 75, smithing: 88, runecraft: 76, combat: 85 }, quests: [], allQuests: true },
  },
  "Morytania": {
    easy: { skills: { crafting: 15, cooking: 12, combat: 20, slayer: 15, farming: 23 }, quests: ["Nature Spirit"] },
    medium: { skills: { hunter: 29, agility: 40, woodcutting: 45, slayer: 42, cooking: 40, smithing: 35, herblore: 22 }, quests: ["Cabin Fever", "Dwarf Cannon", "Ghosts Ahoy", "Lair of Tarn Razorlor"] },
    hard: { skills: { magic: 66, construction: 50, agility: 71, farming: 53, woodcutting: 50, firemaking: 50, slayer: 58, prayer: 70, defence: 70, mining: 55 }, quests: ["Cabin Fever", "Desert Treasure I", "Dwarf Cannon", "Ghosts Ahoy", "Haunted Mine", "In Aid of the Myreque", "Lair of Tarn Razorlor"] },
    elite: { skills: { fishing: 96, strength: 76, firemaking: 80, magic: 83, crafting: 84, slayer: 85, defence: 70 }, quests: ["Desert Treasure I", "Dwarf Cannon", "Ghosts Ahoy", "In Aid of the Myreque", "Lair of Tarn Razorlor", "Lunar Diplomacy", "Shades of Mort'ton"] },
  },
  "Varrock": {
    easy: { skills: { mining: 15, agility: 13, crafting: 8, runecraft: 9, fishing: 20, thieving: 5 }, quests: ["Rune Mysteries"] },
    medium: { skills: { magic: 49, combat: 40, farming: 30, firemaking: 40, agility: 30, questPoints: 32 }, quests: ["A Soul's Bane", "The Dig Site", "Enlightened Journey", "Garden of Tranquillity", "Gertrude's Cat", "Rune Mysteries", "Tree Gnome Village"] },
    hard: { skills: { hunter: 66, woodcutting: 60, magic: 54, firemaking: 60, construction: 50, farming: 68, prayer: 52, agility: 51 }, quests: ["A Soul's Bane", "Desert Treasure I", "Enlightened Journey", "Garden of Tranquillity", "Gertrude's Cat", "Rune Mysteries", "Tree Gnome Village"] },
    elite: { skills: { herblore: 90, magic: 86, cooking: 95, smithing: 89, fletching: 81, runecraft: 78 }, quests: ["A Soul's Bane", "Desert Treasure I", "Dream Mentor", "Druidic Ritual", "Enlightened Journey", "Garden of Tranquillity", "Gertrude's Cat", "The Tourist Trap", "Tree Gnome Village"] },
  },
  "Western Provinces": {
    easy: { skills: { hunter: 9, mining: 15, fletching: 20, combat: 40 }, quests: ["Big Chompy Bird Hunting", "Rune Mysteries"] },
    medium: { skills: { agility: 37, hunter: 31, fishing: 46, woodcutting: 35, firemaking: 35, combat: 70, cooking: 42, mining: 40 }, quests: ["Big Chompy Bird Hunting", "Eagles' Peak", "The Eyes of Glouphrie", "The Grand Tree", "Tree Gnome Village"] },
    hard: { skills: { ranged: 70, fishing: 62, cooking: 62, combat: 100, hunter: 69, agility: 48, woodcutting: 50, firemaking: 50, mining: 70, farming: 68, construction: 65, magic: 64, thieving: 75 }, quests: ["Big Chompy Bird Hunting", "Eagles' Peak", "The Eyes of Glouphrie", "Roving Elves", "Swan Song"] },
    elite: { skills: { fletching: 85, slayer: 93, farming: 75, agility: 85, thieving: 85, prayer: 22, attack: 42, strength: 42, defence: 42, hitpoints: 42, ranged: 42, magic: 42 }, quests: ["Big Chompy Bird Hunting", "Eagles' Peak", "Swan Song", "The Eyes of Glouphrie", "Underground Pass"] },
  },
  "Wilderness": {
    easy: { skills: { magic: 21, agility: 15, mining: 15 }, quests: ["Enter the Abyss"] },
    medium: { skills: { mining: 55, woodcutting: 61, agility: 60, magic: 60, slayer: 50, smithing: 50 }, quests: ["Enter the Abyss"] },
    hard: { skills: { magic: 66, hunter: 67, smithing: 75, agility: 64, slayer: 68, fishing: 53, herblore: 25 }, quests: ["Death Plateau", "Enter the Abyss", "Mage Arena I"] },
    elite: { skills: { magic: 96, fishing: 85, cooking: 90, mining: 85, smithing: 90, thieving: 84, agility: 60, slayer: 83, woodcutting: 75, firemaking: 75 }, quests: ["Death Plateau", "Desert Treasure I", "Enter the Abyss", "Mage Arena I"] },
  },
};


// ---- XP per hour (time to a level) -----------------------------------------------------------
// Rough XP/hour ranges for one mainstream method per level band, copied from the OSRS Wiki's
// training guides (read 2026-11-26). Each band starts at `from` and its method keeps applying until
// the next band starts (methods don't get slower as you level). [from, low, high, method].
// Skills whose guides gave no usable figure are left out (no estimate is shown for them):
// Attack, Strength, Defence, Hitpoints, Magic, Slayer, Hunter, Construction, Farming, Fletching.
// Levels below a skill's first band get no estimate either. Ranges are the guide's, so the top
// end is often a best case; the card shows both ends.
export const XP_RATES = {
  agility: [[40, 45000, 50000, "Brimhaven Agility Arena"], [50, 50000, 60000, "the Wilderness course (PK risk)"], [70, 47000, 53000, "rooftop courses"], [90, 66000, 70000, "the Ardougne rooftop course"]],
  cooking: [[30, 141000, 180000, "karambwans"], [50, 180000, 218000, "karambwans"], [70, 218000, 263000, "karambwans"], [90, 263000, 273000, "karambwans"]],
  crafting: [[20, 139000, 298850, "cutting gems (costs money)"], [54, 245000, 336875, "battlestaves"], [71, 353850, 434730, "d'hide bodies (costs money)"]],
  firemaking: [[1, 74250, 200475, "burning logs"], [50, 233887, 300712, "mahogany and yew logs"], [70, 300712, 451143, "yew and magic logs"], [90, 519750, 519750, "redwood logs"]],
  fishing: [[20, 13000, 34000, "fly fishing"], [50, 57500, 88550, "drift net fishing"], [70, 48000, 54000, "barbarian fishing"], [90, 54000, 57000, "barbarian fishing"]],
  herblore: [[3, 62500, 281250, "making potions (costs money)"], [50, 281250, 393750, "making potions (costs money)"], [70, 275000, 563750, "making potions (costs money)"]],
  mining: [[15, 45000, 55000, "iron ore"], [60, 70000, 80000, "iron ore in the Mining Guild"]],
  prayer: [[30, 670000, 820000, "the libation bowl (costs money)"], [48, 923000, 1050000, "the libation bowl (costs money)"], [70, 1050000, 1118000, "the libation bowl (costs money)"]],
  ranged: [[50, 360000, 470000, "chinchompas (costs money)"], [80, 140000, 230000, "the Venator bow on monkeys"]],
  runecraft: [[1, 36300, 58000, "talisman tiaras (costs money)"], [50, 61300, 65700, "lava runes"], [75, 77600, 100800, "lava runes"], [90, 100800, 102100, "lava runes"]],
  sailing: [[30, 19342, 24519, "Barracuda Trials"], [55, 64746, 88923, "Barracuda Trials"], [72, 113538, 184369, "Barracuda Trials"], [90, 184369, 200000, "Barracuda Trials"]],
  smithing: [[1, 13900, 108500, "smithing at an anvil"], [48, 144000, 200000, "platebodies at an anvil (costs money)"], [88, 240000, 240000, "adamant platebodies (costs money)"]],
  thieving: [[50, 103000, 236000, "blackjacking"], [70, 236000, 257000, "blackjacking"], [90, 257000, 265000, "blackjacking"]],
  woodcutting: [[35, 34000, 46000, "teak trees"], [50, 46000, 65000, "teak trees"], [71, 86300, 97400, "sulliuscep"], [90, 97400, 101900, "sulliuscep"]],
};
