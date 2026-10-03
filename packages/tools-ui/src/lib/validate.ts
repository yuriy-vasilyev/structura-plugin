/**
 * Input validation for the free SEO tools, shared by the tool forms (instant
 * feedback) and the `/api/tools/[tool]` route (reject before spending a
 * round trip to the cloud).
 *
 * The cloud function (`functions/src/public-tools/normalise.ts`) remains the
 * authority and normalises again. This layer is deliberately no stricter than
 * the function (it must never block input the function accepts); anything
 * subtler it lets through comes back from the function as a 400 anyway.
 *
 * Spec: specs/blogseo-gap-analysis.md §4.2, §4.3 "Normalisation".
 */

import { SUPPORTED_LOCALES, type SupportedLocale } from "@structura/i18n-contracts";
import { TOOL_COUNTRIES, type ToolCountry, type ToolId } from "./types";

/** Same bounds as the function. */
export const MAX_URL_LENGTH = 2048;
/** Shortest seed keyword, in characters after collapsing whitespace. */
export const KEYWORD_MIN_LENGTH = 2;
/** Longest seed keyword, in characters after collapsing whitespace. */
export const KEYWORD_MAX_LENGTH = 80;

/** A validated request, ready to forward. */
export interface ToolRequest {
  input: string;
  locale: SupportedLocale;
  country?: ToolCountry;
}

/** Validation outcome. */
export type ValidationResult = { ok: true; value: ToolRequest } | { ok: false };

function isPrivateHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host.startsWith("[")) return true;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function parseHost(raw: string): { url: URL } | null {
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  if (hasScheme && !/^https?:\/\//i.test(raw)) return null;
  try {
    const url = new URL(hasScheme ? raw : `https://${raw}`);
    if (url.username || url.password) return null;
    const host = url.hostname;
    if (!host.includes(".") || host.endsWith(".") || isPrivateHost(host)) return null;
    return { url };
  } catch {
    return null;
  }
}

/** Whether `raw` is a page URL the SEO checker can fetch. */
export function isValidPageUrl(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_URL_LENGTH && parseHost(trimmed) !== null;
}

/** Whether `raw` names a domain the authority checker can look up. */
export function isValidDomain(raw: string): boolean {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return false;
  const parsed = parseHost(trimmed);
  if (!parsed) return false;
  const host = parsed.url.hostname.replace(/^www\./, "");
  // An IP address has no domain authority.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  const labels = host.split(".");
  return (
    host.length <= 253 &&
    labels.length >= 2 &&
    labels.every((l) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(l)) &&
    !/^\d+$/.test(labels[labels.length - 1] ?? "")
  );
}

/** Whether `raw` is a usable seed keyword (2-80 characters after collapsing whitespace). */
export function isValidKeyword(raw: string): boolean {
  const length = Array.from(raw.trim().replace(/\s+/g, " ")).length;
  return length >= KEYWORD_MIN_LENGTH && length <= KEYWORD_MAX_LENGTH;
}

/** Per-tool input check, for the forms. */
export function isValidToolInput(tool: ToolId, raw: string): boolean {
  switch (tool) {
    case "seo-checker":
      return isValidPageUrl(raw);
    case "authority":
      return isValidDomain(raw);
    case "keywords":
      return isValidKeyword(raw);
  }
}

/**
 * Validate a request body for `tool`. The country is only accepted on the
 * keyword generator, the one market-aware tool; the SEO and DR checkers
 * ignore it rather than failing, since a stray field is not the visitor's
 * mistake (the DR checker took a country until 2026-10-01).
 */
export function validateToolRequest(tool: ToolId, body: unknown): ValidationResult {
  if (!body || typeof body !== "object") return { ok: false };
  const b = body as Record<string, unknown>;
  if (typeof b.input !== "string" || !isValidToolInput(tool, b.input)) return { ok: false };

  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(b.locale as string)
    ? (b.locale as SupportedLocale)
    : "en";

  if (tool === "seo-checker" || tool === "authority") {
    return { ok: true, value: { input: b.input.trim(), locale } };
  }
  let country: ToolCountry | undefined;
  if (b.country !== undefined && b.country !== null && b.country !== "") {
    if (typeof b.country !== "string" || !(TOOL_COUNTRIES as readonly string[]).includes(b.country)) {
      return { ok: false };
    }
    country = b.country as ToolCountry;
  }
  return { ok: true, value: { input: b.input.trim(), locale, ...(country ? { country } : {}) } };
}

/** Default market per site locale, matching the function's fallback. */
export const LOCALE_DEFAULT_COUNTRY: Record<SupportedLocale, ToolCountry> = {
  en: "us",
  de: "de",
  es: "es",
  fr: "fr",
};
