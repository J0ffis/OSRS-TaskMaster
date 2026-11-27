// OSRS TaskMaster website: the page around the recommender.
// Gets profiles (paste, file drop, the local server, or an Automatic upload link), renders the
// suggestion cards, goals and tabs, and saves goals. Suggestions themselves come from
// recommender.js; game facts from knowledge-base.js. Pasted profiles stay in localStorage;
// uploaded ones are read from, and their goals and picks saved to, the sync service (config.js).

import {
  CATEGORIES, CONTENT_TOGGLES, STYLE_EFFORT, setDropRates,
  candidates, lockedContent, pickThree, pickMix, pickChallenge, slayerTask,
  goalProgress, goalTitle, analyse, completions, petInfo, itemIndex, fmt, xpForLevel,
  applyManual, withinReach, compactProfile, sinceLast, accountKind, missingSections,
} from "./recommender.js";
import { SKILLS, DIARIES, CA_TIERS } from "./knowledge-base.js";
import { loadGameIcons, spriteUrl, itemUrl, iconImg, skullHTML } from "./game-icons.js";
import { SYNC_API } from "./config.js";

// Small helpers used everywhere below.
/** The first element matching a CSS selector, e.g. $("#cards"). */
const $ = (s) => document.querySelector(s);
/** Makes text safe to put inside HTML (player names, item names...). Use it on anything not written here. */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/** "slayer" -> "Slayer". */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Collection log page names the way the game orders them: "The Whisperer" sorts under W and
// is shown as "Whisperer, The".
const pageSortKey = (n) => n.replace(/^the\s+/i, "");
const pageLabel = (n) => (/^the\s+/i.test(n) ? `${n.replace(/^the\s+/i, "")}, The` : n);
const byPageName = (a, b) => pageSortKey(a).localeCompare(pageSortKey(b));
const SAMPLE = "__sample__";

// Everything the page is currently showing. Settings that should survive a reload are also kept
// in localStorage under "tm.*" keys.
const state = {
  name: null, // the loaded player's name (SAMPLE for the sample data)
  raw: null, // their profile ("snapshot") as the plugin wrote it
  snap: null, // the same with progress marked by hand laid over it; everything renders from this
  marks: { quests: {}, diaries: {}, ca: {} }, // progress marked by hand: { bucket: { key: time } }
  manualMode: localStorage.getItem("tm.manualMode") === "1", // show the "mark done" controls
  prev: null, // compact copy of the profile from before the latest sync (for "Within reach")
  goals: [],
  style: localStorage.getItem("tm.style") || "balanced", // grind style: quick | balanced | long | mix
  // Remember the categories switched *off*, so new categories show up by default.
  cats: new Set(Object.keys(CATEGORIES).filter((k) => !JSON.parse(localStorage.getItem("tm.off") || "[]").includes(k))),
  // Opt-in content (minigames, Wilderness, clues): off until the player switches it on.
  content: JSON.parse(localStorage.getItem("tm.content") || "{}"),
  seed: 0, // bumped by Shuffle; the same seed gives the same picks
  excluded: new Set(), // suggestion ids the player swapped away
  hidden: {}, // suggestions marked "Not for me": { id: { until (time, or 0 for good), title, effort } }
  picks: [], // the cards on screen now
  tab: "skills", // open tab in the Account panel
  // Where the open profile came from: sample | local (pasted) | server (Start-LocalServer.ps1) | sync (uploaded)
  source: null,
};

// ---- Data -------------------------------------------------------------------------------

async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw Object.assign(new Error(await r.text().catch(() => r.statusText)), { status: r.status });
  return r.status === 204 ? null : r.json();
}

// Two ways to run the site:
// - Server mode: Start-LocalServer.ps1 is running; the plugin syncs to it and goals are saved there.
// - Browser mode (the hosted site): players paste the profile the plugin copies. Profiles and
//   goals are kept in this browser's localStorage only; nothing is uploaded anywhere.
let serverMode = false;
const keyOf = (name) => String(name).trim().toLowerCase().replace(/[\s_-]+/g, " ");
const local = {
  names: () => JSON.parse(localStorage.getItem("tm.profileNames") || "[]"),
  get: (name) => JSON.parse(localStorage.getItem(`tm.profile:${keyOf(name)}`) || "null"),
  put(snap) {
    const name = snap.player.name;
    localStorage.setItem(`tm.profile:${keyOf(name)}`, JSON.stringify(snap));
    const names = local.names().filter((n) => keyOf(n) !== keyOf(name));
    localStorage.setItem("tm.profileNames", JSON.stringify([name, ...names]));
  },
  forget(name) {
    for (const k of ["profile", "goals", "marks", "hidden", "history", "seen", "prev"]) localStorage.removeItem(`tm.${k}:${keyOf(name)}`);
    localStorage.setItem("tm.profileNames", JSON.stringify(local.names().filter((n) => keyOf(n) !== keyOf(name))));
  },
  goals: (name) => JSON.parse(localStorage.getItem(`tm.goals:${keyOf(name)}`) || "[]"),
  saveGoals: (name, goals) => localStorage.setItem(`tm.goals:${keyOf(name)}`, JSON.stringify(goals)),
};

// Automatic upload: profiles the plugin uploads are opened with a link, #id=<id>&edit=<token>.
// The id is read-only and safe to share; the edit token (only in the owner's link) lets goals
// be saved. Both stay after the # so they never reach the website's host. Links opened in this
// browser are remembered so the player can come back by name.
const links = {
  all: () => JSON.parse(localStorage.getItem("tm.links") || "[]"),
  save: (list) => localStorage.setItem("tm.links", JSON.stringify(list)),
  put(link) {
    const old = links.byId(link.id);
    // Never downgrade: keep a known edit token if this visit came from a view-only link.
    const merged = { ...old, ...link, edit: link.edit ?? old?.edit ?? null };
    links.save([merged, ...links.all().filter((l) => l.id !== link.id)]);
  },
  byId: (id) => links.all().find((l) => l.id === id),
  byName: (name) => links.all().find((l) => keyOf(l.name) === keyOf(name)),
  remove: (id) => links.save(links.all().filter((l) => l.id !== id)),
};

async function syncApi(path, opts) {
  let r;
  try { r = await fetch(SYNC_API + path, opts); } catch { throw Object.assign(new Error("offline"), { status: 0, sync: true }); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error ?? r.statusText), { status: r.status, sync: true });
  return data;
}

// View only: opened without the edit token, or the owner previewing what visitors see.
const isReadOnly = () => state.source?.kind === "sync" && (!state.source.edit || state.viewAsVisitor);

/**
 * Open a profile. `name` is looked up in this order: a profile linked in this browser, one
 * pasted into this browser, the local server (server mode), then public profiles. `opts.id`
 * opens an uploaded profile directly (from a link).
 */
async function load(name, opts = {}) {
  showError(null);
  let source;
  const link = opts.id ? { id: opts.id, edit: opts.edit ?? links.byId(opts.id)?.edit ?? null }
    : name !== SAMPLE && !opts.local ? links.byName(name) : null;
  try {
    if (name === SAMPLE) {
      state.snap = await api("sample-profile.json");
      state.goals = JSON.parse(localStorage.getItem("tm.sampleGoals") || "null") ?? [
        { id: "g1", type: "skill", skill: "slayer", level: 85 },
        { id: "g2", type: "quest", quest: "Dragon Slayer II" },
      ];
      source = { kind: "sample" };
    } else if (link) {
      const r = await syncApi(`/v1/profile/${encodeURIComponent(link.id)}`);
      state.snap = r.profile; state.goals = r.goals;
      // A share link (no edit token) opened in the owner's own browser still opens as the owner,
      // since this browser has their edit token; the page says so and offers the visitor view.
      source = { kind: "sync", id: link.id, edit: link.edit ?? null, public: r.public, ownerViaShare: !!(opts.id && !opts.edit && link.edit) };
    } else if (!serverMode && local.get(name)) {
      state.snap = local.get(name);
      state.goals = local.goals(name);
      source = { kind: "local" };
    } else if (serverMode && await api(`/api/profile/${encodeURIComponent(name)}`).then((s) => (state.snap = s), () => null)) {
      state.goals = await api(`/api/goals/${encodeURIComponent(name)}`).catch(() => []);
      source = { kind: "server" };
    } else {
      const r = await syncApi(`/v1/public/${encodeURIComponent(name)}`);
      state.snap = r.profile; state.goals = r.goals;
      source = { kind: "sync", id: r.id, edit: links.byId(r.id)?.edit ?? null, public: true };
    }
    name = state.snap.player?.name ?? name;
    // Wealth tracking was removed; drop any old net-worth goals.
    state.goals = (state.goals ?? []).filter((g) => g.type !== "wealth");
    state.goalsSeen = new Set(state.goals.map((g) => g.id));
    delete state.snap.wealth;
    state.raw = state.snap;
    state.prev = trackPrevious(name, state.raw, state.goals);
    state.marks = loadMarks(name, state.raw);
    state.snap = applyManual(state.raw, state.marks);
    state.hidden = loadHidden(name);
  } catch (e) {
    if (location.protocol === "file:") return showError("Open the site through the server (http://localhost:8787), not as a file.");
    // A name lookup that can't reach the upload service reads like "not found": pasting still works.
    if (e.sync && e.status === 0 && (opts.id || link)) return showError("Couldn't reach the OSRS TaskMaster upload service. Check your connection and try again.");
    if (e.sync && e.status === 0) e.status = 404;
    // Only a real "not found" from the service: being offline never forgets a link.
    if (e.sync && e.status === 404 && link) {
      // A dead link stays dead (deleted data or reset links): stop offering it by name.
      links.remove(link.id);
      refreshKnown();
      return showError("That link doesn't work any more: its owner reset their links or deleted their uploaded data. If it's yours, click Open website in the RuneLite panel for your current link.");
    }
    if (e.status === 404) return showError(`No profile for "${name}" yet. If it's yours: in RuneLite, open the OSRS TaskMaster panel and either click Copy my profile and paste it here, or switch on Automatic upload and click Open website.`);
    if (e.status === 400) return showError("That doesn't look like an OSRS name (1–12 letters, numbers, spaces, - or _).");
    return showError(serverMode ? "Couldn't reach the OSRS TaskMaster server. Is Start-LocalServer.ps1 running?" : "Something went wrong loading that profile. Try again in a moment.");
  }
  // Leaving a view-only profile: bring back this browser's own settings (its hidden list was just
  // loaded for the new profile), then fetch the owner's view if this one is view-only too.
  if (state.ownView) {
    ({ style: state.style, cats: state.cats, content: state.content } = state.ownView);
    state.ownView = null;
  }
  state.sharedView = source.kind === "sync" && !source.edit ? await loadSharedView(source.id) : null;
  state.name = name;
  state.source = source;
  state.viewAsVisitor = false;
  state.loadedAt = Date.now();
  state.seed = 0;
  state.excluded.clear();
  state.picks = [];
  if (source.kind === "sync") {
    links.put({ id: source.id, edit: source.edit, name });
    // The address bar keeps only the view-only part, so copying it never shares goal editing.
    history.replaceState(null, "", `#id=${source.id}`);
  } else if (name !== SAMPLE) {
    history.replaceState(null, "", `#${encodeURIComponent(name)}`);
  }
  if (name !== SAMPLE) localStorage.setItem("tm.last", name);
  refreshKnown();
  $("#name").value = name === SAMPLE ? "" : name;
  $("#intro").hidden = true;
  $("#app").hidden = false;
  renderAll();
  if (opts.focus) applyFocus(opts.focus);
}

// ---- Picks for the RuneLite panel ---------------------------------------------------------
// The plugin can't run this engine, so when the owner has their own profile open, the site
// saves its current top picks per tier to the upload service; the plugin's panel shows them.
// Picks follow the site's filters and goals, and are only sent when they change.

// 15 per tier (the service's limit): the panel shows 5 at a time and its Refresh button steps
// through the rest.
const PANEL_TIERS = { Quick: 15, Medium: 15, Long: 15, Challenge: 5 };
let picksTimer = null;

