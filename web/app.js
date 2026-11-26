import { CATEGORIES, CONTENT_TOGGLES, STYLE_EFFORT, setDropRates, candidates, lockedContent, pickThree, pickMix, pickBonus, goalProgress, goalTitle, analyse, completions, petInfo, itemIndex, fmt, xpForLevel } from "./engine.js";
import { SKILLS, DIARIES, CA_TIERS } from "./kb.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Collection log page names the way the game orders them: "The Whisperer" sorts under W and
// is shown as "Whisperer, The".
const pageSortKey = (n) => n.replace(/^the\s+/i, "");
const pageLabel = (n) => (/^the\s+/i.test(n) ? `${n.replace(/^the\s+/i, "")}, The` : n);
const byPageName = (a, b) => pageSortKey(a).localeCompare(pageSortKey(b));
const SAMPLE = "__sample__";

const state = {
  name: null,
  snap: null,
  goals: [],
  style: localStorage.getItem("tm.style") || "balanced",
  // Remember the categories switched *off*, so new categories show up by default.
  cats: new Set(Object.keys(CATEGORIES).filter((k) => !JSON.parse(localStorage.getItem("tm.off") || "[]").includes(k))),
  // Opt-in content (minigames, Wilderness, clues): off until the player switches it on.
  content: JSON.parse(localStorage.getItem("tm.content") || "{}"),
  seed: 0,
  excluded: new Set(),
  picks: [],
  tab: "skills",
};

// ---- Data -------------------------------------------------------------------------------

async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw Object.assign(new Error(await r.text().catch(() => r.statusText)), { status: r.status });
  return r.status === 204 ? null : r.json();
}

// Two ways to run the site:
// - Server mode: start-server.ps1 is running; the plugin syncs to it and goals are saved there.
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
    localStorage.removeItem(`tm.profile:${keyOf(name)}`);
    localStorage.removeItem(`tm.goals:${keyOf(name)}`);
    localStorage.setItem("tm.profileNames", JSON.stringify(local.names().filter((n) => keyOf(n) !== keyOf(name))));
  },
  goals: (name) => JSON.parse(localStorage.getItem(`tm.goals:${keyOf(name)}`) || "[]"),
  saveGoals: (name, goals) => localStorage.setItem(`tm.goals:${keyOf(name)}`, JSON.stringify(goals)),
};

async function load(name) {
  showError(null);
  try {
    if (name === SAMPLE) {
      state.snap = await api("sample-profile.json");
      state.goals = JSON.parse(localStorage.getItem("tm.sampleGoals") || "null") ?? [
        { id: "g1", type: "skill", skill: "slayer", level: 85 },
        { id: "g2", type: "quest", quest: "Dragon Slayer II" },
      ];
    } else if (!serverMode) {
      state.snap = local.get(name);
      if (!state.snap) throw Object.assign(new Error("not imported"), { status: 404 });
      state.goals = local.goals(name);
      name = state.snap.player?.name ?? name;
    } else {
      state.snap = await api(`/api/profile/${encodeURIComponent(name)}`);
      state.goals = await api(`/api/goals/${encodeURIComponent(name)}`).catch(() => []);
    }
    // Wealth tracking was removed; drop any old net-worth goals.
    state.goals = state.goals.filter((g) => g.type !== "wealth");
    delete state.snap.wealth;
  } catch (e) {
    if (location.protocol === "file:") return showError("Open the site through the server (http://localhost:8787), not as a file.");
    if (e.status === 404 && !serverMode) return showError(`No profile for "${name}" in this browser yet. In RuneLite, open the OSRS TaskMaster panel, click Copy my profile, then paste it here.`);
    if (e.status === 404) return showError(`No synced data for "${name}" yet. Log in with the RuneLite plugin enabled, or press Copy my profile in its panel.`);
    if (e.status === 400) return showError("That doesn't look like an OSRS name (1–12 letters, numbers, spaces, - or _).");
    return showError("Couldn't reach the OSRS TaskMaster server. Is start-server.ps1 running?");
  }
  state.name = name;
  state.seed = 0;
  state.excluded.clear();
  state.picks = [];
  if (name !== SAMPLE) {
    localStorage.setItem("tm.last", name);
    history.replaceState(null, "", `#${encodeURIComponent(name)}`);
  }
  $("#intro").hidden = true;
  $("#app").hidden = false;
  renderAll();
}

