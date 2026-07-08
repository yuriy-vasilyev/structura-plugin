/**
 * Ack / dismiss mutations for the wp-admin Notices page.
 *
 * Both go through the WP REST proxy added in `Rest_Api.php` —
 * `POST /structura/v1/notices/{acknowledge,dismiss}` — which in
 * turn calls the cloud's bearer-authenticated HTTP endpoints. We
 * invalidate the `["notices"]` query on success so the list
 * refreshes without waiting for the next poll tick.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";

import type { Notice } from "../types";

interface MutationBody {
  noticeId: string;
}

interface MutationResponse {
  success: boolean;
  notice?: Notice;
}

const buildMutation = (path: string) => async ({ noticeId }: MutationBody) => {
  return apiFetch<MutationResponse>({
    path,
    method: "POST",
    data: { noticeId },
  });
};

export const useAcknowledgeNoticeMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: buildMutation("/structura/v1/notices/acknowledge"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notices"] });
    },
  });
};

export const useDismissNoticeMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: buildMutation("/structura/v1/notices/dismiss"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notices"] });
    },
  });
};