function schedulePicks() {
  if (state.source?.kind !== "sync" || !state.source.edit) return;
  clearTimeout(picksTimer);
  picksTimer = setTimeout(publishPicks, 1500);
}

/** A RuneLite icon for a suggestion: an item id from the collection log, or a skill. */
function iconFor(c, snap) {
  const m = { ...(c.goal ?? {}), ...(c.meta ?? {}) };
  const items = itemIndex(snap);
  const itemId = (name) => (name ? items.get(String(name).toLowerCase())?.id ?? null : null);
  const pages = snap.collectionLog?.pages ?? {};
  const id = itemId(m.item) ?? itemId(m.pet) ?? itemId(m.items?.[0])
    ?? pages[m.page]?.items?.find((i) => !(i.quantity > 0))?.id
    // Combat achievements: the boss's own collection log page, e.g. its pet or first unique.
    ?? pages[m.monster]?.items?.[0]?.id ?? null;
  if (id) return { item: id };
  if (m.skill && SKILLS.includes(m.skill)) return { skill: m.skill };
  return null;
}

async function publishPicks() {
  if (state.source?.kind !== "sync" || !state.source.edit || state.viewAsVisitor || !listCache.all?.length) return;
  const snap = state.snap;
  const toPick = (c) => {
    // The goal this suggestion would make, so the panel's "Make it a goal" adds exactly what the
    // button here would (the service gives it an id when it's used).
    const { id: _, ...goal } = (c.category !== "goals" && toGoal(c)) || {};
    return {
      id: c.id, title: c.title, detail: c.detail, category: c.category,
      progress: typeof c.progress === "number" ? c.progress : null,
      wilderness: !!c.wilderness, icon: iconFor(c, snap),
      goal: goal.type ? goal : null,
    };
  };
  const tiers = {};
  for (const [tier, n] of Object.entries(PANEL_TIERS)) {
    // Suggestions hidden with "Not for me" stay out of the panel too.
    tiers[tier] = pickThree(visibleAll().filter((c) => c.effort === tier), { seed: 0, n }).map(toPick);
  }
  const off = Object.keys(CATEGORIES).filter((k) => !state.cats.has(k));
  const on = Object.entries(state.content).filter(([, v]) => v).map(([k]) => k);
  const filters = [off.length ? `hiding ${off.join(", ")}` : "", on.length ? `including ${on.join(", ")}` : ""].filter(Boolean).join("; ");
  // The owner's view, which visitors of a share link or public profile see (read-only).
  const hidden = Object.entries(state.hidden).filter(([, e]) => !e.until || e.until > Date.now()).map(([id]) => id).sort();
  const view = { style: state.style, off, content: Object.fromEntries(on.map((k) => [k, true])), hidden };
  const body = JSON.stringify({ tiers, filters, view });
  // Skip if nothing changed since the last save from this browser.
  const sentKey = `tm.picksSent:${state.source.id}`;
  const sig = `${body.length}:${[...body].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)}`;
  if (localStorage.getItem(sentKey) === sig) return;
  try {
    await syncApi(`/v1/picks/${encodeURIComponent(state.source.id)}`, {
      method: "PUT", headers: { "Content-Type": "application/json", "X-Edit-Token": state.source.edit }, body,
    });
    localStorage.setItem(sentKey, sig);
  } catch { /* the panel keeps its previous picks; next visit tries again */ }
}

/** Open on one suggestion (from the RuneLite panel): show its tier with it as the first card. */
function applyFocus(focusId) {
  currentList();
  const c = listCache.all.find((x) => x.id === focusId);
  if (!c) {
    $("#tierhint").textContent = "That suggestion isn't on the list any more: it may be done already. Here are your current picks.";
    return;
  }
  if (c.effort === "Challenge") {
    state.challenge = c;
    renderChallenge();
    flash($("#challenge .card"));
    return;
  }
  const style = Object.keys(STYLE_EFFORT).find((k) => STYLE_EFFORT[k] === c.effort);
  if (style && style !== state.style) { state.style = style; renderControls(); }
  renderCards(false, [c]);
  flash($("#cards .card"));
}

function flash(card) {
  if (!card) return;
  card.classList.add("focus");
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => card.classList.remove("focus"), 2600);
}

/** Uploaded profiles: fetch the latest when the player comes back to the tab. */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.source?.kind === "sync" && Date.now() - (state.loadedAt ?? 0) > 60_000) {
    load(state.name, { id: state.source.id });
  }
});

