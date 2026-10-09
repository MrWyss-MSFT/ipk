import { REDACTION_RULES } from "./patterns";

/** Escape a string for safe interpolation into a RegExp source. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface RedactOptions {
  /** IDs of built-in rules (from REDACTION_RULES) to apply. */
  enabledRuleIds: ReadonlySet<string>;
  /** Comma-separated list of extra literal words/phrases to redact (case-insensitive). */
  customWords: string;
  /** Replacement text, e.g. "[REDACTED]" or a custom word. */
  replacement: string;
}

export interface RedactResult {
  output: string;
  /** Count of replacements made per rule id (built-ins) plus "custom" for the custom-words pass. */
  counts: Record<string, number>;
  total: number;
}

/** Redacts `input` according to `options`, returning the redacted text and match counts. */
export function redactText(input: string, options: RedactOptions): RedactResult {
  let output = input;
  const counts: Record<string, number> = {};

  for (const rule of REDACTION_RULES) {
    if (!options.enabledRuleIds.has(rule.id)) continue;
    let count = 0;
    output = output.replace(rule.pattern, () => {
      count++;
      return options.replacement;
    });
    if (count > 0) counts[rule.id] = count;
  }

  const words = options.customWords
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);

  if (words.length > 0) {
    const pattern = new RegExp(`\\b(?:${words.map(escapeRegExp).join("|")})\\b`, "gi");
    let count = 0;
    output = output.replace(pattern, () => {
      count++;
      return options.replacement;
    });
    if (count > 0) counts.custom = count;
  }

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return { output, counts, total };
}
