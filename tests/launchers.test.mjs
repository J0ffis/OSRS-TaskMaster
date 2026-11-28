// The double-click launchers: every .bat file's PowerShell script is there, not empty, ASCII-only
// (Windows PowerShell 5.1 misreads other characters), and has the param block the .bat relies on.
// An empty script makes the .bat window open and close straight away, with nothing to read.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bats = readdirSync(root).filter((f) => f.endsWith(".bat"));

test("launchers: every .bat file's script exists, isn't empty and is ASCII-only", () => {
  assert.ok(bats.length >= 2, "found the launchers");
  for (const bat of bats) {
    const text = readFileSync(join(root, bat), "latin1");
    for (const m of text.matchAll(/%~dp0([^"]+\.ps1)/g)) {
      const file = join(root, m[1].replace(/\\/g, "/"));
      assert.ok(existsSync(file), `${bat} runs ${m[1]}, which doesn't exist`);
      const src = readFileSync(file, "latin1");
      assert.ok(src.trim().length > 200, `${m[1]} (run by ${bat}) is empty`);
      assert.ok(/^param\(/m.test(src), `${m[1]} has its param block`);
      assert.ok(!/[^\x00-\x7f]/.test(src), `${m[1]} has a non-ASCII character`);
    }
  }
});

test("launchers: every script a launcher script runs exists and isn't empty", () => {
  for (const f of readdirSync(join(root, "scripts")).filter((f) => f.endsWith(".ps1"))) {
    const src = readFileSync(join(root, "scripts", f), "latin1");
    assert.ok(src.trim().length > 0, `scripts/${f} is empty`);
    for (const m of src.matchAll(/Join-Path \$PSScriptRoot ["']([\w.-]+\.(?:ps1|mjs))["']/g)) {
      const dep = join(root, "scripts", m[1]);
      assert.ok(existsSync(dep) && readFileSync(dep, "utf8").trim().length > 0, `scripts/${f} runs ${m[1]}, which is missing or empty`);
    }
  }
});

test("launchers: .bat files have Windows line endings", () => {
  for (const bat of bats) {
    const text = readFileSync(join(root, bat), "latin1");
    assert.ok(!/[^\r]\n/.test(text), `${bat} has a line without CRLF`);
  }
});