async function saveGoals() {
  if (state.name === SAMPLE) return localStorage.setItem("tm.sampleGoals", JSON.stringify(state.goals));
  if (state.source?.kind === "sync") {
    if (!state.source.edit) return;
    // `known`: every goal this page has seen, so the service keeps goals added meanwhile from the
    // RuneLite panel instead of this (older) list wiping them.
    for (const g of state.goals) state.goalsSeen.add(g.id);
    const body = JSON.stringify({ goals: state.goals, known: [...state.goalsSeen] });
    return syncApi(`/v1/goals/${encodeURIComponent(state.source.id)}`, {
      method: "PUT", headers: { "Content-Type": "application/json", "X-Edit-Token": state.source.edit }, body,
    }).then((r) => {
      if (!Array.isArray(r?.goals) || r.goals.length === state.goals.length) return;
      state.goals = r.goals;
      for (const g of r.goals) state.goalsSeen.add(g.id);
      renderGoals();
      renderCards(true);
    }).catch(() => alert("Couldn't save goals: the OSRS TaskMaster upload service didn't respond. Your change will be lost when you leave this page."));
  }
  if (!serverMode) return local.saveGoals(state.name, state.goals);
  await api(`/api/goals/${encodeURIComponent(state.name)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state.goals),
  }).catch(() => showToastError());
}

// ---- Progress marked by hand ---------------------------------------------------------------
// For players who don't sync after every session: quests, diary tiers and combat achievements can
// be ticked off here. Marks are kept in this browser (in both modes) and dropped once a sync shows
// the same thing done, so the game always wins.

const marksKey = (name) => `tm.marks:${keyOf(name)}`;

function loadMarks(name, raw) {
  const m = { quests: {}, diaries: {}, ca: {}, ...JSON.parse(localStorage.getItem(marksKey(name)) || "{}") };
  const finished = new Set((raw.quests ?? []).filter((q) => q.state === "FINISHED").map((q) => q.name));
  const caDone = new Set((raw.combatAchievements?.tasks ?? []).filter((t) => t.done).map((t) => String(t.id)));
  for (const q of Object.keys(m.quests)) if (finished.has(q)) delete m.quests[q];
  for (const k of Object.keys(m.diaries)) { const [r, t] = k.split("|"); if (raw.diaries?.[r]?.[t]) delete m.diaries[k]; }
  for (const id of Object.keys(m.ca)) if (caDone.has(id)) delete m.ca[id];
  localStorage.setItem(marksKey(name), JSON.stringify(m));
  return m;
}

const markCount = () => Object.values(state.marks).reduce((n, b) => n + Object.keys(b).length, 0);

// ---- Suggestions hidden by the player ("Not for me") -----------------------------------------
// Hidden for a week or for good, per player, in this browser. Week-long ones come back by
// themselves; the "hidden by you" list in the filters row brings any of them back sooner.

const hiddenKey = (name) => `tm.hidden:${keyOf(name)}`;
const WEEK = 7 * 864e5;

function loadHidden(name) {
  const h = JSON.parse(localStorage.getItem(hiddenKey(name)) || "{}");
  for (const [id, e] of Object.entries(h)) if (e.until && e.until <= Date.now()) delete h[id];
  localStorage.setItem(hiddenKey(name), JSON.stringify(h));
  return h;
}
function saveHidden() {
  localStorage.setItem(hiddenKey(state.name), JSON.stringify(state.hidden));
}
const isHidden = (c) => {
  const e = state.hidden[c.id];
  return !!e && (!e.until || e.until > Date.now());
};
/** Hide a suggestion for `days` days, or for good when `days` is 0. */
function hideSuggestion(c, days) {
  state.hidden[c.id] = { until: days ? Date.now() + days * 864e5 : 0, title: c.title, effort: c.effort };
  saveHidden();
}
function unhide(ids) {
  for (const id of ids) delete state.hidden[id];
  saveHidden();
  renderOptIns();
  renderCards(true);
}

/** Mark something done (or undo a mark), then redraw everything from the updated profile. */
function setMark(bucket, key, on) {
  const b = (state.marks[bucket] ??= {});
  if (on) b[key] = Date.now(); else delete b[key];
  localStorage.setItem(marksKey(state.name), JSON.stringify(state.marks));
  state.snap = applyManual(state.raw, state.marks);
  renderAll();
}

/** What a card would mark done: { bucket, key, label } for quests, diary tiers and CA tasks. */
function markFor(c) {
  const m = { ...(c.goal ?? {}), ...(c.meta ?? {}) };
  const raw = state.raw;
  if (m.quest && (raw.quests ?? []).some((q) => q.name === m.quest && q.state !== "FINISHED")) return { bucket: "quests", key: m.quest };
  if (m.region && m.tier && raw.diaries?.[m.region] && !raw.diaries[m.region][m.tier]) return { bucket: "diaries", key: `${m.region}|${m.tier}` };
  if (m.task != null && (raw.combatAchievements?.tasks ?? []).some((t) => t.id === m.task && !t.done)) return { bucket: "ca", key: String(m.task) };
  return null;
}
/** Marking controls show when the toggle is on, and never on someone else's (view-only) profile. */
const canMark = () => state.manualMode && !isReadOnly();
const isMarked = (mk) => !!mk && !!state.marks[mk.bucket]?.[mk.key];
function markButton(c) {
  if (!canMark()) return "";
  const mk = markFor(c);
  if (!mk) return "";
  const on = isMarked(mk);
  return `<button class="btn tiny markbtn" type="button" data-mark="${mk.bucket}" data-key="${esc(mk.key)}" aria-pressed="${on}" title="${on ? "Undo: you marked this done by hand" : "Done it in-game? Mark it here until your next sync"}">${on ? "✓ Marked done" : "Mark done"}</button>`;
}

// ---- Recent progress -------------------------------------------------------------------------
// "Since last time" and "Within reach" compare the profile with how it was about 8 hours earlier,
// so frequent syncs (Automatic upload sends one every few minutes) don't reset them. The page keeps
// a short history of compact profiles it has seen (tm.history:*): at most one every 30 minutes,
// plus the newest, and nothing older than the one that's 8 hours back.

const RECENT_HOURS = 8;
const HISTORY_GAP_MS = 30 * 60e3;
const HISTORY_MAX = 40;

/** Record this sync in the history; returns the profile to compare with (or null). */
function trackPrevious(name, raw, goals) {
  const k = keyOf(name);
  const key = `tm.history:${k}`;
  let hist = JSON.parse(localStorage.getItem(key) || "[]");
  // First run after this change: start from the copies kept before (previous and latest sync).
  if (!hist.length) {
    for (const old of ["prev", "seen"]) {
      const c = JSON.parse(localStorage.getItem(`tm.${old}:${k}`) || "null");
      if (c && !hist.some((h) => h.syncedAt === c.syncedAt)) hist.push(c);
    }
  }
  const cur = compactProfile(raw, goals);
  hist = hist.filter((h) => h.syncedAt <= cur.syncedAt).sort((x, y) => x.syncedAt - y.syncedAt);
  const last = hist[hist.length - 1];
  if (!last || last.syncedAt < cur.syncedAt) {
    // Keep the newest sync, but don't let one every few minutes crowd the history: replace the
    // newest entry when it's less than 30 minutes after the one before it.
    const before = hist[hist.length - 2];
    if (last && before && last.syncedAt - before.syncedAt < HISTORY_GAP_MS) hist[hist.length - 1] = cur;
    else hist.push(cur);
  }
  // Drop everything older than the newest entry that's at least 8 hours old (the baseline).
  const cutoff = cur.syncedAt - RECENT_HOURS * 36e5;
  const baseIdx = hist.reduce((b, h, i) => (h.syncedAt <= cutoff ? i : b), -1);
  if (baseIdx > 0) hist = hist.slice(baseIdx);
  if (hist.length > HISTORY_MAX) hist = [hist[0], ...hist.slice(-(HISTORY_MAX - 1))];
  try {
    localStorage.setItem(key, JSON.stringify(hist));
    localStorage.removeItem(`tm.prev:${k}`);
    localStorage.removeItem(`tm.seen:${k}`);
  } catch { /* storage full: recent progress just won't show */ }
  // Compare with the profile from 8 hours back, or the oldest one seen if it's all more recent.
  const base = hist[0];
  return base && base.syncedAt < cur.syncedAt ? base : null;
}

function showError(msg) {
  const el = $("#error");
  el.hidden = !msg;
  el.textContent = msg ?? "";
  if (msg) { $("#intro").hidden = false; $("#app").hidden = true; }
}
function showToastError() { alert("Couldn't save goals: the server didn't respond."); }

// ---- Rendering ---------------------------------------------------------------------------

// ---- View only ------------------------------------------------------------------------------
// Share links and public profiles show the owner's own view: their grind style, category filters,
// opt-in content and the suggestions they hid with Not for me (saved with the panel's picks, see
// publishPicks). Visitors can't change it (tiers, Shuffle, Swap, filters, goals); they can still
// open wiki links and the account tabs. A visitor's own settings for their own profiles are set
// aside while it shows and come back afterwards. The owner's "See it as others do" preview is the
// same view, locked.

const DEFAULT_VIEW = { style: "balanced", off: [], content: {}, hidden: [] };

function applyViewMode() {
  const ro = isReadOnly();
  const visitor = ro && !state.source?.edit;
  if (visitor && !state.ownView) {
    const v = state.sharedView ?? DEFAULT_VIEW;
    state.ownView = { style: state.style, cats: new Set(state.cats), content: { ...state.content }, seed: state.seed, hidden: state.hidden };
    state.style = v.style ?? "balanced";
    state.cats = new Set(Object.keys(CATEGORIES).filter((k) => !(v.off ?? []).includes(k)));
    if (!state.cats.size) state.cats = new Set(Object.keys(CATEGORIES));
    state.content = { ...(v.content ?? {}) };
    state.hidden = Object.fromEntries((v.hidden ?? []).map((id) => [id, { until: 0 }]));
    state.seed = 0;
    state.excluded.clear();
  } else if (!visitor && state.ownView) {
    ({ style: state.style, cats: state.cats, content: state.content, seed: state.seed, hidden: state.hidden } = state.ownView);
    state.ownView = null;
    state.excluded.clear();
  }
  $("#app").classList.toggle("readonly", ro);
}

/** The owner's saved view for a profile opened view-only, or null (then a default view shows). */
async function loadSharedView(id) {
  try {
    const r = await syncApi(`/v1/picks/${encodeURIComponent(id)}`);
    return r?.picks?.view ?? null;
  } catch {
    return null;
  }
}

function renderAll() {
  applyViewMode();
  renderSummary();
  renderReach();
  renderControls();
  renderSlayer();
  renderCards(true);
  renderGoals();
  renderGoalTypes();
  renderTabs();
}

function renderSummary() {
  const s = state.snap;
  const a = analyse(s);
  const p = s.player ?? {};
  const age = Date.now() - (s.syncedAt ?? 0);
  const ago = age < 36e5 ? `${Math.max(1, Math.round(age / 6e4))} min ago` : age < 864e5 ? `${Math.round(age / 36e5)} h ago` : `${Math.round(age / 864e5)} days ago`;
  const log = s.collectionLog ?? {};
  const pets = petInfo(s);
  const qDone = (s.quests ?? []).filter((q) => q.state === "FINISHED").length;
  const diaryDone = Object.values(s.diaries ?? {}).reduce((n, d) => n + Object.values(d).filter(Boolean).length, 0);
  const diaryTotal = Object.keys(s.diaries ?? {}).length * 4;
  const { badges } = completions(s);
  $("#summary").innerHTML = `
    <div class="who">
      <h2>${esc(p.name)}</h2>
      <div class="muted">${esc(p.accountType ?? "")} · Combat ${esc(p.combatLevel ?? "?")} · ${state.name === SAMPLE ? "Sample data" : `${state.source.kind === "sync" ? "Uploaded" : "Synced"} <span class="${age > 864e5 ? "stale" : ""}">${ago}</span>`}${isReadOnly() ? ` · <span class="viewonly" title="Opened from a share link or public profile: you can see the suggestions but not change the goals">View only</span>` : ""}${ownerToggleHTML()}</div>
      ${isReadOnly() ? "" : `<div class="manualrow">
        <button type="button" id="manualbtn" class="toggle" aria-pressed="${state.manualMode}" title="Haven't ${state.source.kind === "sync" ? "uploaded" : "synced"} since playing? Turn this on to tick off quests, diary tiers and combat achievements here. Marks stay in this browser until your profile shows them done.">Mark progress by hand</button>
        ${markCount() ? `<span class="muted small">${markCount()} marked by hand, waiting for a sync</span>` : ""}
        ${state.source.kind === "sync" ? `<button type="button" id="sharebtn" class="link small" title="Copies a link that shows your suggestions and goals but can't change anything. Your own link (with editing) never leaves this browser.">Copy share link</button>` : ""}
      </div>`}
      ${sinceLastHTML()}
      ${missingHTML()}
    </div>
    <div class="stats">
      ${stat(a.total, "Total level")}
      ${stat(`${s.questPoints ?? 0}`, `Quest pts · ${qDone}/${(s.quests ?? []).length}`)}
      ${stat(`${diaryDone}/${diaryTotal}`, "Diary tiers")}
      ${stat(s.combatAchievements?.points ?? 0, `CA pts · ${a.caRank}`)}
      ${stat(log.total ? `${log.obtained}/${log.total}` : "—", "Collection log")}
      ${stat(pets.pets.length ? `${pets.owned}/${pets.pets.length}` : "—", "Pets")}
    </div>
    ${badges.length ? `<div class="badges" aria-label="Milestones reached">${badges.map((b) =>
      `<span class="badge" title="${esc(b.detail)}"><span aria-hidden="true">✦</span> ${esc(b.label)}</span>`).join("")}</div>` : ""}`;
}
const stat = (v, l) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`;

/**
 * For the owner of an uploaded profile: a switch to the view-only page visitors get. Opening
 * your own share link in your own browser shows your owner view (this browser has your edit
 * token), so the page says so here rather than looking like the link didn't work.
 */
function ownerToggleHTML() {
  const s = state.source;
  if (s?.kind !== "sync" || !s.edit) return "";
  if (state.viewAsVisitor) {
    return ` · <button type="button" id="visitorbtn" class="link small" title="Back to your own view, where you can change goals">Back to owner view</button>`;
  }
  const why = s.ownerViaShare
    ? "You opened your share link in your own browser, so it shows your owner view. Anyone else with the link sees a view-only page."
    : "Your own profile: only this browser (and Open website in RuneLite) can change it.";
  return ` · <span class="ownerpill" title="${esc(why)}">${s.ownerViaShare ? "Your profile (owner view)" : "Owner"}</span>
    <button type="button" id="visitorbtn" class="link small" title="Preview the view-only page your share link shows other people">See it as others do</button>`;
}

// "Since last time": progress over the last 8 hours of syncs (see trackPrevious), from the raw profile
// (progress marked by hand isn't counted until a sync confirms it). Hover a part for details.
function sinceLastHTML() {
  if (!state.prev || state.name === SAMPLE) return "";
  const parts = sinceLast(state.raw, state.prev, state.goals);
  if (!parts.length) return "";
  // A rolling 8 hours when there's a profile that old; otherwise since the oldest one seen.
  const span = (state.raw.syncedAt ?? 0) - (state.prev.syncedAt ?? 0);
  const full = span >= RECENT_HOURS * 36e5;
  const ago = span < 36e5 ? `${Math.max(1, Math.round(span / 6e4))} min` : span < 864e5 ? `${Math.round(span / 36e5)} h` : `${Math.round(span / 864e5)} days`;
  const label = full && span < 2 * RECENT_HOURS * 36e5 ? `Last ${RECENT_HOURS} hours:` : `Last ${ago}:`;
  return `<p class="since small"><span class="muted" title="Progress over the last ${RECENT_HOURS} hours of syncs this browser has seen (compared with your profile from ${ago} before this sync).">${label}</span> ${parts.map((p) =>
    `<span class="sincepart k-${p.kind}"${p.detail ? ` title="${esc(p.detail)}"` : ""}>${esc(p.text)}</span>`).join('<span class="muted"> · </span>')}</p>`;
}

// Sections the site knows about but this profile doesn't have (see PROFILE_SECTIONS). The same
// wording everywhere, whether the profile was pasted or uploaded automatically.
const missingWhy = (n = 1) => `Profiles from older versions of the TaskMaster plugin don't include ${n > 1 ? "these. They fill" : "this. It fills"} in once a profile from a newer version comes in.`;
const isMissing = (key) => missingSections(state.raw).some((m) => m.key === key);

function missingHTML() {
  const m = missingSections(state.raw);
  if (!m.length || state.name === SAMPLE) return "";
  return `<p class="missing small"><span aria-hidden="true">ⓘ</span> Not in this profile: ${m.map((x) =>
    `<b title="${esc(cap(x.detail))}">${esc(x.label)}</b>`).join(", ")}. <span class="muted">${esc(missingWhy(m.length))}</span></p>`;
}

/** A progress bar with an optional short counter ("30/50 kills") beside it. */
function barHTML(c) {
  if (c.progress == null) return "";
  const pct = Math.round(Math.max(0, Math.min(1, c.progress)) * 100);
  const tip = c.counterTip ?? `${pct}%`;
  return `<div class="barrow" title="${esc(tip)}"><div class="bar"><i style="width:${pct}%"></i></div>${c.counter ? `<span class="counter">${esc(c.counter)}</span>` : ""}</div>`;
}

// ---- Within reach ---------------------------------------------------------------------------
// A carousel under the summary: quests and diary tiers you can do now, or are one or two
// requirements from, with what's still missing. Progress since the last sync (or marked by hand)
// that opened one up is called out and ranks first.

function renderReach() {
  const el = $("#reach");
  state.reach = withinReach(state.snap, { prev: state.prev, marks: state.marks });
  el.hidden = !state.reach.length;
  if (!state.reach.length) { el.innerHTML = ""; return; }
  const ready = state.reach.filter((e) => e.ready).length;
  el.innerHTML = `
    <div class="reachhead">
      <div>
        <h2>Within reach</h2>
        <p class="muted small">${ready ? `${ready} ready to do now` : "Nothing fully unlocked yet"}${state.reach.length > ready ? ` · ${state.reach.length - ready} a requirement or two away` : ""}. Requirements are from the OSRS Wiki; some levels can be boosted.</p>
      </div>
      ${state.reach.length > 3 ? `<div class="mixnav"><button type="button" class="btn tiny" data-reach-scroll="-1" aria-label="Previous">‹</button><button type="button" class="btn tiny" data-reach-scroll="1" aria-label="Next">›</button></div>` : ""}
    </div>
    <div class="track" tabindex="0" aria-label="Quests and diaries within reach">${state.reach.map(reachHTML).join("")}</div>`;
}

function reachHTML(e, i) {
  const met = e.reqs.filter((r) => r.met && !r.unknown);
  const unknown = e.reqs.filter((r) => r.unknown);
  const status = e.ready ? `<span class="reachstate ready">Ready now</span>`
    : `<span class="reachstate close">${e.missing.length} to go</span>`;
  const need = (r) => {
    const have = r.kind === "skill" || r.kind === "combat" || r.kind === "questPoints" ? ` <span class="have">you: ${esc(r.have ?? "?")}</span>`
      : r.kind === "quest" ? ` <span class="have">${esc(String(r.have ?? "").replace("_", " ").toLowerCase())}</span>` : "";
    return `<li class="no"><span aria-hidden="true">✗</span> ${esc(r.label)}${have}</li>`;
  };
  const metLine = met.length
    ? `<li class="yes" title="${esc(met.map((r) => r.label).join(", "))}"><span aria-hidden="true">✓</span> ${esc(met.slice(0, 3).map((r) => r.label).join(", "))}${met.length > 3 ? ` and ${met.length - 3} more` : ""}</li>` : "";
  const unknownLine = unknown.length
    ? `<li class="unk" title="Not in your synced quest list, so TaskMaster can't check it"><span aria-hidden="true">?</span> ${esc(unknown.map((r) => r.label).join(", "))}</li>` : "";
  const goal = toGoal(e);
  const isGoal = goal && state.goals.some((x) => goalTitle(x) === goalTitle(goal));
  return `
    <article class="card reach ${e.ready ? "ready" : ""}" style="--c:var(--c-${e.category})">
      <div class="cat"><span class="catname">${e.kind === "quest" ? (e.inProgress ? "Quest · started" : "Quest") : "Achievement diary"}</span>${status}</div>
      ${e.triggers.length ? `<p class="trigger"><span aria-hidden="true">✦</span> ${esc(e.triggers.slice(0, 2).join(" · "))}</p>` : ""}
      ${e.meta.region === "Wilderness" ? wildBadge({ wilderness: true }) : ""}${titleHTML(e)}
      ${e.why ? `<p class="detail">${esc(e.why)}</p>` : ""}
      ${barHTML(e)}
      <ul class="reqs">${e.missing.map(need).join("")}${metLine}${unknownLine}</ul>
      <div class="actions">
        ${goal && !isGoal && !isReadOnly() ? `<button class="btn tiny ghost" data-reach-goal="${i}" type="button">Make it a goal</button>` : ""}
        ${markButton(e)}
        ${wikiLink(e)}
      </div>
    </article>`;
}

const TIER_HINT = {
  quick: "Quick wins: things you can finish in a session or two.",
  balanced: "Balanced: a few sessions of steady work. None of these appear under Quick wins or Long haul.",
  long: "Long haul: weeks of grinding, rare drops and pets.",
  mix: "Mixed: seven picks across every tier, from tonight's quick wins to this month's long hauls.",
};
const TIER_LABEL = { Quick: "Quick win", Medium: "Balanced", Long: "Long haul" };
const TIER_PLURAL = { Quick: "Quick wins", Medium: "Balanced", Long: "Long hauls" };
const TIER_METAL = { Quick: "Bronze", Medium: "Mithril", Long: "Dragon" };
const isMix = () => state.style === "mix";

function renderControls() {
  document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.style === state.style)));
  $("#tierhint").textContent = isReadOnly()
    ? `View only: ${state.name ?? "this player"}'s ${{ quick: "Quick wins", balanced: "Balanced", long: "Long haul", mix: "Mixed" }[state.style] ?? "Balanced"} suggestions, as they've set them up. Only they can change goals or what's shown.`
    : TIER_HINT[state.style] ?? "";
  $("#gridtitle").textContent = isMix() ? "Your next seven grinds" : "Your next three grinds";
  const { done } = completions(state.snap);
  $("#chips").innerHTML = Object.entries(CATEGORIES).map(([k, label]) => done[k]
    ? `<span class="chip complete" style="--c:var(--c-${k})" title="Complete: nothing left to grind here">✓ ${esc(label)}</span>`
    : `<button type="button" class="chip" style="--c:var(--c-${k})" data-cat="${k}" aria-pressed="${state.cats.has(k)}">${esc(label)}</button>`).join("");
  renderOptIns();
}

