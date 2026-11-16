// HTML templates for knowledge-base entries, one per section. Pure functions of (item, deps).

import { esc } from "../core/dom.js";

const tags = (arr) => (arr || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
const ext = (url, text) => url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text);
const paperLink = (p, ui, label = p.title) =>
  `<button class="link" data-action="detail" data-ref="${esc(ui.ref(p))}">${esc(label)}</button>`;

export const CARDS = {
  papers: (p, { ui }) => `<article class="card">
      <h3>${ext(p.link, p.title)}${p.verified ? "" : `<span class="flag" title="Identifier not yet confirmed against Crossref">unverified</span>`}</h3>
      <p class="meta">${esc(p.authors)} · ${p.year} · ${esc(p.venue)} · ${esc(p.type)}</p>
      <p>${esc(p.summary)}</p>
      <div class="tags">${tags([...(p.practices || []), ...(p.modalities || [])].filter((x) => x !== "none").concat((p.topics || []).slice(0, 4)))}</div>
      <div class="row-actions">
        <button class="link" data-action="similar" data-ref="${esc(ui.ref(p))}">Find similar papers</button>
        <button class="link" data-action="bibtex" data-ref="${esc(ui.ref(p))}">Copy BibTeX</button>
      </div></article>`,

  concepts: (c, { ui }) => `<article class="card">
      <h3>${esc(c.name)}</h3><p>${esc(c.definition)}</p>
      ${(c.papers || []).length ? `<p class="meta">Key papers</p><ul class="refs">${c.papers.map((id) => ui.get(id)).filter(Boolean)
        .map((p) => `<li>${paperLink(p, ui)} <span class="muted">(${p.year})</span></li>`).join("")}</ul>` : ""}</article>`,

  datasets: (d, { ui }) => `<article class="card">
      <h3>${ext(d.url, d.name)}</h3>
      <p class="meta">${esc((d.modality || []).join(", "))}${d.subjects ? ` · ${esc(d.subjects)} participants` : ""} · access: ${esc(d.access)}</p>
      <p>${esc(d.description)}</p>${d.note ? `<p class="small muted">${esc(d.note)}</p>` : ""}
      ${d.paper && ui.get(d.paper) ? `<p class="small">Paper: ${paperLink(ui.get(d.paper), ui)}</p>` : ""}
      <div class="tags">${tags(d.tags)}</div></article>`,

  tools: (t, { ui }) => `<article class="card">
      <h3>${ext(t.url, t.name)}</h3>
      <p class="meta">${esc(t.category)} · ${esc((t.modality || []).join(", "))} · ${esc(t.language)}</p><p>${esc(t.description)}</p>
      ${t.paper && ui.get(t.paper) ? `<p class="small">Cite: ${paperLink(ui.get(t.paper), ui)}</p>` : ""}</article>`,

  databases: (d) => `<article class="card">
      <h3>${ext(d.url, d.name)}</h3>
      <p class="meta">${esc(d.kind)} · ${d.auth === "none" ? "no key needed" : esc(d.auth)}${d.coverage ? ` · ${esc(d.coverage)}` : ""}</p>
      <p>${esc(d.notes)}</p>${d.api ? `<p class="small muted">API: <code>${esc(d.api)}</code></p>` : ""}</article>`,

  organizations: (o) => `<article class="card">
      <h3>${ext(o.url, o.name)}</h3>
      <p class="meta">${esc(o.kind)}${o.location ? ` · ${esc(o.location)}` : ""}</p><p>${esc(o.focus)}</p></article>`,
};
