// OSRS TaskMaster knowledge base.
// Hand-curated game facts the recommender uses on top of your synced data.
// Skill requirements are the main skill gates only; prerequisite quests are listed in `note`.
// Edit freely: everything here is plain data.

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
  "Recipe for Disaster": { why: "Barrows gloves: best-in-slot gloves for most of the game.", reqs: { cooking: 70, agility: 48, mining: 50, fishing: 53, thieving: 53, herblore: 25, magic: 59, smithing: 40, firemaking: 50, ranged: 40, crafting: 40, fletching: 10, slayer: 10, woodcutting: 36 }, weight: 10, note: "Needs 175 quest points for the final subquest." },
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

