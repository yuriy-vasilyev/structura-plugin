import { __, sprintf } from "@wordpress/i18n";
import { contentLanguageLabel } from "@structura/i18n-contracts";
import type {
  ContentLanguagePickerLabels,
  SetupRationaleIcon,
  SetupRationaleItem,
} from "@structura/ui";
import type {
  BankKeyword,
  Campaign,
  CampaignPostStatus,
  CampaignTaxonomy,
  JobStatus,
  SetupRationale,
  SetupRationaleCode,
} from "./types";

/**
 * Central home for enum-to-label translation inside the campaigns feature.
 *
 * Raw enum values (`"active"`, `"publish"`, `"auto"`, `"high"`) are the
 * authoritative keys the plugin REST API and the wizard form both carry —
 * they MUST NOT be replaced with translated strings on write. These helpers
 * exist purely for read-side rendering so that badges, pills, and summary
 * cards display in the user's locale instead of hard-coded English.
 *
 * Whenever you add a new enum variant at the source (see `./types.ts`),
 * extend the matching switch here too; the `default` branches fall back to
 * the raw value so the UI degrades gracefully during a release window where
 * the cloud knows a new variant the plugin hasn't shipped yet.
 */

// ─── Campaign status ────────────────────────────────────────────────────────

export const campaignStatusLabel = (status: Campaign["status"] | string): string => {
  switch (status) {
    case "active":
      return __("Active", "structura");
    case "paused":
      return __("Paused", "structura");
    case "completed":
      return __("Completed", "structura");
    default:
      return String(status);
  }
};

// ─── WP post status (publish / draft / pending) ─────────────────────────────

/**
 * Labels the per-campaign WP post status AND the stock WP statuses we might
 * see on recently-generated posts in dashboards. Covers the authoritative
 * three from `CampaignPostStatus` plus common WP values that may arrive from
 * listing endpoints (`future`, `private`, `trash`).
 */
export const postStatusLabel = (status: CampaignPostStatus | string): string => {
  switch (status) {
    case "publish":
      return __("Published", "structura");
    case "draft":
    // "pending" was removed as a campaign option (2026-07-09); a legacy
    // persisted value reads as a draft (which is how WP treated it).
    case "pending":
      return __("Draft", "structura");
    case "future":
      return __("Scheduled", "structura");
    case "private":
      return __("Private", "structura");
    case "trash":
      return __("Trash", "structura");
    default:
      return String(status);
  }
};

// ─── Active-queue job status ────────────────────────────────────────────────

export const jobStatusLabel = (status: JobStatus | string): string => {
  switch (status) {
    case "pending":
      return __("Pending", "structura");
    case "generating":
      return __("Generating", "structura");
    case "published":
      return __("Published", "structura");
    case "failed":
      return __("Failed", "structura");
    default:
      return String(status);
  }
};

// ─── Taxonomy governance mode ───────────────────────────────────────────────

type TaxonomyMode = CampaignTaxonomy["categories"]["mode"];

export const taxonomyModeLabel = (mode: TaxonomyMode | string): string => {
  switch (mode) {
    case "auto":
      return __("Auto", "structura");
    case "restricted":
      return __("Restricted", "structura");
    case "disabled":
      return __("Disabled", "structura");
    default:
      return String(mode);
  }
};

// ─── Keyword volume pill ────────────────────────────────────────────────────

type KeywordVolume = NonNullable<BankKeyword["volume"]>;

export const keywordVolumeLabel = (volume: KeywordVolume | string): string => {
  switch (volume) {
    case "high":
      return __("High", "structura");
    case "medium":
      return __("Medium", "structura");
    case "low":
      return __("Low", "structura");
    default:
      return String(volume);
  }
};

// ─── Campaign language picker ───────────────────────────────────────────────

/**
 * Every translatable string `<ContentLanguagePicker>` renders. The primitive
 * lives in `@structura/ui`, which has no i18n runtime, so each surface hands
 * it its own strings — these are wp-admin's.
 */
