// Small DOM helpers shared by every view. No state.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Escape text for safe interpolation into HTML strings. */
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c]);

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Trigger a file download of in-memory text. */
export function download(name, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

export async function fetchBin(url, Type) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return new Type(await r.arrayBuffer());
}

/** Run `fn` only while `el` is on screen (for animations). Returns a disposer. */
export function whileVisible(el, start, stop) {
  let on = false;
  const sync = (visible) => {
    const want = visible && document.visibilityState === "visible";
    if (want && !on) { on = true; start(); } else if (!want && on) { on = false; stop(); }
  };
  let visible = false;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(visible); });
  io.observe(el);
  const onVis = () => sync(visible);
  document.addEventListener("visibilitychange", onVis);
  return () => { io.disconnect(); document.removeEventListener("visibilitychange", onVis); if (on) stop(); };
}

/** Read a CSS custom property from :root (used to theme canvases). */
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