// Suggestions for every tier are built once per profile/goals/filters and reused; Shuffle and
// Swap only filter this list by tier and re-randomise, so they stay instant.
let listCache = { key: null, all: [] };
function currentList() {
  const key = JSON.stringify([state.name, state.snap?.syncedAt, state.goals, [...state.cats].sort(), state.content]);
  if (listCache.key !== key || listCache.snap !== state.snap) {
    listCache = { key, snap: state.snap, all: candidates(state.snap, state.goals, { categories: state.cats, content: state.content }) };
  }
  const effort = STYLE_EFFORT[state.style];
  const all = visibleAll();
  return effort ? all.filter((c) => c.effort === effort) : all;
}
/** Every tier's suggestions minus the ones hidden with "Not for me" (call currentList first). */
const visibleAll = () => listCache.all.filter((c) => !isHidden(c));

function renderOptIns() {
  $("#optins").innerHTML = Object.entries(CONTENT_TOGGLES).map(([k, label]) =>
    `<button type="button" class="toggle" data-content="${k}" aria-pressed="${!!state.content[k]}"${k === "wilderness" ? ` title="${esc(wildTip())}"` : ""}>${k === "wilderness" ? `${skullHTML()} ` : ""}${esc(label)}</button>`).join("");
  // Count across every tier, so the number doesn't jump when switching tiers.
  const locked = lockedContent(state.snap, { categories: state.cats, content: state.content });
  const btn = $("#lockedbtn");
  btn.hidden = !locked.length;
  btn.textContent = `${locked.length} hidden until unlocked`;
  $("#lockedbody").innerHTML = `<table class="list"><thead><tr><th>Content</th><th>Needs</th></tr></thead><tbody>${locked.map((l) =>
    `<tr><td>${esc(l.content)}</td><td>${l.needs.map(esc).join(", ")}</td></tr>`).join("")}</tbody></table>`;
  renderHiddenList();
}

