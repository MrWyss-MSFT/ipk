/**
 * Regex-based detectors used by the Redactor tool. Order matters: broader /
 * more specific patterns (URL, email) run before narrower ones (IP, phone)
 * so e.g. an IP address embedded in a URL gets redacted as part of the URL
 * rather than being partially matched twice.
 */
export interface RedactionRule {
  id: string;
  label: string;
  /** Must be a `g` (global) regex. */
  pattern: RegExp;
  defaultEnabled: boolean;
}

export const REDACTION_RULES: RedactionRule[] = [
  {
    id: "url",
    label: "URLs",
    pattern: /\b(?:https?:\/\/|www\.)[^\s<>"'`)]+/gi,
    defaultEnabled: true,
  },
  {
    id: "email",
    label: "Email addresses",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    defaultEnabled: true,
  },
  {
    id: "iban",
    label: "IBANs",
    pattern: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{2,4}){3,8}\b/g,
    defaultEnabled: true,
  },
  {
    id: "creditcard",
    label: "Credit card numbers",
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    defaultEnabled: true,
  },
  {
    id: "phone",
    label: "Phone numbers",
    pattern: /(?<!\d)\+?\(?\d(?:[\s.()-]*\d){7,14}(?!\d)/g,
    defaultEnabled: true,
  },
  {
    id: "ip",
    label: "IP addresses (IPv4)",
    pattern:
      /\b(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\b/g,
    defaultEnabled: true,
  },
];
