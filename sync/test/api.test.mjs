// End-to-end tests against a running service: `npm run dev` in one terminal, then `npm test`.
// SYNC_URL overrides the address (default http://127.0.0.1:8789).
import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

const BASE = process.env.SYNC_URL ?? "http://127.0.0.1:8789";
const SITE = "https://j0ffis.github.io";

const b64url = (bytes) => Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sha = async (t) => new Uint8Array(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));
const newKey = () => b64url(webcrypto.getRandomValues(new Uint8Array(32)));
const ids = async (key) => ({ id: b64url(await sha("tm-id:" + key)).slice(0, 22), edit: b64url(await sha("tm-edit:" + key)).slice(0, 32) });
const uniq = () => "T" + Math.random().toString(36).slice(2, 10);
const profile = (name, extra = {}) => ({ schema: 1, syncedAt: Date.now(), player: { name }, skills: { attack: { level: 50, xp: 101333 } }, ...extra });

async function api(method, path, { key, body, headers = {} } = {}) {
  const h = { ...headers };
  if (key) h.Authorization = `Bearer ${key}`;
  if (body !== undefined) h["Content-Type"] = "application/json";
  const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, data, headers: r.headers };
}

test("upload, then read by id", async () => {
  const key = newKey(), name = uniq(), { id } = await ids(key);
  const up = await api("PUT", "/v1/profile", { key, body: { profile: profile(name), public: false } });
  assert.equal(up.status, 200);
  assert.equal(up.data.id, id, "server and client derive the same id");
  const got = await api("GET", `/v1/profile/${id}`);
  assert.equal(got.status, 200);
  assert.equal(got.data.profile.player.name, name);
  assert.deepEqual(got.data.goals, []);
  assert.equal(got.data.public, false);
});

test("private profiles can't be found by name", async () => {
  const key = newKey(), name = uniq();
  await api("PUT", "/v1/profile", { key, body: { profile: profile(name) } });
  assert.equal((await api("GET", `/v1/public/${name}`)).status, 404);
});

test("public profiles can be found by name, any capitalisation", async () => {
  const key = newKey(), name = uniq();
  await api("PUT", "/v1/profile", { key, body: { profile: profile(name), public: true, account: "acct-" + name } });
  const got = await api("GET", `/v1/public/${name.toLowerCase()}`);
  assert.equal(got.status, 200);
  assert.equal(got.data.profile.player.name, name);
});

test("a second account can't take a public name that's in use", async () => {
  const name = uniq();
  await api("PUT", "/v1/profile", { key: newKey(), body: { profile: profile(name), public: true, account: "owner" } });
  const other = await api("PUT", "/v1/profile", { key: newKey(), body: { profile: profile(name), public: true, account: "impostor" } });
  assert.equal(other.status, 200);
  assert.equal(other.data.public, false);
  assert.match(other.data.note, /already showing this name/);
});

test("the same account with a new key takes its own name over", async () => {
  const name = uniq();
  const first = newKey(), second = newKey();
  await api("PUT", "/v1/profile", { key: first, body: { profile: profile(name), public: true, account: "me" } });
  const r = await api("PUT", "/v1/profile", { key: second, body: { profile: profile(name, { questPoints: 7 }), public: true, account: "me" } });
  assert.equal(r.data.public, true);
  const got = await api("GET", `/v1/public/${name}`);
  assert.equal(got.data.profile.questPoints, 7);
});

test("goals need the edit token", async () => {
  const key = newKey(), { id, edit } = await ids(key);
  await api("PUT", "/v1/profile", { key, body: { profile: profile(uniq()) } });
  const goals = [{ id: "g1", type: "quest", quest: "Dragon Slayer II" }];
  assert.equal((await api("PUT", `/v1/goals/${id}`, { body: goals })).status, 403, "no token");
  assert.equal((await api("PUT", `/v1/goals/${id}`, { body: goals, headers: { "X-Edit-Token": "x".repeat(32) } })).status, 403, "wrong token");
  assert.equal((await api("PUT", `/v1/goals/${id}`, { body: goals, headers: { "X-Edit-Token": edit } })).status, 200);
  assert.deepEqual((await api("GET", `/v1/profile/${id}`)).data.goals, goals);
});

test("goals survive the next profile upload", async () => {
  const key = newKey(), { id, edit } = await ids(key);
  await api("PUT", "/v1/profile", { key, body: { profile: profile(uniq()) } });
  await api("PUT", `/v1/goals/${id}`, { body: [{ id: "g", type: "custom", text: "Fire cape" }], headers: { "X-Edit-Token": edit } });
  // Uploads closer than 30 s apart are skipped, so this checks the skip path keeps goals too.
  await api("PUT", "/v1/profile", { key, body: { profile: profile(uniq()) } });
  assert.equal((await api("GET", `/v1/profile/${id}`)).data.goals.length, 1);
});

