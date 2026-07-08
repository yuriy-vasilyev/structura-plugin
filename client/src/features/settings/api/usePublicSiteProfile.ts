import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { __ } from "@wordpress/i18n";
import { toast } from "@structura/ui";

import { settingsKeys } from "./keys";
import { useLicense } from "./useLicense";

/**
 * Allowed `permalinkStrategy` values. Mirrors
 * `Public_Site_Profile::STRATEGY_*` (PHP) and the cloud-side
 * `PERMALINK_STRATEGIES` enum — keep all three in lockstep when adding
 * a new strategy.
 *
 * Spec: `specs/site-identity-headless.md` §3.1.
 */
export type PermalinkStrategy = "inherit" | "prefixSwap" | "template";

/**
 * KeyPage role hint. Open enum, but the SPA renders a Select with these
 * options — adding a new role here also requires translating it for
 * the picker UI.
 */
export type KeyPageRole =
  | "about"
  | "features"
  | "services"
  | "pricing"
  | "case_studies"
  | "blog_index"
  | "contact"
  | "other";

export interface KeyPage {
  url: string;
  label: string;
  role: KeyPageRole;
}

/**
 * Wire shape of `GET /site-profile`. Mirrors the PHP-side
 * `Public_Site_Profile::to_site_identity_payload()` augmented with the
 * brand-surface read-only fields (`name`, `tagline`, etc.) so the SPA
 * can render the "Inherits everything from this WordPress install"
 * preview without a second query.
 */
export interface PublicSiteProfile {
  /** Read-only — derived from `get_bloginfo('name')`. */
  name: string;
  tagline: string;
  language: string;
  logoUrl: string;
  homeUrl: string;

  /** Editable from the headless toggle group below. */
  publicUrl: string;
  isHeadless: boolean;
  description: string;
  keyPages: KeyPage[];
  permalinkStrategy: PermalinkStrategy;
  permalinkTemplate: string;
  defaultPermalinkLang: string;
}

/**
 * Subset of {@link PublicSiteProfile} that the operator can edit. The
 * API ignores any read-only fields if they're sent, but typing the
 * mutation argument narrowly keeps editing surfaces honest.
 */
export type PublicSiteProfileDraft = Pick<
  PublicSiteProfile,
  | "publicUrl"
  | "isHeadless"
  | "description"
  | "keyPages"
  | "permalinkStrategy"
  | "permalinkTemplate"
  | "defaultPermalinkLang"
>;

/**
 * Quick-setup proposal returned by `POST /site-profile/quick-setup`.
 * Cloud-side scrape result, never mutates state — operator reviews and
 * saves through the regular update path.
 */
export interface QuickSetupProposal {
  description: string;
  keyPages: KeyPage[];
}

interface QuickSetupResponse {
  success: boolean;
  proposed: QuickSetupProposal;
  cached: boolean;
}

/** Fetch the current profile state. */
export const usePublicSiteProfile = () => {
  const { hasWorkspace } = useLicense();
  return useQuery({
    queryKey: settingsKeys.publicSiteProfile(),
    queryFn: () =>
      apiFetch<PublicSiteProfile>({ path: "/structura/v1/site-profile" }),
    enabled: hasWorkspace === true,
    // Profile rarely changes — same staleTime as the main settings query.
    staleTime: 1000 * 60 * 5,
  });
};

/**
 * Save the operator's headless override. The endpoint returns the
 * canonical post-save state, which we feed back into React Query as
 * the new cache so the form reflects any server-side normalisation
 * (e.g. trailing-slash strip on `publicUrl`) immediately.
 */
export const usePublicSiteProfileMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (draft: PublicSiteProfileDraft) =>
      apiFetch<PublicSiteProfile>({
        path: "/structura/v1/site-profile",
        method: "POST",
        data: draft,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKeys.publicSiteProfile(), data);
      toast.success(__("Public website settings saved.", "structura"));
    },
    onError: (err: { message?: string }) => {
      toast.error(
        err?.message ??
          __("Could not save public website settings. Please try again.", "structura")
      );
    },
  });
};

/**
 * Trigger a Quick-setup scrape. Returns proposals — does NOT save to
 * the profile. Caller wires up a confirmation modal and invokes the
 * regular mutation when the operator clicks Apply.
 *
 * Errors include the cloud's `error` code as the React-Query error
 * code, letting the SPA surface specific copy for `scrape_failed` vs
 * `unauthorized` vs `invalid_url`.
 */
export const useQuickSetup = () => {
  return useMutation<QuickSetupResponse, { code?: string; message?: string }, string>({
    mutationFn: async (publicUrl: string) =>
      apiFetch<QuickSetupResponse>({
        path: "/structura/v1/site-profile/quick-setup",
        method: "POST",
        data: { publicUrl },
      }),
  });
};