async function saveGoals() {
  if (state.name === SAMPLE) return localStorage.setItem("tm.sampleGoals", JSON.stringify(state.goals));
  if (!serverMode) return local.saveGoals(state.name, state.goals);
  await api(`/api/goals/${encodeURIComponent(state.name)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state.goals),
  }).catch(() => showToastError());
}

function showError(msg) {
  const el = $("#error");
  el.hidden = !msg;
  el.textContent = msg ?? "";
  if (msg) { $("#intro").hidden = false; $("#app").hidden = true; }
}
function showToastError() { alert("Couldn't save goals: the server didn't respond."); }

// ---- Rendering ---------------------------------------------------------------------------

function renderAll() {
  renderSummary();
  renderControls();
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
      <div class="muted">${esc(p.accountType ?? "")} · Combat ${esc(p.combatLevel ?? "?")} · ${state.name === SAMPLE ? "Sample data" : `Synced <span class="${age > 864e5 ? "stale" : ""}">${ago}</span>`}</div>
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
  $("#tierhint").textContent = TIER_HINT[state.style] ?? "";
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
  return effort ? listCache.all.filter((c) => c.effort === effort) : listCache.all;
}

function renderOptIns() {
  $("#optins").innerHTML = Object.entries(CONTENT_TOGGLES).map(([k, label]) =>
    `<button type="button" class="toggle" data-content="${k}" aria-pressed="${!!state.content[k]}"${k === "wilderness" ? ` title="${esc(WILD_TIP)}"` : ""}>${k === "wilderness" ? `<span class="skull" aria-hidden="true">☠</span> ` : ""}${esc(label)}</button>`).join("");
  // Count across every tier, so the number doesn't jump when switching tiers.
  const locked = lockedContent(state.snap, { categories: state.cats, content: state.content });
  const btn = $("#lockedbtn");
  btn.hidden = !locked.length;
  btn.textContent = `${locked.length} hidden until unlocked`;
  $("#lockedbody").innerHTML = `<table class="list"><thead><tr><th>Content</th><th>Needs</th></tr></thead><tbody>${locked.map((l) =>
    `<tr><td>${esc(l.content)}</td><td>${l.needs.map(esc).join(", ")}</td></tr>`).join("")}</tbody></table>`;
}

function renderCards(fresh = false, keep = null) {
  const list = currentList();
  if (fresh) state.picks = isMix()
    ? pickMix(list, { seed: state.seed, exclude: state.excluded })
    : pickThree(list, { seed: state.seed, exclude: state.excluded });
  else if (keep) state.picks = pickThree(list, { seed: state.seed, exclude: state.excluded, keep });
  if (fresh) state.bonus = pickBonus(listCache.all, { seed: state.seed, exclude: state.excluded });
  renderBonus();
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

// The Bonus tier sits above Long haul: huge log completions. It's never one of the regular
// picks or a grind style; one is offered on its own below them, for players who want it.
// Wilderness warning: other players can attack and take your items there.
const WILD_TIP = "Wilderness: other players can attack you here, and you can lose items you carry when you die. Bring only what you can afford to lose.";
const wildBadge = (c) => c.wilderness
  ? `<span class="wildbadge" title="${esc(WILD_TIP)}" role="note"><span class="skull" aria-hidden="true">☠</span> Wilderness: PvP risk</span>`
  : "";

function renderBonus() {
  const el = $("#bonus");
  const c = state.bonus;
  el.hidden = !c;
  if (!c) { el.innerHTML = ""; return; }
  el.innerHTML = `
    <article class="card bonus" style="--c:var(--t-Bonus)">
      <div class="bonushead">
        <span class="tierbadge t-Bonus" title="Third age tier: above Long haul">Bonus grind</span>
        <span class="muted small">Above Long haul: for when you want a project that lasts months.</span>
      </div>
      ${wildBadge(c)}<h3>${esc(c.title)}</h3>
      <p class="detail">${esc(c.detail)}</p>
      ${c.progress != null ? `<div class="bar" title="${Math.round(c.progress * 100)}%"><i style="width:${Math.round(c.progress * 100)}%"></i></div>` : ""}
      <div class="actions">
        <button class="btn tiny" data-bonus-swap type="button">Another bonus</button>
        ${toGoal(c) ? `<button class="btn tiny ghost" data-bonus-goal type="button">Make it a goal</button>` : ""}
      </div>
    </article>`;
}

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
      ${wildBadge(c)}<h3>${esc(c.title)}</h3>
      <p class="detail">${esc(c.detail)}</p>
      ${c.progress != null ? `<div class="bar" title="${Math.round(c.progress * 100)}%"><i style="width:${Math.round(c.progress * 100)}%"></i></div>` : ""}
      <ul>${c.why.slice(0, 3).map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
      <div class="actions">
        <button class="btn tiny" data-swap="${i}" type="button">Swap</button>
        ${c.category !== "goals" && toGoal(c) ? `<button class="btn tiny ghost" data-goal="${i}" type="button">Make it a goal</button>` : ""}
      </div>
    </article>`;
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

function renderGoals() {
  const el = $("#goals");
  if (!state.goals.length) {
    el.innerHTML = `<li class="muted small">No goals yet. Add one below, or press "Make it a goal" on a suggestion.</li>`;
    return;
  }
  el.innerHTML = state.goals.map((g) => {
    const p = goalProgress(g, state.snap);
    const custom = g.type === "custom" || p.manual;
    return `<li class="goal">
      <span class="t ${p.done ? "done" : ""}">${custom ? `<label><input type="checkbox" data-check="${esc(g.id)}" ${g.done ? "checked" : ""}> ` : ""}${esc(goalTitle(g))}${custom ? "</label>" : ""}${p.done ? " ✓" : ""}</span>
      <span class="l">${esc(p.label)} <button class="x" data-del="${esc(g.id)}" aria-label="Remove goal" title="Remove">×</button></span>
      <div class="bar" style="--c:${p.done ? "var(--good)" : "var(--c-goals)"}"><i style="width:${Math.round(p.progress * 100)}%"></i></div>
    </li>`;
  }).join("");
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
      return `<div class="sk ${level >= 99 ? "max" : ""}" title="${xp.toLocaleString()} XP${level < 99 ? ` · ${fmt(xpForLevel(level + 1) - xp)} to ${level + 1}` : ""}"><span>${cap(k)}</span><b>${level >= 99 ? fmt(xp) : level}</b></div>`;
    }).join("")}</div>`;
  },
  quests(s) {
    const order = { IN_PROGRESS: 0, NOT_STARTED: 1, FINISHED: 2 };
    const qs = [...(s.quests ?? [])].sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name));
    return `<table class="list"><tbody>${qs.map((q) => `<tr><td>${esc(q.name)}</td><td class="num"><span class="pill ${q.state === "FINISHED" ? "ok" : q.state === "IN_PROGRESS" ? "mid" : ""}">${esc(q.state.replace("_", " ").toLowerCase())}</span></td></tr>`).join("")}</tbody></table>`;
  },
  diaries(s) {
    return `<table class="list"><thead><tr><th>Region</th><th>Easy · Med · Hard · Elite</th></tr></thead><tbody>${Object.entries(s.diaries ?? {}).map(([r, d]) =>
      `<tr><td>${esc(r)}</td><td><span class="dots">${["easy", "medium", "hard", "elite"].map((t) => `<i class="${d[t] ? "on" : ""}" title="${t}"></i>`).join("")}</span></td></tr>`).join("")}</tbody></table>`;
  },
  combat(s) {
    const a = analyse(s);
    const ca = s.combatAchievements ?? {};
    const rows = CA_TIERS.map((t) => {
      const b = a.caByTier[t];
      return `<tr><td>${t}</td><td class="num">${b.total ? `${b.done}/${b.total}` : "—"}</td><td class="num">${ca.thresholds?.[t] ?? "—"}</td></tr>`;
    }).join("");
    return `<table class="list"><thead><tr><th>Tier</th><th class="num">Tasks</th><th class="num">Points needed</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="note">${ca.points ?? 0} points · current reward tier: ${esc(a.caRank)}${a.caNext ? ` · ${a.caNext.gap} to ${a.caNext.tier}` : ""}</p>`;
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
            ? `<li class="have"><span>${esc(i.name)}</span><span class="q">${i.quantity > 1 ? `×${i.quantity.toLocaleString()}` : "✓"}</span></li>`
            : `<li class="need"><span>${esc(i.name)}</span><span class="q">not obtained</span></li>`).join("")}</ul>
        </details>`).join("")}</div>`
      : `<p class="note">No pages recorded yet. Open the collection log in-game and click Search, then sync.</p>`}`;
  },
  pets(s) {
    const { pets, owned } = petInfo(s);
    if (!pets.length) return `<p class="note">No pet data yet. Sync with the latest plugin to load the All Pets page.</p>`;
    const sorted = [...pets].sort((a, b) => Number(b.owned) - Number(a.owned) || a.name.localeCompare(b.name));
    return `<p class="note" style="margin:0 0 10px">${owned} of ${pets.length} pets</p>
      <div class="petgrid">${sorted.map((p) =>
        `<div class="pet ${p.owned ? "owned" : ""}" title="${esc(p.source ? `From ${p.source}` : "")}"><span>${esc(p.name)}</span><i aria-label="${p.owned ? "Obtained" : "Missing"}">${p.owned ? "✓" : ""}</i></div>`).join("")}</div>`;
  },
};

