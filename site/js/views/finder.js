// Find papers: embed the visitor's text on-device and rank the collection by cosine similarity.

import { $, download, esc } from "../core/dom.js";
import { paperText, row, scoreAll, toBibtex, topK, weightedPosition } from "../lib/search-core.js";
import { europePmc, liveSearch, openAlex } from "../services/live-search.js";
import { mapLayout } from "../services/map-layout.js";

const EXAMPLES = [
  "Gamma oscillations in long-term meditators during compassion practice",
  "Default mode network activity and mind wandering during breath-focused meditation",
  "Does an eight-week mindfulness course change brain structure? Randomised trial with active control",
  "Neurophenomenology of cessation events in an advanced meditator using EEG",
  "Attention residue after task switching and whether brief mindfulness practice clears it",
  "Machine learning classifier to decode meditation versus mind wandering from EEG",
];

let ctx, providers, results = [];

export function mount(c) {
  ctx = c;
  const key = $("#oa-key");
  try { key.value = localStorage.getItem("openalex_key") || ""; } catch { /* storage blocked */ }
  key.addEventListener("change", () => { try { localStorage.setItem("openalex_key", key.value.trim()); } catch { /* ignore */ } });
  providers = [europePmc(ctx.config), openAlex(ctx.config, () => key.value.trim())];

  $("#examples").innerHTML = EXAMPLES.map((x) => `<button type="button" class="chip">${esc(x)}</button>`).join("");
  $("#examples").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) { $("#query").value = b.textContent; if (!$("#run").disabled) run(); }
  });
  $("#finder-form").addEventListener("submit", (e) => { e.preventDefault(); run(); });
  $("#query").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(); });
  $("#export-bib").addEventListener("click", () => download("papers.bib", results.map((r) => toBibtex(r.paper)).join("\n\n")));
  $("#export-csv").addEventListener("click", exportCsv);
  ctx.actions.on("more", (el) => moreLike(Number(el.dataset.i)));

  ctx.models.events.addEventListener("status", ({ detail }) => setStatus(detail));
}

export async function show() {
  const pending = ctx.store.get().pendingQuery;
  if (pending) { $("#query").value = pending; ctx.store.set({ pendingQuery: null }); }
  try {
    await ctx.models.index();
    $("#run").disabled = false;
    $("#run").textContent = "Find papers";
    if (pending) run();
  } catch {
    $("#run").textContent = "Model unavailable";
  }
}

function setStatus({ message, fraction, state }) {
  const el = $("#model-status");
  el.dataset.state = state;
  el.innerHTML = `<span>${esc(message)}</span>` +
    (fraction != null ? `<span class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(fraction * 100)}"><span style="width:${Math.round(fraction * 100)}%"></span></span>` : "");
}

async function run(opts = {}) {
  const index = await ctx.models.index();
  const text = $("#query").value.trim();
  if (!opts.vector && !text) { $("#query").focus(); return; }
  const btn = $("#run");
  btn.disabled = true; btn.textContent = "Searching…";
  $("#find-results").setAttribute("aria-busy", "true");
  try {
    const q = opts.vector || (await ctx.models.encoder().embed([text])).vectors;
    const k = Number($("#k").value), yearMin = Number($("#year-min").value) || 0, curatedOnly = $("#curated-only").checked;
    const scores = scoreAll(q, index.vectors, index.dim);
    const keep = (i) => {
      const p = index.papers[i];
      return (!curatedOnly || p.curated) && (!yearMin || (p.year || 0) >= yearMin) && (!opts.vector || scores[i] < 0.9999);
    };
    results = topK(scores, k, keep).map((i) => ({ paper: index.papers[i], score: scores[i], i }));
    let meta = opts.label ? `Papers closest to “${esc(opts.label)}”` : `Top ${results.length} of ${index.papers.length} papers by meaning`;

    if ($("#live").checked && !opts.vector) {
      setStatus({ message: "Searching Europe PMC with keywords only…", state: "loading" });
      const live = await liveSearch(text, providers);
      const known = new Set(index.papers.map((p) => (p.doi || "").toLowerCase()).filter(Boolean));
      const fresh = live.papers.filter((p) => (!p.doi || !known.has(p.doi.toLowerCase())) && (!yearMin || p.year >= yearMin));
      if (fresh.length) {
        setStatus({ message: `Ranking ${fresh.length} live results on your device…`, state: "loading" });
        const { vectors, dim } = await ctx.models.encoder().embed(fresh.map((p) => paperText(p.title, p.abstract)));
        const s = scoreAll(q, vectors, dim);
        results = results.concat(fresh.map((p, j) => ({ paper: p, score: s[j], live: true })))
          .sort((a, b) => b.score - a.score).slice(0, k);
      }
      meta += ` · live search sent: <code>${esc(live.keywords.join(", ") || "nothing")}</code> (${fresh.length} new papers)`;
      if (live.notes.length) meta += ` · ${esc(live.notes.join(" "))}`;
      setStatus({ message: `Ready · ${index.papers.length} papers in the collection`, state: "ready" });
    }

    // Publish where the query sits on the map: the score-weighted centre of its nearest papers.
    const { points } = mapLayout(index);
    const local = results.filter((r) => r.i != null).slice(0, 8);
    ctx.store.set({
      highlight: new Set(local.map((r) => r.i)),
      queryPoint: local.length ? weightedPosition(local.map((r) => points[r.i]), local.map((r) => r.score)) : null,
    });
    $("#find-meta").innerHTML = meta;
    render();
  } catch (e) {
    $("#find-meta").textContent = `Search failed: ${e.message}`;
  } finally {
    btn.disabled = false; btn.textContent = "Find papers";
    $("#find-results").removeAttribute("aria-busy");
  }
}

function moreLike(i) {
  const index = ctx.models.index();
  index.then((idx) => run({ vector: row(idx.vectors, idx.dim, i), label: idx.papers[i].title }));
}

function render() {
  const top = results[0]?.score || 1;
  $("#find-results").innerHTML = results.length ? results.map(({ paper: p, score, live, i }) => {
    const key = ctx.ui.ref(p);
    return `<article class="result">
      <div class="score" title="Cosine similarity to your text">${score.toFixed(2)}<span class="bar"><span style="width:${Math.max(4, (score / top) * 100)}%"></span></span></div>
      <div>
        <h3><a href="${esc(p.link || "#")}" target="_blank" rel="noopener">${esc(p.title)}</a><span class="src">${live ? esc(p.source) : p.curated ? "curated" : esc(p.source || "")}</span></h3>
        <p class="meta">${[p.authors, p.year, p.venue].filter(Boolean).map(esc).join(" · ")}</p>
        ${p.summary || p.abstract ? `<p class="abs">${esc(p.summary || p.abstract)}</p>` : ""}
        <div class="row-actions">
          <button class="link" data-action="detail" data-ref="${esc(key)}">Details</button>
          ${i != null ? `<button class="link" data-action="more" data-i="${i}">More like this</button>` : ""}
          <button class="link" data-action="bibtex" data-ref="${esc(key)}">Copy BibTeX</button>
        </div>
      </div></article>`;
  }).join("") : `<div class="empty">No results with these filters.</div>`;
  $("#find-actions").hidden = !results.length;
}

function exportCsv() {
  const cols = ["score", "title", "authors", "year", "venue", "doi", "link"];
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = results.map((r) => [r.score.toFixed(4), ...cols.slice(1).map((c) => r.paper[c])].map(q).join(","));
  download("papers.csv", [cols.join(","), ...lines].join("\n"), "text/csv");
}
