/**
 * Lets a tool accept a dropped file anywhere on the page - the drag/drop
 * counterpart to `wireGlobalPaste()` - as an alternative to a plain
 * `<input type="file">` picker. Listens document-wide so the drop doesn't
 * have to land exactly on the tool's own elements, but only toggles an
 * `is-drag-over` class on `highlightEl` while a file is being dragged, so
 * the tool's own CSS can render a highlight there (e.g.
 * `.xyz-tool.is-drag-over { ... }`) - this module only handles the drag
 * events/class, not the visual style.
 *
 * Wire once per mount, alongside any file `<input>`'s own "change" listener,
 * and call the returned unwire function in the cleanup callback.
 */
export function wireFileDrop(highlightEl: HTMLElement, onFile: (file: File) => void): () => void {
  // Counts nested dragenter/dragleave pairs (the document and its descendants)
  // so the highlight doesn't flicker off while the pointer moves between them.
  let dragDepth = 0;

  const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;

  const onDragEnter = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    highlightEl.classList.add("is-drag-over");
  };
  const onDragOver = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
  };
  const onDragLeave = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) highlightEl.classList.remove("is-drag-over");
  };
  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    highlightEl.classList.remove("is-drag-over");
    const file = e.dataTransfer?.files[0];
    if (file) onFile(file);
  };

  document.addEventListener("dragenter", onDragEnter);
  document.addEventListener("dragover", onDragOver);
  document.addEventListener("dragleave", onDragLeave);
  document.addEventListener("drop", onDrop);

  return () => {
    document.removeEventListener("dragenter", onDragEnter);
    document.removeEventListener("dragover", onDragOver);
    document.removeEventListener("dragleave", onDragLeave);
    document.removeEventListener("drop", onDrop);
    highlightEl.classList.remove("is-drag-over");
  };
}
