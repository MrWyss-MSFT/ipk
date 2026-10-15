/**
 * Shared behavior for a tool's "Load example" button (`.ipk-example-btn`,
 * see `.ipk-field-header` in components.css). The button is dual-purpose:
 * while the field is empty it loads canned example data; once the field has
 * content (whether from the example, a paste, a file drop, or manual
 * typing) it flips to "Clear" and empties the field instead. The label
 * always reflects the field's actual current content, including changes
 * made through other means (paste, file upload, a tool's own "Clear"
 * button), so it never gets out of sync.
 */

export function wireExampleButton(
  button: HTMLButtonElement,
  field: HTMLInputElement | HTMLTextAreaElement,
  getExampleValue: () => string,
): () => void {
  const updateLabel = () => {
    button.textContent = field.value.trim() ? "Clear" : "Load example";
  };

  const onClick = () => {
    field.value = field.value.trim() ? "" : getExampleValue();
    field.dispatchEvent(new Event("input", { bubbles: true }));
  };

  button.addEventListener("click", onClick);
  field.addEventListener("input", updateLabel);
  updateLabel();

  return () => {
    button.removeEventListener("click", onClick);
    field.removeEventListener("input", updateLabel);
  };
}
