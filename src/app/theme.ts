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

/** The theme actually being shown right now (resolves "system" via the OS preference). */
export function getResolvedTheme(): ResolvedTheme {
  return resolve(getThemePreference());
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

/**
 * Flips between light and dark, used by the header toggle button. The app
 * still defaults to following the OS preference ("system") until the user
 * makes an explicit choice here - after that it stays on their pick.
 */
export function toggleTheme(): ResolvedTheme {
  const next: ResolvedTheme = getResolvedTheme() === "dark" ? "light" : "dark";
  setThemePreference(next);
  return next;
}

/** Re-invokes `callback` whenever the OS light/dark preference changes. */
export function onSystemThemeChange(callback: () => void): void {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", callback);
}
