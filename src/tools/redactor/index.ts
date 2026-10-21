import "./style.css";
import { copyButtonHtml, wireCopyButton } from "@/app/copy-button";
import { wireGlobalPaste } from "@/app/global-paste";
import { wireExampleButton } from "@/app/example-button";
import type { ToolDefinition } from "@/types/tool";
import { REDACTION_RULES } from "./patterns";
import { redactText } from "./redact";

const DEFAULT_REPLACEMENT = "[REDACTED]";

const EXAMPLE_TEXT = `Hi Jane Doe, following up on Project Phoenix for IPK - IT Pro Kit.
Reach me at jane.doe@ipkitprokit.com or +1 (555) 123-4567.
The staging server is at 192.168.1.42, see https://staging.ipkitprokit.com/status for details.
Card on file ends in 4242 4242 4242 4242, IBAN DE89 3704 0044 0532 0130 00.`;

function ruleCheckboxHtml(rule: (typeof REDACTION_RULES)[number]): string {
  return `
    <label class="rdx-rule-label">
      <input type="checkbox" data-rule="${rule.id}" ${rule.defaultEnabled ? "checked" : ""} />
      ${rule.label}
    </label>
  `;
}

const tool: ToolDefinition = {
  id: "redactor",
  name: "Redactor",
  description:
    "Redact emails, URLs, IPs, IBANs, credit card and phone numbers (or your own custom words) from text.",
  category: "Text",
  keywords: [
    "redact",
    "redaction",
    "pii",
    "mask",
    "sanitize",
    "privacy",
    "email",
    "url",
    "ip address",
    "iban",
    "credit card",
    "phone number",
    "scrub",
    "anonymize",
  ],
  icon: "⬛",
  mount(container) {
    container.innerHTML = `
      <div class="rdx-tool">
        <p class="ipk-hint">
          Paste text below and pick what to redact. Detection relies on heuristic patterns, so always double-check
          the output before sharing it.
        </p>

        <div class="rdx-options">
          <fieldset class="rdx-rules">
            <legend>Redact</legend>
            ${REDACTION_RULES.map(ruleCheckboxHtml).join("")}
          </fieldset>

          <div class="rdx-fields">
            <label class="rdx-field-label ipk-field-label" for="rdx-custom">Custom words (comma-separated)</label>
            <input
              type="text"
              id="rdx-custom"
              class="mono"
              placeholder="IPK - IT Pro Kit, Project Phoenix, Jane Doe"
            />

            <label class="rdx-field-label ipk-field-label" for="rdx-replacement">Replacement text</label>
            <input type="text" id="rdx-replacement" class="mono" value="${DEFAULT_REPLACEMENT}" />
          </div>
        </div>

        <div class="ipk-field-header">
          <label class="rdx-field-label ipk-field-label" for="rdx-input">Input <span class="ipk-paste-note">— paste anywhere on the page</span></label>
          <button type="button" id="rdx-example" class="ipk-example-btn">Load example</button>
        </div>
        <textarea id="rdx-input" rows="10" placeholder="Paste text here..."></textarea>

        <div class="rdx-summary" id="rdx-summary" role="status"></div>

        <label class="rdx-field-label ipk-field-label" for="rdx-output">Redacted output</label>
        <div class="ipk-copy-wrap">
          <textarea id="rdx-output" class="mono" readonly rows="10"></textarea>
          ${copyButtonHtml("rdx-copy")}
        </div>
      </div>
    `;

    const input = container.querySelector<HTMLTextAreaElement>("#rdx-input")!;
    const output = container.querySelector<HTMLTextAreaElement>("#rdx-output")!;
    const customInput = container.querySelector<HTMLInputElement>("#rdx-custom")!;
    const replacementInput = container.querySelector<HTMLInputElement>("#rdx-replacement")!;
    const summaryEl = container.querySelector<HTMLDivElement>("#rdx-summary")!;
    const copyBtn = container.querySelector<HTMLButtonElement>("#rdx-copy")!;
    const ruleChecks = container.querySelectorAll<HTMLInputElement>("[data-rule]");

    const ruleLabelById = new Map(REDACTION_RULES.map((r) => [r.id, r.label]));

    const render = () => {
      const enabledRuleIds = new Set(
        Array.from(ruleChecks)
          .filter((c) => c.checked)
          .map((c) => c.dataset.rule!),
      );
      const replacement = replacementInput.value || DEFAULT_REPLACEMENT;

      const result = redactText(input.value, {
        enabledRuleIds,
        customWords: customInput.value,
        replacement,
      });

      output.value = result.output;

      if (!input.value) {
        summaryEl.textContent = "";
      } else if (result.total === 0) {
        summaryEl.textContent = "No matches found.";
      } else {
        const parts = Object.entries(result.counts).map(
          ([id, count]) => `${id === "custom" ? "Custom words" : ruleLabelById.get(id)} (${count})`,
        );
        summaryEl.textContent = `${result.total} redaction${result.total === 1 ? "" : "s"}: ${parts.join(", ")}`;
      }
    };

    input.addEventListener("input", render);
    customInput.addEventListener("input", render);
    replacementInput.addEventListener("input", render);
    ruleChecks.forEach((c) => c.addEventListener("change", render));

    wireCopyButton(copyBtn, () => output.value);
    const unwireGlobalPaste = wireGlobalPaste(input);

    const exampleBtn = container.querySelector<HTMLButtonElement>("#rdx-example")!;
    const unwireExample = wireExampleButton(exampleBtn, input, () => EXAMPLE_TEXT);

    render();

    return () => {
      input.removeEventListener("input", render);
      customInput.removeEventListener("input", render);
      replacementInput.removeEventListener("input", render);
      ruleChecks.forEach((c) => c.removeEventListener("change", render));
      unwireGlobalPaste();
      unwireExample();
    };
  },
};

export default tool;
