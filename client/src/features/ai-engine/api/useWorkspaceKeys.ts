/**
 * Workspace AI keys library — cross-site picker for the plugin AI
 * Engine page. Mirrors the AI-keys "use one of the previously used
 * API keys" affordance the user asked for: a site can pick a key
 * already saved on a sibling site without round-tripping through
 * the customer portal. Backed by the cloud's
 * `listWorkspaceProviderCredentials` and
 * `bindWorkspaceProviderCredential` plugin endpoints.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@structura/ui";
import apiFetch from "@wordpress/api-fetch";
import { __ } from "@wordpress/i18n";

import { settingsKeys } from "@/features/settings/api/keys";
import { useLicense } from "@/features/settings/api/useLicense";

export interface WorkspaceCredentialView {
  credId: string;
  provider: "openai" | "gemini" | "anthropic";
  label: string;
  maskedKey?: string;
  addedAt?: string;
  lastUsedAt?: string;
  /** Total activations in the workspace bound to this credential. */
  boundActivationCount: number;
  /** True when the calling activation is currently bound to this credential. */
  boundToCallingActivation: boolean;
}

interface ListResponse {
  success: true;
  credentials: WorkspaceCredentialView[];
}

const workspaceKeysQueryKey = ["workspace-keys"] as const;

export const useWorkspaceKeysQuery = () => {
  const { hasUsableLicense } = useLicense();
  return useQuery({
    queryKey: workspaceKeysQueryKey,
    queryFn: () => apiFetch<ListResponse>({ path: "/structura/v1/keys/workspace" }),
    enabled: hasUsableLicense === true,
    staleTime: 1000 * 60 * 2,
  });
};

export const useBindWorkspaceKey = () => {
  const queryClient = useQueryClient();
  const { successToast } = useToast();
  return useMutation({
    mutationFn: (data: { cred_id: string; provider: string }) =>
      apiFetch({
        path: "/structura/v1/keys/bind",
        method: "POST",
        data,
      }),
    onSuccess: () => {
      successToast(__("Bound this site to the existing workspace key.", "structura"));
      queryClient.invalidateQueries({ queryKey: workspaceKeysQueryKey });
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
};
