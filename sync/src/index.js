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
//   GET    /v1/profile/:id                                      profile + goals (anyone with the id)
//   GET    /v1/public/:name                                     same, for profiles marked public
//   PUT    /v1/goals/:id          X-Edit-Token: <token>          replace the goals list

const MAX_PROFILE_BYTES = 1_500_000;
const MAX_GOALS_BYTES = 64_000;
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
  let p;
  if ((p = path.match(/^\/v1\/profile\/([^/]+)$/)) && m === "GET") return readById(env, p[1]);
  if ((p = path.match(/^\/v1\/public\/([^/]+)$/)) && m === "GET") return readPublic(env, decodeURIComponent(p[1]));
  if ((p = path.match(/^\/v1\/goals\/([^/]+)$/)) && m === "PUT") return saveGoals(request, env, p[1]);
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

async function saveGoals(request, env, id) {
  if (!ID_RE.test(id)) throw new HttpError(404, "No profile here");
  const token = request.headers.get("X-Edit-Token") ?? "";
  const row = await env.DB.prepare("SELECT edit_hash FROM profiles WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "No profile here");
  if (!token || !(await timingSafeEqualHex(await sha256Hex(token), row.edit_hash))) {
    throw new HttpError(403, "This link can view the profile but not change its goals");
  }
  const raw = await readBody(request, MAX_GOALS_BYTES);
  let goals;
  try { goals = JSON.parse(raw); } catch { throw new HttpError(400, "Body isn't JSON"); }
  if (!Array.isArray(goals) || goals.length > 200 || goals.some((g) => !g || typeof g !== "object" || typeof g.type !== "string")) {
    throw new HttpError(400, "Goals must be a list of up to 200 goals");
  }
  await env.DB.prepare("UPDATE profiles SET goals = ? WHERE id = ?").bind(JSON.stringify(goals), id).run();
  return json({ ok: true }, 200);
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
