const HINT_SELECTOR = ".ipk-hint, .ipk-warn";

function normalizedKey(el: HTMLElement): string {
  const kind = el.classList.contains("ipk-warn") ? "warn" : "hint";
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return `${kind}:${text}`;
}

/**
 * Relocates every `.ipk-hint`/`.ipk-warn` box a tool renders in its body
 * into a small icon button in the title row (`tray`), turning the original
 * box into a popover that opens under its icon on click. This reclaims the
 * vertical space those boxes used to take at the top of every tool, while
 * keeping the hint/warning content one click away.
 *
 * Works generically off the shared component classes - no per-tool wiring
 * required - and a MutationObserver picks up hints a tool renders
 * dynamically after mount (e.g. a warning that only appears for certain
 * input). Tools that re-render the same hint repeatedly (e.g. on every
 * keystroke) are deduped by their text content, so re-renders don't pile up
 * duplicate icons.
 */
export function relocateHintsToTitle(body: HTMLElement, tray: HTMLElement): () => void {
  const seen = new Set<string>();
  let openChip: HTMLElement | null = null;

  function closeOpenChip(): void {
    if (!openChip) return;
    openChip.querySelector<HTMLButtonElement>(".ipk-hint-chip-btn")?.setAttribute("aria-expanded", "false");
    const popover = openChip.querySelector<HTMLElement>(".ipk-hint-popover");
    if (popover) popover.hidden = true;
    openChip = null;
  }

  function relocate(el: HTMLElement): void {
    const key = normalizedKey(el);
    if (seen.has(key)) {
      // Same hint re-rendered (e.g. on every keystroke) - it's already a
      // chip, discard this duplicate instead of adding another icon.
      el.remove();
      return;
    }
    seen.add(key);

    const isWarn = el.classList.contains("ipk-warn");
    const chip = document.createElement("span");
    chip.className = "ipk-hint-chip";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ipk-hint-chip-btn";
    btn.textContent = isWarn ? "⚠️" : "💡";
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", isWarn ? "Show warning" : "Show hint");

    el.classList.add("ipk-hint-popover");
    el.hidden = true;
    el.setAttribute("role", "dialog");

    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const wasOpen = openChip === chip;
      closeOpenChip();
      if (!wasOpen) {
        el.hidden = false;
        btn.setAttribute("aria-expanded", "true");
        openChip = chip;
      }
    });

    chip.append(btn, el);
    tray.appendChild(chip);
  }

  Array.from(body.querySelectorAll<HTMLElement>(HINT_SELECTOR)).forEach(relocate);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches(HINT_SELECTOR)) relocate(node);
        node.querySelectorAll<HTMLElement>(HINT_SELECTOR).forEach(relocate);
      });
    }
  });
  observer.observe(body, { childList: true, subtree: true });

  const onDocClick = (event: MouseEvent): void => {
    if (openChip && !openChip.contains(event.target as Node)) closeOpenChip();
  };
  const onDocKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && openChip) closeOpenChip();
  };
  document.addEventListener("click", onDocClick);
  document.addEventListener("keydown", onDocKeydown);

  return () => {
    observer.disconnect();
    document.removeEventListener("click", onDocClick);
    document.removeEventListener("keydown", onDocKeydown);
  };
}
