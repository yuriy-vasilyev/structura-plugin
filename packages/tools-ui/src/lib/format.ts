/**
 * Number formatting for the tool result panels, locale-aware so a German
 * visitor sees "1.874" and a French one "1 874".
 */

/** Integer or decimal with locale grouping. */
export function formatNumber(value: number, locale: string, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

/** USD amount, e.g. "$4.62" / "4,62 $". For CPC only; the domain report's visits are not money. */
export function formatUsd(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

/** Share 0-1 as a percentage, e.g. "75 %". */
export function formatPercent(share: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(share);
}

/** A band's range for a legend: "1,000–9,999", "10,000+", "0" for a one-value band, or "60–100%" when `percent`. */
export function formatRange(range: { min: number; max?: number }, locale: string, percent = false): string {
  const min = formatNumber(range.min, locale);
  if (range.max === undefined) return `${min}+`;
  const max = percent ? formatPercent(range.max / 100, locale) : formatNumber(range.max, locale);
  return range.max === range.min ? max : `${min}–${max}`;
}

/** Bytes as KB or MB with one decimal. */
export function formatBytes(bytes: number, locale: string): string {
  const unit = bytes >= 1024 * 1024 ? "MB" : "KB";
  const value = unit === "MB" ? bytes / (1024 * 1024) : bytes / 1024;
  return `${formatNumber(value, locale, 1)} ${unit}`;
}

/**
 * Milliseconds as "33 ms" under a second, else seconds with one decimal
 * ("1.2 s"). Seconds alone turned a 33 ms load into "0 s" (QA 2026-10-02).
 */
export function formatDuration(ms: number, locale: string): string {
  const rounded = Math.round(ms);
  return rounded < 1000 ? `${formatNumber(rounded, locale)} ms` : `${formatNumber(ms / 1000, locale, 1)} s`;
}

/** ISO date (or timestamp) as a medium-length local date. */
export function formatDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(d);
}

/**
 * `{{key}}` substitution for the tool widgets. Same behaviour as
 * `interpolate` in www's `lib/i18n.ts`, repeated here because importing that
 * module from a client component ships every locale's dictionaries (and the
 * catalog) in the browser bundle: its module-level token table defeats
 * tree-shaking.
 */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => (key in vars ? String(vars[key]) : `{{${key}}}`));
}

/** The next 00:00 UTC after `now`: when the public tools' daily ledger resets. */
export function nextUtcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

/**
 * The public reset time as HH:MM in the visitor's time zone (or `timeZone`,
 * for tests), e.g. "02:00" in Berlin in summer. Computed in the browser: the
 * server does not know the visitor's zone.
 */
export function formatResetTime(now: Date, locale: string, timeZone?: string): string {
  return formatClockTime(nextUtcMidnight(now), locale, timeZone);
}

/** Whether `at` falls on a later calendar day than `now` in the visitor's time zone (or `timeZone`, for tests). */
export function isLaterDay(at: Date, now: Date, timeZone?: string): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
  const day = (d: Date) => {
    const p = Object.fromEntries(parts.formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };
  return day(at) > day(now);
}

/** `at` as HH:MM in the visitor's time zone (or `timeZone`, for tests). */
export function formatClockTime(at: Date, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(timeZone ? { timeZone } : {}),
  }).format(at);
}

/** A wait in seconds as m:ss, e.g. 95 -> "1:35". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Seconds from a `Retry-After` header (delta-seconds form, the only one our
 * route sends). Falls back to `fallback` when the header is missing or odd.
 */
export function retryAfterSeconds(header: string | null, fallback = 60): number {
  const n = header === null ? NaN : Number(header.trim());
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : fallback;
}
