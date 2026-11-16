// Map: every paper as a dot placed by embedding similarity, coloured by cluster.
// Highlights and the query star come from the shared store (published by the finder).

import { $, cssVar, esc } from "../core/dom.js";
import { effectiveTheme } from "../core/theme.js";
import { mapLayout } from "../services/map-layout.js";

let ctx, index = null, screenPts = [];
const canvas = () => $("#map");

/** Evenly spaced hues, tuned per theme so dots stay readable on either background. */
const colour = (c, k) => {
  const h = Math.round((265 + (c * 360) / Math.max(k, 1)) % 360);
  return effectiveTheme() === "dark" ? `hsl(${h} 75% 68%)` : `hsl(${h} 60% 42%)`;
};

export function mount(c) {
  ctx = c;
  const cv = canvas(), tip = $("#map-tip");
  const nearest = (ev) => {
    const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    let best = -1, bd = 120;
    screenPts.forEach(([sx, sy], i) => { const d = (sx - x) ** 2 + (sy - y) ** 2; if (d < bd) { bd = d; best = i; } });
    return { i: best, x, y };
  };
  cv.addEventListener("mousemove", (ev) => {
    const { i, x, y } = nearest(ev);
    if (i < 0) { tip.hidden = true; cv.style.cursor = "default"; return; }
    const p = index.papers[i];
    tip.hidden = false; tip.textContent = `${p.title} (${p.year || "n.d."})`;
    tip.style.left = `${Math.min(x + 14, cv.clientWidth - 300)}px`; tip.style.top = `${y + 14}px`;
    cv.style.cursor = "pointer";
  });
  cv.addEventListener("mouseleave", () => (tip.hidden = true));
  cv.addEventListener("click", (ev) => { const { i } = nearest(ev); if (i >= 0) ctx.ui.openDetail(index.papers[i]); });
  ctx.store.subscribe((_, patch) => { if (("highlight" in patch || "queryPoint" in patch) && index) draw(); });
  addEventListener("resize", () => { if (!$("#view-map").hidden && index) draw(); });
  document.addEventListener("themechange", () => { if (index) draw(); });
  ctx.models.events.addEventListener("status", ({ detail }) => {
    if (detail.state !== "ready") $("#map-note").textContent = detail.message;
  });
}

export async function show() {
  try {
    index = await ctx.models.index();
    draw();
  } catch (e) {
    $("#map-note").textContent = `The map needs the model: ${e.message}`;
  }
}

function draw() {
  const cv = canvas(), ctx2 = cv.getContext("2d");
  const { points, labels, names, method } = mapLayout(index);
  const { highlight = new Set(), queryPoint = null } = ctx.store.get();
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = Math.round(Math.min(w * 0.62, 640));
  cv.width = w * dpr; cv.height = h * dpr; cv.style.height = `${h}px`;
  ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx2.clearRect(0, 0, w, h);
  const pad = 22, X = (x) => pad + x * (w - 2 * pad), Y = (y) => pad + (1 - y) * (h - 2 * pad);
  screenPts = points.map(([x, y]) => [X(x), Y(y)]);
  const k = names.length, hasHi = highlight.size > 0, ink = cssVar("--ink");
  index.papers.forEach((p, i) => {
    const [sx, sy] = screenPts[i], hi = highlight.has(i);
    ctx2.globalAlpha = hasHi && !hi ? 0.18 : 0.85;
    ctx2.fillStyle = colour(labels[i], k);
    ctx2.beginPath(); ctx2.arc(sx, sy, hi ? 6 : p.curated ? 3.6 : 2.2, 0, Math.PI * 2); ctx2.fill();
    if (hi) { ctx2.globalAlpha = 1; ctx2.strokeStyle = ink; ctx2.lineWidth = 1.5; ctx2.stroke(); }
  });
  ctx2.globalAlpha = 1;
  if (queryPoint) {
    const qx = X(queryPoint[0]), qy = Y(queryPoint[1]);
    ctx2.fillStyle = ink;
    ctx2.beginPath();
    for (let s = 0; s < 10; s++) { const r = s % 2 ? 4 : 10, a = (Math.PI / 5) * s - Math.PI / 2; ctx2.lineTo(qx + r * Math.cos(a), qy + r * Math.sin(a)); }
    ctx2.closePath(); ctx2.fill();
  }
  $("#map-legend").innerHTML = names.map((n, c) => `<span><i style="background:${colour(c, k)}"></i>${esc(n)}</span>`).join("")
    + (queryPoint ? `<span><b aria-hidden="true">★</b> your query (approximate)</span>` : "");
  $("#map-note").textContent = `${index.papers.length} papers · layout: ${method} · larger dots are curated papers · clusters are named from frequent title words.`;
}
