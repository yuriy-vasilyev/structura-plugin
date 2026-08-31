/**
 * Shared formatting for Google Search Console performance numbers — ONE
 * implementation so the portal panel and the wp-admin section always agree
 * on how a metric reads (spec: specs/gsc-integration.md §7).
 *
 * Everything returns data, not copy: translated words ("better"/"worse",
 * unit labels) are the caller's job, because the two SPAs use different
 * i18n systems. Locale-aware digits go through `Intl.NumberFormat`.
 */

/** Clicks/impressions, compact above 10k (`48.9k`, `1.2M`), locale digits below. */
export function formatMetricCount(value: number, locale: string): string {
  if (Math.abs(value) >= 10_000) {
    return new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat(locale).format(value);
}

/** CTR from the wire's 0..1 fraction → localized percent, one decimal. */
export function formatCtr(fraction: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(fraction);
}

/** Average position, one decimal (`8.4`). 0 impressions → em dash. */
export function formatPosition(position: number, locale: string): string {
  if (position <= 0) return "—";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(position);
}

/**
 * Tone + direction of a count delta (clicks/impressions). `flat` for small
 * moves so week-to-week noise on low-traffic sites doesn't read as
 * green/red drama (design handoff: delta chips).
 */
export interface CountDelta {
  tone: "good" | "bad" | "flat";
  /** Formatted `+18%` / `−12%` string, or null when the base is too small to be meaningful. */
  label: string | null;
}

const FLAT_THRESHOLD = 0.05;
const MIN_BASE = 10;

export function countDelta(
  current: number,
  previous: number,
  locale: string,
): CountDelta {
  if (previous < MIN_BASE) return { tone: "flat", label: null };
  const ratio = (current - previous) / previous;
  const label = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
    signDisplay: "always",
  }).format(ratio);
  if (Math.abs(ratio) < FLAT_THRESHOLD) return { tone: "flat", label };
  return { tone: ratio > 0 ? "good" : "bad", label };
}

/**
 * Position delta. LOWER IS BETTER — this returns goodness, never a signed
 * number, so no caller can accidentally render "position +2.1" in green
 * (the exact misread the design brief warns about). Callers translate
 * `direction` into words ("2.1 better" / "1.4 worse").
 */
export interface PositionDelta {
  direction: "better" | "worse" | "flat";
  /** Localized absolute magnitude, one decimal (`"2.1"`), null when flat/unknown. */
  magnitude: string | null;
}

const POSITION_FLAT_THRESHOLD = 0.3;

export function positionDelta(
  current: number,
  previous: number,
  locale: string,
): PositionDelta {
  if (current <= 0 || previous <= 0) return { direction: "flat", magnitude: null };
  const change = previous - current; // positive = moved up = better
  if (Math.abs(change) < POSITION_FLAT_THRESHOLD) {
    return { direction: "flat", magnitude: null };
  }
  return {
    direction: change > 0 ? "better" : "worse",
    magnitude: new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(Math.abs(change)),
  };
}
