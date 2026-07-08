import { __ } from "@wordpress/i18n";
import type {
  BankKeyword,
  Campaign,
  CampaignPostStatus,
  CampaignTaxonomy,
  JobStatus,
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
      return __("Draft", "structura");
    case "pending":
      return __("Pending review", "structura");
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
