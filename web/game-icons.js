// Game icons: the skull, skill and category icons, combat achievement tier swords and collection
// log item icons, exported from the OSRS game cache by scripts/Update-GameIcons.ps1 into
// icons/game/. Only these local copies are ever loaded. Game images © Jagex Ltd.
//
// Every helper returns "" (or the given fallback) when an icon wasn't exported, so the page
// works the same without them.

let sprites = {};
let items = new Set();

/** Read icons/game/index.json once at startup. Never throws: no index just means no icons. */
export async function loadGameIcons() {
  try {
    const r = await fetch("icons/game/index.json");
    if (!r.ok) return;
    const index = await r.json();
    sprites = index.sprites ?? {};
    items = new Set(index.items ?? []);
  } catch { /* the page falls back to text */ }
}

const attr = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** URL of an exported sprite ("skull", "skill-attack", "cat-quests", "ca-elite"...), or null. */
export const spriteUrl = (name) => (sprites[name] ? `icons/game/${sprites[name]}` : null);
/** URL of a collection log item's icon, or null. */
export const itemUrl = (id) => (items.has(Number(id)) ? `icons/game/items/${Number(id)}.png` : null);

/** An <img> for a URL; decorative unless `alt` is given. */
export function iconImg(url, { alt = "", cls = "gicon", title = "" } = {}) {
  if (!url) return "";
  return `<img class="${cls}" src="${attr(url)}" alt="${attr(alt)}"${alt ? "" : ' aria-hidden="true"'}${title ? ` title="${attr(title)}"` : ""} loading="lazy" decoding="async">`;
}

/** The PvP skull, or the ☠ character when the icon isn't there. */
export function skullHTML(cls = "skull") {
  const url = spriteUrl("skull");
  return url ? iconImg(url, { cls: `${cls} gskull` }) : `<span class="${cls}" aria-hidden="true">☠</span>`;
}
