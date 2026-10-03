/**
 * Campaign Setup draft — the wp-admin transport for the cloud's
 * `draftCampaignSetup` (spec `campaign-language-and-smart-setup.md` §4.4).
 *
 * Nothing runs on its own. The Setup step mounts empty and calls
 * {@link UseCampaignSetupDraftResult.suggest} only when the user presses
 * Magic suggest (or confirms a redraft in another language): one cloud call
 * per click, `deterministic` on Free, `ai` on paid plans. Until 2026-10-02 the
 * wp-admin step drafted on mount; that went, as in the customer portal on
 * 2026-09-29, because it read as an unrequested AI pass and every call now
 * counts against the workspace's AI call limit.
 *
 * A failure never touches the fields. A gated AI pass still lands the
 * templated draft the cloud returned, with the error shown next to it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import apiFetch from "@wordpress/api-fetch";
import { __ } from "@wordpress/i18n";

import { humanizeSuggestionError } from "@/hooks/humanizeSuggestionError";

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
  /** Called once per landed draft so the caller can copy it into the form. */
  onDraft?: (draft: CampaignSetupDraft) => void;
}

export interface UseCampaignSetupDraftResult {
  /** The last draft that landed, or null before the first suggestion. */
  draft: CampaignSetupDraft | null;
  /** True while a suggestion is in flight. */
  isSuggesting: boolean;
  /** Translated message when the last suggestion failed or was gated. */
  error: string | null;
  /**
   * Run one suggestion in `language` at `stage`. A newer call supersedes an
   * older one still in flight.
   */
  suggest: (language: string, stage: SetupDraftStage) => void;
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

/** Returns the message for a failed suggestion: the AI call limit's own copy, else the generic one. */
const failureMessage = (err: unknown): string =>
  (err as { data?: { code?: string } })?.data?.code === "ai_rate_limited"
    ? humanizeSuggestionError(err)
    : __("Couldn't refine this campaign — try again", "structura");

export const useCampaignSetupDraft = ({
  onDraft,
}: UseCampaignSetupDraftOptions = {}): UseCampaignSetupDraftResult => {
  const [draft, setDraft] = useState<CampaignSetupDraft | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Each call carries a sequence number so a slow response from an older
  // click (or an older language) never lands over a newer one.
  const requestIdRef = useRef(0);
  const onDraftRef = useRef(onDraft);
  useEffect(() => {
    onDraftRef.current = onDraft;
  });

  const suggest = useCallback((language: string, stage: SetupDraftStage) => {
    const id = ++requestIdRef.current;
    const isStale = () => requestIdRef.current !== id;
    setIsSuggesting(true);
    setError(null);

    void (async () => {
      try {
        const next = await requestDraft(stage, language);
        if (isStale()) return;
        if (!next) {
          setError(failureMessage(null));
          return;
        }
        // A gated AI pass comes back as the templated draft with a reason.
        // It still lands — the click asked for a draft — but the user asked
        // for more, so they are told rather than quietly downgraded.
        setDraft(next);
        onDraftRef.current?.(next);
        if (stage === "ai" && (next.stage !== "ai" || !!next.aiReason)) {
          setError(failureMessage(null));
        }
      } catch (err) {
        if (isStale()) return;
        setError(failureMessage(err));
      } finally {
        if (!isStale()) setIsSuggesting(false);
      }
    })();
  }, []);

  return { draft, isSuggesting, error, suggest };
};
