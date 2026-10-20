/**
 * Lets Ctrl+V paste into a tool's primary input field no matter what has
 * focus on the page, instead of requiring the user to click into the field
 * first. Skipped when some *other* editable element (e.g. the header search
 * box, or another tool's field) is actually focused, so it never hijacks a
 * paste the user clearly meant for something else.
 *
 * Wire once per mount, right alongside the field's own "input" listener, and
 * call the returned unwire function in the cleanup callback.
 */
export function wireGlobalPaste(target: HTMLElement): () => void {
  const onPaste = (e: ClipboardEvent) => {
    const active = e.target as HTMLElement | null;
    const isOtherEditable =
      active &&
      !target.contains(active) &&
      (active.tagName === "TEXTAREA" || active.tagName === "INPUT" || active.isContentEditable);
    if (isOtherEditable) return;

    const text = e.clipboardData?.getData("text") ?? "";
    if (!text) return;

    e.preventDefault();
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) target.value = text;
    else target.innerText = text;
    // Setting .value programmatically doesn't fire a native "input" event, which both the
    // tool's own listener and the generic sessionStorage persistence (layout.ts) rely on.
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.focus();
  };
  document.addEventListener("paste", onPaste);
  return () => document.removeEventListener("paste", onPaste);
}
