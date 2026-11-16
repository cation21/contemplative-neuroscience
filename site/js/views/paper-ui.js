// Shared paper UI: the detail dialog and the actions every list offers (details, find similar,
// copy BibTeX). Papers are passed by reference key, never serialised into HTML attributes.

import { $, esc } from "../core/dom.js";
import { paperText, toBibtex } from "../lib/search-core.js";

export function createPaperUI({ kb, actions, router, store }) {
  const refs = new Map();
  kb.papers.forEach((p) => refs.set(p.id, p));
  let anon = 0;

  /** Register a paper object and return the key that markup uses to point at it. */
  const ref = (p) => {
    const key = p.kb_id || p.id || `anon-${anon++}`;
    if (!refs.has(key)) refs.set(key, p);
    return key;
  };
  const get = (key) => refs.get(key);

  const dialog = $("#detail");
  function openDetail(p) {
    const abs = p.abstract || p.summary || "";
    const key = ref(p);
    $("#detail-body").innerHTML = `
      <p class="eyebrow">${esc(p.curated ? "Curated paper" : p.source || "Paper")}</p>
      <h2 id="detail-title">${esc(p.title)}</h2>
      <p class="meta">${[p.authors, p.year, p.venue].filter(Boolean).map(esc).join(" · ")}</p>
      ${abs ? `<p>${esc(abs)}</p>` : ""}
      <p class="small muted">${p.abstract ? `Abstract licence: ${esc(p.license || "open")}` : p.summary ? "Summary written for this site, not the abstract." : ""}</p>
      <div class="row-actions">
        ${p.link ? `<a class="btn" href="${esc(p.link)}" target="_blank" rel="noopener">Open paper ↗</a>` : ""}
        <button class="btn" data-action="similar" data-ref="${esc(key)}">Find similar papers</button>
        <button class="btn ghost" data-action="bibtex" data-ref="${esc(key)}">Copy BibTeX</button>
      </div>`;
    dialog.showModal();
  }

  actions.on("detail", (el) => openDetail(get(el.dataset.ref)));
  actions.on("similar", (el) => {
    const p = get(el.dataset.ref);
    if (dialog.open) dialog.close();
    store.set({ pendingQuery: paperText(p.title, p.summary || p.abstract || "") });
    router.go("find");
  });
  actions.on("bibtex", async (el) => {
    const p = get(el.dataset.ref);
    try { await navigator.clipboard.writeText(toBibtex(p)); } catch { /* clipboard blocked */ }
    const was = el.textContent;
    el.textContent = "Copied";
    setTimeout(() => (el.textContent = was), 1200);
  });
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });   // click on backdrop

  return { ref, get, openDetail };
}
