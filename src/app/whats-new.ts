import { isVersionOlder } from "@/app/version";

const LAST_SEEN_KEY = "ipk-last-seen-version";

/** The app version this visitor last saw the changelog for (localStorage - persists across browser restarts). */
export function getLastSeenVersion(): string | null {
  return localStorage.getItem(LAST_SEEN_KEY);
}

/** Records `version` as seen so future visits don't flag it as new again. */
export function setLastSeenVersion(version: string): void {
  localStorage.setItem(LAST_SEEN_KEY, version);
}

/** True when the visitor has seen an older version before and the app has since shipped a newer one. */
export function hasUnseenChanges(currentVersion: string): boolean {
  const lastSeen = getLastSeenVersion();
  return !!lastSeen && isVersionOlder(lastSeen, currentVersion);
}

/**
 * Call once at startup. On a visitor's very first visit (no stored version
 * yet) there's nothing to show "since last visit" for, so this silently
 * records the current version instead of badging a brand-new visitor.
 * Returning visitors keep their stored version untouched here - callers
 * decide when to actually mark the current version as seen (e.g. once the
 * About page's changelog has been shown), via `setLastSeenVersion`.
 */
export function initWhatsNew(currentVersion: string): void {
  if (!getLastSeenVersion()) {
    setLastSeenVersion(currentVersion);
  }
}
