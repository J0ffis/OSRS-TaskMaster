// The website as it's published (the web/ folder): every file the page loads is there, every
// import resolves, every element the code looks up exists, and the page never asks another site
// for anything. These catch a broken deploy (a renamed file or id) before players see it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "web");
const read = (...p) => readFileSync(join(web, ...p), "utf8");
const html = read("index.html");
const scripts = Object.fromEntries(readdirSync(web).filter((f) => f.endsWith(".js")).map((f) => [f, read(f)]));
const app = scripts["app.js"];

test("site: every local file index.html links to exists", () => {
  const refs = [...html.matchAll(/\b(?:href|src)="([^"#]+)"/g)].map((m) => m[1]).filter((u) => !/^[a-z]+:/i.test(u) && u !== "./");
  assert.ok(refs.length >= 3, "found the page's stylesheet, icon and script");
  for (const r of refs) assert.ok(existsSync(join(web, r)), `index.html links to ${r}, which isn't in web/`);
});

test("site: every import between the page's modules resolves to a real export", async () => {
  for (const [file, src] of Object.entries(scripts)) {
    for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*"(\.[^"]+)"/g)) {
      const target = resolve(web, m[2]);
      assert.ok(existsSync(target), `${file} imports ${m[2]}, which doesn't exist`);
      const mod = await import(new URL(`file:///${target.replace(/\\/g, "/")}`).href);
      for (const name of m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
        assert.ok(name in mod, `${file} imports ${name} from ${m[2]}, which doesn't export it`);
      }
    }
  }
});

test("site: every element app.js looks up by id is on the page or made by app.js", () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g), ...app.matchAll(/\bid="([^"$]+)"/g)].map((m) => m[1]));
  const used = new Set([...app.matchAll(/\$\("#([\w-]+)/g), ...app.matchAll(/closest\("#([\w-]+)/g)].map((m) => m[1]));
  assert.ok(used.size > 20);
  for (const id of used) assert.ok(ids.has(id), `app.js uses #${id}, but nothing has that id`);
  // Ids must be unique on the page.
  const onPage = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(onPage.filter((id, i) => onPage.indexOf(id) !== i), [], "duplicate ids in index.html");
});

test("site: the data files the page loads exist and have the shape the code expects", () => {
  const json = (...p) => JSON.parse(read(...p));
  const drops = json("data", "drop-rates.json");
  assert.equal(typeof drops.items, "object");
  for (const [name, rows] of Object.entries(drops.items)) {
    assert.ok(Array.isArray(rows) && rows.length, `${name} has drop rows`);
    for (const r of rows) {
      assert.equal(typeof r.from, "string", `${name}: source`);
      assert.ok(r.p == null || (r.p >= 0 && r.p <= 1), `${name}: chance ${r.p} from ${r.from}`);
      assert.ok(Number.isInteger(r.rolls) && r.rolls >= 1, `${name}: rolls ${r.rolls}`);
    }
  }
  // An item is either looked up with rates or remembered as having none, never both.
  const withRates = new Set(Object.keys(drops.items).map((n) => n.toLowerCase()));
  assert.deepEqual((drops.noDrops ?? []).filter((n) => withRates.has(n.toLowerCase())), [], "noDrops overlaps items");

  const quests = json("data", "quest-reqs.json").quests;
  assert.ok(Object.keys(quests).length > 150);
  for (const [name, q] of Object.entries(quests)) {
    for (const [s, lvl] of Object.entries(q.skills ?? {})) assert.ok(Number.isInteger(lvl) && lvl >= 1 && lvl <= 99, `${name}: ${s} ${lvl}`);
    for (const k of ["quests", "other", "fights"]) assert.ok(q[k] == null || Array.isArray(q[k]), `${name}: ${k}`);
  }

  const index = json("samples", "index.json");
  for (const a of index.accounts) {
    const snap = json("samples", `${a.id}.json`);
    assert.equal(typeof snap.player?.name, "string", `samples/${a.id}.json has a player name`);
    assert.ok(Array.isArray(a.goals), `samples/index.json: goals for ${a.id}`);
  }
  // app.js lists the same sample accounts as samples/index.json, in the same order.
  const inApp = [...app.matchAll(/\{ id: "(\w+)", label: "[^"]+" \}/g)].map((m) => m[1]);
  assert.deepEqual(inApp, index.accounts.map((a) => a.id));
});

test("site: the page only ever loads its own files", () => {
  // No scripts, styles or fonts from other sites, and no inline scripts.
  assert.doesNotMatch(html, /<(script|link)[^>]+(src|href)="https?:/i, "index.html loads something from another site");
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, "index.html has an inline script");
  assert.doesNotMatch(read("styles.css"), /url\(\s*["']?https?:|@import/i, "styles.css loads something from another site");
  // Every fetch goes to a path on the same site (data files, icons, the local server's /api).
  for (const [file, src] of Object.entries(scripts)) {
    for (const m of src.matchAll(/\b(?:fetch|api)\(\s*([`"'])([^`"']*)/g)) {
      assert.doesNotMatch(m[2], /^(https?:)?\/\//i, `${file} fetches ${m[2]}`);
    }
  }
  // Links out (the wiki) only open when clicked, in a new tab that can't reach back to this one.
  const links = [...(html + app).matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].map((m) => m[0]);
  assert.ok(links.length > 5);
  for (const a of links) assert.match(a, /rel="noopener noreferrer"/, a);
});
