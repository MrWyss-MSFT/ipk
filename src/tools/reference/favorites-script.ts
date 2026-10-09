/**
 * Builds a short, copy-pasteable cmd.exe / reg.exe script that adds entries to Registry
 * Editor's "Favorites" list directly (no PowerShell needed). `reg add` auto-creates any
 * missing parent keys, so no separate setup step is needed.
 *
 * Adapted from the standalone Intune Registry Favorites Generator tool, now folded into
 * the References tool's Registry Paths tab.
 */

const FAVORITES_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Applets\\Regedit\\Favorites";

const HIVE_MAP: Record<string, string> = {
  HKLM: "HKEY_LOCAL_MACHINE",
  HKCU: "HKEY_CURRENT_USER",
  HKCR: "HKEY_CLASSES_ROOT",
  HKU: "HKEY_USERS",
  HKCC: "HKEY_CURRENT_CONFIG",
};

/**
 * Converts a short-hive display path (e.g. "HKLM\SOFTWARE\...") into the full
 * "Computer\HKEY_LOCAL_MACHINE\SOFTWARE\..." form Registry Editor stores Favorites values
 * as. Paths already in "Computer\..." form are returned unchanged.
 */
export function toFavoriteValue(path: string): string {
  const trimmed = path.trim();
  if (/^computer\\/i.test(trimmed)) return trimmed;
  const idx = trimmed.indexOf("\\");
  const hive = idx === -1 ? trimmed : trimmed.slice(0, idx);
  const rest = idx === -1 ? "" : trimmed.slice(idx);
  const full = HIVE_MAP[hive.toUpperCase()] ?? hive;
  return `Computer\\${full}${rest}`;
}

export interface RegistryFavoriteEntry {
  name: string;
  path: string;
}

/**
 * `path` may contain the literal placeholder `{EnrollmentID}`, substituted with the
 * generated script's own run-time lookup of the device's Intune enrollment GUID.
 *
 * Uses single `%` for interactive cmd.exe paste; double every `%` to `%%` if saving this
 * as a .bat/.cmd file instead.
 */
export function buildRegistryFavoritesScript(favorites: RegistryFavoriteEntry[]): string {
  const needsEnrollmentId = favorites.some((f) => f.path.includes("{EnrollmentID}"));

  const lines: string[] = ["@echo off", "chcp 65001 >nul", `set "FAV=${FAVORITES_KEY}"`];

  if (needsEnrollmentId) {
    lines.push(
      "",
      "for /f \"tokens=1* delims=\" %K in ('reg query \"HKLM\\SOFTWARE\\Microsoft\\Enrollments\" /s /d /f \"MS DM Server\" 2^>nul ^| findstr /b /i \"HKEY_LOCAL_MACHINE\"') do set \"ENROLLKEY=%K\"",
      'for %A in ("%ENROLLKEY:\\=" "%") do set "EnrollmentID=%~A"',
    );
  }

  lines.push("");
  const favoriteLines = favorites.map((f) => {
    const value = toFavoriteValue(f.path.replace(/\{EnrollmentID\}/g, "%EnrollmentID%"));
    const name = f.name.replace(/"/g, "").trim() || "Favorite";
    return `reg add "%FAV%" /v "${name}" /t REG_SZ /d "${value}" /f`;
  });
  lines.push(...(favoriteLines.length ? favoriteLines : ["rem No favorites selected"]));
  lines.push("", "echo Done. Open regedit and check Favorites.", "@echo on");

  return lines.join("\n") + "\n";
}
