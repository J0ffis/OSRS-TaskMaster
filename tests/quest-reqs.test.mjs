// The quest requirement snapshot (web/data/quest-reqs.json) and the script that makes it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRequirements, gameName, buildQuests, missingQuests } from "../scripts/update-quest-reqs.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (...p) => JSON.parse(readFileSync(join(root, ...p), "utf8"));

// Shortened copies of the wiki's rendered requirement lists.
const scp = (skill, level) => `<span class="scp" data-skill="${skill}" data-level="${level}" style="x">[[File:${skill} icon.png|link=${skill}]] ${level} [[${skill}]]</span> <sup class="nowrap">[<span title="t">not boostable</span>]</sup>`;
const DS2 = [
  `*${scp("Quest points", 200)}`,
  `*${scp("Magic", 75)}`,
  `*${scp("Smithing", 70)}`,
  "*Completion of the following quests:",
  "**[[Legends' Quest]]",
  "***[[Family Crest]]",
  "***[[Heroes' Quest]]",
  "****[[Dragon Slayer I]]",
  "**[[Bone Voyage]]",
  "***[[The Dig Site]]",
  "***100 [[Kudos]]",
  "*Started the [[Barbarian_Training#Pyre_ships|pyre ship]] portion of the [[Barbarian Training]] [[miniquest]]",
  "*The ability to defeat a level 83 [[Elvarg|dragon]]",
].join("\n");
const QUESTS = new Set(["Legends' Quest", "Family Crest", "Heroes' Quest", "Dragon Slayer I", "Bone Voyage", "The Dig Site", "Barbarian Training", "Death Plateau"]);

test("quest requirements: skills, quest points, direct prerequisites, other lines", () => {
  const r = parseRequirements(DS2, (n) => QUESTS.has(n));
  assert.deepEqual(r.skills, { magic: 75, smithing: 70 });
  assert.equal(r.questPoints, 200);
  // Only the direct prerequisites: the chain is followed through each quest's own entry.
  assert.deepEqual(r.quests, ["Legends' Quest", "Bone Voyage", "Barbarian Training"]);
  assert.deepEqual(r.other, [], "Kudos belongs to Bone Voyage, under a quest");
  assert.deepEqual(r.fights, ["The ability to defeat a level 83 dragon"]);
});

test("quest requirements: 'Completion of' lines, notes and 'None'", () => {
  const troll = `* Completion of <span class="scp" data-skill="Quest points" style="x">[[File:Quest point icon.png|link=Quest points]] </span> [[Death Plateau]]\n* ${scp("Agility", 15)} (47 is recommended)`;
  const r = parseRequirements(troll, (n) => QUESTS.has(n));
  assert.deepEqual(r.quests, ["Death Plateau"], "an empty quest point icon doesn't make it a skill line");
  assert.deepEqual(r.skills, { agility: 15 });
  const note = parseRequirements("'''Note:''' The following skill levels are only for the end.\n*100 [[Kudos]]", () => false);
  assert.deepEqual(note.other, ["100 Kudos"]);
  assert.deepEqual(parseRequirements("None", () => false).quests, []);
});

test("quest requirements: wiki page names become the game's names", () => {
  assert.equal(gameName("Recipe for Disaster/Freeing King Awowogei"), "Recipe for Disaster - King Awowogei");
  assert.equal(gameName("Recipe for Disaster/Defeating the Culinaromancer"), "Recipe for Disaster - Culinaromancer");
  assert.equal(gameName("Recipe for Disaster/Freeing the Goblin generals"), "Recipe for Disaster - Wartface & Bentnoze");
  assert.equal(gameName("Recipe for Disaster/Full guide"), null);
  assert.equal(gameName("Vale Totems (miniquest)"), "Vale Totems");
  const built = buildQuests([
    { page_name: "Monkey Madness II", requirements: "*Completion of the following quests:\n**[[Recipe for Disaster/Freeing King Awowogei]]" },
    { page_name: "Recipe for Disaster/Freeing King Awowogei", requirements: "None" },
    { page_name: "Recipe for Disaster/Full guide", requirements: "None" },
  ]);
  assert.deepEqual(Object.keys(built), ["Monkey Madness II", "Recipe for Disaster - King Awowogei"]);
  assert.deepEqual(built["Monkey Madness II"].quests, ["Recipe for Disaster - King Awowogei"]);
});

test("quest requirements script: only asks the wiki about quests the file doesn't cover", () => {
  const file = { quests: { "Cook's Assistant": {}, "Dragon Slayer I": {} }, notOnWiki: ["Odd Name"] };
  assert.deepEqual(missingQuests(["Cook's Assistant", "Dragon Slayer I", "Odd Name"], file), [], "nothing new: no request");
  assert.deepEqual(missingQuests(["Cook's Assistant", "A Brand New Quest"], file), ["A Brand New Quest"]);
  assert.deepEqual(missingQuests(["Cook's Assistant"], null), ["Cook's Assistant"], "no file yet: everything is missing");
  // The real snapshot covers the game names, so a normal re-run sends nothing.
  assert.deepEqual(missingQuests(readJson("tests", "fixtures", "game-names.json").quests, readJson("web", "data", "quest-reqs.json")), []);
});

test("quest requirement snapshot: covers every quest in the game, with no broken links or loops", () => {
  const { quests } = readJson("web", "data", "quest-reqs.json");
  const game = readJson("tests", "fixtures", "game-names.json").quests;
  assert.deepEqual(game.filter((q) => !quests[q]), [], "every quest the game lists has an entry");
  for (const [name, q] of Object.entries(quests)) {
    for (const p of q.quests ?? []) assert.ok(quests[p], `${name} needs ${p}, which has no entry`);
  }
  // No quest needs itself, however far down the chain.
  const state = new Map();
  const visit = (n, path) => {
    if (state.get(n) === "done") return;
    assert.notEqual(state.get(n), "open", `loop: ${[...path, n].join(" -> ")}`);
    state.set(n, "open");
    for (const p of quests[n]?.quests ?? []) visit(p, [...path, n]);
    state.set(n, "done");
  };
  for (const n of Object.keys(quests)) visit(n, []);
});
