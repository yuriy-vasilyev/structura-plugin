/**
 * Colour buckets and verdict bands for the tools' figures. Shared by the
 * result panels and pinned by `www/lib/__tests__/tools-helpers.test.ts`,
 * because a threshold that drifts in one panel and not another reads as a
 * bug to the visitor.
 *
 * Spec: specs/blogseo-gap-analysis.md §4.4 "Result panels", §4.11 (verdicts,
 * bands calibrated in specs/learn-hub-tool-metrics-research.md §6).
 */

/** Bucket for the SEO checker's 0-100 checklist score. */
export type ScoreBucket = "good" | "fair" | "poor";

/** >= 80 good, 50-79 fair, < 50 poor. */
export function scoreBucket(score: number): ScoreBucket {
  if (score >= 80) return "good";
  if (score >= 50) return "fair";
  return "poor";
}

/** Bucket for keyword difficulty, where LOWER is better for the visitor. */
export type DifficultyLevel = "easy" | "medium" | "hard";

/**
 * Highest KD that counts as easy: the green chip and the "KD 25 or less"
 * filter (§4.8.2) use the same line, so they can never disagree.
 */
export const EASY_KD_MAX = 25;

/** Lowest KD that counts as hard. */
export const HARD_KD_MIN = 60;

/** KD 0-25 easy, 26-59 medium, >= 60 hard; the same cut-offs the page copy states. */
export function difficultyLevel(kd: number): DifficultyLevel {
  if (kd <= EASY_KD_MAX) return "easy";
  if (kd < HARD_KD_MIN) return "medium";
  return "hard";
}

/* ─── Verdicts (§4.11) ───────────────────────────────────────────── */

/**
 * A verdict chip's colour and icon. `neutral` names a size or a stage, which
 * only means something next to competitors; `unknown` is a figure the
 * source did not report.
 */
export type VerdictIntent = "good" | "warn" | "bad" | "neutral" | "unknown";

/** What a figure's chip says: its band, the chip's intent, and whether it asks for work. */
export interface Verdict<B extends string> {
  /** The band key, which the surface's copy is keyed on. */
  readonly band: B;
  /** Colour and icon of the chip. */
  readonly intent: VerdictIntent;
  /** The figure gets a "How to improve" Learn link. */
  readonly action: boolean;
}

/** No band: the source did not report the figure. Never zero. */
export type NotMeasured = "notMeasured";

/** No band: the domain has no backlinks, so link quality has nothing to measure. */
export type NoLinks = "noLinks";

const NOT_MEASURED: Verdict<NotMeasured> = { band: "notMeasured", intent: "unknown", action: false };
const NO_LINKS: Verdict<NoLinks> = { band: "noLinks", intent: "neutral", action: false };

/** One step of a scale: its key and the lowest value it covers, up to the next step's minimum. */
export interface Bucket<K extends string> {
  readonly key: K;
  readonly min: number;
}

/** A {@link Bucket} that is a verdict: with its chip's intent and whether it asks for work. */
export interface Band<K extends string> extends Bucket<K> {
  readonly intent: VerdictIntent;
  readonly action: boolean;
}

/** The last step whose minimum `value` reaches; below the first, the first. */
function bucketOf<B extends Bucket<string>>(steps: readonly B[], value: number): B {
  return steps.reduce((hit, step) => (value >= step.min ? step : hit), steps[0]!);
}

function verdictOf<K extends string>(bands: readonly Band<K>[], value: number): Verdict<K> {
  const { key, intent, action } = bucketOf(bands, value);
  return { band: key, intent, action };
}

/**
 * Each step's inclusive range, for legends: up to the next step's minimum
 * minus one. The last step runs to `top`, or is open-ended without one.
 */
export function bandRanges<K extends string>(
  steps: readonly Bucket<K>[],
  top?: number,
): Array<{ key: K; min: number; max?: number }> {
  return steps.map((step, i) => {
    const max = i + 1 < steps.length ? steps[i + 1]!.min - 1 : top;
    return max === undefined ? { key: step.key, min: step.min } : { key: step.key, min: step.min, max };
  });
}

/** A 0-1 share as the whole percent the report prints; the dofollow band reads this same number. */
export function wholePercent(share: number): number {
  return Math.round(share * 100);
}

/** Stage of the domain rank's link profile. */
export type RankStage = "early" | "typical" | "established" | "major";

/**
 * Domain rank stages, all neutral: the rank is log-scaled and relative, so a
 * 27 can be right for a young niche shop. Cut points are the calibration
 * sample's medians (research §6.2).
 */