test("bad uploads are refused", async () => {
  assert.equal((await api("PUT", "/v1/profile", { body: { profile: profile("x") } })).status, 401, "no key");
  assert.equal((await api("PUT", "/v1/profile", { key: "short", body: { profile: profile("x") } })).status, 401, "malformed key");
  assert.equal((await api("PUT", "/v1/profile", { key: newKey(), body: "not json" })).status, 400);
  assert.equal((await api("PUT", "/v1/profile", { key: newKey(), body: { profile: { player: {} } } })).status, 400, "not a profile");
  assert.equal((await api("PUT", "/v1/profile", { key: newKey(), body: { profile: profile("x", { wealth: { total: 1 } }) } })).status, 400, "wealth");
  const big = profile("x", { pad: "a".repeat(1_600_000) });
  assert.equal((await api("PUT", "/v1/profile", { key: newKey(), body: { profile: big } })).status, 413, "too large");
});

const pick = (id, extra = {}) => ({ id, title: `Do ${id}`, detail: "Because", category: "clog", progress: 0.5, icon: { item: 4151 }, ...extra });

test("picks: the owner's website saves them, anyone with the id reads them", async () => {
  const key = newKey(), { id, edit } = await ids(key);
  await api("PUT", "/v1/profile", { key, body: { profile: profile(uniq()) } });
  assert.equal((await api("GET", `/v1/picks/${id}`)).data.picks, null, "none until the website saves some");
  const body = { tiers: { Quick: [pick("a"), pick("b", { icon: { skill: "attack" }, wilderness: true })], Long: [pick("c", { icon: null })] }, filters: "all" };
  assert.equal((await api("PUT", `/v1/picks/${id}`, { body })).status, 403, "no token");
  const saved = await api("PUT", `/v1/picks/${id}`, { body, headers: { "X-Edit-Token": edit } });
  assert.equal(saved.status, 200);
  const got = await api("GET", `/v1/picks/${id}`);
  assert.equal(got.status, 200);
  assert.deepEqual(got.data.picks.tiers.Quick.map((p) => p.id), ["a", "b"]);
  assert.deepEqual(got.data.picks.tiers.Quick[1].icon, { skill: "attack" });
  assert.equal(got.data.picks.tiers.Quick[1].wilderness, true);
  assert.equal(got.data.picks.tiers.Quick[0].effort, "Quick", "tier comes from where the pick is listed");
  assert.deepEqual(got.data.picks.tiers.Medium, []);
  assert.ok(got.data.picksAt > 0);
});

test("picks: odd input is cleaned or refused", async () => {
  const key = newKey(), { id, edit } = await ids(key);
  await api("PUT", "/v1/profile", { key, body: { profile: profile(uniq()) } });
  const h = { "X-Edit-Token": edit };
  assert.equal((await api("PUT", `/v1/picks/${id}`, { body: { tiers: [] }, headers: h })).status, 400, "tiers must be an object");
  assert.equal((await api("PUT", `/v1/picks/${id}`, { body: { tiers: { Quick: Array.from({ length: 16 }, (_, i) => pick("p" + i)) } }, headers: h })).status, 400, "too many");
  assert.equal((await api("PUT", `/v1/picks/${id}`, { body: { tiers: { Quick: [{ title: "no id" }] } }, headers: h })).status, 400, "missing id");
  const odd = pick("x", { title: "T".repeat(500), icon: { item: -5 }, progress: 7, extra: "dropped", category: "<b>" });
  await api("PUT", `/v1/picks/${id}`, { body: { tiers: { Long: [odd], Nonsense: [pick("y")] } }, headers: h });
  const p = (await api("GET", `/v1/picks/${id}`)).data.picks;
  assert.equal(p.tiers.Long[0].title.length, 160, "long titles are cut");
  assert.equal(p.tiers.Long[0].icon, null, "bad item id dropped");
  assert.equal(p.tiers.Long[0].progress, null, "progress out of range dropped");
  assert.equal(p.tiers.Long[0].extra, undefined, "unknown fields dropped");
  assert.equal(p.tiers.Nonsense, undefined, "unknown tiers dropped");
});

test("picks: the old 'Bonus' tier name is read as Challenge", async () => {
  const key = newKey(), { id, edit } = await ids(key);
  await api("PUT", "/v1/profile", { key, body: { profile: profile(uniq()) } });
  await api("PUT", `/v1/picks/${id}`, { body: { tiers: { Bonus: [pick("big-log")] } }, headers: { "X-Edit-Token": edit } });
  const t = (await api("GET", `/v1/picks/${id}`)).data.picks.tiers;
  assert.deepEqual(t.Challenge.map((p) => p.id), ["big-log"]);
  assert.equal(t.Challenge[0].effort, "Challenge");
  assert.equal(t.Bonus, undefined);
});

