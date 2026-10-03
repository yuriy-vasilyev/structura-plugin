import {
  TOOL_COUNTRIES,
  type AuthorityResult,
  type KeywordIntent,
  type KeywordRow,
  type KeywordsResult,
  type SeoCheck,
  type SeoCheckerResult,
  type ToolErrorCode,
  type ToolId,
  type ToolResultMap,
} from "./types";

/**
 * Turning `/api/tools/*` answers into UI states, defensively.
 *
 * The cloud function and this site deploy on their own cadences, so a 200
 * body is validated rather than cast (specs/blogseo-gap-analysis.md §4.8.1
 * #6, AGENTS.md §10). Required fields missing → the `unavailable` state, not
 * a crash. Optional fields of the wrong type are dropped, never guessed.
 * Additive changes pass: an unknown check id or status survives as a plain
 * string and the report renders it as a neutral row.
 */

/**
 * What the tool UI does with one `/api/tools/*` answer. Also what a
 * surface's runner resolves to (`useToolRun`).
 */
export type ToolOutcome<T extends ToolId> =
  | { ok: true; result: ToolResultMap[T]; cached: boolean }
  | {
      ok: false;
      error: ToolErrorCode;
      status: number;
      /** Seconds before a retry can succeed, when the answer said (a 429's `Retry-After`). */
      retryAfterSeconds?: number;
    };

const KNOWN_ERRORS: readonly ToolErrorCode[] = [
  "invalid_input",
  "rate_limited",
  "capacity",
  "visitor_limit",
  "upstream",
  "unavailable",
];

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

/** Copy only the keys whose value passed its reader; absent stays absent. */
function pick<T extends object>(src: Obj, readers: { [K in keyof T]: (v: unknown) => T[K] | undefined }): T {
  const out: Partial<T> = {};
  for (const key of Object.keys(readers) as Array<keyof T>) {
    const value = readers[key](src[key as string]);
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

function parseSeoChecker(r: Obj): SeoCheckerResult | null {
  const url = str(r.url);
  const fetchedAt = str(r.fetchedAt);
  if (!url || !fetchedAt || !isObj(r.page) || !Array.isArray(r.checks)) return null;
  const statusCode = num(r.page.statusCode);
  if (statusCode === undefined) return null;
  const checks: SeoCheck[] = r.checks.flatMap((c) => {
    if (!isObj(c) || !str(c.id) || !str(c.status)) return [];
    const value = typeof c.value === "string" || typeof c.value === "number" ? String(c.value) : undefined;
    return [{ id: c.id as string, status: c.status as string, ...(value !== undefined ? { value } : {}) }];
  });
  const page = pick<Omit<SeoCheckerResult["page"], "statusCode">>(r.page, {
    title: str,
    titleLength: num,
    metaDescription: str,
    metaDescriptionLength: num,
    h1: (v) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined),
    h2Count: num,
    wordCount: num,
    canonical: str,
    robotsDirective: str,
    isHttps: bool,
    viewport: bool,
    hasSchema: bool,
    hasOpenGraph: bool,
    hreflangCount: num,
    imagesTotal: num,
    imagesMissingAlt: num,
    internalLinks: num,
    externalLinks: num,
    pageSizeBytes: num,
    loadTimeMs: num,
  });
  const score = num(r.score);
  return {
    url,
    fetchedAt,
    ...(score !== undefined ? { score: Math.max(0, Math.min(100, score)) } : {}),
    page: { statusCode, ...page },
    checks,
  };
}

function parseAuthority(r: Obj): AuthorityResult | null {
  const domain = str(r.domain);
  const fetchedAt = str(r.fetchedAt);
  if (!domain || !fetchedAt) return null;
  const authority = isObj(r.authority)
    ? pick<AuthorityResult["authority"]>(r.authority, {
        score: num,
        backlinks: num,
        referringDomains: num,
        referringMainDomains: num,
        dofollowBacklinkShare: num,
        spamScore: num,
        firstSeen: str,
      })
    : undefined;
  // The report is the link figures. An answer without them has nothing to
  // show; that includes a pre-2026-10-01 answer whose link half failed.
  if (!authority || Object.keys(authority).length === 0) return null;
  return { domain, fetchedAt, authority };
}

const INTENTS: readonly KeywordIntent[] = ["informational", "navigational", "commercial", "transactional"];

function parseKeywords(r: Obj): KeywordsResult | null {
  const seed = str(r.seed);
  const country = str(r.country);
  const fetchedAt = str(r.fetchedAt);
  if (!seed || !country || !fetchedAt || !Array.isArray(r.items)) return null;
  const items: KeywordRow[] = r.items.flatMap((row) => {
    if (!isObj(row) || !str(row.keyword)) return [];
    return [
      {
        keyword: row.keyword as string,
        ...pick<Omit<KeywordRow, "keyword">>(row, {
          volume: num,
          cpc: num,
          competition: num,
          difficulty: num,
          intent: (v) => (INTENTS.includes(v as KeywordIntent) ? (v as KeywordIntent) : undefined),
        }),
      },
    ];
  });
  const language = str(r.language);
  return { seed, country, ...(language ? { language } : {}), fetchedAt, items };
}

/**
 * Validate a success body's `result` for `tool`. Returns `null` when a field
 * the report cannot do without is missing or of the wrong type.
 */
export function parseToolResult<T extends ToolId>(tool: T, result: unknown): ToolResultMap[T] | null {
  if (!isObj(result)) return null;
  switch (tool) {
    case "seo-checker":
      return parseSeoChecker(result) as ToolResultMap[T] | null;
    case "authority":
      return parseAuthority(result) as ToolResultMap[T] | null;
    case "keywords":
      return parseKeywords(result) as ToolResultMap[T] | null;
    default:
      return null;
  }
}

/**
 * Interpret a route response for the UI. Falls back on the status when the
 * body is missing or unexpected (a Vercel edge error page, a timeout), so the
 * visitor always gets one of the five translated error states. A 200 whose
 * result fails validation is `unavailable`: from the visitor's side the
 * checker did not produce a usable answer.
 */
export function parseToolResponse<T extends ToolId>(tool: T, status: number, body: unknown): ToolOutcome<T> {
  const b = (isObj(body) ? body : {}) as { ok?: unknown; error?: unknown; result?: unknown; cached?: unknown };
  if (status === 200 && b.ok === true) {
    const result = parseToolResult(tool, b.result);
    return result ? { ok: true, result, cached: b.cached === true } : { ok: false, error: "unavailable", status };
  }
  if (typeof b.error === "string" && (KNOWN_ERRORS as readonly string[]).includes(b.error)) {
    return { ok: false, error: b.error as ToolErrorCode, status };
  }
  const byStatus: ToolErrorCode =
    status === 400 ? "invalid_input" : status === 429 ? "rate_limited" : status === 502 ? "upstream" : "unavailable";
  return { ok: false, error: byStatus, status };
}

/** Whether `value` is one of the countries the tools serve; used to label a result's market. */
export function isKnownCountry(value: string): value is (typeof TOOL_COUNTRIES)[number] {
  return (TOOL_COUNTRIES as readonly string[]).includes(value);
}
