// OSRS TaskMaster sync service (Cloudflare Worker + D1).
//
// Players opt in from the RuneLite plugin. The plugin keeps one secret upload key per account
// and derives everything else from it, the same way this file does:
//   profile id  = base64url(SHA-256("tm-id:" + key))[0..22]    -> read-only link, safe to share
//   edit token  = base64url(SHA-256("tm-edit:" + key))[0..32]  -> lets the website save goals
// The server stores only SHA-256 hashes of the edit token and of the RuneLite account hash.
// It never stores the upload key, and it doesn't log IP addresses.
//
//   PUT    /v1/profile            Authorization: Bearer <key>   upload { profile, public, account }
//   DELETE /v1/profile            Authorization: Bearer <key>   delete everything for this key
//   POST   /v1/profile/rotate     Authorization: Bearer <old key>  { newKey }: move the profile,
//                                                               goals and picks to a new key, so
//                                                               every old link stops working
//   GET    /v1/profile/:id                                      profile + goals (anyone with the id)
//   GET    /v1/public/:name                                     same, for profiles marked public
//   PUT    /v1/goals/:id          X-Edit-Token: <token>          replace the goals list ({ goals, known }
//                                                               keeps goals added elsewhere meanwhile)
//   POST   /v1/goals/:id          X-Edit-Token: <token>          { pick }: add the goal that saved pick
//                                                               would make (the panel's Make it a goal)
//   PUT    /v1/picks/:id          X-Edit-Token: <token>          the website's current suggestions,
//                                                               the pinned route and the owner's
//                                                               view (for visitors)
//   GET    /v1/picks/:id                                        those suggestions (the RuneLite panel)
//                                                               tiers: Quick, Medium, Long, Challenge,
//                                                               and Clog (log and pet rows, quickest
//                                                               first) under "Fastest logs first"
//
// Suggestions are worked out by the website (web/recommender.js), not here: the engine needs more
// CPU than the free Workers plan allows per request. The owner's browser saves its picks, and
// the plugin shows them.

const MAX_PROFILE_BYTES = 1_500_000;
const MAX_GOALS_BYTES = 64_000;
const MAX_PICKS_BYTES = 160_000; // 65 picks, each with the goal it would make, plus a route
const MAX_ROUTE_STEPS = 30;
const MAX_GOALS = 200;
// Clog: collection log and pet picks only, quickest first, sent while "Fastest logs first" is on.
const PICK_TIERS = ["Quick", "Medium", "Long", "Challenge", "Clog"];
// The Challenge tier used to be called "Bonus"; picks saved or sent under the old name still count.
const withChallenge = (tiers) => (tiers && tiers.Bonus && !tiers.Challenge ? { ...tiers, Challenge: tiers.Bonus } : tiers);
const MIN_UPLOAD_GAP_MS = 30_000;            // uploads closer together than this are skipped
const NAME_HOLD_MS = 30 * 24 * 3600 * 1000;  // a public name stays with its account this long after its last upload
const KEY_RE = /^[A-Za-z0-9_-]{32,128}$/;
const ID_RE = /^[A-Za-z0-9_-]{22}$/;

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      const res = await route(request, env);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, cors);
      console.error("unhandled", e?.stack ?? e); // no request details: they could include IPs
      return json({ error: "Server error" }, 500, cors);
    }
  },
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const m = request.method;

  if (path === "/v1/profile" && m === "PUT") return upload(request, env);
  if (path === "/v1/profile" && m === "DELETE") return remove(request, env);
  if (path === "/v1/profile/rotate" && m === "POST") return rotate(request, env);
  let p;
  if ((p = path.match(/^\/v1\/profile\/([^/]+)$/)) && m === "GET") return readById(env, p[1]);
  if ((p = path.match(/^\/v1\/public\/([^/]+)$/)) && m === "GET") return readPublic(env, decodeName(p[1]));
  if ((p = path.match(/^\/v1\/goals\/([^/]+)$/)) && m === "PUT") return saveGoals(request, env, p[1]);
  if ((p = path.match(/^\/v1\/goals\/([^/]+)$/)) && m === "POST") return addGoal(request, env, p[1]);
  if ((p = path.match(/^\/v1\/picks\/([^/]+)$/)) && m === "PUT") return savePicks(request, env, p[1]);
  if ((p = path.match(/^\/v1\/picks\/([^/]+)$/)) && m === "GET") return readPicks(env, p[1]);
  if (path === "" || path === "/v1") return json({ service: "osrs-taskmaster-sync", ok: true });
  throw new HttpError(404, "Not found");
}

