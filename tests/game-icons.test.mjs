// The game icons in web/icons/game (exported by scripts/Update-GameIcons.ps1) match what the
// website asks for: every sprite it uses, and an icon for every collection log item.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SKILLS, CA_TIERS } from "../web/knowledge-base.js";
import { accountHelm } from "../web/game-icons.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "web", "icons", "game");
const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
const game = JSON.parse(readFileSync(join(root, "tests", "fixtures", "game-names.json"), "utf8"));

// PNG files start with these 8 bytes.
const isPng = (file) => readFileSync(file).subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

// The account type helms, one per Ironman type the plugin can report.
const HELMS = ["helm-ironman", "helm-ultimate", "helm-hardcore", "helm-group", "helm-hardcore-group", "helm-unranked-group"];

test("each account type the plugin writes gets its own helm", () => {
  // SnapshotCollector.ACCOUNT_TYPES, plus what's written for an unknown type.
  const java = readFileSync(join(root, "plugin", "src", "main", "java", "com", "osrstaskmaster", "SnapshotCollector.java"), "utf8");
  const types = [...java.match(/ACCOUNT_TYPES = {([^}]*)}/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(types.map(accountHelm), [null, "helm-ironman", "helm-ultimate", "helm-hardcore", "helm-group", "helm-hardcore-group", "helm-unranked-group"]);
  assert.equal(accountHelm("Unknown"), null);
  assert.equal(accountHelm(undefined), null);
});

test("every sprite the website uses was exported", () => {
  const wanted = ["skull", "cat-quests", "cat-diaries", "cat-clog", ...HELMS, ...SKILLS.map((s) => `skill-${s}`), ...CA_TIERS.map((t) => `ca-${t.toLowerCase()}`)];
  for (const name of wanted) {
    assert.ok(index.sprites[name], `${name} is missing: run scripts/Update-GameIcons.ps1`);
    const file = join(dir, index.sprites[name]);
    assert.ok(existsSync(file) && isPng(file), `${name}: ${file} isn't a PNG`);
  }
});

test("every collection log item has an icon", () => {
  const have = new Set(index.items);
  const missing = [];
  for (const [page, p] of Object.entries(game.pages)) {
    for (const i of p.items) if (!have.has(i.id)) missing.push(`${i.name} (${page})`);
  }
  assert.deepEqual(missing, [], "run scripts/Update-GameIcons.ps1 after refreshing tests/fixtures/game-names.json");
  for (const id of index.items) assert.ok(existsSync(join(dir, "items", `${id}.png`)), `items/${id}.png is listed but missing`);
});
