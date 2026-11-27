// The knowledge-base checker: the real knowledge base passes, and the mistakes it exists to
// catch are caught.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as KB from "../web/knowledge-base.js";
import { checkKnowledgeBase } from "./check-knowledge-base.mjs";

test("knowledge-base.js has no errors", () => {
  const { errors } = checkKnowledgeBase(KB);
  assert.deepEqual(errors, []);
});

test("a misspelt item and a tier that doesn't exist are both caught", () => {
  // The Helmet of the moon rule that once did nothing: "Helment" and "Long-Haul".
  const broken = { ...KB, ITEM_EFFORT: { ...KB.ITEM_EFFORT, "Helment of the moon": { effort: "Long-Haul", why: "test" } } };
  const { errors } = checkKnowledgeBase(broken);
  assert.ok(errors.some((e) => e.includes('"Helment of the moon" isn\'t a collection log item') && e.includes('Did you mean "Helmet of the moon"')), errors.join("\n"));
  assert.ok(errors.some((e) => e.includes('tier "Long-Haul" doesn\'t exist')), errors.join("\n"));
});

test("misspelt pages, quests and one bad name inside a pattern are caught", () => {
  const broken = {
    ...KB,
    PAGE_EFFORT: { ...KB.PAGE_EFFORT, "The Infernoo": "Long" },
    QUEST_PREREQS: { ...KB.QUEST_PREREQS, "Dragon Slayer 2": { quests: [] } },
    RARE_ITEMS: [...KB.RARE_ITEMS, { match: /^(Dragon warhammer|Dragon warhamer)$/i, band: "rare" }],
  };
  const { errors } = checkKnowledgeBase(broken);
  assert.ok(errors.some((e) => e.includes('"The Infernoo" isn\'t a collection log page') && e.includes('"The Inferno"')), errors.join("\n"));
  assert.ok(errors.some((e) => e.includes('"Dragon Slayer 2" isn\'t a quest')), errors.join("\n"));
  assert.ok(errors.some((e) => e.includes('"Dragon warhamer"') && e.includes("matches nothing")), errors.join("\n"));
});
