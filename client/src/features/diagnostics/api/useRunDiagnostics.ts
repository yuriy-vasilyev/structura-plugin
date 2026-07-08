/**
 * Mutation hook for the user-triggered diagnostics run.
 *
 * Spec: `specs/v2/notification-center.md` §11.2.
 *
 * POSTs `/structura/v1/diagnostics/run`; the PHP handler walks the
 * WP-side probes and forwards each finding to the cloud's
 * noticesReport endpoint. Findings show up in the Notification
 * Center bell + page within a poll tick — we invalidate the
 * `["notices"]` query on success so the inbox refreshes
 * immediately rather than waiting up to 60s for the next poll.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";

export interface DiagnosticsFinding {
  subjectId: string;
  severity: "warning" | "error";
  errorCode: string | null;
}

export interface DiagnosticsResponse {
  success: boolean;
  checksRun: number;
  findings: DiagnosticsFinding[];
}

export const useRunDiagnostics = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return apiFetch<DiagnosticsResponse>({
        path: "/structura/v1/diagnostics/run",
        method: "POST",
      });
    },
    onSuccess: () => {
      // Refresh the notices query so any new plugin-health entries
      // appear in the bell + page right away. The cloud's classifier
      // is dedup-aware, so re-runs that produce the same finding
      // bump occurrence count rather than spawning duplicates.
      qc.invalidateQueries({ queryKey: ["notices"] });
    },
  });
};
