/**
 * Small reusable "copy to clipboard" icon button, meant to sit absolutely
 * positioned in the top-right corner of a text field. Wrap the field in a
 * `.ipk-copy-wrap` container and drop `copyButtonHtml(id)` right after it.
 */

const COPY_ICON = `
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
    <path d="M3.5 10.5h-1A1.5 1.5 0 0 1 1 9V3a1.5 1.5 0 0 1 1.5-1.5H9A1.5 1.5 0 0 1 10.5 3v1" stroke="currentColor" stroke-width="1.3"/>
  </svg>
`;

const CHECK_ICON = `
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 8.5 6.2 11.5 13 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

export function copyButtonHtml(id: string, label = "Copy to clipboard"): string {
  return `<button type="button" class="ipk-copy-btn" id="${id}" title="${label}" aria-label="${label}">${COPY_ICON}</button>`;
}

/**
 * Copyable command/output fields should never scroll — grow the textarea to
 * fit its content instead. Call once after mount and again whenever the
 * value changes (e.g. in the same `render()` that sets `.value`).
 */
export function autoGrowTextarea(el: HTMLTextAreaElement): void {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/** Wires a copy-icon button to copy whatever `getValue()` returns, with a brief checkmark confirmation. */
export function wireCopyButton(button: HTMLButtonElement, getValue: () => string): void {
  button.addEventListener("click", async () => {
    const value = getValue();
    if (!value) return;
    await navigator.clipboard.writeText(value);
    button.innerHTML = CHECK_ICON;
    button.classList.add("is-copied");
    setTimeout(() => {
      button.innerHTML = COPY_ICON;
      button.classList.remove("is-copied");
    }, 1200);
  });
}