// "N hidden by you": the suggestions marked "Not for me", each with a way to bring it back.
function renderHiddenList() {
  const rows = Object.entries(state.hidden).filter(([, e]) => !e.until || e.until > Date.now())
    .sort(([, a], [, b]) => (a.until || Infinity) - (b.until || Infinity));
  const btn = $("#hiddenbtn");
  btn.hidden = !rows.length;
  btn.textContent = `${rows.length} hidden by you`;
  if (!rows.length && $("#hiddendlg").open) $("#hiddendlg").close();
  const when = (e) => (e.until ? `Until ${new Date(e.until).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : "For good");
  $("#hiddenbody").innerHTML = `<table class="list"><thead><tr><th>Suggestion</th><th>Tier</th><th>Hidden</th><th></th></tr></thead><tbody>${rows.map(([id, e]) =>
    `<tr><td>${esc(e.title)}</td><td>${esc(TIER_LABEL[e.effort] ?? e.effort ?? "")}</td><td class="muted">${when(e)}</td>
      <td><button type="button" class="link small" data-unhide="${esc(id)}">Show again</button></td></tr>`).join("")}</tbody></table>
    ${rows.length > 1 ? `<p class="small"><button type="button" class="link small" data-unhide-all>Show them all again</button></p>` : ""}`;
}

function renderCards(fresh = false, keep = null) {
  const list = currentList();
  if (fresh) state.picks = isMix()
    ? pickMix(list, { seed: state.seed, exclude: state.excluded })
    : pickThree(list, { seed: state.seed, exclude: state.excluded });
  else if (keep) state.picks = pickThree(list, { seed: state.seed, exclude: state.excluded, keep });
  if (fresh) state.challenge = pickChallenge(visibleAll(), { seed: state.seed, exclude: state.excluded });
  renderChallenge();
  schedulePicks();
  const el = $("#cards");
  el.classList.toggle("mix", isMix());
  if (!state.picks.length) {
    const tier = { quick: "Quick wins", balanced: "Balanced", long: "Long haul", mix: "Mixed" }[state.style];
    el.innerHTML = `<div class="emptycard">No ${esc(tier)} suggestions left with these filters. Try another tier or turn on more categories.</div>`;
    return;
  }
  const cards = state.picks.map((c, i) => cardHTML(c, i)).join("");
  if (!isMix()) { el.innerHTML = cards; finishSpin(el); return; }
  // Mixed: a ladder showing how the seven picks split across tiers, then a swipeable track.
  const count = (t) => state.picks.filter((c) => c.effort === t).length;
  el.innerHTML = `
    <div class="mixhead">
      <div class="ladder" aria-label="Picks by tier">${["Quick", "Medium", "Long"].filter(count).map((t) =>
        `<span class="rung t-${t}" style="flex:${count(t)}" title="${TIER_METAL[t]} tier"><b>${count(t)}</b> ${esc(count(t) > 1 ? TIER_PLURAL[t] : TIER_LABEL[t])}</span>`).join("")}</div>
      <div class="mixnav"><button type="button" class="btn tiny" data-scroll="-1" aria-label="Previous">‹</button><button type="button" class="btn tiny" data-scroll="1" aria-label="Next">›</button></div>
    </div>
    <div class="track" tabindex="0" aria-label="Seven suggested grinds">${cards}</div>`;
  if (spin === "all") el.querySelectorAll(".rung").forEach((r, k) => r.style.setProperty("--r", k));
  if (spin === "all") el.querySelector(".ladder")?.classList.add("pulse");
  finishSpin(el);
}

// Shuffle animation: "all" spins every card in, a number spins just that slot (Swap).
// The new picks are chosen instantly; the animation only reveals them.
let spin = null;
let spinTurns = 0;
function finishSpin(el) {
  spin = null;
  // Clear the animation classes afterwards (also a safety net if animations are paused).
  clearTimeout(finishSpin.t);
  finishSpin.t = setTimeout(() => {
    el.querySelectorAll(".card.spin").forEach((c) => c.classList.remove("spin"));
    el.querySelector(".ladder")?.classList.remove("pulse");
  }, 1000);
}

// The Challenge tier sits above Long haul: huge log completions that take weeks or months. It's
// never one of the regular picks or a grind style; one is offered on its own below them, as a
// long-term goal for players who want one.
// Wilderness warning: other players can attack and take your items there. Hardcore accounts get a
// stronger one, since a death there also ends their Hardcore status.
const WILD_TIP = "Wilderness: other players can attack you here, and you can lose items you carry when you die. Bring only what you can afford to lose.";
const WILD_TIP_HC = "Hardcore: other players can attack you here, and dying here ends your Hardcore status as well as risking your items. Only go if you're prepared for that.";
const isHardcore = () => !!state.snap && accountKind(state.snap).hardcore;
const wildTip = () => (isHardcore() ? WILD_TIP_HC : WILD_TIP);
const wildBadge = (c) => c.wilderness
  ? `<span class="wildbadge${isHardcore() ? " hc" : ""}" title="${esc(wildTip())}" role="note">${skullHTML()} ${isHardcore() ? "Wilderness: risks your Hardcore status" : "Wilderness: PvP risk"}</span>`
  : "";

function renderChallenge() {
  const el = $("#challenge");
  const c = state.challenge;
  el.hidden = !c;
  if (!c) { el.innerHTML = ""; return; }
  el.innerHTML = `
    <article class="card challenge" style="--c:var(--t-Challenge)">
      <div class="challengehead">
        <span class="tierbadge t-Challenge" title="Third age tier: above Long haul">Challenge</span>
        <span class="muted small">A long-term goal: weeks to months of grinding, beyond Long haul.</span>
      </div>
      ${wildBadge(c)}${titleHTML(c)}
      <p class="detail">${esc(c.detail)}</p>
      ${barHTML(c)}
      <div class="actions">
        ${!isReadOnly() ? `<button class="btn tiny" data-challenge-swap type="button">Another challenge</button>` : ""}
        ${!isReadOnly() && toGoal(c) ? `<button class="btn tiny ghost" data-challenge-goal type="button">Take on this challenge</button>` : ""}
        ${!isReadOnly() ? `<button class="btn tiny ghost" data-challenge-notforme type="button" title="Hide this challenge for a week or for good">Not for me</button>` : ""}
        ${wikiLink(c)}
      </div>
    </article>`;
}

// The current Slayer assignment: its own card above the picks, since it's already been chosen for
// you by a Slayer master. Not affected by Shuffle, tiers or category filters.
// Bosses that count for the task: green when you can fight them, red with what's missing when not.
// Each opens the boss's wiki page.
function bossChips(bosses) {
  if (!bosses?.length) return "";
  return `<p class="bosses small"><span class="muted">Also counts:</span> ${bosses.map((b) => {
    const open = !b.needs.length;
    const tip = open ? `You can fight ${b.name} on this task` : `Needs ${b.needs.join(", ")}`;
    return `<a class="bosschip ${open ? "open" : "locked"}" href="${wikiPage(b.name)}" target="_blank" rel="noopener" title="${esc(tip)}">${b.wilderness ? `${skullHTML()} ` : ""}${esc(b.name)}${open ? "" : ` <span class="need">(${esc(b.needs.join(", "))})</span>`}</a>`;
  }).join(" ")}</p>`;
}

function renderSlayer() {
  const el = $("#slayer");
  if (isMissing("slayer")) {
    el.hidden = false;
    el.innerHTML = `<article class="card slayer nodata" style="--c:var(--c-slayer)"><div class="slayerhead"><span class="tierbadge t-Slayer">Slayer</span></div>
      <h3>Slayer task not in this profile</h3><p class="muted small">${esc(missingWhy())}</p></article>`;
    return;
  }
  const c = slayerTask(state.snap, state.goals);
  el.hidden = !c;
  if (!c) { el.innerHTML = ""; return; }
  const storedLine = !c.stored ? "" : c.stored.name
    ? `<p class="muted small">In storage: <b>${esc(c.stored.amount)} ${esc(c.stored.name)}</b>. Swap it in at any Slayer master when you want it.</p>`
    : `<p class="muted small">You also have a task in storage. Open the Slayer rewards shop once so TaskMaster can see which one.</p>`;
  if (!c.task) {
    el.innerHTML = `<article class="card slayer" style="--c:var(--c-slayer)"><div class="slayerhead"><span class="tierbadge t-Slayer">Slayer</span></div>
      <h3>No active Slayer task</h3>${storedLine}</article>`;
    return;
  }
  const pct = c.progress != null ? Math.round(c.progress * 100) : null;
  el.innerHTML = `
    <article class="card slayer" style="--c:var(--c-slayer)">
      <div class="slayerhead">
        <span class="tierbadge t-Slayer">Current Slayer task</span>
        <span class="tierbadge t-${esc(c.effort)}">${esc(TIER_LABEL[c.effort])}</span>
      </div>
      ${wildBadge(c)}${titleHTML({ meta: { skill: "slayer" } }, c.title)}
      <p class="detail">${esc(c.detail)}</p>
      ${pct != null ? `<div class="bar" title="${pct}%"><i style="width:${pct}%"></i></div>` : ""}
      ${c.why.length ? `<ul>${c.why.slice(0, 4).map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
      ${bossChips(c.bosses)}
      ${storedLine}
      <div class="actions">${wikiLink({ meta: { monster: c.task.name } })}</div>
    </article>`;
}

// ---- OSRS Wiki quick links -------------------------------------------------------------------
// Pages live at /w/Page_name (spaces as underscores). Names that don't always match a page title
// (collection log pages, combat achievement tasks) use the wiki's "Go" search, which jumps to the
// page when one matches and lists results otherwise. Links only open when clicked.

const WIKI = "https://oldschool.runescape.wiki";
const wikiTitle = (t) => String(t).replace(/ /g, " ").trim();
const wikiPage = (title, section) => `${WIKI}/w/${encodeURIComponent(wikiTitle(title).replace(/ /g, "_"))}${section ? `#${encodeURIComponent(section)}` : ""}`;
const wikiGo = (term) => `${WIKI}/w/Special:Search?search=${encodeURIComponent(wikiTitle(term))}&go=Go`;

/** The wiki page for a suggestion or goal: { url, name }, or null if there's nothing sensible. */
function wikiFor(c) {
  const m = { ...(c.goal ?? {}), ...(c.meta ?? {}) };
  const type = c.goal?.type;
  if (m.item) return { url: wikiPage(m.item), name: m.item };
  if (m.pet) return { url: wikiPage(m.pet), name: m.pet };
  if (m.items?.length) return { url: wikiGo(m.page ?? m.items[0]), name: m.page ?? m.items[0] };
  if (m.page) return { url: wikiGo(m.page), name: m.page };
  if (m.quest) return { url: wikiPage(m.quest), name: m.quest };
  if (m.region) return { url: wikiPage(`${m.region} Diary`, m.tier ? cap(m.tier) : null), name: `${m.region} Diary` };
  if (m.skill) return { url: wikiPage(cap(m.skill)), name: cap(m.skill) };
  if (m.taskName ?? m.name) return { url: wikiGo(m.taskName ?? m.name), name: m.taskName ?? m.name };
  if (m.monster && m.monster !== "Other") return { url: wikiPage(m.monster), name: m.monster };
  if (c.id === "quest:cape") return { url: wikiPage("Quest point cape"), name: "Quest point cape" };
  if (c.category === "combat" || type === "ca") return { url: wikiPage("Combat Achievements"), name: "Combat Achievements" };
  if (c.category === "clog") return { url: wikiPage("Collection log"), name: "Collection log" };
  return null;
}

function wikiLink(c, cls = "btn tiny ghost wiki") {
  const w = wikiFor(c);
  return w ? `<a class="${cls}" href="${esc(w.url)}" target="_blank" rel="noopener noreferrer" title="Open ${esc(w.name)} on the OSRS Wiki">Wiki ↗</a>` : "";
}

/**
 * The game icon for a suggestion, goal or Within reach entry: the item itself for collection log
 * and pet cards (the first missing item for a page or a group of items), the skill for levels,
 * the quest or diary icon, or the combat achievement tier's sword. Empty when there's none.
 */
function cardIcon(c) {
  const m = { ...(c.goal ?? {}), ...(c.meta ?? {}) };
  const snap = state.snap;
  const items = itemIndex(snap);
  const idOf = (name) => (name ? items.get(String(name).toLowerCase())?.id ?? null : null);
  const page = m.page ? snap.collectionLog?.pages?.[m.page] : null;
  const firstMissing = (names) => (names ?? []).map((n) => items.get(String(n).toLowerCase())).find((it) => it && !it.owned)?.id;
  const itemId = idOf(m.item) ?? idOf(m.pet)
    ?? firstMissing(m.items)
    ?? page?.items?.find((i) => !(i.quantity > 0))?.id ?? page?.items?.[0]?.id ?? null;
  const name = m.item ?? m.pet ?? m.page ?? "";
  if (itemId && itemUrl(itemId)) return iconImg(itemUrl(itemId), { cls: "gicon item", title: name });
  if (m.skill && SKILLS.includes(m.skill)) return iconImg(spriteUrl(`skill-${m.skill}`), { cls: "gicon sprite", title: cap(m.skill) });
  if (m.quest || c.category === "quests" || c.kind === "quest") return iconImg(spriteUrl("cat-quests"), { cls: "gicon sprite" });
  if (m.region || c.category === "diaries") return iconImg(spriteUrl("cat-diaries"), { cls: "gicon sprite" });
  if (m.tier && CA_TIERS.includes(m.tier)) return iconImg(spriteUrl(`ca-${m.tier.toLowerCase()}`), { cls: "gicon sprite", title: `${m.tier} combat achievement` });
  if (c.category === "combat" || c.goal?.type === "ca") return iconImg(spriteUrl(`ca-${String(c.goal?.tier ?? "elite").toLowerCase()}`), { cls: "gicon sprite" });
  if (c.category === "clog" || c.category === "pets") return iconImg(spriteUrl("cat-clog"), { cls: "gicon sprite" });
  return "";
}

/** A card title with its game icon in front. */
const titleHTML = (c, title = c.title) => {
  const icon = cardIcon(c);
  return icon ? `<div class="titlerow">${icon}<h3>${esc(title)}</h3></div>` : `<h3>${esc(title)}</h3>`;
};

function cardHTML(c, i) {
  const spinning = spin === "all" || spin === i;
  // Mixed view: colour means tier (matching the tier bar); the category becomes a small dot.
  // Single-tier views: colour means category, as before.
  const colour = isMix() ? `--c:var(--t-${c.effort}); --cat:var(--c-${c.category})` : `--c:var(--c-${c.category})`;
  return `
    <article class="card t-${c.effort}${spinning ? " spin" : ""}" style="${colour}; --i:${spin === "all" ? i : 0}">
      <div class="cat"><span class="catname">${esc(CATEGORIES[c.category])}</span>${isMix()
        ? `<span class="tierbadge t-${c.effort}" title="${TIER_METAL[c.effort]} tier">${esc(TIER_LABEL[c.effort])}</span>`
        : `<span class="effort">${esc(c.effort)}</span>`}</div>
      ${wildBadge(c)}${titleHTML(c)}
      <p class="detail">${esc(c.detail)}</p>
      ${barHTML(c)}
      <ul>${c.why.slice(0, 3).map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
      <div class="actions">${actionsHTML(c, i)}</div>
    </article>`;
}

function actionsHTML(c, i) {
  return `
        ${!isReadOnly() ? `<button class="btn tiny" data-swap="${i}" type="button">Swap</button>` : ""}
        ${c.category !== "goals" && !isReadOnly() && toGoal(c) ? `<button class="btn tiny ghost" data-goal="${i}" type="button">Make it a goal</button>` : ""}
        ${markButton(c)}
        ${c.category !== "goals" && !isReadOnly() ? `<button class="btn tiny ghost" data-notforme="${i}" type="button" title="Hide this suggestion for a week or for good">Not for me</button>` : ""}
        ${wikiLink(c)}`;
}

/** Shown in place of a card's buttons after "Not for me": how long to hide it. */
function hideChoicesHTML(i) {
  return `<span class="hideask small">Hide it:</span>
        <button class="btn tiny" data-hide="${i}" data-days="7" type="button">For a week</button>
        <button class="btn tiny" data-hide="${i}" data-days="0" type="button">For good</button>
        <button class="btn tiny ghost" data-hide-cancel="${i}" type="button">Cancel</button>`;
}

function toGoal(c) {
  const m = c.meta ?? {};
  const id = "g" + Date.now().toString(36);
  if (m.skill && m.target) return { id, type: "skill", skill: m.skill, level: m.target };
  if (m.skill && m.xpTarget) return { id, type: "xp", skill: m.skill, xp: m.xpTarget };
  if (m.pet) return { id, type: "pet", pet: m.pet };
  if (m.item) return { id, type: "item", item: m.item };
  if (m.quest) return { id, type: "quest", quest: m.quest };
  if (m.region) return { id, type: "diary", region: m.region, tier: m.tier };
  // Keep the suggestion's own scope, so the goal reads (and tracks) like the card did.
  if (m.family) return { id, type: "family", page: m.page, family: m.family, title: m.familyTitle, items: m.items, effort: c.effort };
  if (m.page) return { id, type: "clog", page: m.page };
  if (m.task != null) return { id, type: "catask", task: m.task, name: m.taskName, tier: m.tier, effort: c.effort };
  if (m.monster && m.tier) return { id, type: "cabundle", monster: m.monster, tier: m.tier, effort: c.effort };
  if (c.category === "combat") {
    const next = analyse(state.snap).caNext;
    return next ? { id, type: "ca", tier: next.tier } : null;
  }
  return null;
}

// Which category's icon a goal gets when it has no item, skill or tier of its own.
const GOAL_CATEGORY = { quest: "quests", diary: "diaries", ca: "combat", catask: "combat", cabundle: "combat", clog: "clog", pet: "pets", item: "clog", family: "clog" };

function renderGoals() {
  const el = $("#goals");
  const ro = isReadOnly();
  $("#goalform").hidden = ro;
  if (!state.goals.length) {
    el.innerHTML = `<li class="muted small">${ro ? "No goals set." : `No goals yet. Add one below, or press "Make it a goal" on a suggestion.`}</li>`;
    return;
  }
  el.innerHTML = state.goals.map((g) => {
    const p = goalProgress(g, state.snap);
    const custom = g.type === "custom" || p.manual;
    return `<li class="goal">
      <span class="t ${p.done ? "done" : ""}">${custom ? `<label><input type="checkbox" data-check="${esc(g.id)}" ${g.done ? "checked" : ""}${ro ? " disabled" : ""}> ` : cardIcon({ goal: g, category: GOAL_CATEGORY[g.type] })}${esc(goalTitle(g))}${custom ? "</label>" : ""}${p.done ? " ✓" : ""}</span>
      <span class="l"${p.counterTip ? ` title="${esc(p.counterTip)}"` : ""}>${esc(p.label)} ${wikiLink({ goal: g }, "wikimini")}${ro ? "" : `<button class="x" data-del="${esc(g.id)}" aria-label="Remove goal" title="Remove">×</button>`}</span>
      ${!p.done && goalHint(g) ? `<span class="gd">${esc(goalHint(g))}</span>` : ""}
      <div class="bar" style="--c:${p.done ? "var(--good)" : "var(--c-goals)"}"><i style="width:${Math.round(p.progress * 100)}%"></i></div>
    </li>`;
  }).join("");
}

/**
 * A short reminder of what a goal actually asks, for goals whose title doesn't say it:
 * a combat achievement's requirement, the tasks left in a CA bundle, or the pieces that count
 * towards "any missing piece" goals. Null when the title already says it all.
 */
function goalHint(g) {
  const tasks = state.snap?.combatAchievements?.tasks ?? [];
  const list = (names) => `${names.slice(0, 4).join(", ")}${names.length > 4 ? ` and ${names.length - 4} more` : ""}`;
  switch (g.type) {
    case "catask": {
      const t = tasks.find((x) => x.id === g.task);
      if (!t?.description) return null;
      return `${t.monster && t.monster !== "Other" ? `${t.monster}: ` : ""}${t.description}`;
    }
    case "cabundle": {
      const left = tasks.filter((t) => t.monster === g.monster && t.tier === g.tier && !t.done).map((t) => t.name);
      return left.length ? `Still to do: ${list(left)}` : null;
    }
    case "family": {
      const items = itemIndex(state.snap);
      const missing = (g.items ?? []).filter((n) => !items.get(String(n).toLowerCase())?.owned);
      return missing.length ? `Any one of: ${list(missing)}` : null;
    }
    default:
      return null;
  }
}

/** Only offer goal types that still have something left to achieve. */
function renderGoalTypes() {
  const s = state.snap;
  const { done } = completions(s);
  const below99 = SKILLS.some((k) => s.skills?.[k] && s.skills[k].level < 99);
  const below200m = SKILLS.some((k) => s.skills?.[k] && (s.skills[k].xp ?? 0) < 200e6);
  const types = [
    ["skill", "Skill level", below99],
    ["xp", "Skill XP", below200m],
    ["quest", "Quest", !done.quests],
    ["diary", "Diary tier", !done.diaries],
    ["ca", "CA tier", !done.combat],
    ["clog", "Collection log page", !done.clog],
    ["pet", "Pet", petInfo(s).pets.some((p) => !p.owned)],
    ["item", "Item", true],
    ["custom", "Custom", true],
  ].filter(([, , ok]) => ok);
  const sel = $("#gtype");
  const prev = sel.value;
  sel.innerHTML = types.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  if (types.some(([v]) => v === prev)) sel.value = prev;
  renderGoalFields();
}

function renderGoalFields() {
  const s = state.snap;
  const t = $("#gtype").value;
  const opts = (arr) => arr.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
  let html = "";
  if (t === "skill") {
    html = `<select name="skill" aria-label="Skill">${SKILLS.filter((k) => s.skills?.[k] && s.skills[k].level < 99).map((k) => `<option value="${k}">${cap(k)} (${s.skills[k].level})</option>`).join("")}</select>
            <input name="level" type="number" min="2" max="99" value="99" aria-label="Target level">`;
  } else if (t === "xp") {
    html = `<select name="skill" aria-label="Skill">${SKILLS.filter((k) => s.skills?.[k] && (s.skills[k].xp ?? 0) < 200e6).map((k) => `<option value="${k}">${cap(k)} (${fmt(s.skills[k].xp)})</option>`).join("")}</select>
            <input name="xp" placeholder="e.g. 50m" aria-label="Target XP" required style="width:96px">`;
  } else if (t === "quest") {
    const qs = (s.quests ?? []).filter((q) => q.state !== "FINISHED").map((q) => q.name).sort();
    html = `<select name="quest" class="grow" aria-label="Quest">${opts(qs)}</select>`;
  } else if (t === "diary") {
    html = `<select name="region" aria-label="Region">${opts(Object.keys(s.diaries ?? DIARIES))}</select>
            <select name="tier" aria-label="Tier">${opts(["easy", "medium", "hard", "elite"])}</select>`;
  } else if (t === "ca") {
    html = `<select name="tier" aria-label="Tier">${opts(CA_TIERS)}</select>`;
  } else if (t === "clog") {
    const pages = Object.keys(s.collectionLog?.pages ?? {}).sort(byPageName);
    html = pages.length ? `<select name="page" class="grow" aria-label="Page">${pages.map((v) => `<option value="${esc(v)}">${esc(pageLabel(v))}</option>`).join("")}</select>`
      : `<span class="muted small grow">Browse collection log pages in-game first.</span>`;
  } else if (t === "pet") {
    const missing = petInfo(s).pets.filter((p) => !p.owned).map((p) => p.name).sort();
    html = `<select name="pet" class="grow" aria-label="Pet">${opts(missing)}</select>`;
  } else if (t === "item") {
    // Suggest collection log items you don't have yet; any other item name works too (ticked off by hand).
    const pets = petInfo(s).ids;
    const missing = [...itemIndex(s).values()].filter((i) => !i.owned && !pets.has(i.id)).map((i) => i.name).sort();
    html = `<input name="item" class="grow" list="itemlist" placeholder="Item name, e.g. Dragon warhammer" maxlength="60" aria-label="Item" required>
            <datalist id="itemlist">${missing.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>`;
  } else {
    html = `<input name="text" class="grow" placeholder="e.g. Get a Fire cape" maxlength="80" aria-label="Goal" required>`;
  }
  $("#gfields").innerHTML = html;
}

const parseAmount = (v) => {
  const m = String(v).trim().toLowerCase().replace(/,/g, "").match(/^(\d+(?:\.\d+)?)\s*([kmb]?)$/);
  if (!m) return null;
  return Math.round(parseFloat(m[1]) * { "": 1, k: 1e3, m: 1e6, b: 1e9 }[m[2]]);
};

// ---- Account tabs ------------------------------------------------------------------------

const TABS = { skills: "Skills", quests: "Quests", diaries: "Diaries", combat: "Combat", clog: "Collection log", pets: "Pets" };

function renderTabs() {
  $("#tabs").innerHTML = Object.entries(TABS).map(([k, l]) =>
    `<button type="button" role="tab" data-tab="${k}" aria-selected="${state.tab === k}">${l}</button>`).join("");
  $("#tabbody").innerHTML = TAB_RENDER[state.tab](state.snap);
}

const TAB_RENDER = {
  skills(s) {
    return `<div class="skillgrid">${SKILLS.filter((k) => s.skills?.[k]).map((k) => {
      const { level, xp } = s.skills[k];
      // At 99 the level can't move, so show XP instead.
      return `<div class="sk ${level >= 99 ? "max" : ""}" title="${xp.toLocaleString()} XP${level < 99 ? ` · ${fmt(xpForLevel(level + 1) - xp)} to ${level + 1}` : ""}"><span>${iconImg(spriteUrl(`skill-${k}`), { cls: "gicon tiny" })}${cap(k)}</span><b>${level >= 99 ? fmt(xp) : level}</b></div>`;
    }).join("")}</div>`;
  },
  quests(s) {
    const order = { IN_PROGRESS: 0, NOT_STARTED: 1, FINISHED: 2 };
    const qs = [...(s.quests ?? [])].sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name));
    // Marking by hand: every quest the last sync didn't show as finished gets a toggle.
    const mark = (q) => {
      if (!canMark() || (q.state === "FINISHED" && !q.manual)) return "";
      return `<button type="button" class="markmini" data-mark="quests" data-key="${esc(q.name)}" aria-pressed="${!!q.manual}" title="${q.manual ? "Undo your mark" : "Mark as finished until your next sync"}">${q.manual ? "Undo" : "Mark done"}</button>`;
    };
    return `${canMark() ? `<p class="note manualnote">Marking by hand: tick off quests you've finished since your last sync.</p>` : ""}
      <table class="list"><tbody>${qs.map((q) => `<tr><td><a class="plainlink" href="${esc(wikiPage(q.name))}" target="_blank" rel="noopener noreferrer" title="Open ${esc(q.name)} on the OSRS Wiki">${esc(q.name)}</a></td><td class="num">${mark(q)}<span class="pill ${q.state === "FINISHED" ? "ok" : q.state === "IN_PROGRESS" ? "mid" : ""}">${esc(q.manual ? "finished (marked)" : q.state.replace("_", " ").toLowerCase())}</span></td></tr>`).join("")}</tbody></table>`;
  },
  diaries(s) {
    // One column per tier; each square links to that tier on the wiki. A region counts as started
    // when the plugin saw any of its tasks done (older profiles don't say, so nothing is yellow).
    const tiers = ["easy", "medium", "hard", "elite"];
    const rows = Object.entries(s.diaries ?? {}).map(([region, done]) => {
      const nextTier = tiers.find((t) => !done[t]);
      const started = s.diaryStarted?.[region] === true;
      const cells = tiers.map((t) => {
        const marked = !!state.marks.diaries?.[`${region}|${t}`];
        const status = done[t] ? "done" : started && t === nextTier ? "started" : "todo";
        const label = `${region} ${cap(t)}: ${marked ? "complete (marked by hand)" : { done: "complete", started: "in progress", todo: "not started" }[status]}`;
        // Marking by hand: tiers the last sync didn't show as done become toggles.
        if (canMark() && (!done[t] || marked)) {
          return `<td class="tiercell"><button type="button" class="tierbox ${status}${marked ? " marked" : ""}" data-mark="diaries" data-key="${esc(`${region}|${t}`)}" aria-pressed="${marked}" title="${esc(label)}. Click to ${marked ? "undo your mark" : "mark it done until your next sync"}" aria-label="${esc(label)}"></button></td>`;
        }
        return `<td class="tiercell"><a class="tierbox ${status}${marked ? " marked" : ""}" href="${esc(wikiPage(`${region} Diary`, cap(t)))}" target="_blank" rel="noopener noreferrer" title="${esc(label)}. Open on the OSRS Wiki" aria-label="${esc(label)}"></a></td>`;
      }).join("");
      return `<tr><td><a class="plainlink" href="${esc(wikiPage(`${region} Diary`))}" target="_blank" rel="noopener noreferrer">${esc(region)}</a></td>${cells}</tr>`;
    }).join("");
    return `<table class="list diarytable"><thead><tr><th>Region</th>${tiers.map((t) => `<th class="tiercell">${cap(t)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
      <p class="note legend"><span class="tierbox done"></span> Complete <span class="tierbox started"></span> In progress <span class="tierbox todo"></span> Not started${markCount() ? ` <span class="tierbox done marked"></span> Marked by hand` : ""} · ${canMark()
        ? "Marking by hand: click a tier you've finished since your last sync."
        : "Click a square to open that tier on the wiki."}</p>
      ${isMissing("diaryStarted") ? `<p class="note missing"><span aria-hidden="true">ⓘ</span> Diaries in progress aren't in this profile, so none show as started. ${esc(missingWhy())}</p>` : ""}`;
  },
  combat(s) {
    const a = analyse(s);
    const ca = s.combatAchievements ?? {};
    const tierLink = (t) => `<a class="plainlink" href="${esc(wikiGo(`${t} Combat Achievements`))}" target="_blank" rel="noopener noreferrer" title="Open the ${t} combat achievements on the OSRS Wiki">${t}</a>`;
    const rows = CA_TIERS.map((t) => {
      const b = a.caByTier[t];
      return `<tr><td>${iconImg(spriteUrl(`ca-${t.toLowerCase()}`), { cls: "gicon tiny" })}${tierLink(t)}</td><td class="num">${b.total ? `${b.done}/${b.total}` : "—"}</td><td class="num">${ca.thresholds?.[t] ?? "—"}</td></tr>`;
    }).join("");
    // Every task, by tier: unfinished first, each linking to its wiki entry. One tier open at a
    // time, like the collection log pages.
    const tasks = ca.tasks ?? [];
    const lists = CA_TIERS.map((t) => {
      const list = tasks.filter((x) => x.tier === t).sort((x, y) => Number(!!x.done) - Number(!!y.done) || String(x.monster).localeCompare(String(y.monster)) || x.name.localeCompare(y.name));
      if (!list.length) return "";
      const done = list.filter((x) => x.done).length;
      const key = `ca:${t}`;
      return `
        <details class="clogpage" name="clogpage" data-page="${esc(key)}" ${state.clogOpen === key ? "open" : ""}>
          <summary><span>${iconImg(spriteUrl(`ca-${t.toLowerCase()}`), { cls: "gicon tiny" })}${t} tasks</span>
            <span class="pill ${done === list.length ? "ok" : ""}">${done}/${list.length}</span></summary>
          <ul class="clogitems catasks">${list.map((x) => `
            <li class="${x.done ? "have" : "need"}" title="${esc(x.description ?? "")}">
              <span><span><a class="plainlink" href="${esc(wikiGo(x.name))}" target="_blank" rel="noopener noreferrer">${esc(x.name)}</a>${x.monster && x.monster !== "Other" ? ` <span class="muted small">· ${esc(x.monster)}</span>` : ""}</span>
                ${x.description ? `<span class="catdesc">${esc(x.description)}</span>` : ""}</span>
              <span class="q">${x.done ? (x.manual ? "marked" : "✓") : "to do"}</span>
            </li>`).join("")}</ul>
        </details>`;
    }).join("");
    return `<table class="list"><thead><tr><th>Tier</th><th class="num">Tasks</th><th class="num">Points needed</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="note">${ca.points ?? 0} points · current reward tier: ${esc(a.caRank)}${a.caNext ? ` · ${a.caNext.gap} to ${a.caNext.tier}` : ""}</p>
      ${lists ? `<div class="clogpages">${lists}</div>` : ""}`;
  },
  clog(s) {
    const log = s.collectionLog ?? {};
    const cats = Object.entries(log.categories ?? {}).map(([c, v]) => `<tr><td>${esc(c)}</td><td class="num">${v.obtained}/${v.total}</td></tr>`).join("");
    // Pages A–Z; each expands to its item list. Only one page is open at a time.
    const pages = Object.entries(log.pages ?? {}).map(([n, p]) => {
      const got = p.items.filter((i) => i.quantity > 0).length;
      return { n, got, total: p.items.length, tab: p.tab, items: p.items };
    }).sort((a, b) => byPageName(a.n, b.n));
    return `<table class="list"><thead><tr><th>Tab</th><th class="num">Slots</th></tr></thead><tbody>${cats}</tbody></table>
      ${pages.length ? `<div class="clogpages">${pages.map((p) => `
        <details class="clogpage" name="clogpage" data-page="${esc(p.n)}" ${state.clogOpen === p.n ? "open" : ""}>
          <summary><span>${esc(pageLabel(p.n))} <span class="muted small">${esc(p.tab)}</span></span>
            <span class="pill ${p.got === p.total ? "ok" : ""}">${p.got}/${p.total}</span></summary>
          <ul class="clogitems">${p.items.map((i) => i.quantity > 0
            ? `<li class="have"><span>${iconImg(itemUrl(i.id), { cls: "gicon tiny item" })}${esc(i.name)}</span><span class="q">${i.quantity > 1 ? `×${i.quantity.toLocaleString()}` : "✓"}</span></li>`
            : `<li class="need"><span>${iconImg(itemUrl(i.id), { cls: "gicon tiny item" })}${esc(i.name)}</span><span class="q">not obtained</span></li>`).join("")}</ul>
        </details>`).join("")}</div>`
      : `<p class="note">No pages recorded yet. Open the collection log in-game and click Search, then sync.</p>`}`;
  },
  pets(s) {
    const { pets, owned } = petInfo(s);
    if (!pets.length) return `<p class="note">No pet data yet. Sync with the latest plugin to load the All Pets page.</p>`;
    const sorted = [...pets].sort((a, b) => Number(b.owned) - Number(a.owned) || a.name.localeCompare(b.name));
    return `<p class="note" style="margin:0 0 10px">${owned} of ${pets.length} pets</p>
      <div class="petgrid">${sorted.map((p) =>
        `<div class="pet ${p.owned ? "owned" : ""}" title="${esc(p.source ? `From ${p.source}` : "")}"><span>${iconImg(itemUrl(p.id), { cls: "gicon tiny item" })}${esc(p.name)}</span><i aria-label="${p.owned ? "Obtained" : "Missing"}">${p.owned ? "✓" : ""}</i></div>`).join("")}</div>`;
  },
};

// ---- Events --------------------------------------------------------------------------------

$("#lookup").addEventListener("submit", (e) => { e.preventDefault(); load($("#name").value.trim()); });
$("#sample").addEventListener("click", () => load(SAMPLE));

$("#shuffle").addEventListener("click", () => {
  if (isReadOnly()) return;
  state.seed = (state.seed + 1) * 7919 % 100003;
  // Never show the same cards twice in a row; start over once a tier has been cycled through.
  for (const c of state.picks) state.excluded.add(c.id);
  // Once a tier has been cycled through, start over: avoid what's on screen if there's enough
  // else to fill the cards, otherwise allow repeats (pickThree never returns fewer than it can).
  const list = currentList();
  const want = Math.min(isMix() ? 7 : 3, list.length);
  if (list.filter((c) => !state.excluded.has(c.id)).length < want) {
    const shown = new Set(state.picks.map((c) => c.id));
    state.excluded = list.length - shown.size >= want ? shown : new Set();
  }
  spin = "all";
  spinTurns += 1;
  $("#shuffle .ico").style.transform = `rotate(${spinTurns * 90}deg)`;
  renderCards(true);
});

document.querySelector(".seg").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-style]");
  if (!b || isReadOnly()) return;
  state.style = b.dataset.style;
  localStorage.setItem("tm.style", state.style);
  renderControls();
  renderCards(true);
});

