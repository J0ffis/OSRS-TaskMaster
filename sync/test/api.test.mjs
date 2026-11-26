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

test("delete removes the profile", async () => {
  const key = newKey(), { id } = await ids(key);
  await api("PUT", "/v1/profile", { key, body: { profile: profile(uniq()) } });
  assert.equal((await api("DELETE", "/v1/profile", { key })).data.deleted, true);
  assert.equal((await api("GET", `/v1/profile/${id}`)).status, 404);
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
