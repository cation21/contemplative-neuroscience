// Light / dark theme. Follows the system until the visitor picks one; the pick is remembered
// in localStorage (a per-viewer convenience, so failures are ignored).

const KEY = "cn-theme";

function stored() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function effectiveTheme() {
  const t = document.documentElement.dataset.theme;
  if (t === "light" || t === "dark") return t;
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function initTheme(button) {
  const saved = stored();
  if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
  const label = () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    button.setAttribute("aria-label", `Switch to ${next} theme`);
    button.title = `Switch to ${next} theme`;
  };
  label();
  button.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
    label();
    document.dispatchEvent(new CustomEvent("themechange", { detail: next }));
  });
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    label();
    document.dispatchEvent(new CustomEvent("themechange", { detail: effectiveTheme() }));
  });
}
