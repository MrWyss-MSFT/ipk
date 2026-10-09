/**
 * Thin wrapper around Prism's core highlighter. We only import the specific
 * language components we actually use (not Prism's autoloader or a bundled
 * theme) to keep the bundle small; token colors are styled with our own CSS
 * variables in `components.css` so both themes stay correct.
 */
import Prism from "prismjs";
import "prismjs/components/prism-powershell";
import "prismjs/components/prism-batch";
import "prismjs/components/prism-markup";

// Stock Prism only colors the leading "-" of a cmdlet parameter (e.g.
// `-FeatureName`) as a bare operator, leaving the parameter name itself
// unstyled — a stray gray dash next to plain text. Recognize `-ParamName` as
// one unit (styled like XML/cmd attribute names via the shared `attr-name`
// token), while leaving real comparison operators (`-eq`, `-match`, ...) to
// the stock `operator` rule by excluding them here.
Prism.languages.insertBefore("powershell", "operator", {
  parameter: {
    pattern:
      /(\s|^)-(?!(?:b?(?:and|x?or)|as|(?:not)?(?:contains|in|like|match)|eq|ge|gt|is(?:not)?|join|le|lt|ne|not|replace|sh[lr])\b)[a-z][\w]*\b/i,
    lookbehind: true,
    alias: "attr-name",
  },
});

export type CodeLang = "powershell" | "cmd" | "xml";

const GRAMMARS: Record<CodeLang, { grammar: Prism.Grammar; name: string }> = {
  powershell: { grammar: Prism.languages.powershell, name: "powershell" },
  cmd: { grammar: Prism.languages.batch, name: "batch" },
  xml: { grammar: Prism.languages.markup, name: "markup" },
};

/** Highlights `code` as `lang`, returning HTML with `<span class="token ...">` markup. */
export function highlightCode(code: string, lang: CodeLang): string {
  const entry = GRAMMARS[lang];
  return Prism.highlight(code, entry.grammar, entry.name);
}
