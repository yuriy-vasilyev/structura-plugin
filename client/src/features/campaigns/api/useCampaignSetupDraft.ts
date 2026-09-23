/**
 * Two-stage campaign Setup draft — the wp-admin transport for the cloud's
 * `draftCampaignSetup` (spec `campaign-language-and-smart-setup.md` §4.4).
 *
 * The deterministic pass runs itself: it is instant, free and templated, so
 * the step is never blank. The AI pass is not automatic — it costs a model
 * call and rewrites prose the user may already have started editing, so it
 * runs only when they press Magic suggest (owner decision 2026-09-23). A
 * failed refinement therefore leaves the deterministic draft standing, and a
 * failed stage 1 still leaves an empty but usable form.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import apiFetch from "@wordpress/api-fetch";

import type { CampaignMode, SetupRationale } from "@/features/campaigns/types";

/** Which pass produced the draft's name / objective / topics. */
export type SetupDraftStage = "deterministic" | "ai";

/** An active campaign already running on this site in the same language. */
export interface SiblingCampaignSummary {
  campaignId: string;
  name: string;
  language: string;
  postsPerWeek: number;
}

/** What the cloud resolved about the campaign's language. */
export interface SetupDraftLanguage {
  /** WP-style code this draft was written for (`de_AT`, `fa_IR`). */
  code: string;
  source: "wp" | "user" | "guess" | "none";
  support: "full" | "ai_only";
  /** Other languages the site publishes in — pinned at the top of the picker. */
  additionalLanguages: string[];
}

/** Wire shape of `POST /structura/v1/campaigns/draft-setup` → `draft`. */
export interface CampaignSetupDraft {
  language: SetupDraftLanguage;
  name: string;
  objective: string;
  audience?: string;
  /** Discovery seeds — the slot the retired Interview step's topics filled. */
  topics: string[];
  campaignMode: CampaignMode;
  discoveryMode: "winnable" | "balanced" | "authority";
  suggestedPostsPerWeek: number;
  siblingCampaigns: SiblingCampaignSummary[];
  sitePostsPerWeek: number;
  rationale: SetupRationale[];
  stage: SetupDraftStage;
  /** Why the AI pass did not contribute, when it was asked for. */
  aiReason?: "plan_gated" | "ai_unavailable" | "error";
}

interface DraftResponse {
  success?: boolean;
  draft?: CampaignSetupDraft;
}

export interface UseCampaignSetupDraftOptions {
  /**
   * Campaign language the draft is written for. `"default"` (the plugin's
   * site-language sentinel) is NOT forwarded — the cloud resolves it itself.
   */
  language: string;
  /** False keeps the hook idle — e.g. the step is not on screen yet. */
  enabled?: boolean;
  /**
   * Called once per accepted draft so the caller can copy it into the form.
   * Fires for the deterministic pass and again for an accepted AI pass.
   */
  onDraft?: (draft: CampaignSetupDraft) => void;
}

export interface UseCampaignSetupDraftResult {
  draft: CampaignSetupDraft | null;
  /** True while stage 1 is in flight — the form has nothing to show yet. */
  isDrafting: boolean;
  /** True while Magic suggest is in flight over an already-rendered draft. */
  isRefining: boolean;
  /** Set only when stage 1 failed; the form stays empty but usable. */
  error: string | null;
  /** Set when the last Magic suggest run failed or the cloud declined it. */
  refineError: string | null;
  /** Re-run the deterministic pass — the error Alert's "Try again". */
  redraft: () => void;
  /** Run the AI pass over the current draft — Magic suggest, nothing else. */
  refine: () => void;
}

const ENDPOINT = "/structura/v1/campaigns/draft-setup";

const requestDraft = async (
  stage: SetupDraftStage,
  language: string,
): Promise<CampaignSetupDraft | null> => {
  const response = await apiFetch<DraftResponse>({
    path: ENDPOINT,
    method: "POST",
    data: {
      stage,
      // The sentinel means "whatever the site writes in" — sending it would
      // make the cloud validate a code that isn't one.
      ...(language && language !== "default" ? { language } : {}),
    },
  });
  return response?.draft ?? null;
};

export const useCampaignSetupDraft = ({
  language,
  enabled = true,
  onDraft,
}: UseCampaignSetupDraftOptions): UseCampaignSetupDraftResult => {
  const [draft, setDraft] = useState<CampaignSetupDraft | null>(null);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Every deterministic run carries a sequence number, and a refinement
  // captures the number that was current when it started — so a slow AI pass
  // fired under one language can never land on top of a newer one's draft.
  const runIdRef = useRef(0);
  const onDraftRef = useRef(onDraft);
  useEffect(() => {
    onDraftRef.current = onDraft;
  });

  useEffect(() => {
    if (!enabled) return;

    const runId = ++runIdRef.current;
    const isStale = () => runIdRef.current !== runId;

    setIsDrafting(true);
    // A refinement in flight is now orphaned by its own run-id guard, so it
    // will never clear this flag itself.
    setIsRefining(false);
    setError(null);
    setRefineError(null);

    const run = async () => {
      try {
        const base = await requestDraft("deterministic", language);
        if (isStale()) return;
        if (base) {
          setDraft(base);
          onDraftRef.current?.(base);
        }
      } catch (err) {
        if (isStale()) return;
        setError(
          (err as { message?: string })?.message ??
            "campaign_setup_draft_failed",
        );
      } finally {
        if (!isStale()) setIsDrafting(false);
      }
    };

    void run();
  }, [language, enabled, attempt]);

  const redraft = useCallback(() => setAttempt((n) => n + 1), []);

  const refine = useCallback(() => {
    const runId = runIdRef.current;
    const isStale = () => runIdRef.current !== runId;

    setIsRefining(true);
    setRefineError(null);

    void (async () => {
      try {
        const refined = await requestDraft("ai", language);
        if (isStale()) return;
        // `aiReason` means the cloud declined (plan gate, model outage). The
        // user asked for this explicitly, so silence would read as a dead
        // button — surface it like any other failure.
        if (refined?.stage === "ai") {
          setDraft(refined);
          onDraftRef.current?.(refined);
        } else {
          setRefineError(refined?.aiReason ?? "ai_unavailable");
        }
      } catch (err) {
        if (isStale()) return;
        setRefineError(
          (err as { message?: string })?.message ??
            "campaign_setup_refine_failed",
        );
      } finally {
        if (!isStale()) setIsRefining(false);
      }
    })();
  }, [language]);

  return { draft, isDrafting, isRefining, error, refineError, redraft, refine };
};
