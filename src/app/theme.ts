export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "ipk-theme";

function resolve(pref: ThemePreference): ResolvedTheme {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

function apply(pref: ThemePreference): void {
  const resolved = resolve(pref);
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.setAttribute("data-theme-pref", pref);
}

/** Current stored preference (light/dark/system), defaulting to "system". */
export function getThemePreference(): ThemePreference {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
}

/** Persist and apply a new theme preference. */
export function setThemePreference(pref: ThemePreference): void {
  localStorage.setItem(STORAGE_KEY, pref);
  apply(pref);
}

/**
 * Initialize theming: re-applies the current preference (index.html already
 * did this before paint) and reacts to OS theme changes while on "system".
 */
export function initTheme(): void {
  apply(getThemePreference());

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getThemePreference() === "system") {
      apply("system");
    }
  });
}

/** Cycles light -> dark -> system -> light, used by the header toggle button. */
export function cycleThemePreference(): ThemePreference {
  const order: ThemePreference[] = ["light", "dark", "system"];
  const current = getThemePreference();
  const next = order[(order.indexOf(current) + 1) % order.length];
  setThemePreference(next);
  return next;
}
