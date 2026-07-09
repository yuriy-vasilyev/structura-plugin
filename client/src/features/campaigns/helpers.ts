import { CampaignFormData, CampaignPostStatus } from "@/features/campaigns/types";
import { DEFAULT_CAMPAIGN_FORM_DATA } from "@/features/campaigns/constants";
import { CONTENT_BLOCKS } from "@/features/settings/constants";
import type { SeoOptimizationRules } from "@/features/settings/types";

/**
 * Coerce any persisted / wire post-status value to the two we support.
 * "pending" was removed 2026-07-09 (WP treated it as a draft), so a
 * legacy campaign persisted with "pending" — or any unrecognized value —
 * reads back as "draft" rather than selecting a now-missing option or
 * being mislabelled as published.
 */
export const normalizePostStatus = (value: unknown): CampaignPostStatus =>
  value === "publish" ? "publish" : "draft";

/**
 * All six user-toggleable SEO rules in `SeoRuleName` are Pro-gated in
 * the GeneratePostPage / campaign-wizard UI (each renders as a
 * `LockedFeature` for non-paid tiers). The shipped DEFAULT_SEO_RULES
 * pre-fills them all to `true` for Pro, but for None/Free tiers we
 * suppress them so the form doesn't quietly send `true` for rules the
 * user can't toggle.
 *
 * Why this matters beyond cosmetics: `outbound_link_authority` (and
 * the two other Pro SERP rules) trigger paid Serper.dev / Jina API
 * calls inside `gatherResearch` BEFORE the cloud's tier-gate in the
 * instruction builder runs. Sending the rule as `true` from a None-
 * or Free-tier install meant every single-post run burned a SERP
 * fetch the prompt was going to discard anyway. Yurii incident
 * 2026-05-10: an anonymous run logged "SERP fetch triggered" with
 * `activeRules: ["outbound_link_authority"]` despite that rule being
 * Pro-only. The cloud gates this defensively too — see
 * `functions/src/scheduler/helpers.ts` — but stripping it here is the
 * source-of-truth fix.
 */
const NO_SEO_RULES: SeoOptimizationRules = {
  include_faq_section: false,
  include_action_steps: false,
  include_statistics: false,
  number_in_title: false,
  internal_link_optimization: false,
  outbound_link_authority: false,
  eeat_signals: false,
  entity_coverage: false,
};

/**
 * Returns a CampaignFormData pre-filled with sensible defaults for the user's
 * license tier.
 *
 * Historically this function gated specific SEO rules (keyphrase density,
 * passive voice, etc.) behind Pro. That logic has moved server-side — the
 * cloud now unions its `ALWAYS_ON_RULES_BY_TIER` map with whatever the plugin
 * sends, so the client only needs to set the small set of *user-toggleable*
 * structural rules (FAQ, Action Steps, statistics, etc.). The tier gate now
 * only influences block availability, image defaults, and which structural
 * rules are pre-filled (Pro-locked rules stay off for None/Free).
 */
export const getCampaignFormDataForLicense = ({
  isPaidLicense,
  isLicensed,
}: {
  isPaidLicense: boolean | undefined;
  isLicensed: boolean;
}): CampaignFormData => {
  if (isLicensed && !isPaidLicense) {
    // Free tier — restrict to non-Pro blocks, enable featured image only.
    // Pre-generation is also a Pro-only feature: the cloud's stock
    // refill keys every slot off the keyword bank (Pro-locked too), so
    // a Free campaign with `pregenerationEnabled: true` would just sit
    // forever with `keyword_bank_empty` — wedging the chip and hiding
    // any signal that something's expected to happen. Defaulting to
    // `false` here matches the locked `<PregenerationStrip>` UI in the
    // wizard so the form state and the rendered surface stay in sync.
    //
    // postLength defaults to 500 to mirror the server-side cap in
    // `functions/src/ai/instruction-builder.ts` (cloud clamps anything
    // higher to 500 for `plan: "free"`). Pre-fill the form at the
    // ceiling so the value the user sees matches the post they'll get
    // — otherwise they'd pick 2700 in the slider and silently receive
    // ~500 words.
    return {
      ...DEFAULT_CAMPAIGN_FORM_DATA,
      intelligence: {
        ...DEFAULT_CAMPAIGN_FORM_DATA.intelligence,
        seoRules: NO_SEO_RULES,
        postLength: 500,
      },
      schedule: {
        ...DEFAULT_CAMPAIGN_FORM_DATA.schedule,
        pregenerationEnabled: false,
      },
      structure: {
        ...DEFAULT_CAMPAIGN_FORM_DATA.structure,
        enabledBlocks: CONTENT_BLOCKS.filter((block) => !block.isPro).map((block) => block.name),
        featuredImage: true,
      },
    };
  }

  if (isPaidLicense) {
    // Pro/Cloud tier — all blocks available, body images on.
    return {
      ...DEFAULT_CAMPAIGN_FORM_DATA,
      structure: {
        ...DEFAULT_CAMPAIGN_FORM_DATA.structure,
        enabledBlocks: CONTENT_BLOCKS.filter((block) => !block.defaultOff).map(
          (block) => block.name
        ),
        featuredImage: true,
        bodyImages: true,
      },
    };
  }

  // None tier (anonymous shadow workspace) — same Pro-rule suppression
  // as Free, plus no images by default (None can't generate them).
  // postLength is capped at 500 to match the cloud-side clamp in
  // `instruction-builder.ts` (anonymous resolves to `plan: "free"`,
  // which the clamp gates on). Free already pre-fills 500 above; None
  // needs the same default so the /generate one-time form doesn't show
  // 1700 in the input and silently produce a ~500-word post.
  return {
    ...DEFAULT_CAMPAIGN_FORM_DATA,
    intelligence: {
      ...DEFAULT_CAMPAIGN_FORM_DATA.intelligence,
      seoRules: NO_SEO_RULES,
      postLength: 500,
    },
  };
};
