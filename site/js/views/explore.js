// Explore: search and facet-filter every knowledge-base section.

import { $, esc } from "../core/dom.js";
import { matchesQuery } from "../lib/search-core.js";
import { CARDS } from "./cards.js";

const SECTIONS = {
  papers: { label: "Papers", facets: { type: "Type", practices: "Practice", modalities: "Modality", decade: "Decade" } },
  concepts: { label: "Concepts", facets: {} },
  datasets: { label: "Datasets", facets: { modality: "Modality", access: "Access" } },
  tools: { label: "Tools", facets: { category: "Category", modality: "Modality" } },
  databases: { label: "Databases & APIs", facets: { kind: "Kind", auth: "Access" } },
  organizations: { label: "Labs & funders", facets: { kind: "Kind" } },
};

function facetValues(item, key) {
  if (key === "decade") return [`${Math.floor(item.year / 10) * 10}s`];
  const v = item[key];
  return Array.isArray(v) ? v : v != null ? [String(v)] : [];
}

const state = { section: "papers", q: "", filters: {} };
let deps;

export function mount(ctx) {
  deps = ctx;
  $("#kb-sections").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-s]");
    if (!b) return;
    state.section = b.dataset.s; state.filters = {};
    renderSections(); render();
  });
  let t;
  $("#kb-search").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = e.target.value; render(); }, 80);
  });
  $("#kb-facets").addEventListener("change", (e) => {
    const { k } = e.target.dataset;
    const set = state.filters[k] || (state.filters[k] = new Set());
    e.target.checked ? set.add(e.target.value) : set.delete(e.target.value);
    render();
  });
  renderSections();
  render();
}

export function show(ctx, params) {
  if (params.section && SECTIONS[params.section] && params.section !== state.section) {
    state.section = params.section; state.filters = {};
    renderSections(); render();
  }
}

function renderSections() {
  $("#kb-sections").innerHTML = Object.entries(SECTIONS).map(([k, s]) =>
    `<button type="button" data-s="${k}" aria-pressed="${k === state.section}">${s.label} <span class="count">${deps.kb[k].length}</span></button>`).join("");
}

function render() {
  const sec = SECTIONS[state.section], items = deps.kb[state.section];
  const passes = (it, skip) => matchesQuery(it, state.q) && Object.entries(state.filters).every(([k, vals]) =>
    k === skip || !vals.size || facetValues(it, k).some((v) => vals.has(v)));

  // Facet counts respect every other active filter, so numbers always match what a click would show.
  $("#kb-facets").innerHTML = Object.entries(sec.facets).map(([key, label]) => {
    const counts = new Map();
    items.filter((it) => passes(it, key)).forEach((it) => facetValues(it, key).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1)));
    const active = state.filters[key] || new Set();
    const vals = [...counts.entries()].sort((a, b) => key === "decade" ? b[0].localeCompare(a[0]) : b[1] - a[1]);
    return `<fieldset><legend>${label}</legend>${vals.map(([v, n]) =>
      `<label><input type="checkbox" data-k="${key}" value="${esc(v)}" ${active.has(v) ? "checked" : ""}> <span>${esc(v)}</span><span class="n">${n}</span></label>`).join("")}</fieldset>`;
  }).join("") || `<p class="small muted">No filters for this section.</p>`;

  const shown = items.filter((it) => passes(it));
  if (state.section === "papers") shown.sort((a, b) => b.year - a.year);
  $("#kb-count").textContent = `${shown.length} of ${items.length} ${sec.label.toLowerCase()}`;
  $("#kb-results").innerHTML = shown.length
    ? shown.map((it) => CARDS[state.section](it, deps)).join("")
    : `<div class="empty">Nothing matches. Try fewer filters or a different word.</div>`;
}
