import "./style.css";
import { autoGrowTextarea, copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import type { ToolDefinition } from "@/types/tool";

/** UTF-8 safe Base64 encode. */
function encodeBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

/** UTF-8 safe Base64 decode. Throws on invalid input. */
function decodeBase64(input: string): string {
  const binary = atob(input);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const tool: ToolDefinition = {
  id: "base64",
  name: "Base64 Encode / Decode",
  description: "Encode text to Base64 or decode a Base64 string back to text.",
  category: "Converters",
  keywords: ["base64", "encode", "decode", "btoa", "atob"],
  icon: "🔤",
  mount(container) {
    container.innerHTML = `
      <div class="b64-tool">
        <div class="b64-mode" role="radiogroup" aria-label="Mode">
          <button type="button" class="btn btn-primary" data-mode="encode">Encode</button>
          <button type="button" class="btn" data-mode="decode">Decode</button>
        </div>
        <label class="b64-label" for="b64-input">Input</label>
        <textarea id="b64-input" class="mono" rows="8" placeholder="Type or paste text here..."></textarea>
        <span class="b64-error" id="b64-error" role="alert"></span>
        <label class="b64-label" for="b64-output">Output</label>
        <div class="ipk-copy-wrap">
          <textarea id="b64-output" class="mono" rows="8" readonly></textarea>
          ${copyButtonHtml("b64-copy")}
        </div>
      </div>
    `;

    const input = container.querySelector<HTMLTextAreaElement>("#b64-input")!;
    const output = container.querySelector<HTMLTextAreaElement>("#b64-output")!;
    const errorEl = container.querySelector<HTMLSpanElement>("#b64-error")!;
    const copyBtn = container.querySelector<HTMLButtonElement>("#b64-copy")!;
    const modeButtons = container.querySelectorAll<HTMLButtonElement>("[data-mode]");

    let mode: "encode" | "decode" = "encode";

    const setMode = (next: "encode" | "decode") => {
      mode = next;
      modeButtons.forEach((btn) => {
        const isActive = btn.dataset.mode === next;
        btn.classList.toggle("btn-primary", isActive);
      });
      render();
    };

    const render = () => {
      errorEl.textContent = "";
      if (!input.value) {
        output.value = "";
        autoGrowTextarea(output);
        return;
      }
      try {
        output.value = mode === "encode" ? encodeBase64(input.value) : decodeBase64(input.value);
      } catch {
        output.value = "";
        errorEl.textContent =
          mode === "decode" ? "Invalid Base64 input." : "Unable to encode this input.";
      }
      autoGrowTextarea(output);
    };

    modeButtons.forEach((btn) => {
      btn.addEventListener("click", () => setMode(btn.dataset.mode as "encode" | "decode"));
    });

    input.addEventListener("input", render);

    wireCopyButton(copyBtn, () => output.value);

    // No external listeners/timers outlive this view beyond the copy label
    // reset, which is harmless if the view is torn down mid-flight.
    return () => {
      input.removeEventListener("input", render);
    };
  },
};

export default tool;
