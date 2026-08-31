import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { __, sprintf } from "@wordpress/i18n";
import { toast } from "@structura/ui";
import { campaignKeys, jobKeys } from "./keys";
import { progressKeys } from "@/features/progress/api/keys";
import { BankKeyword, CampaignFormData, KeywordDiscoveryMeta, VettedAuthorityDomain } from "@/features/campaigns";
import { capture } from "@/lib/posthog";
import { buildPortalSignupUrl } from "@/utils/portalLinks";

/**
 * URL the "Contact us" CTA opens when a user hits their per-tier
 * campaign cap. Lives here (not in `@/constants`) because it's the
 * only consumer today; promote when a second consumer needs it.
 *
 * Spec §1.0l: "Contact us" is the v1 escape hatch for users who
 * legitimately need more campaigns than their tier allows. Phase 2
 * may add a Stripe-backed "extra campaigns" add-on, at which point
 * this CTA flips to a billing-portal link instead.
 */
const SUPPORT_URL = "https://www.structurawp.com/support";

/**
 * Shape of the structured error WordPress's apiFetch surfaces when
 * the cloud rejects with HTTP 403 + `error: "campaign_limit_reached"`.
 * The plugin's `Rest_Api::create_campaign_on_cloud()` propagates
 * `limit`, `current`, and `tier` through `WP_Error->error_data`, which
 * apiFetch lifts onto the rejected error's `data` field.
 */
interface CampaignLimitReachedError {
  code: "campaign_limit_reached";
  message: string;
  data?: {
    status?: number;
    limit?: number | null;
    current?: number | null;
    tier?: string | null;
  };
}

/**
 * True when a rejected mutation carries the cloud's `campaign_limit_reached`
 * code. Exported so the create wizard can react to a cap hit on launch —
 * reaching the cap from inside the create flow means a campaign already
 * exists, so the wizard closes to the list instead of stranding the user on
 * a summary step they can never successfully submit.
 */
export const isCampaignLimitReachedError = (
  err: unknown,
): err is CampaignLimitReachedError =>
  typeof err === "object" &&
  err !== null &&
  (err as { code?: unknown }).code === "campaign_limit_reached";

/**
 * Shape of the structured error surfaced when the cloud rejects a
 * create/update with HTTP 403 + `error: "cadence_limit_reached"` — the
 * Free tier's "1 post per week" cadence cap. The plugin propagates
 * `maxPerWeek`, `weeklyCount`, and `tier` through `WP_Error->error_data`.
 * Hit only by a stale SPA bundle on create, or by editing a flagged Free
 * campaign to an over-cap cadence (the picker is locked in the create
 * flow, so a current client rarely produces this).
 */
interface CadenceLimitReachedError {
  code: "cadence_limit_reached";
  message: string;
  data?: {
    status?: number;
    maxPerWeek?: number | null;
    weeklyCount?: number | null;
    tier?: string | null;
  };
}

const isCadenceLimitReachedError = (
  err: unknown,
): err is CadenceLimitReachedError =>
  typeof err === "object" &&
  err !== null &&
  (err as { code?: unknown }).code === "cadence_limit_reached";

/**
 * Sticky "you publish too often for this plan" toast with a Go Pro CTA
 * into the billing portal. Shared by the create + update mutations.
 */
const showCadenceLimitToast = (error: CadenceLimitReachedError) => {
  const maxPerWeek = error.data?.maxPerWeek ?? 1;
  const detail =
    maxPerWeek === 1
      ? __(
          "Your current plan publishes one post a week. Upgrade to publish more often.",
          "structura",
        )
      : sprintf(
          /* translators: %d is the plan's weekly post limit. */
          __(
            "Your current plan publishes up to %d posts a week. Upgrade to publish more often.",
            "structura",
          ),
          maxPerWeek,
        );
  toast.error(detail, {
    title: __("Publishing limit reached", "structura"),
    // 0 = sticky; the Go Pro CTA is the point of the toast.
    duration: 0,
    action: {
      label: __("Go Pro", "structura"),
      onClick: () => {
        window.open(
          buildPortalSignupUrl({
            intent: "unlock_cadence",
            domain:
              typeof window !== "undefined" ? window.location.hostname : undefined,
          }),
          "_blank",
          "noopener,noreferrer",
        );
      },
    },
  });
};

