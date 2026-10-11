/**
 * Many tools ask the user to run a one-off PowerShell pipeline on a device
 * and copy its result. `Set-Clipboard -PassThru` only exists in PowerShell
 * 7.4+ — Windows PowerShell 5.1 (the OS-default console on every managed
 * endpoint) doesn't support it — so every such command needs two variants:
 * `-PassThru` on 7+, and `$var = <pipeline>; $var | Set-Clipboard; $var` on
 * 5.1 (copies *and* echoes the result either way). This renders a small
 * two-tab switcher ("PowerShell 7+" / "Windows PowerShell 5.1") above a
 * `codeBlockHtml()` + `copyButtonHtml()` pair so either version is one click
 * away; wrap in `.ipk-copy-wrap` as usual.
 */
import { codeBlockHtml, setPowerShellCode } from "./code-block";
import { copyButtonHtml, wireCopyButton } from "./copy-button";

export interface PsCommandVariants {
  ps7: string;
  ps51: string;
}

export interface MakePsCommandVariantsOptions {
  /** Statements that must run (and keep echoing to the console) before the final value expression, already ending in `; ` — e.g. `$System = Get-CimInstance ...; "CoManaged: ..."; `. Omit for a single-expression pipeline. */
  setup?: string;
  /** PowerShell variable name used to hold the final value on the 5.1 branch. Must not collide with any variable used in `setup`/`valueExpr`. */
  varName?: string;
}

/**
 * Builds the PS 7+ / Windows PowerShell 5.1 variant pair for a command whose
 * last expression is the value to copy. Only `valueExpr` gets wrapped in the
 * `$var = ...; $var | Set-Clipboard; $var` assignment on 5.1 — any `setup`
 * statements run first, unchanged, on both versions (assigning to `$var`
 * around the whole script would otherwise swallow/misattribute earlier
 * statements' own assignments, e.g. chained `$var = $Foo = ...`).
 */
export function makePsCommandVariants(valueExpr: string, options: MakePsCommandVariantsOptions = {}): PsCommandVariants {
  const { setup = "", varName = "result" } = options;
  return {
    ps7: `${setup}${valueExpr} | Set-Clipboard -PassThru`,
    ps51: `${setup}$${varName} = ${valueExpr}; $${varName} | Set-Clipboard; $${varName}`,
  };
}

export function psCommandTabsHtml(id: string, options: { requiresAdmin?: boolean } = {}): string {
  const { requiresAdmin = false } = options;
  return `
    <div class="ipk-ps-command">
      <div class="ipk-ps-tabs" role="tablist" aria-label="PowerShell version">
        <button type="button" class="ipk-ps-tab is-active" id="${id}-tab-ps7" role="tab" aria-selected="true">PowerShell 7+</button>
        <button type="button" class="ipk-ps-tab" id="${id}-tab-ps51" role="tab" aria-selected="false">Windows PowerShell 5.1</button>
        ${requiresAdmin ? `<span class="ipk-ps-admin-badge" title="Needs an elevated PowerShell/terminal (Run as Administrator)">🛡️ Admin</span>` : ""}
      </div>
      <div class="ipk-copy-wrap ipk-copy-wrap-tabbed">
        ${codeBlockHtml(`${id}-code`)}
        ${copyButtonHtml(`${id}-copy`)}
      </div>
    </div>
  `;
}

/** Wires a `psCommandTabsHtml(id)` block: tab switching, highlighted code, and the copy button. Call once after inserting the HTML; call the returned cleanup on unmount. */
export function wirePsCommandTabs(container: ParentNode, id: string, variants: PsCommandVariants): () => void {
  const codeEl = container.querySelector<HTMLElement>(`#${id}-code`)!;
  const copyBtn = container.querySelector<HTMLButtonElement>(`#${id}-copy`)!;
  const tabPs7 = container.querySelector<HTMLButtonElement>(`#${id}-tab-ps7`)!;
  const tabPs51 = container.querySelector<HTMLButtonElement>(`#${id}-tab-ps51`)!;

  let active: keyof PsCommandVariants = "ps7";

  const render = () => {
    setPowerShellCode(codeEl, variants[active]);
    tabPs7.classList.toggle("is-active", active === "ps7");
    tabPs7.setAttribute("aria-selected", String(active === "ps7"));
    tabPs51.classList.toggle("is-active", active === "ps51");
    tabPs51.setAttribute("aria-selected", String(active === "ps51"));
  };

  const selectPs7 = () => {
    active = "ps7";
    render();
  };
  const selectPs51 = () => {
    active = "ps51";
    render();
  };

  tabPs7.addEventListener("click", selectPs7);
  tabPs51.addEventListener("click", selectPs51);
  wireCopyButton(copyBtn, () => variants[active]);

  render();

  return () => {
    tabPs7.removeEventListener("click", selectPs7);
    tabPs51.removeEventListener("click", selectPs51);
  };
}
