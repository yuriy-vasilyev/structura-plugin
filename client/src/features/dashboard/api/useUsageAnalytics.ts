import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { useLicense } from "@/features/settings";
import { PlanId } from "@structura/types";

/**
 * Discriminated cycle-usage view — Phase 4.4 of
 * `specs/v2/multi-tenant-and-public-api.md`. The cloud helper
 * (`functions/src/billing/cycleUsageView.ts`) computes this shape
 * from the workspace + license + cycle rollup docs; the plugin
 * SPA + portal widgets render it.
 */
export type CycleUsageView =
  | {
      kind: "managed";
      cycleMonth: string;
      cycleResetsAt: number;
      daysLeftInCycle: number;
      /**
       * License has no token cap (comped / internal). Optional: absent
       * from responses served by functions deployed before 2026-07-03.
       */
      unmetered?: boolean;
      workspace: {
        tokensUsed: number;
        tokensIncluded: number;
        imagesUsed: number;
        imagesIncluded: number;
        utilizationPercent: number;
      };
      activations: Array<{
        activationId: string;
        label: string;
        tokensUsed: number;
        tokensIncluded: number;
        imagesUsed: number;
        imagesIncluded: number;
        utilizationPercent: number;
      }>;
    }
  | {
      kind: "byok";
      cycleMonth: string;
      cycleResetsAt: number;
      daysLeftInCycle: number;
      postsUsed: number;
      tokensUsed: number;
      imagesUsed: number;
    }
  | { kind: "none"; reason: string };

export interface AnalyticsResponse {
  success: boolean;
  plan: PlanId;
  /**
   * Next quota-reset instant, as a raw epoch-millis number. Historical
   * artefact — the name is "renewalDate" but the value is an epoch ms.
   * Kept for the managed-plan banner; BYOK/Free dashboards read
   * `cycleUsage.cycleResetsAt` off the discriminated view instead.
   */
  renewalDate: number;
  limits: {
    maxTokens: number;
    maxImages: number;
    currentTokens: number;
    currentImages: number;
  };
  /**
   * Phase 4.4 cycle usage — the authoritative shape for every
   * dashboard surface. The cycle rollup (`usageRecords/*` →
   * `usageCycles/{YYYY-MM}`) is the single source of truth as of
   * 2026-05-12; the legacy `stats` / `data` fields and the
   * `usage_logs` subcollection they came from were retired in the
   * same release.
   */
  cycleUsage?: CycleUsageView | null;
}

/** The per-site row shape inside the managed cycle view. */
export type ManagedActivationUsage = Extract<
  CycleUsageView,
  { kind: "managed" }
>["activations"][number];

/**
 * Pick the CURRENT site's row out of the managed cycle view.
 *
 * The cloud computes ONE view for both surfaces: the customer portal
 * renders the workspace aggregate plus per-site rows, but wp-admin is
 * a single-site surface and quotas are PER ACTIVATION — the
 * generation gate hard-blocks on `usedTokensThisMonth >=
 * maxTokensPerActivation` for the calling activation. There is no
 * shared workspace token pool; the view's `workspace` block is a
 * synthetic sum for the portal. The wp-admin widgets therefore match
 * their own row via `structuraConfig.activation_id` and render only
 * that.
 *
 * Returns null when the row can't be matched (plugin builds predating
 * the `activation_id` config field, or a view built without
 * activation docs) — callers fall back to the workspace aggregate,
 * which is identical on a single-site workspace.
 */
export function selectOwnActivationUsage(
  cycle: Extract<CycleUsageView, { kind: "managed" }>,
  activationId: string | null | undefined,
): ManagedActivationUsage | null {
  if (!activationId) return null;
  return (
    cycle.activations.find((a) => a.activationId === activationId) ?? null
  );
}

export const useUsageAnalytics = (campaignId?: number) => {
  const { isPaidLicense, hasUsableLicense } = useLicense();

  return useQuery({
    queryKey: ["analytics", "usage", { campaignId }],
    queryFn: async () => {
      const params = new URLSearchParams(
        campaignId ? { campaignId: campaignId.toString() } : {},
      );
      const qs = params.toString();
      return apiFetch<AnalyticsResponse>({
        path: `/structura/v1/analytics/usage${qs ? `?${qs}` : ""}`,
      });
    },
    enabled: hasUsableLicense === true && !!isPaidLicense,
    staleTime: 1000 * 60 * 10,
  });
};