// ---- Handlers -------------------------------------------------------------------------------

async function upload(request, env) {
  const key = bearer(request);
  const raw = await readBody(request, MAX_PROFILE_BYTES + 4_000);
  let body;
  try { body = JSON.parse(raw); } catch { throw new HttpError(400, "Body isn't JSON"); }
  const profile = body?.profile;
  const name = profile?.player?.name;
  if (typeof name !== "string" || !/^[A-Za-z0-9 _-]{1,12}$/.test(name) || typeof profile.skills !== "object") {
    throw new HttpError(400, "That isn't an OSRS TaskMaster profile");
  }
  // Wealth was never part of the profile; refuse anything that carries it.
  if ("wealth" in profile) throw new HttpError(400, "Profiles must not contain wealth data");
  const profileJson = JSON.stringify(profile);
  if (profileJson.length > MAX_PROFILE_BYTES) throw new HttpError(413, "Profile is too large");

  const { id, editHash } = await deriveIds(key);
  const accountTag = typeof body.account === "string" && body.account ? await sha256Hex("tm-acct:" + body.account) : null;
  const nameKey = normName(name);
  const now = Date.now();

  const existing = await env.DB.prepare("SELECT updated_at FROM profiles WHERE id = ?").bind(id).first();
  if (existing && now - existing.updated_at < MIN_UPLOAD_GAP_MS) {
    return json({ ok: true, id, skipped: "Uploaded less than 30 seconds ago" }, 200);
  }

  // Public names: one account per name. Another account can take a name only once the
  // current holder hasn't uploaded for NAME_HOLD_MS (e.g. after a name change).
  let isPublic = body.public === true;
  let publicNote = null;
  if (isPublic) {
    const holders = await env.DB.prepare(
      "SELECT id, account_tag, updated_at FROM profiles WHERE name_key = ? AND public = 1 AND id != ?",
    ).bind(nameKey, id).all();
    const stmts = [];
    for (const h of holders.results ?? []) {
      const sameAccount = accountTag && h.account_tag === accountTag;
      if (sameAccount || now - h.updated_at > NAME_HOLD_MS) {
        stmts.push(env.DB.prepare("UPDATE profiles SET public = 0 WHERE id = ?").bind(h.id));
      } else {
        isPublic = false;
        publicNote = "Another account is already showing this name publicly, so your profile stays private for now.";
      }
    }
    if (isPublic && stmts.length) await env.DB.batch(stmts);
  }

  await env.DB.prepare(
    `INSERT INTO profiles (id, edit_hash, account_tag, name, name_key, public, profile, goals, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)
     ON CONFLICT(id) DO UPDATE SET edit_hash = excluded.edit_hash, account_tag = COALESCE(excluded.account_tag, profiles.account_tag),
       name = excluded.name, name_key = excluded.name_key, public = excluded.public, profile = excluded.profile,
       updated_at = excluded.updated_at`,
  ).bind(id, editHash, accountTag, name, nameKey, isPublic ? 1 : 0, profileJson, now, now).run();

  return json({ ok: true, id, public: isPublic, note: publicNote }, 200);
}

async function remove(request, env) {
  const { id } = await deriveIds(bearer(request));
  const r = await env.DB.prepare("DELETE FROM profiles WHERE id = ?").bind(id).run();
  return json({ ok: true, deleted: (r.meta?.changes ?? 0) > 0 }, 200);
}

/**
 * Reset links: the plugin makes a new upload key and the profile, goals and picks move to the id
 * and edit token derived from it. Every old link (owner's and shared) stops working, which is how
 * a leaked owner link is revoked. Only the holder of the current key can do this.
 */
async function rotate(request, env) {
  const oldKey = bearer(request);
  const raw = await readBody(request, 1_000);
  let body;
  try { body = JSON.parse(raw); } catch { throw new HttpError(400, "Body isn't JSON"); }
  const newKey = body?.newKey;
  if (typeof newKey !== "string" || !KEY_RE.test(newKey)) throw new HttpError(400, "newKey must be a valid upload key");
  if (newKey === oldKey) throw new HttpError(400, "newKey must differ from the current key");
  const from = await deriveIds(oldKey);
  const to = await deriveIds(newKey);
  const row = await env.DB.prepare("SELECT id FROM profiles WHERE id = ?").bind(from.id).first();
  if (!row) throw new HttpError(404, "Nothing uploaded with this key");
  const taken = await env.DB.prepare("SELECT id FROM profiles WHERE id = ?").bind(to.id).first();
  if (taken) throw new HttpError(409, "That new key is already in use");
  await env.DB.prepare("UPDATE profiles SET id = ?, edit_hash = ? WHERE id = ?").bind(to.id, to.editHash, from.id).run();
  return json({ ok: true, id: to.id }, 200);
}

