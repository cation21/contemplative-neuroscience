// Hash router for a single-page site. Pages load dynamically:
//   - each route's view module is fetched with import() the first time it is needed,
//   - hovering or focusing a link prefetches that module, so the click is usually instant,
//   - a thin progress bar appears only if a load takes longer than 150 ms,
//   - the old page is swapped for the new one inside a View Transition when the browser
//     supports it and the visitor has not asked for reduced motion.
//
// A view module exports: mount(ctx, el) once, show(ctx, params) on every visit, hide() when left.
// New pages are added by registering a route; the router itself never changes (open/closed).

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function createRouter({ routes, fallback, ctx, onChange = () => {} }) {
  const modules = new Map();  // id -> Promise<module>   (fetched, maybe not mounted)
  const mounted = new Map();  // id -> Promise<module>   (fetched and mounted once)
  let current = null, renderSeq = 0;

  /** Fetch a route's code without showing it. Safe to call repeatedly. */
  function prefetch(id) {
    if (!routes[id]) return Promise.resolve(null);
    if (!modules.has(id)) {
      const p = routes[id].load();
      p.catch(() => modules.delete(id));   // allow a retry after a network error
      modules.set(id, p);
    }
    return modules.get(id);
  }

  function mount(id) {
    if (!mounted.has(id)) {
      const p = prefetch(id).then(async (view) => {
        await view.mount?.(ctx, document.getElementById(`view-${id}`));
        return view;
      });
      p.catch(() => mounted.delete(id));
      mounted.set(id, p);
    }
    return mounted.get(id);
  }

  function parse() {
    const [id, query = ""] = location.hash.slice(1).split("?");
    return { id: routes[id] ? id : fallback, params: Object.fromEntries(new URLSearchParams(query)) };
  }

  function swap(id) {
    const apply = () => { for (const sec of document.querySelectorAll(".view")) sec.hidden = sec.id !== `view-${id}`; };
    if (document.startViewTransition && !reduceMotion() && current) return document.startViewTransition(apply).updateCallbackDone;
    apply();
    return Promise.resolve();
  }

  async function render() {
    const seq = ++renderSeq;
    // An in-page anchor (#how-2, #main) scrolls within its page instead of routing.
    const raw = location.hash.slice(1).split("?")[0];
    const anchor = raw && !routes[raw] ? document.getElementById(raw) : null;
    const host = anchor?.closest(".view")?.id.replace("view-", "");
    const scrollToAnchor = () => {
      anchor.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth" });
      if (!anchor.hasAttribute("tabindex")) anchor.setAttribute("tabindex", "-1");
      anchor.focus({ preventScroll: true });
    };
    if (anchor && current && (!host || host === current)) return scrollToAnchor();

    let { id, params } = parse();
    if (anchor && host && routes[host]) { id = host; params = {}; }
    const changed = current !== id;

    // Load before swapping, so the old page stays up instead of flashing an empty one.
    const slow = setTimeout(() => document.documentElement.setAttribute("aria-busy", "true"), 150);
    let view;
    try {
      view = await mount(id);
    } catch (e) {
      console.error(e);
      view = null;
    } finally {
      clearTimeout(slow);
      document.documentElement.removeAttribute("aria-busy");
    }
    if (seq !== renderSeq) return;            // a newer navigation started while this one loaded

    if (changed && current) mounted.get(current)?.then((v) => v.hide?.()).catch(() => {});
    await swap(id);
    current = id;
    onChange(id, routes[id]);
    if (anchor) scrollToAnchor();
    else if (changed) window.scrollTo({ top: 0 });

    if (!view) {
      const el = document.getElementById(`view-${id}`);
      if (!el.querySelector(".load-error")) {
        el.insertAdjacentHTML("beforeend", `<p class="notice load-error">This page could not load. Check your connection and <a href="#${id}">try again</a>.</p>`);
      }
      return;
    }
    el(id)?.querySelector(".load-error")?.remove();
    await view.show?.(ctx, params);
  }

  const el = (id) => document.getElementById(`view-${id}`);

  /** Prefetch a page's code when the visitor shows intent to open it. */
  function prefetchOnIntent(root = document) {
    const handler = (e) => {
      const a = e.target.closest?.('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href").slice(1).split("?")[0];
      if (routes[id] && id !== current) prefetch(id).catch(() => {});
    };
    root.addEventListener("pointerover", handler, { passive: true });
    root.addEventListener("focusin", handler);
    root.addEventListener("touchstart", handler, { passive: true });
  }

  addEventListener("hashchange", render);
  return {
    start() { prefetchOnIntent(); return render(); },
    prefetch,
    go(id, params) {
      const q = params ? `?${new URLSearchParams(params)}` : "";
      if (location.hash === `#${id}${q}`) render(); else location.hash = `${id}${q}`;
    },
    get current() { return current; },
  };
}