/**
 * Fallback schedule cluster for schedule-less snapshots.
 *
 * A single-post ("Generate post now") run stores an `inputSnapshot` with NO
 * `schedule` cluster (a one-off has no cron / end-condition). "Run again"
 * feeds that snapshot straight back through `flattenCampaign`, which used to
 * dereference `schedule.cron` and throw `Cannot read properties of undefined
 * (reading 'cron')` (2026-07-20). The `/post/generate` endpoint never reads
 * these cron/end fields, so a harmless default keeps the ad-hoc replay working
 * without affecting the create/update paths (which always carry a schedule).
 */
const SCHEDULE_FALLBACK: CampaignFormData["schedule"] = {
  cron: "",
  endCondition: { type: "infinite", value: 0 },
  pregenerationEnabled: true,
};

/**
 * ARCHITECT'S UTILITY: Flattening Logic
 * Converts the nested Domain clusters back into flat API parameters.
 *
 * Exported for the schedule-less-snapshot regression test — the "Run again"
 * path is the only caller that can pass a `CampaignFormData` with no schedule.
 */
export const flattenCampaign = (data: CampaignFormData) => {
  const { identity, intelligence, structure, taxonomy, authority, keywords, researchAttachments } =
    data;
  const schedule = data.schedule ?? SCHEDULE_FALLBACK;

  return {
    // Identity Cluster
    name: identity.name,
    topic: identity.objective,
    campaign_mode: identity.campaignMode,
    // Single-post focus keyphrase (SEO Targeting). Only present when the user
    // picked one; the plugin maps it to the ephemeral post's picked keyword.
    ...(identity.focusKeyphrase?.trim()
      ? { focus_keyphrase: identity.focusKeyphrase.trim() }
      : {}),

    // Intelligence Cluster — split providers (new) + legacy provider field (backward compat)
    text_provider: intelligence.textProvider,
    image_provider: intelligence.imageProvider,
    provider: intelligence.textProvider, // Legacy field for older cloud functions
    text_model: intelligence.textModel,
    image_model: intelligence.imageModel,
    // BYOK quality tier (top | mid) — sent ONLY when set so a tier-less
    // campaign never writes one and a partial save can't wipe a stored tier
    // (matches the plugin validator's omit-when-absent contract, §10). The
    // cloud prefers the tier over text_model/image_model at generation time.
    ...(intelligence.textTier ? { text_tier: intelligence.textTier } : {}),
    ...(intelligence.imageTier ? { image_tier: intelligence.imageTier } : {}),
    // Optional fallback providers — null/undefined means "no fallback".
    // Server-side validator rejects same-as-primary; we still let the payload
    // carry whatever the form has (client can't know server plan rules for
    // every edge case, so the server remains the source of truth).
    fallback_text_provider: intelligence.fallbackTextProvider ?? "",
    fallback_image_provider: intelligence.fallbackImageProvider ?? "",
    persona_id: intelligence.personaId,
    language: intelligence.language,
    post_length: intelligence.postLength,
    replace_long_dashes: intelligence.replaceLongDashes,
    disable_emojis: intelligence.disableEmojis,
    seo_optimization_rules: intelligence.seoRules,

    // Structure Cluster
    enabled_blocks: structure.enabledBlocks,
    enable_disclosure: structure.disclosure.enabled,
    disclosure_text: structure.disclosure.text,
    // Referral / partner links — always sent (even empty) so clearing the
    // list persists. The transformer sanitizes + drops URL-less rows.
    referral_links: structure.referralLinks ?? [],
    featured_image: structure.featuredImage,
    body_images: structure.bodyImages,
    // Per-campaign replacement for the removed global `structura_post_status`
    // option — Task_Runner reads this on each scheduled run to decide whether
    // to publish, save as draft, or mark the post pending review.
    post_status: structure.postStatus,

    // Taxonomy Cluster
    category_mode: taxonomy.categories.mode,
    allowed_categories: taxonomy.categories.list,
    tag_mode: taxonomy.tags.mode,
    allowed_tags: taxonomy.tags.list,

    // Schedule Cluster
    cron_schedule: schedule.cron,
    end_mode: schedule.endCondition.type,
    // Map the polymorphic value to the specific columns
    end_posts: schedule.endCondition.type === "quota" ? schedule.endCondition.value : 0,
    end_date: schedule.endCondition.type === "date" ? schedule.endCondition.value : "",
    // Phase 1.6 — pre-generation toggle. The cloud accepts this on the
    // top-level campaign doc (not nested under schedule); the SPA
    // happens to keep it on the schedule cluster for form-locality
    // purposes only. Default true on creation; existing campaigns
    // without the field default OFF on the cloud side per Phase 1.7
    // migration. Empty/undefined falls through to whatever the cloud
    // doc currently holds (patch semantics).
    pregeneration_enabled: schedule.pregenerationEnabled ?? true,

    // Authority Cluster (optional — only present when discovery has been run)
    ...(authority?.domains?.length ? { authority_domains: authority.domains } : {}),

    // Keywords Cluster (optional — only present when keyword discovery has been run)
    ...(keywords?.bank?.length ? { keyword_bank: keywords.bank } : {}),
    // Resolved discovery mode / KD ceiling / path (ranked keyword bank) —
    // only when the SPA has one, so an older doc keeps what it holds.
    ...(keywords?.discoveryMeta ? { keyword_discovery_meta: keywords.discoveryMeta } : {}),

    // Research material (single-post flow only). Sent as snake_case refs the
    // plugin's `generate_single_post` re-stamps on the ephemeral campaign as
    // `researchAttachments` — which lands in the run's `inputSnapshot`, so a
    // "Run again" replay flows the refs back through here unchanged. Mapped
    // field-by-field to pin the wire shape (max 5, id+name only) even when a
    // replayed snapshot carries extra keys.
    ...(researchAttachments?.length
      ? {
          research_attachments: researchAttachments
            .slice(0, 5)
            .map(({ id, name }) => ({ id, name })),
        }
      : {}),
  };
};