async function readById(env, id) {
  if (!ID_RE.test(id)) throw new HttpError(404, "No profile here");
  const row = await env.DB.prepare("SELECT * FROM profiles WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "No profile here");
  return profileResponse(row);
}

async function readPublic(env, name) {
  if (!/^[A-Za-z0-9 _-]{1,12}$/.test(name)) throw new HttpError(404, "No public profile with that name");
  const row = await env.DB.prepare("SELECT * FROM profiles WHERE name_key = ? AND public = 1 ORDER BY updated_at DESC LIMIT 1")
    .bind(normName(name)).first();
  if (!row) throw new HttpError(404, "No public profile with that name");
  return profileResponse(row);
}

/** Only the owner's link (with the edit token) may change goals or picks. */
async function requireEditToken(request, env, id) {
  if (!ID_RE.test(id)) throw new HttpError(404, "No profile here");
  const token = request.headers.get("X-Edit-Token") ?? "";
  const row = await env.DB.prepare("SELECT edit_hash FROM profiles WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "No profile here");
  if (!token || !(await timingSafeEqualHex(await sha256Hex(token), row.edit_hash))) {
    throw new HttpError(403, "This link can view the profile but not change it");
  }
}

/**
 * Replace the goals list. Body: the list, or { goals, known } where `known` is every goal id the
 * website has seen since it loaded. Goals stored here that the website has never seen (added
 * meanwhile from the RuneLite panel) are kept, so a stale page can't wipe them. Replies with the
 * saved list.
 */
async function saveGoals(request, env, id) {
  await requireEditToken(request, env, id);
  const raw = await readBody(request, MAX_GOALS_BYTES);
  let body;
  try { body = JSON.parse(raw); } catch { throw new HttpError(400, "Body isn't JSON"); }
  let goals = Array.isArray(body) ? body : body?.goals;
  if (!Array.isArray(goals) || goals.length > MAX_GOALS || goals.some((g) => !g || typeof g !== "object" || typeof g.type !== "string")) {
    throw new HttpError(400, `Goals must be a list of up to ${MAX_GOALS} goals`);
  }
  if (!Array.isArray(body) && Array.isArray(body.known)) {
    const known = new Set(body.known.filter((k) => typeof k === "string"));
    const sent = new Set(goals.map((g) => g.id));
    const row = await env.DB.prepare("SELECT goals FROM profiles WHERE id = ?").bind(id).first();
    const added = JSON.parse(row?.goals || "[]").filter((g) => g?.id && !known.has(g.id) && !sent.has(g.id));
    goals = [...goals, ...added].slice(0, MAX_GOALS);
  }
  await env.DB.prepare("UPDATE profiles SET goals = ? WHERE id = ?").bind(JSON.stringify(goals), id).run();
  return json({ ok: true, goals }, 200);
}

/**
 * The RuneLite panel's "Make it a goal": body { pick: <suggestion id> }. The goal itself comes
 * from the picks the owner's website saved (each pick carries the goal it would make), so the
 * plugin never builds goals and only website-made goals are ever stored. Adding a goal that's
 * already there is a no-op ({ added: false }).
 */
async function addGoal(request, env, id) {
  await requireEditToken(request, env, id);
  let body;
  try { body = JSON.parse(await readBody(request, 1_000)); } catch { throw new HttpError(400, "Body isn't JSON"); }
  if (typeof body?.pick !== "string") throw new HttpError(400, "Say which suggestion: { pick: <id> }");
  const row = await env.DB.prepare("SELECT goals, picks FROM profiles WHERE id = ?").bind(id).first();
  const picks = row?.picks ? JSON.parse(row.picks) : null;
  const pick = Object.values(withChallenge(picks?.tiers) ?? {}).flat().find((p) => p?.id === body.pick);
  if (!pick) throw new HttpError(404, "That suggestion isn't in your list any more. Click Sync and try again.");
  if (!pick.goal) throw new HttpError(400, "That suggestion can't be made into a goal.");
  const goals = JSON.parse(row.goals || "[]");
  const same = (g) => JSON.stringify({ ...g, id: undefined }) === JSON.stringify({ ...pick.goal, id: undefined });
  const existing = goals.find(same);
  if (existing) return json({ ok: true, added: false, goal: existing }, 200);
  if (goals.length >= MAX_GOALS) throw new HttpError(400, `You already have ${MAX_GOALS} goals.`);
  const goal = { id: "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ...pick.goal };
  goals.push(goal);
  await env.DB.prepare("UPDATE profiles SET goals = ? WHERE id = ?").bind(JSON.stringify(goals), id).run();
  return json({ ok: true, added: true, goal }, 200);
}

async function savePicks(request, env, id) {
  await requireEditToken(request, env, id);
  const raw = await readBody(request, MAX_PICKS_BYTES);
  let body;
  try { body = JSON.parse(raw); } catch { throw new HttpError(400, "Body isn't JSON"); }
  if (!body?.tiers || typeof body.tiers !== "object" || Array.isArray(body.tiers)) throw new HttpError(400, "Picks need a tiers object");
  const tiers = withChallenge(body.tiers);
  const clean = {};
  for (const tier of PICK_TIERS) {
    const list = tiers[tier] ?? [];
    if (!Array.isArray(list) || list.length > 15) throw new HttpError(400, `Up to 15 picks per tier (${tier})`);
    clean[tier] = list.map((p) => cleanPick(p, tier));
  }
  const now = Date.now();
  await env.DB.prepare("UPDATE profiles SET picks = ?, picks_at = ? WHERE id = ?")
    .bind(JSON.stringify({ tiers: clean, filters: cleanText(body.filters, 200), view: cleanView(body.view), route: cleanRoute(body.route) }), now, id).run();
  return json({ ok: true, picksAt: now }, 200);
}

// The owner's chosen view, which visitors of a share link or public profile see (read-only):
// grind style, categories switched off, opt-in content, suggestions hidden with Not for me, and
// whether log cards come fastest first.
const VIEW_STYLES = ["quick", "balanced", "long", "mix"];
const VIEW_CONTENT = ["minigames", "wilderness", "clues"];
function cleanView(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const off = Array.isArray(v.off) ? v.off.filter((k) => typeof k === "string" && /^[a-z]{2,12}$/.test(k)).slice(0, 12) : [];
  const content = {};
  if (v.content && typeof v.content === "object") for (const k of VIEW_CONTENT) if (v.content[k] === true) content[k] = true;
  const hidden = Array.isArray(v.hidden) ? v.hidden.filter((h) => typeof h === "string" && h.length <= 120).slice(0, 300) : [];
  // The pinned route, as goal ids (visitors plan it from the owner's goals) and the step keys it
  // had when pinned (for "4 of 19 steps done").
  const route = v.route && typeof v.route === "object" && Array.isArray(v.route.goals)
    ? { goals: strings(v.route.goals, 50, 60), keys: strings(v.route.keys, 300, 160) } : null;
  return {
    style: VIEW_STYLES.includes(v.style) ? v.style : "balanced", off, content, hidden,
    // "Fastest logs first": log and pet suggestions in time order, quickest first.
    ...(v.fastest === true ? { fastest: true } : {}),
    ...(route?.goals.length ? { route } : {}),
  };
}

/**
 * The owner's pinned route from the website's route planner, for the panel's "Your route": the
 * next steps in order (at most MAX_ROUTE_STEPS), how many are done, and the time left. Plain text
 * only; the panel shows it as it is.
 */
function cleanRoute(r) {
  if (!r || typeof r !== "object" || Array.isArray(r) || !Array.isArray(r.steps)) return null;
  const count = (v) => (Number.isInteger(v) && v >= 0 && v <= 10_000 ? v : 0);
  const steps = r.steps
    .filter((s) => s && typeof s === "object" && typeof s.key === "string" && typeof s.title === "string")
    .slice(0, MAX_ROUTE_STEPS)
    .map((s) => ({
      key: cleanText(s.key, 160), title: cleanText(s.title, 160), hours: cleanText(s.hours, 40) || null,
      for: strings(s.for, 6, 120), goal: s.goal === true, note: cleanText(s.note, 300) || null,
    }));
  return { goals: strings(r.goals, 20, 120), done: count(r.done), total: count(r.total), left: count(r.left), time: cleanText(r.time, 200), steps };
}

const strings = (a, n, max) => (Array.isArray(a) ? a.filter((s) => typeof s === "string").slice(0, n).map((s) => s.slice(0, max)) : []);

/** Keep only the fields the panel shows, with sane lengths, so nothing odd is stored or served. */
function cleanPick(p, tier) {
  if (!p || typeof p !== "object" || typeof p.id !== "string" || typeof p.title !== "string") {
    throw new HttpError(400, "Each pick needs an id and a title");
  }
  const icon = p.icon && typeof p.icon === "object"
    ? (Number.isInteger(p.icon.item) && p.icon.item > 0 ? { item: p.icon.item }
      : typeof p.icon.skill === "string" && /^[a-z]{3,12}$/.test(p.icon.skill) ? { skill: p.icon.skill } : null)
    : null;
  return {
    id: cleanText(p.id, 120),
    title: cleanText(p.title, 160),
    detail: cleanText(p.detail, 240),
    category: cleanText(p.category, 20),
    // A Clog pick keeps its own tier (Quick, Medium, ...); every other list is one tier.
    effort: tier === "Clog" && PICK_TIERS.includes(p.effort) ? p.effort : tier,
    progress: typeof p.progress === "number" && p.progress >= 0 && p.progress <= 1 ? Math.round(p.progress * 1000) / 1000 : null,
    wilderness: p.wilderness === true,
    icon,
    goal: cleanGoal(p.goal),
    // Rough time for a log or pet row under "Fastest logs first" ("~12 h", "20+ h"), or null.
    est: cleanText(p.est, 20) || null,
  };
}

// The goal a pick would make (what the website's "Make it a goal" builds), for the panel's
// "Make it a goal". Only the website's goal kinds, small, and without an id (added when used).
const GOAL_TYPES = ["skill", "xp", "pet", "item", "quest", "diary", "family", "clog", "catask", "cabundle", "ca"];
function cleanGoal(g) {
  if (!g || typeof g !== "object" || Array.isArray(g) || !GOAL_TYPES.includes(g.type)) return null;
  const { id, ...rest } = g;
  const text = JSON.stringify(rest);
  return text.length <= 1_500 ? JSON.parse(text) : null;
}

const cleanText = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");

async function readPicks(env, id) {
  if (!ID_RE.test(id)) throw new HttpError(404, "No profile here");
  const row = await env.DB.prepare("SELECT picks, picks_at, updated_at FROM profiles WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "No profile here");
  const picks = row.picks ? JSON.parse(row.picks) : null;
  if (picks) picks.tiers = withChallenge(picks.tiers);
  return json({ picks, picksAt: row.picks_at ?? null, uploadedAt: row.updated_at }, 200);
}

function profileResponse(row) {
  return json({
    id: row.id,
    public: row.public === 1,
    updatedAt: row.updated_at,
    profile: JSON.parse(row.profile),
    goals: JSON.parse(row.goals || "[]"),
  }, 200);
}

// ---- Helpers --------------------------------------------------------------------------------

function bearer(request) {
  const m = (request.headers.get("Authorization") ?? "").match(/^Bearer\s+(\S+)$/);
  if (!m || !KEY_RE.test(m[1])) throw new HttpError(401, "Missing or invalid upload key");
  return m[1];
}

async function readBody(request, limit) {
  const len = Number(request.headers.get("Content-Length") ?? 0);
  if (len > limit) throw new HttpError(413, "Too large");
  const text = await request.text();
  if (text.length > limit) throw new HttpError(413, "Too large");
  return text;
}

/** Same derivation as the plugin (TaskMasterPlugin.deriveId / deriveEditToken). */
export async function deriveIds(key) {
  const id = (await sha256B64url("tm-id:" + key)).slice(0, 22);
  const editToken = (await sha256B64url("tm-edit:" + key)).slice(0, 32);
  return { id, editToken, editHash: await sha256Hex(editToken) };
}

const normName = (n) => n.trim().toLowerCase().replace(/[\s_-]+/g, " ");

/** A name from the address; a broken %-escape ("%E0%A4%A") is no name at all (404, not a 500). */
function decodeName(s) {
  try { return decodeURIComponent(s); } catch { return ""; }
}

async function sha256Bytes(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}
async function sha256Hex(text) {
  return [...(await sha256Bytes(text))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256B64url(text) {
  const bin = String.fromCharCode(...(await sha256Bytes(text)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const h = { "Vary": "Origin", "Cache-Control": "no-store" };
  // The plugin doesn't send an Origin header, so CORS only governs browsers.
  if (origin && allowed.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    // Browsers only read and save goals/picks; uploads, deletes and link resets come from the plugin.
    h["Access-Control-Allow-Methods"] = "GET, PUT, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type, X-Edit-Token";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}
