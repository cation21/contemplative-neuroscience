// One delegated click listener; modules register named actions ("similar", "detail", …) and
// markup opts in with data-action="name". Modules never attach listeners to each other's DOM.

export function createActions(root = document) {
  const handlers = new Map();
  root.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    const fn = el && handlers.get(el.dataset.action);
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  return {
    on(name, fn) {
      if (handlers.has(name)) throw new Error(`action "${name}" registered twice`);
      handlers.set(name, fn);
    },
  };
}
