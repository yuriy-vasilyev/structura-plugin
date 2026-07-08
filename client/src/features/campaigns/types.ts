import type { ReferralLink } from "@structura/types";

import { SeoOptimizationRules, SUPPORTED_BLOCK_TYPE } from "@/features/settings";

export type JobStatus = "pending" | "generating" | "published" | "failed";

/**
 * The strategic objective driving content generation for this campaign.
 * Mirrors CampaignMode in packages/types and functions/src/types.
 */
export type CampaignMode = "traffic_magnet" | "quick_wins" | "conversion" | "authority";

export interface Job {
  id: number;
  campaign_id: number;
  campaign_name: string;
  model_slug: string;
  // String for v2 Firestore nanoid personas, number for legacy WP
  // post-id personas, null when the job's campaign has no persona
  // binding. The field isn't consumed by any current renderer
  // (JobTable + ActiveQueue both ignore it) — typed correctly here
  // for hygiene so any future consumer doesn't silently mishandle
  // the nanoid shape.
  persona_id: string | number | null;
  generate_images: boolean;
  topic: string;
  status: JobStatus;
  error: string;
  date: string;
  timestamp: number;
  formatted_date: string | null;
}

/**
 * DOMAIN CLUSTERS
 */
export interface CampaignIdentity {
  name: string;
  objective: string; // renamed from 'topic' for clarity
  /** Strategic angle that shapes content generation. */
  campaignMode?: CampaignMode;
  /**
   * Single-post focus keyphrase picked in the "Generate a Post" SEO Targeting
   * section (a real DFS long-tail, or the user's own phrase). Drives the post's
   * target keyword. Only used on the single-post flow — campaigns round-robin a
   * keyword bank instead — so it's optional and absent everywhere else.
   */
  focusKeyphrase?: string;
}

export type AIProvider = "gemini" | "openai" | "anthropic";

export interface CampaignIntelligence {
  /** @deprecated Use textProvider. Kept for backward compat with existing campaigns. */
  provider?: AIProvider;
  /** The provider used for text generation. */
  textProvider: AIProvider;
  /** The provider used for image generation. */
  imageProvider: AIProvider;
  textModel: string;
  imageModel: string;
  /**
   * Optional per-campaign safety net — on a transient (429 / 5xx / timeout)
   * failure the cloud retries the call through this provider once before
   * surfacing the error.
   *
   * `null` (or missing on older campaigns) → no fallback attempted.
   * Must differ from `textProvider` (enforced by the validator) so the
   * fallback actually buys us provider diversity.
   *
   * Added in 1.16.0. Optional so existing campaigns keep their original
   * "no fallback" behavior until the user opts in.
   */
  fallbackTextProvider?: AIProvider | null;
  /** Image-side counterpart of `fallbackTextProvider`. Same rules apply. */
  fallbackImageProvider?: AIProvider | null;
  /**
   * Persona id. Post-2026-05-01 cloud personas use nanoid string ids
   * (e.g. "4r9TBGo0Pj_RDioJQGyib"); legacy WP-stored personas use
   * numeric ids (e.g. 10). The form keeps the value in whichever
   * shape the API returned — `Number()`-ing a nanoid yields `NaN`
   * and breaks `<Select>` round-tripping (the Persona dropdown
   * silently shows its placeholder after every selection — Yurii
   * report 2026-05-01).
   *
   * `"random"` is the always-available sentinel for "no specific
   * persona, pick one each run."
   */
  personaId: string | number | "random";
  language: string;
  postLength: number;
  replaceLongDashes: boolean;
  disableEmojis: boolean;
  seoRules: SeoOptimizationRules;
}

/**
 * WP post status a campaign writes generated posts to.
 *
 *   - `publish` — auto-publish the post (default; matches historical
 *     behavior when the `structura_post_status` global option existed)
 *   - `draft`   — save as a draft; the reviewer opens it in wp-admin later
 *   - `pending` — send for moderation review (the WP "Pending Review" state)
 *
 * Lives on the Structure cluster because it shapes the output shell — it's
 * analogous to "enabled blocks" and "disclosure", not to intelligence knobs
 * like language or post length.
 */
export type CampaignPostStatus = "publish" | "draft" | "pending";

export interface CampaignStructure {
  enabledBlocks: SUPPORTED_BLOCK_TYPE[];
  featuredImage: boolean;
  bodyImages: boolean;
  disclosure: {
    enabled: boolean;
    text: string;
  };
  /**
   * Client referral / partner links woven into topically relevant posts.
   * Seeded from the site-level list; edited per campaign. Optional during
   * rollout — older plugins omit it. @since 2.12.0
   */
  referralLinks?: ReferralLink[];
  /**
   * Per-campaign default for the WP post_status Task_Runner writes new posts
   * with. Restored after commit 8ad567586 removed the global
   * `structura_post_status` option from Settings; moving it to the campaign
   * shape means agencies running many campaigns on one site can split review
   * workflows per campaign (e.g. drafts for the blog, auto-publish for the
   * release announcements stream).
   */
  postStatus: CampaignPostStatus;
}

