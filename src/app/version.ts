/** Parses a dotted version string like "1.2.3" into numeric parts. */
function parseVersion(version: string): number[] {
  return version.split(".").map((part) => parseInt(part, 10) || 0);
}

/** True if version `a` is strictly older than version `b` (major.minor.patch, left to right). */
export function isVersionOlder(a: string, b: string): boolean {
  const partsA = parseVersion(a);
  const partsB = parseVersion(b);
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i++) {
    const da = partsA[i] ?? 0;
    const db = partsB[i] ?? 0;
    if (da !== db) return da < db;
  }
  return false;
}