// ---- Events --------------------------------------------------------------------------------

$("#lookup").addEventListener("submit", (e) => { e.preventDefault(); load($("#name").value.trim()); });
$("#sample").addEventListener("click", () => load(SAMPLE));

$("#shuffle").addEventListener("click", () => {
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
  if (!b) return;
  state.style = b.dataset.style;
  localStorage.setItem("tm.style", state.style);
  renderControls();
  renderCards(true);
});

$("#chips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cat]");
  if (!b) return;
  const k = b.dataset.cat;
  if (state.cats.has(k)) { if (state.cats.size > 1) state.cats.delete(k); } else state.cats.add(k);
  localStorage.setItem("tm.off", JSON.stringify(Object.keys(CATEGORIES).filter((c) => !state.cats.has(c))));
  renderControls();
  renderCards(true);
});

$("#cards").addEventListener("click", (e) => {
  const swap = e.target.closest("[data-swap]");
  if (swap) {
    const i = +swap.dataset.swap;
    state.excluded.add(state.picks[i].id);
    if (isMix()) {
      // Replace with another pick from the same tier, so the carousel keeps its spread.
      const old = state.picks[i];
      const shown = new Set(state.picks.map((c) => c.id));
      const tierList = currentList().filter((c) => c.effort === old.effort && !shown.has(c.id));
      const [next] = pickThree(tierList, { seed: state.seed, exclude: state.excluded, keep: state.picks.filter((_, j) => j !== i), n: 7 })
        .filter((c) => !shown.has(c.id));
      if (next) state.picks = state.picks.map((c, j) => (j === i ? next : c));
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

$("#bonus").addEventListener("click", (e) => {
  if (!state.bonus) return;
  if (e.target.closest("[data-bonus-swap]")) {
    // Cycle through the bonus picks; when they've all been seen, start over.
    const old = state.bonus.id;
    (state.bonusSeen ??= new Set()).add(old);
    state.bonus = pickBonus(listCache.all, { seed: ++state.seed, exclude: state.bonusSeen });
    if (!state.bonus) { state.bonusSeen = new Set([old]); state.bonus = pickBonus(listCache.all, { seed: state.seed, exclude: state.bonusSeen }); }
    renderBonus();
    $("#bonus .card")?.classList.add("spin");
    return;
  }
  if (e.target.closest("[data-bonus-goal]")) {
    const goal = toGoal(state.bonus);
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
  if (!b) return;
  state.content[b.dataset.content] = !state.content[b.dataset.content];
  localStorage.setItem("tm.content", JSON.stringify(state.content));
  state.excluded.clear();
  renderControls();
  renderCards(true);
});
$("#lockedbtn").addEventListener("click", () => $("#lockeddlg").showModal());
$("#lockeddlg").addEventListener("click", (e) => {
  // Close on the × button or a click on the backdrop.
  if (e.target.closest("[data-close]") || e.target === e.currentTarget) e.currentTarget.close();
});

$("#gtype").addEventListener("change", renderGoalFields);
$("#goalform").addEventListener("submit", (e) => {
  e.preventDefault();
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
  if (del) {
    state.goals = state.goals.filter((g) => g.id !== del.dataset.del);
    saveGoals(); renderGoals(); renderCards(true);
  }
});
$("#goals").addEventListener("change", (e) => {
  const c = e.target.closest("[data-check]");
  if (!c) return;
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

// ---- Boot --------------------------------------------------------------------------------

window.addEventListener("hashchange", () => {
  const n = decodeURIComponent(location.hash.slice(1));
  if (n && n !== state.name) { $("#name").value = n; load(n); }
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
  load(snap.player.name);
}

async function importFile(file) {
  if (!file) return;
  if (file.size > 20e6) return importError("That file is too big to be a profile.");
  importProfile(await file.text());
}

function refreshKnown() {
  const names = serverMode ? refreshKnown.server : local.names();
  $("#known").innerHTML = (names ?? []).map((n) => `<option value="${esc(n.replace(/_/g, " "))}">`).join("");
  const list = $("#knownlist");
  if (!serverMode && names.length) {
    list.hidden = false;
    list.innerHTML = `Profiles in this browser: ${names.map((n) => `<button type="button" class="link" data-open="${esc(n)}">${esc(n)}</button>`).join(", ")}`;
  } else list.hidden = true;
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
  $("#importbtn").addEventListener("click", () => { importError(null); $("#forget").parentElement.hidden = !state.name || state.name === SAMPLE; $("#importdlg").showModal(); });
  $("#importdlg").addEventListener("click", (e) => {
    if (e.target.closest("[data-close]") || e.target === e.currentTarget) e.currentTarget.close();
  });
  $("#forget").addEventListener("click", () => {
    if (!state.name || !confirm(`Remove ${state.name}'s profile and goals from this browser?`)) return;
    local.forget(state.name);
    localStorage.removeItem("tm.last");
    $("#importdlg").close();
    state.name = null;
    history.replaceState(null, "", location.pathname);
    $("#name").value = "";
    refreshKnown();
    $("#app").hidden = true;
    $("#intro").hidden = false;
  });
  $("#knownlist").addEventListener("click", (e) => {
    const b = e.target.closest("[data-open]");
    if (b) { $("#name").value = b.dataset.open; load(b.dataset.open); }
  });
}

(async function boot() {
  // Drop rates are a static file in this project (a one-off wiki snapshot); no outside calls.
  try { setDropRates(await api("data/drop-rates.json")); } catch { /* fall back to the hand-made rules */ }
  // Server mode only when this page is served by start-server.ps1; anywhere else (the hosted
  // site) profiles are pasted in and kept in the browser.
  try {
    const names = await api("api/profiles");
    if (Array.isArray(names)) { serverMode = true; refreshKnown.server = names; }
  } catch { /* hosted site, or the server isn't running */ }
  document.body.classList.remove("booting");
  document.body.classList.toggle("static", !serverMode);
  setupImport();
  refreshKnown();
  const fromHash = decodeURIComponent(location.hash.slice(1));
  const last = fromHash || localStorage.getItem("tm.last");
  if (last) {
    $("#name").value = last;
    // In browser mode the profile is right here, so open it straight away.
    if (fromHash || (!serverMode && local.get(last))) load(last);
  }
})();