export interface CampaignTaxonomy {
  categories: {
    mode: "auto" | "restricted" | "disabled";
    list: number[];
  };
  tags: {
    mode: "auto" | "restricted" | "disabled";
    list: number[];
  };
}

export interface CampaignSchedule {
  cron: string;
  endCondition: {
    type: "infinite" | "quota" | "date";
    value: string | number;
  };
  /**
   * Phase 1.6 — when true, scheduled cron ticks consume a pre-generated
   * stock entry instead of running synchronous AI synthesis. ~50% AI
   * cost savings (Batch tier discount), ~100-300ms publish latency.
   * Run Now still runs synchronously regardless of this flag (since
   * the user clicked "now" they expect now). Default true on creation
   * for managed tiers; default true on creation for BYOK too (the
   * user can opt out via the toggle on the schedule step). Existing
   * campaigns default to false until the user opts in via the
   * settings page (Phase 1.7 migration).
   */
  pregenerationEnabled: boolean;
}

/**
 * Attention signal overlaid on a campaign row when the progress-stream
 * feature is on AND the campaign has an unacknowledged failed or
 * warning run. Written by the plugin's REST bridge from the shared
 * site-transient cache of attention runs — see
 * `Rest_Api::attention_runs_by_campaign()`.
 *
 * Absence means "no attention items" (not "we don't know"). A cold
 * site-transient cache will also return absent; in that case the
 * next campaign-list refetch will carry the signal once the cache
 * has been warmed by any other surface (banner / dashboard widget).
 *
 * Added in 1.20.0 alongside specs/plugin-quiet-mode.md §5.6.
 * Optional because (a) the feature flag can be off and (b) older
 * plugin builds won't carry the field at all.
 */
export interface CampaignLastRunSignal {
  runId: string;
  /** Matches the cloud's `RunStatus` enum — we accept both to avoid coupling. */
  status: "failed" | "succeeded_with_warnings" | string;
  /** ISO-8601 UTC timestamp, or "" when the cloud didn't set it. */
  endedAt: string;
  /** Cloud-curated headline copy for the failing step (may be empty). */
  headline: string;
  /** Only populated on `failed`; the user-facing error message. */
  errorMessage: string;
}

/**
 * THE UNIFIED CAMPAIGN
 */
export interface Campaign {
  id: string | number;
  status: "active" | "paused" | "completed";
  identity: CampaignIdentity;
  intelligence: CampaignIntelligence;
  structure: CampaignStructure;
  taxonomy: CampaignTaxonomy;
  schedule: CampaignSchedule;
  authority?: CampaignAuthority;
  keywords?: CampaignKeywords;
  stats: {
    postsPublished: number;
    /**
     * Posts created (any status), including drafts awaiting review. Always
     * >= postsPublished. Optional for back-compat with older plugin/cloud
     * builds; readers fall back to `postsPublished` when absent.
     */
    postsCreated?: number;
    nextRun: string;
  };
  /**
   * ISO 8601 timestamp of when the campaign was created, normalized from
   * the cloud's Firestore `createdAt` by the plugin's
   * `Campaign_Shape_Transformer::cloud_to_wp`. Optional for back-compat:
   * absent when the plugin build predates the field, or when the campaign
   * is read from a legacy WP-meta path that has no creation timestamp.
   */
  createdAt?: string;
  /**
   * Unacknowledged-attention signal for this campaign's most recent
   * failed/warning run. Optional — absent when there's nothing to
   * surface, or when the progress-stream feature flag is off on this
   * site, or when the plugin build is older than 1.20.0.
   */
  lastRun?: CampaignLastRunSignal;
}

/**
 * KEYWORD BANK
 */
export interface BankKeyword {
  keyword: string;
  source: "related_search" | "people_also_ask" | "ai_generated" | "manual";
  volume?: "high" | "medium" | "low";
  /**
   * Real monthly search volume from DataForSEO (provider discovery path),
   * merged onto the keyword at discovery time from the response's metrics
   * map. Display-only; absent for the legacy LLM path and manual adds.
   */
  volumeNumber?: number;
  usageCount: number;
}

export interface CampaignKeywords {
  bank: BankKeyword[];
  discoveredAt: string | null;
}

/**
 * AUTHORITY DISCOVERY
 */
export interface VettedAuthorityDomain {
  domain: string;
  description: string;
  tier: "universal" | "niche";
  citedBy: number;
  category: string;
  sampleUrls: string[];
}

export interface CampaignAuthority {
  domains: VettedAuthorityDomain[];
  discoveredAt: string | null;
}

// What the wizard actually works with. `createdAt` is a read-only,
// cloud-assigned timestamp (and a primitive, which would break the
// cluster-spread reducers in CampaignContext/draftStore), so it's not
// part of the editable form shape.
export type CampaignFormData = Omit<Campaign, "id" | "status" | "stats" | "createdAt">;