export const useCampaignMutations = () => {
  const queryClient = useQueryClient();

  const invalidate = () => {
    // Invalidate the entire `campaigns` namespace so both the list query
    // (campaignKeys.lists()) AND every detail query
    // (campaignKeys.detail(id) — used by CampaignViewPage's
    // `useCampaignQuery`) refetch. Previously only `lists()` was
    // invalidated, so the campaign-view "Next Run" / "Active|Paused"
    // badges held stale state until the user manually refreshed.
    // TanStack invalidates by prefix match — `['campaigns']` catches
    // every nested key.
    queryClient.invalidateQueries({ queryKey: campaignKeys.all });
    queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
  };

  // 1. Toggle Mutation
  const toggleMutation = useMutation({
    mutationFn: (id: string | number) =>
      apiFetch({ path: `/structura/v1/scheduler/campaign/${id}/toggle`, method: "POST" }),
    onSuccess: () => invalidate(),
  });

  // 2. Create Mutation (with Flattening)
  //
  // The cap-reached branch surfaces a sticky toast with a Contact Us
  // CTA per spec §1.0l. `meta.silentError` opts out of the global
  // "Action Failed: …" toast at `client/src/index.tsx` so the user
  // doesn't see a generic + a specific toast at the same time. Other
  // failure modes (cloud transient errors, validation) still bubble
  // through the global handler unchanged.
  const createMutation = useMutation({
    meta: { silentError: true },
    mutationFn: ({ data }: { data: CampaignFormData }) =>
      apiFetch({
        path: "/structura/v1/scheduler/campaign",
        method: "POST",
        data: flattenCampaign(data),
      }),
    onSuccess: () => {
      toast.success(__("New campaign deployed to the engine.", "structura"));
      capture("campaign_created");
      invalidate();
    },
    onError: (error: unknown) => {
      if (isCampaignLimitReachedError(error)) {
        const limit = error.data?.limit ?? null;
        const current = error.data?.current ?? null;
        const detail =
          limit !== null && current !== null
            ? sprintf(
                /* translators: 1: campaigns currently used, 2: plan limit */
                __("You're using %1$d of %2$d campaigns on your current plan.", "structura"),
                current,
                limit,
              )
            : __("You've reached your plan's campaign limit.", "structura");
        // Prefer the locally-built (translated) `detail` over the
        // cloud's English `error.message` so de/es/fr users don't see
        // an English fallback in their UI. The cloud's message is a
        // safety net for non-SPA API consumers (e.g. third-party
        // scripts hitting `/scheduler/campaign` directly), not the
        // SPA toast's source of truth.
        toast.error(detail, {
          title: __("Campaign limit reached", "structura"),
          // 0 = sticky; the user has to dismiss or click Contact Us.
          // The cap is rare to hit and the CTA is the whole point of
          // the toast — auto-dismiss would lose it before the user
          // reads it.
          duration: 0,
          action: {
            label: __("Contact us", "structura"),
            onClick: () => {
              window.open(SUPPORT_URL, "_blank", "noopener,noreferrer");
            },
          },
        });
        return;
      }
      if (isCadenceLimitReachedError(error)) {
        showCadenceLimitToast(error);
        return;
      }
      // Fall back to the global "Action Failed" toast for everything
      // else by re-emitting it inline (we suppressed the global handler
      // via `meta.silentError`). Keeps the failure visible for unknown
      // server errors, validation, transient cloud issues, etc.
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : __("Unknown error", "structura");
      toast.error(`${__("Action Failed:", "structura")} ${message}`);
    },
  });

  // 3. Update Mutation (with Flattening)
  const updateMutation = useMutation({
    // Suppress the global handler so the cadence-cap rejection (editing a
    // flagged Free campaign to publish too often) gets the same Go Pro
    // toast as create, instead of a generic "Action Failed".
    meta: { silentError: true },
    mutationFn: ({ id, data }: { id: string | number; data: CampaignFormData }) =>
      apiFetch({
        path: `/structura/v1/scheduler/campaign/${id}`,
        method: "PUT",
        data: flattenCampaign(data),
      }),
    onSuccess: () => {
      toast.success(__("Campaign architecture updated.", "structura"));
      invalidate();
    },
    onError: (error: unknown) => {
      if (isCadenceLimitReachedError(error)) {
        showCadenceLimitToast(error);
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : __("Unknown error", "structura");
      toast.error(`${__("Action Failed:", "structura")} ${message}`);
    },
  });

  // 4. Duplicate Mutation
  const duplicateMutation = useMutation({
    mutationFn: ({ id }: { id: string | number }) =>
      apiFetch({
        path: `/structura/v1/scheduler/campaign/${id}/duplicate`,
        method: "POST",
      }),
    onSuccess: () => {
      toast.success(__("Campaign duplicated.", "structura"));
      invalidate();
    },
  });

  // 5. Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string | number) =>
      apiFetch({ path: `/structura/v1/scheduler/campaign/${id}`, method: "DELETE" }),
    onSuccess: () => {
      toast.success(__("Campaign deleted.", "structura"));
      invalidate();
    },
  });

  // 6. Generate Single Post Mutation
  //
  // The plugin REST handler mints a runId upfront and returns it in
  // the response so the SPA can navigate to `/generate/runs/:runId`
  // immediately on submit — that's the in-place transition that
  // replaces the "click submit and the form disappears with a toast"
  // UX. The component's own onSuccess handler does the navigation
  // (the mutation just returns the run_id; routing concerns belong
  // outside this hook).
  const generatePostMutation = useMutation({
    mutationFn: ({ data }: { data: CampaignFormData }) =>
      apiFetch<{ success: true; run_id: string; message?: string }>({
        path: "/structura/v1/post/generate",
        method: "POST",
        data: flattenCampaign(data),
      }),
    onSuccess: () => {
      // Refresh the dashboard "Recent generations" widget and the SPA
      // refresh-recovery active-runs list immediately so the new
      // submission shows up without waiting for the next 30s tick.
      // No toast: the SPA navigates to /generate/runs/{runId} on
      // success and the in-place progress is the only feedback the
      // user needs.
      capture("post_generation_started", { surface: "single_post" });
      queryClient.invalidateQueries({ queryKey: progressKeys.singlePostRuns() });
      queryClient.invalidateQueries({ queryKey: progressKeys.activeRuns() });
    },
  });

  // 7. Authority Discovery — campaign-bound (for editing existing campaigns)
  const discoverAuthorityMutation = useMutation({
    mutationFn: ({ campaignId }: { campaignId: string | number }) =>
      apiFetch<{
        success: boolean;
        domains: VettedAuthorityDomain[];
        meta: Record<string, number>;
      }>({
        path: `/structura/v1/scheduler/campaign/${campaignId}/discover-authority`,
        method: "POST",
      }),
    onSuccess: () => invalidate(),
  });

  // 8. Authority Discovery — detached (pre-creation wizard step, no campaign ID)
  const discoverAuthorityDetachedMutation = useMutation({
    mutationFn: (params: { keyphrase: string; campaign_name?: string; language: string; provider: string }) =>
      apiFetch<{
        success: boolean;
        domains: VettedAuthorityDomain[];
        meta: Record<string, number>;
      }>({
        path: "/structura/v1/scheduler/discover-authority",
        method: "POST",
        data: params,
      }),
  });

  // 9. Keyword Discovery — detached (pre-creation wizard step, no campaign ID)
  const discoverKeywordsDetachedMutation = useMutation({
    mutationFn: (params: {
      keyphrase: string;
      campaign_name?: string;
      language: string;
      provider: string;
      /** Interview topics as explicit discovery seeds; absent → objective-derived seeds. */
      topic_seeds?: string[];
    }) =>
      apiFetch<{
        success: boolean;
        keywords: BankKeyword[];
        meta: {
          queriesRun?: number;
          rawCandidates?: number;
          afterCuration?: number;
          durationMs?: number;
          /**
           * Spec: `specs/seo-intelligence-plan.md` §3.2. Tells the SPA
           * whether the bank was built from real SEO intel provider
           * data ("provider") or fell back to the legacy LLM-only
           * pipeline ("legacy"). Surfaced in the StepKeywords data-
           * source badge so users see clearly which path produced
           * their bank.
           */
          path?: "provider" | "legacy";
          /** Resolved difficulty mode + KD ceiling (provider path only). */
          resolvedMode?: "winnable" | "balanced" | "authority";
          kdCeiling?: number | null;
        };
        /**
         * Per-keyword enriched metrics (volume, difficulty, intent)
         * keyed by keyword string. Present only on the `provider`
         * path; absent on legacy runs.
         */
        metrics?: Record<string, {
          volumeNumber?: number;
          difficulty?: number;
          intent?: "informational" | "navigational" | "commercial" | "transactional";
          /** Long-tail variants ready (server-computed "+N" signal). */
          variantCount?: number;
        }>;
      }>({
        path: "/structura/v1/scheduler/discover-keywords",
        method: "POST",
        data: params,
      }),
  });

  // 10. Save Keyword Bank Mutation
  const saveKeywordsMutation = useMutation({
    mutationFn: ({
      campaignId,
      keywords,
      discoveryMeta,
    }: {
      campaignId: string | number;
      keywords: BankKeyword[];
      discoveryMeta?: KeywordDiscoveryMeta | null;
    }) =>
      apiFetch({
        path: `/structura/v1/scheduler/campaign/${campaignId}/save-keywords`,
        method: "POST",
        data: { keywords, ...(discoveryMeta ? { discoveryMeta } : {}) },
      }),
    onSuccess: () => {
      toast.success(__("Keyword bank saved.", "structura"));
      invalidate();
    },
  });

  // 11. Save Authority Domains Mutation
  const saveAuthorityMutation = useMutation({
    mutationFn: ({
      campaignId,
      domains,
    }: {
      campaignId: string | number;
      domains: VettedAuthorityDomain[];
    }) =>
      apiFetch({
        path: `/structura/v1/scheduler/campaign/${campaignId}/save-authority`,
        method: "POST",
        data: { domains },
      }),
    onSuccess: () => {
      toast.success(__("Authority domains saved.", "structura"));
      invalidate();
    },
  });

  return {
    // Promise-returning variants so callers can `await` them. Lets the
    // CampaignViewPage's ConfirmDialog stay open with a spinner until the
    // round-trip completes, then auto-close — the previous fire-and-forget
    // `mutate` shape gave the dialog no way to know when to dismiss, so it
    // closed instantly and the user had to refresh to see the new state.
    toggleCampaign: toggleMutation.mutateAsync,
    isToggling: toggleMutation.isPending,
    createCampaign: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateCampaign: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    duplicateCampaign: duplicateMutation.mutateAsync,
    isDuplicating: duplicateMutation.isPending,
    deleteCampaign: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    generatePost: generatePostMutation.mutateAsync,
    isGenerating: generatePostMutation.isPending,
    discoverAuthority: discoverAuthorityMutation.mutateAsync,
    isDiscovering: discoverAuthorityMutation.isPending,
    discoverAuthorityDetached: discoverAuthorityDetachedMutation.mutateAsync,
    isDiscoveringDetached: discoverAuthorityDetachedMutation.isPending,
    saveAuthority: saveAuthorityMutation.mutateAsync,
    isSavingAuthority: saveAuthorityMutation.isPending,
    discoverKeywordsDetached: discoverKeywordsDetachedMutation.mutateAsync,
    isDiscoveringKeywords: discoverKeywordsDetachedMutation.isPending,
    saveKeywords: saveKeywordsMutation.mutateAsync,
    isSavingKeywords: saveKeywordsMutation.isPending,
  };
};
