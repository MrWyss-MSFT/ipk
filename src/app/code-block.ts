/**
 * Readonly, syntax-highlighted code block — a drop-in replacement for a
 * readonly `<textarea class="mono">` when the content is static PowerShell,
 * cmd, or XML. Wrap in `.ipk-copy-wrap` and follow with `copyButtonHtml(id)`,
 * same as any other copyable field; for a copy button, read from the raw
 * source string when one is already in hand, or fall back to this element's
 * `.textContent` (Prism's `<span>` markup never changes the text content) for
 * content that's rebuilt reactively.
 */
import { highlightCode, type CodeLang } from "./highlight";

export function codeBlockHtml(id: string): string {
  return `<pre class="ipk-code mono" id="${id}"><code></code></pre>`;
}

/** Sets highlighted `lang` content on a `codeBlockHtml()` element. */
export function setCode(pre: HTMLElement, code: string, lang: CodeLang): void {
  pre.querySelector("code")!.innerHTML = highlightCode(code, lang);
}

/** Sets highlighted PowerShell content on a `codeBlockHtml()` element. */
export function setPowerShellCode(pre: HTMLElement, code: string): void {
  setCode(pre, code, "powershell");
}