$("#chips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cat]");
  if (!b || isReadOnly()) return;
  const k = b.dataset.cat;
  if (state.cats.has(k)) { if (state.cats.size > 1) state.cats.delete(k); } else state.cats.add(k);
  localStorage.setItem("tm.off", JSON.stringify(Object.keys(CATEGORIES).filter((c) => !state.cats.has(c))));
  renderControls();
  renderCards(true);
});

/** Replace the card in slot `i` with another suggestion (Swap, and after "Not for me"). */
function swapAt(i) {
  state.excluded.add(state.picks[i].id);
  if (isMix()) {
    // Replace with another pick from the same tier, so the carousel keeps its spread.
    const old = state.picks[i];
    const shown = new Set(state.picks.map((c) => c.id));
    const tierList = currentList().filter((c) => c.effort === old.effort && !shown.has(c.id));
    const [next] = pickThree(tierList, { seed: state.seed, exclude: state.excluded, keep: state.picks.filter((_, j) => j !== i), n: 7 })
      .filter((c) => !shown.has(c.id));
    // A hidden card must go even when nothing can replace it.
    if (next) state.picks = state.picks.map((c, j) => (j === i ? next : c));
    else if (isHidden(old)) state.picks = state.picks.filter((_, j) => j !== i);
    spin = i;
    renderCards();
    return;
  }
  const keep = state.picks.filter((_, j) => j !== i);
  // Put the replacement back in the same slot.
  const next = pickThree(currentList(), { seed: state.seed, exclude: state.excluded, keep });
  const added = next.find((c) => !keep.includes(c));
  state.picks = added ? [...keep.slice(0, i), added, ...keep.slice(i)] : keep;
  spin = i;
  renderCards();
}

