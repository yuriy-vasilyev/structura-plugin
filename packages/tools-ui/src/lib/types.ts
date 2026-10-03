/**
 * Wire types for the free SEO tools, mirrored from the `publicSeoTools`
 * cloud function (`functions/src/public-tools/tools/*.ts`). The two packages
 * cannot share imports, so this file is the browser copy of that contract,
 * used by www and the customer portal; a field added there must be added here.
 *
 * Spec: specs/blogseo-gap-analysis.md §4.3.
 */

/** Tool ids, as used in `/api/tools/[tool]` and the function's `tool` field. */
export const TOOL_IDS = ["seo-checker", "authority", "keywords"] as const;

/** One of {@link TOOL_IDS}. */
export type ToolId = (typeof TOOL_IDS)[number];

/** Whether `value` is a {@link ToolId}. */
export function isToolId(value: unknown): value is ToolId {
  return typeof value === "string" && (TOOL_IDS as readonly string[]).includes(value);
}

/** Countries the market-aware tools accept, in select-box order. */
export const TOOL_COUNTRIES = ["us", "gb", "ca", "au", "de", "at", "ch", "es", "mx", "fr", "be"] as const;

/** One of {@link TOOL_COUNTRIES}. */
export type ToolCountry = (typeof TOOL_COUNTRIES)[number];

/**
 * Error codes a tool call can end in. The UI keys its copy on these;
 * `unavailable` covers anything we cannot attribute more precisely.
 * `visitor_limit` is www's per-visitor daily limit
 * (specs/blogseo-gap-analysis.md §4.10); the portal never sends it.
 */
export type ToolErrorCode = "invalid_input" | "rate_limited" | "capacity" | "visitor_limit" | "upstream" | "unavailable";

/** Refusals each surface renders as its own card instead of the shared error pane. */
export type RefusalCode = Extract<ToolErrorCode, "capacity" | "visitor_limit">;

/** Whether `error` is a {@link RefusalCode}. */
export function isRefusal(error: ToolErrorCode): error is RefusalCode {
  return error === "capacity" || error === "visitor_limit";
}

/** Stable seo-checker check ids, in display order. */
export const SEO_CHECK_IDS = [
  "title_present",
  "title_length",
  "meta_description_present",
  "meta_description_length",
  "single_h1",
  "https",
  "canonical",
  "indexable",
  "viewport",
  "images_alt",
  "word_count",
  "structured_data",
  "open_graph",
  "page_size",
  "load_time",
  "internal_links",
  "duplicate_title_desc",
] as const;

/** One of {@link SEO_CHECK_IDS}. */
export type SeoCheckId = (typeof SEO_CHECK_IDS)[number];

/** Outcome of one check; `unknown` means the crawl did not report the signal. */
export type SeoCheckStatus = "pass" | "warn" | "fail" | "unknown";

/** Whether `value` is a {@link SeoCheckId} this build has copy for. */
export function isSeoCheckId(value: string): value is SeoCheckId {
  return (SEO_CHECK_IDS as readonly string[]).includes(value);
}

/** Whether `value` is a {@link SeoCheckStatus} this build knows how to show. */
export function isSeoCheckStatus(value: string): value is SeoCheckStatus {
  return value === "pass" || value === "warn" || value === "fail" || value === "unknown";
}

/**
 * One check as it arrives on the wire. `id` and `status` are plain strings
 * on purpose: the function ships on its own cadence and may add a check or a
 * status before this build knows it, and the report must still render
 * (§4.8.1 #6). Narrow with {@link isSeoCheckId} / {@link isSeoCheckStatus}.
 */
export interface SeoCheck {
  id: string;
  status: string;
  value?: string;
}

/** Result of `seo-checker`. */
export interface SeoCheckerResult {
  url: string;
  fetchedAt: string;
  score?: number;
  page: {
    statusCode: number;
    title?: string;
    titleLength?: number;
    metaDescription?: string;
    metaDescriptionLength?: number;
    h1?: string[];
    h2Count?: number;
    wordCount?: number;
    canonical?: string;
    robotsDirective?: string;
    isHttps?: boolean;
    viewport?: boolean;
    hasSchema?: boolean;
    hasOpenGraph?: boolean;
    hreflangCount?: number;
    imagesTotal?: number;
    imagesMissingAlt?: number;
    internalLinks?: number;
    externalLinks?: number;
    pageSizeBytes?: number;
    loadTimeMs?: number;
  };
  checks: SeoCheck[];
}

/**
 * Result of `authority`: global link figures for one domain. Figures may be
 * absent; never zero-filled. Until 2026-10-01 it also carried an organic
 * footprint for a chosen country, with `country`, `language`, `organic` and
 * `unavailable` fields; those are ignored if an older answer still sends them.
 */
export interface AuthorityResult {
  domain: string;
  fetchedAt: string;
  authority: {
    /** DataForSEO domain rank, 0-100, DR-comparable. Not Ahrefs DR or Moz DA. */
    score?: number;
    backlinks?: number;
    referringDomains?: number;
    referringMainDomains?: number;
    /** Followed share of referring links, 0-1 (denominator: referring pages since 2026-09-30). */
    dofollowBacklinkShare?: number;
    spamScore?: number;
    firstSeen?: string;
  };
}

/** Search intent labels the keyword rows may carry. */
export type KeywordIntent = "informational" | "navigational" | "commercial" | "transactional";

/** One keyword row. Metrics are absent, not zero, when unknown. */
export interface KeywordRow {
  keyword: string;
  volume?: number;
  cpc?: number;
  competition?: number;
  difficulty?: number;
  intent?: KeywordIntent;
}

/** Result of `keywords`. */
export interface KeywordsResult {
  seed: string;
  country: string;
  /** Language the ideas are in; sent by the function since rev 2, optional for older answers. */
  language?: string;
  fetchedAt: string;
  items: KeywordRow[];
}

/** Result type per tool id. */
export interface ToolResultMap {
  "seo-checker": SeoCheckerResult;
  authority: AuthorityResult;
  keywords: KeywordsResult;
}

/** Body `/api/tools/[tool]` returns on success. */
export interface ToolSuccessBody<T extends ToolId> {
  ok: true;
  tool: T;
  cached: boolean;
  result: ToolResultMap[T];
}

/** Body `/api/tools/[tool]` returns on failure. */
export interface ToolErrorBody {
  ok: false;
  error: ToolErrorCode;
}
