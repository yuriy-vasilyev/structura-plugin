import apiFetch from "@wordpress/api-fetch";
import { useQuery } from "@tanstack/react-query";

import { campaignKeys } from "./keys";
import { useLicense } from "@/features/settings/api/useLicense";

/**
 * One live stock entry as the Stock tab renders it — a card-ready
 * projection serialized by the cloud's `listCampaignStock`
 * (functions/src/stock/endpoints.ts `StockEntryView`). Blueprint
 * body, image prompts, and provider job ids never reach the SPA.
 */
export interface StockEntryView {
  stockId: string;
  entryStatus: "pending" | "ready" | "failed";
  textStatus: "queued" | "in_flight" | "ready" | "failed";
  imageStatus: "pending" | "queued" | "in_flight" | "ready" | "failed" | "not_required";
  /** Parsed blueprint title; null while generating / on parse failure. */
  title: string | null;
  excerpt: string | null;
  /** Fresh signed URL (re-signed server-side at read time) or null. */
  featuredImageUrl: string | null;
  provider: string;
  textModel: string;
  createdAt: string | null;
  updatedAt: string | null;
  /** ISO timestamp of the in-flight batch submission, for "generating for N min". */
  batchSubmittedAt: string | null;
  failureReason: string | null;
}

/**
 * Pre-generation health, mirrored from the cloud's `StockPregenStatus`
 * (functions/src/stock/endpoints.ts). Surfaces when the buffer is paused
 * by the daily provider-failure cap so the tab can explain a "0 in stock,
 * not regenerating" state instead of showing a bare empty buffer.
 */
export interface StockPregenStatus {
  paused: boolean;
  reason: "failure_cap" | null;
  failureCount: number;
  failureCap: number;
  /** ISO of the next UTC midnight when the cap resets, or null. */
  resetsAt: string | null;
}

interface SuccessEnvelope {
  success: true;
  entries: StockEntryView[];
  pregen?: StockPregenStatus;
}

/** What the hook resolves to — entries plus optional pre-gen health. */
export interface StockListResult {
  entries: StockEntryView[];
  pregen: StockPregenStatus | null;
}

/**
 * Live stock entries for one campaign (Stock tab).
 *
 * Poll cadence: 30s while any entry is still generating (`pending`),
 * paused once everything is terminal (ready/failed) — same pattern as
 * the Runs tab. The list is tiny (buffer target = 2 plus a few failed
 * rows), so the poll is one cheap proxy round-trip.
 */
export const useStockListQuery = (
  campaignId: string | number,
  options?: { enabled?: boolean },
) => {
  const { hasUsableLicense } = useLicense();
  return useQuery({
    queryKey: campaignKeys.stock(campaignId),
    enabled: hasUsableLicense === true && (options?.enabled ?? true),
    staleTime: 15_000,
    refetchInterval: (query) => {
      const entries = query.state.data?.entries ?? [];
      const hasInFlight = entries.some((e) => e.entryStatus === "pending");
      // Keep a slow poll alive while pre-gen is paused so the banner
      // clears on its own once the daily cap resets at UTC midnight.
      if (query.state.data?.pregen?.paused) return 60_000;
      return hasInFlight ? 30_000 : false;
    },
    queryFn: async (): Promise<StockListResult> => {
      const response = (await apiFetch({
        path: `/structura/v1/scheduler/campaign/${campaignId}/stock`,
      })) as SuccessEnvelope | undefined;
      return {
        entries: response?.entries ?? [],
        pregen: response?.pregen ?? null,
      };
    },
    // The tab renders its own empty/error states; no global toast.
    meta: { silentError: true },
  });
};