$("#cards").addEventListener("click", (e) => {
  // View only: the carousel arrows still scroll; nothing else on the cards changes anything.
  if (isReadOnly() && !e.target.closest("[data-scroll]")) return;
  const swap = e.target.closest("[data-swap]");
  if (swap) { swapAt(+swap.dataset.swap); return; }
  // "Not for me": ask how long, then hide it and fill the slot like Swap does.
  const nfm = e.target.closest("[data-notforme]");
  if (nfm) { nfm.closest(".actions").innerHTML = hideChoicesHTML(+nfm.dataset.notforme); return; }
  const cancel = e.target.closest("[data-hide-cancel]");
  if (cancel) { const i = +cancel.dataset.hideCancel; cancel.closest(".actions").innerHTML = actionsHTML(state.picks[i], i); return; }
  const hide = e.target.closest("[data-hide]");
  if (hide) {
    const i = +hide.dataset.hide;
    hideSuggestion(state.picks[i], +hide.dataset.days);
    renderOptIns();
    swapAt(i);
    return;
  }
  const nav = e.target.closest("[data-scroll]");
  if (nav) {
    const track = $("#cards .track");
    const step = track.querySelector(".card")?.getBoundingClientRect().width ?? 280;
    track.scrollBy({ left: +nav.dataset.scroll * (step + 14), behavior: "smooth" });
    return;
  }
  const g = e.target.closest("[data-goal]");
  if (g) {
    const goal = toGoal(state.picks[+g.dataset.goal]);
    if (goal && !state.goals.some((x) => goalTitle(x) === goalTitle(goal))) {
      state.goals.push(goal);
      saveGoals();
      renderGoals();
      renderCards(true);
    }
  }
});

$("#challenge").addEventListener("click", (e) => {
  if (!state.challenge || isReadOnly()) return;
  if (e.target.closest("[data-challenge-swap]")) {
    // Cycle through the challenges; when they've all been seen, start over.
    const old = state.challenge.id;
    (state.challengeSeen ??= new Set()).add(old);
    state.challenge = pickChallenge(visibleAll(), { seed: ++state.seed, exclude: state.challengeSeen });
    if (!state.challenge) { state.challengeSeen = new Set([old]); state.challenge = pickChallenge(visibleAll(), { seed: state.seed, exclude: state.challengeSeen }); }
    renderChallenge();
    $("#challenge .card")?.classList.add("spin");
    return;
  }
  const actions = $("#challenge .actions");
  if (e.target.closest("[data-challenge-notforme]")) { actions.innerHTML = hideChoicesHTML("challenge"); return; }
  if (e.target.closest("[data-hide-cancel]")) { renderChallenge(); return; }
  const hide = e.target.closest("[data-hide]");
  if (hide) {
    hideSuggestion(state.challenge, +hide.dataset.days);
    currentList();
    state.challenge = pickChallenge(visibleAll(), { seed: ++state.seed, exclude: state.challengeSeen ?? new Set() })
      ?? pickChallenge(visibleAll(), { seed: state.seed });
    renderOptIns();
    renderChallenge();
    $("#challenge .card")?.classList.add("spin");
    return;
  }
  if (e.target.closest("[data-challenge-goal]")) {
    const goal = toGoal(state.challenge);
    if (goal && !state.goals.some((x) => goalTitle(x) === goalTitle(goal))) {
      state.goals.push(goal);
      saveGoals();
      renderGoals();
      renderCards(true);
    }
  }
});

$("#optins").addEventListener("click", (e) => {
  const b = e.target.closest("[data-content]");
  if (!b || isReadOnly()) return;
  state.content[b.dataset.content] = !state.content[b.dataset.content];
  localStorage.setItem("tm.content", JSON.stringify(state.content));
  state.excluded.clear();
  renderControls();
  renderCards(true);
});
$("#lockedbtn").addEventListener("click", () => $("#lockeddlg").showModal());
$("#hiddenbtn").addEventListener("click", () => $("#hiddendlg").showModal());
$("#hiddendlg").addEventListener("click", (e) => {
  if (e.target.closest("[data-close]") || e.target === e.currentTarget) return e.currentTarget.close();
  if (isReadOnly()) return;
  const one = e.target.closest("[data-unhide]");
  if (one) return unhide([one.dataset.unhide]);
  if (e.target.closest("[data-unhide-all]")) return unhide(Object.keys(state.hidden));
});
$("#lockeddlg").addEventListener("click", (e) => {
  // Close on the × button or a click on the backdrop.
  if (e.target.closest("[data-close]") || e.target === e.currentTarget) e.currentTarget.close();
});