test("picks: a new upload keeps them", async () => {
  const key = newKey(), { id, edit } = await ids(key);
  await api("PUT", "/v1/profile", { key, body: { profile: profile(uniq()) } });
  await api("PUT", `/v1/picks/${id}`, { body: { tiers: { Quick: [pick("keep")] } }, headers: { "X-Edit-Token": edit } });
  await api("PUT", "/v1/profile", { key, body: { profile: profile(uniq()) } });
  assert.equal((await api("GET", `/v1/picks/${id}`)).data.picks.tiers.Quick[0].id, "keep");
});

test("delete removes the profile", async () => {
  const key = newKey(), { id } = await ids(key);
  await api("PUT", "/v1/profile", { key, body: { profile: profile(uniq()) } });
  assert.equal((await api("DELETE", "/v1/profile", { key })).data.deleted, true);
  assert.equal((await api("GET", `/v1/profile/${id}`)).status, 404);
});

test("reset links: everything moves to the new key and old links stop working", async () => {
  const oldKey = newKey(), next = newKey();
  const before = await ids(oldKey), after = await ids(next);
  const name = uniq();
  await api("PUT", "/v1/profile", { key: oldKey, body: { profile: profile(name) } });
  const goals = [{ id: "g1", type: "quest", quest: "Dragon Slayer II" }];
  await api("PUT", `/v1/goals/${before.id}`, { body: goals, headers: { "X-Edit-Token": before.edit } });
  await api("PUT", `/v1/picks/${before.id}`, { body: { tiers: { Quick: [pick("p")] } }, headers: { "X-Edit-Token": before.edit } });

  const r = await api("POST", "/v1/profile/rotate", { key: oldKey, body: { newKey: next } });
  assert.equal(r.status, 200);
  assert.equal(r.data.id, after.id);

  assert.equal((await api("GET", `/v1/profile/${before.id}`)).status, 404, "old share link is gone");
  assert.equal((await api("PUT", `/v1/goals/${before.id}`, { body: [], headers: { "X-Edit-Token": before.edit } })).status, 404, "old owner link can't edit");
  const got = await api("GET", `/v1/profile/${after.id}`);
  assert.equal(got.data.profile.player.name, name, "profile moved");
  assert.deepEqual(got.data.goals, goals, "goals moved");
  assert.equal((await api("GET", `/v1/picks/${after.id}`)).data.picks.tiers.Quick[0].id, "p", "picks moved");
  assert.equal((await api("PUT", `/v1/goals/${after.id}`, { body: goals, headers: { "X-Edit-Token": before.edit } })).status, 403, "old edit token doesn't work on the new id");
  assert.equal((await api("PUT", `/v1/goals/${after.id}`, { body: goals, headers: { "X-Edit-Token": after.edit } })).status, 200, "new owner link works");
  assert.equal((await api("PUT", "/v1/profile", { key: oldKey, body: { profile: profile(name) } })).data.id, before.id, "the old key would start a new, empty profile");
});

test("reset links: refused without the current key or with a bad new key", async () => {
  const key = newKey();
  await api("PUT", "/v1/profile", { key, body: { profile: profile(uniq()) } });
  assert.equal((await api("POST", "/v1/profile/rotate", { body: { newKey: newKey() } })).status, 401, "no key");
  assert.equal((await api("POST", "/v1/profile/rotate", { key: newKey(), body: { newKey: newKey() } })).status, 404, "a key with nothing uploaded");
  assert.equal((await api("POST", "/v1/profile/rotate", { key, body: { newKey: "short" } })).status, 400, "malformed new key");
  assert.equal((await api("POST", "/v1/profile/rotate", { key, body: { newKey: key } })).status, 400, "same key");
  const taken = newKey();
  await api("PUT", "/v1/profile", { key: taken, body: { profile: profile(uniq()) } });
  assert.equal((await api("POST", "/v1/profile/rotate", { key, body: { newKey: taken } })).status, 409, "a key someone already uses");
});

test("unknown ids and paths are 404", async () => {
  assert.equal((await api("GET", "/v1/profile/AAAAAAAAAAAAAAAAAAAAAA")).status, 404);
  assert.equal((await api("GET", "/v1/profile/../../etc")).status, 404);
  assert.equal((await api("GET", "/nope")).status, 404);
});

test("CORS: only the listed websites get access", async () => {
  const ok = await fetch(BASE + "/v1/profile/AAAAAAAAAAAAAAAAAAAAAA", { headers: { Origin: SITE } });
  assert.equal(ok.headers.get("Access-Control-Allow-Origin"), SITE);
  const bad = await fetch(BASE + "/v1/profile/AAAAAAAAAAAAAAAAAAAAAA", { headers: { Origin: "https://evil.example" } });
  assert.equal(bad.headers.get("Access-Control-Allow-Origin"), null);
  const pre = await fetch(BASE + "/v1/goals/AAAAAAAAAAAAAAAAAAAAAA", { method: "OPTIONS", headers: { Origin: SITE } });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get("Access-Control-Allow-Headers"), /X-Edit-Token/);
});
