/**
 * Pure, DOM-free classification of decoded QR payload text into a handful of
 * common formats (URL / Wi-Fi / TOTP authenticator / Autopilot DeviceLink),
 * so the UI can render a nicer, format-aware result instead of only raw
 * text. Anything that doesn't match a known, documented format falls back
 * to plain "text" - we don't guess at undocumented shapes.
 */

import { isDeviceLinkPayload, parseDeviceLinkUrl } from "@/app/devicelink";

export interface UrlPayload {
  kind: "url";
  raw: string;
  url: string;
}

export interface WifiPayload {
  kind: "wifi";
  raw: string;
  ssid: string;
  password?: string;
  authType?: string;
  hidden?: boolean;
}

export interface TotpPayload {
  kind: "totp";
  raw: string;
  issuer?: string;
  account?: string;
  secret?: string;
  algorithm?: string;
  digits?: string;
  period?: string;
}

export interface TextPayload {
  kind: "text";
  raw: string;
}

export interface DeviceLinkPayload {
  kind: "deviceLink";
  raw: string;
  serialNumber: string;
  data: string;
}

export type ParsedQr = UrlPayload | WifiPayload | TotpPayload | DeviceLinkPayload | TextPayload;

/** Splits a `WIFI:` payload body into its `KEY:VALUE;` fields, honoring `\;` `\:` `\,` `\\` escapes per the format. */
function parseWifiFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const regex = /([A-Za-z]):((?:\\.|[^\\;])*);/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body))) {
    const key = match[1].toUpperCase();
    fields[key] = match[2].replace(/\\(.)/g, "$1");
  }
  return fields;
}

function parseWifi(raw: string): WifiPayload {
  const body = raw.replace(/^WIFI:/i, "");
  const fields = parseWifiFields(body.endsWith(";") ? body : `${body};`);
  return {
    kind: "wifi",
    raw,
    ssid: fields.S ?? "",
    password: fields.P || undefined,
    authType: fields.T || undefined,
    hidden: fields.H?.toLowerCase() === "true",
  };
}

/** Parses the documented `otpauth://totp/...` URI scheme (https://github.com/google/google-authenticator/wiki/Key-Uri-Format). */
function parseTotp(raw: string): TotpPayload {
  try {
    const url = new URL(raw);
    const label = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    let issuer = url.searchParams.get("issuer") ?? undefined;
    let account = label || undefined;
    if (label.includes(":")) {
      const [labelIssuer, labelAccount] = label.split(":", 2);
      if (!issuer) issuer = labelIssuer;
      account = labelAccount;
    }
    return {
      kind: "totp",
      raw,
      issuer,
      account,
      secret: url.searchParams.get("secret") ?? undefined,
      algorithm: url.searchParams.get("algorithm") ?? undefined,
      digits: url.searchParams.get("digits") ?? undefined,
      period: url.searchParams.get("period") ?? undefined,
    };
  } catch {
    return { kind: "totp", raw };
  }
}

export function parseQrPayload(raw: string): ParsedQr {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return { kind: "url", raw, url: trimmed };
  if (/^WIFI:/i.test(trimmed)) return parseWifi(trimmed);
  if (/^otpauth:\/\/totp\//i.test(trimmed)) return parseTotp(trimmed);
  if (isDeviceLinkPayload(trimmed)) {
    const parsed = parseDeviceLinkUrl(trimmed);
    if (parsed) return { kind: "deviceLink", raw, serialNumber: parsed.serialNumber, data: parsed.data };
  }
  return { kind: "text", raw };
}