export const RANK_STAGES: readonly Band<RankStage>[] = [
  { key: "early", min: 0, intent: "neutral", action: false },
  { key: "typical", min: 30, intent: "neutral", action: false },
  { key: "established", min: 45, intent: "neutral", action: false },
  { key: "major", min: 60, intent: "neutral", action: false },
];

/** The domain rank's stage, or not measured. */
export function rankVerdict(score: number | undefined): Verdict<RankStage | NotMeasured> {
  return score === undefined ? NOT_MEASURED : verdictOf(RANK_STAGES, Math.round(score));
}

/** Size of a referring (root) domain count. */
export type LinkProfileSize = "none" | "handful" | "small" | "established" | "major";

/** Referring and root domain sizes, all neutral: a count only means something next to competitors. */
export const LINK_PROFILE_SIZES: readonly Band<LinkProfileSize>[] = [
  { key: "none", min: 0, intent: "neutral", action: false },
  { key: "handful", min: 1, intent: "neutral", action: false },
  { key: "small", min: 100, intent: "neutral", action: false },
  { key: "established", min: 1_000, intent: "neutral", action: false },
  { key: "major", min: 10_000, intent: "neutral", action: false },
];

/** The size of a referring or root domain count, or not measured. */
export function referringVerdict(count: number | undefined): Verdict<LinkProfileSize | NotMeasured> {
  return count === undefined ? NOT_MEASURED : verdictOf(LINK_PROFILE_SIZES, count);
}

/** Band of the dofollow share. */
export type DofollowBand = "low" | "mixed" | "good";

/**
 * Dofollow share bands in whole percent. Never bad: the metric is noisy, and
 * a mostly nofollow profile is typical of directories, not a penalty
 * (research §6.2).
 */
export const DOFOLLOW_BANDS: readonly Band<DofollowBand>[] = [
  { key: "low", min: 0, intent: "warn", action: true },
  { key: "mixed", min: 30, intent: "neutral", action: true },
  { key: "good", min: 60, intent: "good", action: false },
];

/** The dofollow share's band (`share` 0-1): no links yet with 0 backlinks, else not measured when absent. */
export function dofollowVerdict(
  share: number | undefined,
  backlinks: number | undefined,
): Verdict<DofollowBand | NoLinks | NotMeasured> {
  if (backlinks === 0) return NO_LINKS;
  return share === undefined ? NOT_MEASURED : verdictOf(DOFOLLOW_BANDS, wholePercent(share));
}

/** Band of the spam score, where lower is better. */
export type SpamBand = "low" | "medium" | "high";

/** DataForSEO's published spam score bands (research §6.2). */
export const SPAM_BANDS: readonly Band<SpamBand>[] = [
  { key: "low", min: 0, intent: "good", action: false },
  { key: "medium", min: 31, intent: "warn", action: true },
  { key: "high", min: 61, intent: "bad", action: true },
];

/** The spam score's band: no links yet with 0 backlinks, else not measured when absent. */
export function spamVerdict(
  score: number | undefined,
  backlinks: number | undefined,
): Verdict<SpamBand | NoLinks | NotMeasured> {
  if (backlinks === 0) return NO_LINKS;
  return score === undefined ? NOT_MEASURED : verdictOf(SPAM_BANDS, Math.round(score));
}

const SEO_INTENT: Record<ScoreBucket, VerdictIntent> = { good: "good", fair: "warn", poor: "bad" };

/** The SEO score's verdict, from the rounded score the report prints, or not measured. */
export function seoVerdict(score: number | undefined): Verdict<ScoreBucket | NotMeasured> {
  if (score === undefined) return NOT_MEASURED;
  const band = scoreBucket(Math.round(score));
  return { band, intent: SEO_INTENT[band], action: band !== "good" };
}

/** Size word for a monthly search volume. */
export type VolumeSize = "nearZero" | "low" | "moderate" | "high" | "veryHigh";

/**
 * Volume size words, in Google Ads' buckets: 11-19 cannot occur, and 100
 * counts as moderate. A size, not a verdict: low volume is not bad.
 */
export const VOLUME_SIZES: readonly Bucket<VolumeSize>[] = [
  { key: "nearZero", min: 0 },
  { key: "low", min: 11 },
  { key: "moderate", min: 100 },
  { key: "high", min: 1_000 },
  { key: "veryHigh", min: 10_000 },
];

/** The size word for a monthly search volume. */
export function volumeSize(volume: number): VolumeSize {
  return bucketOf(VOLUME_SIZES, volume).key;
}
