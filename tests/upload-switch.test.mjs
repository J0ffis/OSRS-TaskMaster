// The go-live switch for Automatic upload has one value on each side: UPLOAD_LIVE in the plugin
// and LIVE in web/config.js (scripts\Set-UploadLive.ps1 sets both). These checks keep them in
// step, point both at the same live service, and, once live, make sure the player-facing docs no
// longer say it isn't.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(join(root, f), "utf8");
const java = read("plugin/src/main/java/com/osrstaskmaster/TaskMasterConfig.java");
const js = read("web/config.js");

const pluginLive = java.match(/^\s*boolean UPLOAD_LIVE = (true|false);/m)?.[1];
const siteLive = js.match(/^export const LIVE = (true|false);/m)?.[1];

test("upload switch: the plugin and the website agree", () => {
  assert.ok(pluginLive, "TaskMasterConfig.java has 'boolean UPLOAD_LIVE = true|false;'");
  assert.ok(siteLive, "web/config.js has 'export const LIVE = true|false;'");
  assert.equal(pluginLive, siteLive, "run scripts\\Set-UploadLive.ps1 to set both");
});

test("upload switch: the plugin and the website use the same live service", () => {
  const server = java.match(/DEFAULT_UPLOAD_SERVER = "([^"]+)"/)?.[1];
  assert.ok(server, "TaskMasterConfig.java has DEFAULT_UPLOAD_SERVER");
  assert.ok(js.includes(`"${server}"`), `web/config.js uses ${server} away from this PC`);
});

test("upload switch: once live, the player-facing docs don't say it isn't", async () => {
  const { UPLOAD_LIVE } = await import("../web/config.js");
  assert.equal(UPLOAD_LIVE, siteLive === "true", "in Node (no local host) UPLOAD_LIVE is the switch itself");
  if (siteLive !== "true") return;
  for (const f of ["TESTER-GUIDE.md", "plugin/README.md"]) {
    assert.doesNotMatch(read(f), /not live yet|isn't live/i, `${f} still says Automatic upload isn't live`);
  }
});
