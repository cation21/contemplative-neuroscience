// A tiny observable store. Views share state through it instead of importing each other,
// e.g. the finder publishes results and the map highlights them.

export function createStore(initial = {}) {
  let state = { ...initial };
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      subs.forEach((fn) => fn(state, patch));
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
