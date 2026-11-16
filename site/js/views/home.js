// Home: what contemplative neuroscience is, built from the knowledge base so the page stays
// in step with the YAML. The hero effects load only here and only run while visible.

import { $, esc, fetchJSON, reducedMotion } from "../core/dom.js";
import { startMeditator } from "../fx/meditator.js";
import { startSilk } from "../fx/silk.js";

const PRACTICES = ["focused-attention", "open-monitoring", "compassion", "non-dual"];
const CAUTIONS = ["state-vs-trait", "active-control", "aperiodic-activity", "attention-residue"];
const METHODS = [
  { mods: ["EEG", "MEG"], name: "Electrophysiology", what: "Millisecond timing: oscillations such as gamma and alpha, and the aperiodic background they sit on." },
  { mods: ["fMRI"], name: "Functional MRI", what: "Where activity and connectivity change, such as the default mode network during mind wandering." },
  { mods: ["sMRI"], name: "Brain structure", what: "Cortical thickness and grey matter in long-term practitioners and after training programmes." },
  { mods: ["behavior", "physiology"], name: "Body and behaviour", what: "Attention tasks, heart rate, cortisol and breathing: what practice changes outside the scanner." },
];

let stops = [];

export function mount(ctx) {
  const { kb } = ctx;
  const byId = new Map(kb.concepts.map((c) => [c.id, c]));
  const count = (mods) => kb.papers.filter((p) => (p.modalities || []).some((m) => mods.includes(m))).length;

  const facts = (mapped) => [
    [mapped, "papers mapped", "#map"], [kb.counts.papers, "hand-curated", "#explore"],
    [kb.counts.datasets, "open datasets", "#explore?section=datasets"],
  ].map(([n, l, href]) => `<div><a href="${href}"><dt>${l}</dt><dd>${n == null ? "–" : Number(n).toLocaleString("en")}</dd></a></div>`).join("");
  $("#home-stats").innerHTML = facts(null);            // dash until the corpus count arrives
  fetchJSON("data/embeddings.meta.json").then((m) => { $("#home-stats").innerHTML = facts(m.count); }).catch(() => {});

  $("#hero-ask").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#hero-q").value.trim();
    if (!q) return $("#hero-q").focus();
    ctx.store.set({ pendingQuery: q });
    ctx.router.go("find");
  });

  const conceptCard = (c, i) => c && `<article class="pcard" style="--i:${i}">
      <h3>${esc(c.name)}</h3><p>${esc(c.definition)}</p>
      ${(c.papers || []).slice(0, 2).map((id) => ctx.ui.get(id)).filter(Boolean)
        .map((p) => `<button class="link small" data-action="detail" data-ref="${esc(p.id)}">${esc(p.authors.split(/[ ,]/)[0])} ${p.year} →</button>`).join(" ")}
    </article>`;
  $("#home-practices").innerHTML = PRACTICES.map((id, i) => conceptCard(byId.get(id), i)).join("");
  $("#home-cautions").innerHTML = CAUTIONS.map((id, i) => conceptCard(byId.get(id), i)).join("");

  $("#home-methods").innerHTML = METHODS.map((m) => `<article class="mcard">
      <p class="mcount"><span>${count(m.mods)}</span> curated papers</p>
      <h3>${m.name}</h3><p>${m.what}</p>
      <a class="link small" href="#explore?section=papers">${m.mods.join(" · ")} in Explore →</a></article>`).join("");

  const reading = kb.papers.filter((p) => p.type === "review" || p.type === "meta-analysis")
    .sort((a, b) => b.year - a.year).slice(0, 5);
  $("#home-reading").innerHTML = reading.map((p) => `<li>
      <button class="link" data-action="detail" data-ref="${esc(p.id)}">${esc(p.title)}</button>
      <span class="muted small">${esc(p.authors)} · ${esc(p.venue)} · ${p.year} · ${esc(p.type)}</span></li>`).join("");

  $("#home-ask").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#home-ask-text").value.trim();
    if (!q) return $("#home-ask-text").focus();
    ctx.store.set({ pendingQuery: q });
    ctx.router.go("find");
  });
}

export function show() {
  if (!stops.length) stops = [startSilk($("#silk")), startMeditator($("#meditator"), $("#breath-label"), $(".hero-figure")), watchHeader(), breathWords()];
}

export function hide() {
  stops.forEach((stop) => stop());
  stops = [];
}

/** The headline's last word changes at the start of each inhale, in step with the figure. */
const WORDS = ["attention", "awareness", "compassion", "the self"];
function breathWords() {
  const el = $("#hero-word");
  if (reducedMotion()) { el.textContent = "contemplative practice"; return () => {}; }
  let i = 0;
  el.textContent = WORDS[0];
  const onBreath = () => {
    el.classList.add("is-out");
    setTimeout(() => { i = (i + 1) % WORDS.length; el.textContent = WORDS[i]; el.classList.remove("is-out"); }, 650);
  };
  const canvas = $("#meditator");
  canvas.addEventListener("breath", onBreath);
  return () => canvas.removeEventListener("breath", onBreath);
}

/** Style the sticky header for the dark hero only while it overlaps the hero. */
function watchHeader() {
  const header = $(".top").offsetHeight, hero = $(".hero");
  if (hero.getBoundingClientRect().bottom > header) document.body.dataset.overHero = "";
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) document.body.dataset.overHero = ""; else delete document.body.dataset.overHero;
  }, { rootMargin: `-${header}px 0px -${Math.max(innerHeight - header - 1, 0)}px 0px` });
  io.observe(hero);
  return () => { io.disconnect(); delete document.body.dataset.overHero; };
}