$("#gtype").addEventListener("change", renderGoalFields);
$("#goalform").addEventListener("submit", (e) => {
  e.preventDefault();
  if (isReadOnly()) return;
  const f = new FormData(e.target);
  const type = f.get("type") ?? $("#gtype").value;
  const g = { id: "g" + Date.now().toString(36), type };
  if (type === "skill") Object.assign(g, { skill: f.get("skill"), level: Math.max(2, Math.min(99, +f.get("level") || 99)) });
  else if (type === "xp") {
    const n = parseAmount(f.get("xp"));
    if (!n || n > 200e6) return alert("Try an XP target like 50m (200m max).");
    Object.assign(g, { skill: f.get("skill"), xp: n });
  }
  else if (type === "quest") g.quest = f.get("quest");
  else if (type === "diary") Object.assign(g, { region: f.get("region"), tier: f.get("tier") });
  else if (type === "ca") g.tier = f.get("tier");
  else if (type === "clog") { if (!f.get("page")) return; g.page = f.get("page"); }
  else if (type === "pet") { if (!f.get("pet")) return; g.pet = f.get("pet"); }
  else if (type === "item") {
    const raw = String(f.get("item") || "").trim();
    if (!raw) return;
    // Use the game's spelling when it matches a collection log item, so it tracks automatically.
    const known = itemIndex(state.snap).get(raw.toLowerCase());
    g.item = known ? known.name : raw;
    if (!known) g.done = false;
  }
  else { const t = String(f.get("text") || "").trim(); if (!t) return; g.text = t; g.done = false; }
  if (Object.values(g).some((v) => v == null)) return;
  state.goals.push(g);
  saveGoals();
  renderGoals();
  renderGoalFields();
  renderCards(true);
});

$("#goals").addEventListener("click", (e) => {
  const del = e.target.closest("[data-del]");
  if (del && !isReadOnly()) {
    state.goals = state.goals.filter((g) => g.id !== del.dataset.del);
    saveGoals(); renderGoals(); renderCards(true);
  }
});
$("#goals").addEventListener("change", (e) => {
  const c = e.target.closest("[data-check]");
  if (!c || isReadOnly()) return;
  const g = state.goals.find((x) => x.id === c.dataset.check);
  if (g) { g.done = c.checked; saveGoals(); renderGoals(); renderCards(true); }
});

// Collection log accordion: remember the open page and keep only one open at a time
// (also for browsers that ignore <details name>).
$("#tabbody").addEventListener("toggle", (e) => {
  const d = e.target;
  if (!d.matches?.("details.clogpage")) return;
  if (d.open) {
    state.clogOpen = d.dataset.page;
    document.querySelectorAll("details.clogpage[open]").forEach((o) => { if (o !== d) o.open = false; });
  } else if (state.clogOpen === d.dataset.page) {
    state.clogOpen = null;
  }
}, true);

$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tab]");
  if (!b) return;
  state.tab = b.dataset.tab;
  renderTabs();
});

// Marking by hand: the toggle in the summary, and every "Mark done" control on cards and tabs.
$("#summary").addEventListener("click", async (e) => {
  // The owner previewing the visitor view, or back again. Nothing is saved while previewing.
  if (e.target.closest("#visitorbtn") && state.source?.edit) {
    state.viewAsVisitor = !state.viewAsVisitor;
    renderAll();
    return;
  }
  // Owners share a view-only link (the id only), never their own link with the edit token.
  const share = e.target.closest("#sharebtn");
  if (share && state.source?.kind === "sync") {
    const link = `${location.origin}${location.pathname}#id=${state.source.id}`;
    try {
      await navigator.clipboard.writeText(link);
      share.textContent = "Copied: view-only link";
    } catch {
      prompt("Copy this view-only link:", link);
    }
    setTimeout(() => { share.textContent = "Copy share link"; }, 2500);
    return;
  }
  if (!e.target.closest("#manualbtn")) return;
  state.manualMode = !state.manualMode;
  localStorage.setItem("tm.manualMode", state.manualMode ? "1" : "0");
  renderAll();
});
$("#app").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-mark]");
  if (!b || !state.raw || isReadOnly()) return;
  setMark(b.dataset.mark, b.dataset.key, b.getAttribute("aria-pressed") !== "true");
});

$("#reach").addEventListener("click", (e) => {
  const nav = e.target.closest("[data-reach-scroll]");
  if (nav) {
    const track = $("#reach .track");
    const step = track.querySelector(".card")?.getBoundingClientRect().width ?? 280;
    track.scrollBy({ left: +nav.dataset.reachScroll * (step + 14), behavior: "smooth" });
    return;
  }
  const g = e.target.closest("[data-reach-goal]");
  if (g) {
    const goal = toGoal(state.reach[+g.dataset.reachGoal]);
    if (goal && !state.goals.some((x) => goalTitle(x) === goalTitle(goal))) {
      state.goals.push(goal);
      saveGoals();
      renderGoals();
      renderReach();
      renderCards(true);
    }
  }
});

// ---- Boot --------------------------------------------------------------------------------

/** The address after #: either a profile link (id=…&edit=…) or a player name. */
function readHash() {
  const raw = location.hash.slice(1);
  if (/^id=/.test(raw)) {
    const p = new URLSearchParams(raw);
    return { id: p.get("id"), edit: p.get("edit"), focus: p.get("focus") };
  }
  return { name: decodeURIComponent(raw) };
}

window.addEventListener("hashchange", () => {
  const h = readHash();
  if (h.id && (h.id !== state.source?.id || h.focus)) load(null, h);
  else if (h.name && h.name !== state.name) { $("#name").value = h.name; load(h.name); }
});

// ---- Importing a profile (browser mode) --------------------------------------------------

const importBoxHTML = () => `
  <div class="importbox">
    <textarea class="pastebox" rows="3" spellcheck="false" aria-label="Paste your profile here"
      placeholder="Click here and press Ctrl+V to paste the profile you copied in RuneLite"></textarea>
    <div class="importrow">
      <label class="btn tiny">Choose profile file<input type="file" accept=".json,application/json" hidden></label>
      <span class="muted small">or drag the file onto this page. RuneLite saves it in <code>.runelite\\osrs-taskmaster</code> (Show profile file in the panel).</span>
    </div>
    <p class="error importerr" role="alert" hidden></p>
  </div>`;

function importError(msg) {
  document.querySelectorAll(".importerr").forEach((el) => { el.hidden = !msg; el.textContent = msg ?? ""; });
}

/** Read a profile the plugin copied or saved, keep it in this browser, and show it. */
function importProfile(text) {
  importError(null);
  let snap;
  try { snap = JSON.parse(String(text).trim()); } catch { snap = null; }
  if (!snap || typeof snap !== "object" || typeof snap.player?.name !== "string" || !snap.skills) {
    return importError("That isn't an OSRS TaskMaster profile. In RuneLite, click Copy my profile in the OSRS TaskMaster panel, then paste here.");
  }
  delete snap.wealth; // never kept, even from an old plugin
  try { local.put(snap); } catch {
    return importError("This browser's storage is full. Remove a profile you no longer need (Update profile → Remove) and try again.");
  }
  document.querySelectorAll(".pastebox").forEach((t) => { t.value = ""; });
  $("#importdlg").close();
  refreshKnown();
  $("#name").value = snap.player.name;
  load(snap.player.name, { local: true });
}

async function importFile(file) {
  if (!file) return;
  if (file.size > 20e6) return importError("That file is too big to be a profile.");
  importProfile(await file.text());
}

function refreshKnown() {
  // Profiles this browser knows about: pasted ones (or the local server's), plus opened links.
  const names = [];
  for (const n of [...((serverMode ? refreshKnown.server : local.names()) ?? []).map((n) => n.replace(/_/g, " ")), ...links.all().map((l) => l.name)]) {
    if (n && !names.some((m) => keyOf(m) === keyOf(n))) names.push(n);
  }
  $("#known").innerHTML = names.map((n) => `<option value="${esc(n)}">`).join("");
  const list = $("#knownlist");
  if (!serverMode && names.length) {
    list.hidden = false;
    list.innerHTML = `Profiles in this browser: ${names.map((n) => `<button type="button" class="link" data-open="${esc(n)}">${esc(n)}</button>`).join(", ")}`;
  } else list.hidden = true;
}

/**
 * Back to the start page without reloading. The profile stays saved in this browser, and it's
 * listed on the start page so it's one click to open again.
 */
function goHome() {
  state.name = null;
  history.replaceState(null, "", location.pathname);
  showError(null);
  refreshKnown();
  $("#app").hidden = true;
  $("#intro").hidden = false;
  window.scrollTo(0, 0);
}

function setupImport() {
  $("#importslot").innerHTML = importBoxHTML();
  $("#importdlgslot").innerHTML = importBoxHTML();
  document.addEventListener("paste", (e) => {
    if (serverMode) return;
    const text = e.clipboardData?.getData("text") ?? "";
    // In a paste box, or anywhere outside a text field.
    const field = e.target.closest?.("input, textarea, select");
    if (field && !field.classList.contains("pastebox")) return;
    // Outside a paste box, only react to something that looks like a profile.
    if (!field && !text.trim().startsWith("{")) return;
    e.preventDefault();
    importProfile(text);
  });
  document.addEventListener("change", (e) => {
    if (e.target.matches(".importbox input[type=file]")) importFile(e.target.files[0]).finally(() => { e.target.value = ""; });
  });
  document.addEventListener("dragover", (e) => { if (!serverMode && e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });
  document.addEventListener("drop", (e) => {
    if (serverMode || !e.dataTransfer?.files?.length) return;
    e.preventDefault();
    importFile(e.dataTransfer.files[0]);
  });
  $("#importbtn").addEventListener("click", () => {
    importError(null);
    $("#forget").parentElement.hidden = !["local", "sync"].includes(state.source?.kind);
    $("#importdlg").showModal();
  });
  $("#importdlg").addEventListener("click", (e) => {
    if (e.target.closest("[data-close]") || e.target === e.currentTarget) e.currentTarget.close();
  });
  $("#forget").addEventListener("click", () => {
    const synced = state.source?.kind === "sync";
    if (!state.name || !confirm(synced
      ? `Forget ${state.name}'s link in this browser? The uploaded profile itself stays on the server; delete it from the RuneLite plugin's panel.`
      : `Remove ${state.name}'s profile and goals from this browser?`)) return;
    if (synced) links.remove(state.source.id);
    else local.forget(state.name);
    state.source = null;
    localStorage.removeItem("tm.last");
    $("#importdlg").close();
    $("#name").value = "";
    goHome();
  });
  $("#knownlist").addEventListener("click", (e) => {
    const b = e.target.closest("[data-open]");
    if (b) { $("#name").value = b.dataset.open; load(b.dataset.open); }
  });
}

(async function boot() {
  // Drop rates are a static file in this project (a one-off wiki snapshot); no outside calls.
  try { setDropRates(await api("data/drop-rates.json")); } catch { /* fall back to the hand-made rules */ }
  // Game icons are local files too (exported from the game cache); without them the page uses text.
  await loadGameIcons();
  // Server mode only when this page is served by Start-LocalServer.ps1; anywhere else (the hosted
  // site) profiles are pasted in and kept in the browser.
  try {
    const names = await api("api/profiles");
    if (Array.isArray(names)) { serverMode = true; refreshKnown.server = names; }
  } catch { /* hosted site, or the server isn't running */ }
  document.body.classList.remove("booting");
  document.body.classList.toggle("static", !serverMode);
  setupImport();
  // The logo goes back to the start page. A plain click stays on this page; opening it in a new
  // tab (Ctrl/middle click) behaves like a normal link.
  $("#home").addEventListener("click", (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    goHome();
  });
  refreshKnown();
  const h = readHash();
  if (h.id) return load(null, h);
  const last = h.name || localStorage.getItem("tm.last");
  if (last) {
    $("#name").value = last;
    // Profiles this browser already has (pasted or linked) open straight away.
    if (h.name || (!serverMode && local.get(last)) || links.byName(last)) load(last);
  }
})();
