// Composition root: load the two small data files, build the shared services once, and hand
// them to each view through `ctx`. Views never construct services themselves, so any of them
// can be swapped (a mock encoder in tests, another live-search provider) in this one place.

import { createActions } from "./core/actions.js";
import { $, $$, fetchJSON } from "./core/dom.js";
import { createRouter } from "./core/router.js";
import { createStore } from "./core/store.js";
import { initTheme } from "./core/theme.js";
import { createModelService } from "./services/model-service.js";
import { createPaperUI } from "./views/paper-ui.js";

const ROUTES = {
  home: { title: "Contemplative Neuroscience", load: () => import("./views/home.js") },
  explore: { title: "Explore · Contemplative Neuroscience", load: () => import("./views/explore.js") },
  find: { title: "Find papers · Contemplative Neuroscience", load: () => import("./views/finder.js") },
  map: { title: "Map · Contemplative Neuroscience", load: () => import("./views/map.js") },
  how: { title: "How the finder works · Contemplative Neuroscience", load: () => import("./views/how.js") },
  about: { title: "About · Contemplative Neuroscience", load: async () => ({}) },
};

initTheme($("#theme-toggle"));

const [kb, config] = await Promise.all([fetchJSON("data/kb.json"), fetchJSON("data/config.json")]);
const ctx = { kb, config, store: createStore({ highlight: new Set(), queryPoint: null, pendingQuery: null }) };
ctx.actions = createActions();
ctx.models = createModelService({ config, kb });
ctx.router = createRouter({
  routes: ROUTES,
  fallback: "home",
  ctx,
  onChange(id, route) {
    document.title = route.title;
    for (const a of $$(".nav a[data-route]")) {
      if (a.dataset.route === id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    }
    document.body.dataset.route = id;
    $("#nav").classList.remove("open");
    $("#nav-toggle").setAttribute("aria-expanded", "false");
  },
});
ctx.ui = createPaperUI(ctx);

$("#about-stats").textContent = `Knowledge base: ${kb.counts.papers} papers, ${kb.counts.datasets} datasets, ${kb.counts.tools} tools, `
  + `${kb.counts.databases} databases, ${kb.counts.organizations} organisations, ${kb.counts.concepts} concepts.`;

$("#nav-toggle").addEventListener("click", () => {
  const open = $("#nav").classList.toggle("open");
  $("#nav-toggle").setAttribute("aria-expanded", String(open));
});

ctx.router.start();
