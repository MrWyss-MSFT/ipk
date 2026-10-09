type PersistableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const STORAGE_PREFIX = "ipk:field:";
const SKIPPED_INPUT_TYPES = new Set(["button", "submit", "reset", "file", "hidden", "image"]);

function isPersistable(el: Element): el is PersistableElement {
  if (el instanceof HTMLInputElement) {
    return !el.readOnly && !SKIPPED_INPUT_TYPES.has(el.type);
  }
  if (el instanceof HTMLTextAreaElement) {
    return !el.readOnly;
  }
  return el instanceof HTMLSelectElement;
}

function fieldKey(toolId: string, el: PersistableElement): string | null {
  if (el instanceof HTMLInputElement && el.type === "radio") {
    return el.name ? `${STORAGE_PREFIX}${toolId}:radio:${el.name}` : null;
  }
  const ident = el.id || el.name;
  return ident ? `${STORAGE_PREFIX}${toolId}:${ident}` : null;
}

/**
 * Auto-persists every editable input/textarea/select under `container` to
 * sessionStorage, scoped by `toolId`, and replays saved values (dispatching
 * synthetic "input"/"change" events) when the tool is mounted again. This
 * means switching away from a tool - or reloading the page - doesn't lose
 * in-progress input, with no per-tool code required: it works generically
 * off standard form elements and each tool's own existing render listeners.
 * Readonly fields (computed outputs, PowerShell snippets, ...) are skipped.
 */
export function persistFormState(container: HTMLElement, toolId: string): () => void {
  const fields = Array.from(container.querySelectorAll<PersistableElement>("input, textarea, select")).filter(isPersistable);
  const restoredRadioGroups = new Set<string>();
  const listeners: Array<{ el: Element; type: string; handler: EventListener }> = [];

  for (const el of fields) {
    const key = fieldKey(toolId, el);
    if (!key) continue;

    if (el instanceof HTMLInputElement && el.type === "radio") {
      if (!restoredRadioGroups.has(key)) {
        restoredRadioGroups.add(key);
        const saved = sessionStorage.getItem(key);
        if (saved !== null) {
          const radios = container.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(el.name)}"]`);
          radios.forEach((r) => (r.checked = r.value === saved));
          radios[0]?.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    } else if (el instanceof HTMLInputElement && el.type === "checkbox") {
      const saved = sessionStorage.getItem(key);
      if (saved !== null) {
        el.checked = saved === "1";
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else {
      const saved = sessionStorage.getItem(key);
      if (saved !== null && saved !== el.value) {
        el.value = saved;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    const eventType = el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") ? "change" : "input";
    const handler: EventListener = () => {
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        sessionStorage.setItem(key, el.checked ? "1" : "0");
      } else if (el instanceof HTMLInputElement && el.type === "radio") {
        if (el.checked) sessionStorage.setItem(key, el.value);
      } else {
        sessionStorage.setItem(key, el.value);
      }
    };
    el.addEventListener(eventType, handler);
    listeners.push({ el, type: eventType, handler });
  }

  return () => {
    for (const { el, type, handler } of listeners) {
      el.removeEventListener(type, handler);
    }
  };
}