export const contentLanguagePickerLabels = (): ContentLanguagePickerLabels => ({
  alsoOnSite: __("Also on your site", "structura"),
  supported: __("Supported", "structura"),
  other: __("Other…", "structura"),
  otherCaption: __("More languages", "structura"),
  allWordPressLanguages: __("More languages", "structura"),
  searchPlaceholder: __("Search languages…", "structura"),
  noMatches: (query: string) =>
    sprintf(
      /* translators: %s is the text the user typed into the language search. */
      __("No language matches “%s”.", "structura"),
      query,
    ),
  searchCount: (matched: number, total: number) =>
    sprintf(
      /* translators: 1: languages matching the search. 2: languages in the list. */
      __("%1$d of %2$d", "structura"),
      matched,
      total,
    ),
  backToSupported: __("Back to the supported list", "structura"),
  aiOnlyNote: (languageName: string) =>
    sprintf(
      /* translators: %s is a language name, e.g. "Polish". */
      __(
        "Search-volume data isn't available for %s yet. Topics come from AI research instead.",
        "structura",
      ),
      languageName,
    ),
  pickSupported: __("Pick a supported language", "structura"),
  aiOnlyReassurance: __(
    "Everything else works the same: discovery, rhythm, publishing.",
    "structura",
  ),
});

// ─── Setup rationale ────────────────────────────────────────────────────────

/** Which icon carries each coded reason — fixed by the design handoff. */
const RATIONALE_ICONS: Record<SetupRationaleCode, SetupRationaleIcon> = {
  language_from_site: "globe",
  language_ai_only: "info",
  approach_authority_low_footprint: "trending-up",
  approach_quick_wins_page_two: "trending-up",
  approach_conversion_objective: "target",
  approach_traffic_magnet_default: "trending-up",
  overlap_sibling_campaign: "layers",
  rhythm_shared_cadence: "calendar-clock",
  footprint_refreshed: "refresh-cw",
};

const rationaleSentence = (
  { code, params }: SetupRationale,
  uiLocale: string,
): string | null => {
  const languageName = () =>
    contentLanguageLabel(String(params?.language ?? ""), uiLocale);
  const count = () => Number(params?.count ?? 0);

  switch (code) {
    case "language_from_site":
      return sprintf(
        /* translators: %s is a language name, e.g. "German". */
        __("Writing in %s, your site's language.", "structura"),
        languageName(),
      );
    case "language_ai_only":
      return sprintf(
        /* translators: %s is a language name, e.g. "Polish". */
        __(
          "Search-volume data isn't available for %s yet. Topics come from AI research instead.",
          "structura",
        ),
        languageName(),
      );
    case "approach_authority_low_footprint":
      return __(
        "Your site ranks for few keywords so far, so this campaign builds topical authority first.",
        "structura",
      );
    case "approach_quick_wins_page_two":
      return sprintf(
        /* translators: %d is how many keywords currently rank on page 2. */
        __(
          "You have %d keywords on page 2. This campaign targets those first.",
          "structura",
        ),
        count(),
      );
    case "approach_conversion_objective":
      return __(
        "Your objective is commercial, so posts lead readers to your offer.",
        "structura",
      );
    case "approach_traffic_magnet_default":
      return __(
        "This campaign goes after the topics with the most search demand.",
        "structura",
      );
    case "overlap_sibling_campaign":
      return sprintf(
        /* translators: %s is another campaign's name. */
        __(
          "“%s” already covers similar ground. This campaign takes a different angle.",
          "structura",
        ),
        String(params?.name ?? ""),
      );
    case "rhythm_shared_cadence":
      return sprintf(
        /* translators: %d is the site's combined weekly post count. */
        __(
          "Together with your other campaigns this site publishes %d posts a week.",
          "structura",
        ),
        count(),
      );
    case "footprint_refreshed":
      return sprintf(
        /* translators: %d is how many keywords the site now ranks for. */
        __(
          "Your site now ranks for %d keywords. Keyword difficulty for this campaign was raised.",
          "structura",
        ),
        count(),
      );
    default:
      // A code the cloud knows and this build doesn't: say nothing rather
      // than render a raw enum at the user (§10 release window).
      return null;
  }
};

/**
 * Turn the campaign's coded rationale into the icon + sentence pairs
 * `<SetupRationaleStrip>` renders. Unknown codes are dropped.
 */
export const setupRationaleItems = (
  rationale: SetupRationale[] | undefined,
  uiLocale: string,
): SetupRationaleItem[] =>
  (rationale ?? []).flatMap((entry) => {
    const text = rationaleSentence(entry, uiLocale);
    if (!text) return [];
    return [{ icon: RATIONALE_ICONS[entry.code] ?? "info", text, key: entry.code }];
  });
