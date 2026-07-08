/**
 * Save / delete mutations for channel connections.
 *
 * Both go through the WP REST proxy
 * (`/structura/v1/channels/connections/...`) which holds the activation
 * secret needed to authenticate against the cloud. The React app never sees
 * the secret and never receives the encrypted token blob.
 *
 * `onSuccess` invalidates `channelKeys.connections()` so the list refetches
 * with the new state — saving a connection updates `status` to `connected`
 * and stamps `connectedAt`; deleting removes the row entirely.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import { __ } from "@wordpress/i18n";
import { toast } from "@structura/ui";
import { channelKeys } from "./keys";
import { capture } from "@/lib/posthog";
import type {
  DeleteConnectionResponse,
  OAuthInitInput,
  OAuthInitResponse,
  SaveConnectionResponse,
  SaveCredentialConnectionInput,
  SaveWebhookConnectionInput,
  UpdateConnectionSettingsInput,
} from "../types";

export const useChannelConnectionMutations = () => {
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: channelKeys.connections() });

  // Save a webhook-style connection (Slack / Discord today).
  // `onError` keeps the toast generic — the cloud's exact reason
  // ("Integration is not webhook-based.", "Security check failed.", etc.)
  // is already surfaced as a WP_Error through the REST proxy and apiFetch
  // throws with that message, so callers can read mutation.error?.message
  // for inline form feedback.
  const saveWebhookMutation = useMutation({
    mutationFn: (input: SaveWebhookConnectionInput) =>
      apiFetch<SaveConnectionResponse>({
        path: "/structura/v1/channels/connections/webhook",
        method: "POST",
        data: input,
      }),
    onSuccess: (_data, input) => {
      capture("channel_connected", {
        integration_id: input.integration_id,
        auth_type: "webhook",
      });
      toast.success(__("Channel connected.", "structura"));
      invalidate();
    },
  });

  // Save a credential-style connection (email-owner, telegram, whatsapp).
  // Same pattern as the webhook mutation but hits the `/credential` endpoint
  // and sends a `credentials` map instead of a `webhook_url`.
  const saveCredentialMutation = useMutation({
    mutationFn: (input: SaveCredentialConnectionInput) =>
      apiFetch<SaveConnectionResponse>({
        path: "/structura/v1/channels/connections/credential",
        method: "POST",
        data: input,
      }),
    onSuccess: (_data, input) => {
      capture("channel_connected", {
        integration_id: input.integration_id,
        auth_type: "credential",
      });
      toast.success(__("Channel connected.", "structura"));
      invalidate();
    },
  });

  // Initiate an OAuth flow. Returns the authorize URL; the caller redirects
  // the browser to it. The cloud handles the callback and persists the
  // connection, then redirects back to wp-admin.
  //
  // `postAsOrg` (LinkedIn only) maps to the wire `post_as` field — when set,
  // the cloud requests the company-page scopes so the user can post on behalf
  // of a Page they administer. Personal-profile posting is the default.
  const initOAuthMutation = useMutation({
    mutationFn: ({ integrationId, postAsOrg }: OAuthInitInput) =>
      apiFetch<OAuthInitResponse>({
        path: "/structura/v1/channels/oauth/init",
        method: "POST",
        data: {
          integration_id: integrationId,
          ...(postAsOrg ? { post_as: "organization" } : {}),
        },
      }),
    onSuccess: (_data, input) => {
      // The OAuth round-trip continues off-page (provider authorize URL
      // → cloud callback → wp-admin redirect). We fire the "initiated"
      // event here so the funnel captures the click; a follow-up
      // `channel_connected` event fires when the SPA gets back to the
      // connections list with the new row.
      capture("channel_oauth_initiated", {
        integration_id: input.integrationId,
        post_as: input.postAsOrg ? "organization" : "personal",
      });
    },
  });

  // The path id is whatever stable key the caller has for the connection:
  // post-migration that's `connection.connectionId` (UUID), pre-migration
  // it's `connection.integrationId` — the REST proxy and cloud endpoint
  // accept either via the dual connection_id / integration_id fallback.
  // Patch the user-managed settings on an existing connection
  // (campaign bindings, locale, cadence). Used by both the post-OAuth
  // configure modal and the per-row Edit affordance — the OAuth install
  // path has no other "save settings" hop, and editing webhook /
  // credential connections through the same endpoint keeps the
  // settings-update wire shape uniform across auth types.
  const updateSettingsMutation = useMutation({
    mutationFn: (input: UpdateConnectionSettingsInput) =>
      apiFetch<SaveConnectionResponse>({
        path: "/structura/v1/channels/connections/settings",
        method: "POST",
        data: input,
      }),
    onSuccess: () => {
      toast.success(__("Settings saved.", "structura"));
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (connectionKey: string) =>
      apiFetch<DeleteConnectionResponse>({
        path: `/structura/v1/channels/connections/${encodeURIComponent(connectionKey)}`,
        method: "DELETE",
      }),
    onSuccess: () => {
      capture("channel_disconnected");
      toast.success(__("Channel disconnected.", "structura"));
      invalidate();
    },
  });

  return {
    saveWebhook: saveWebhookMutation.mutateAsync,
    saveCredential: saveCredentialMutation.mutateAsync,
    initOAuth: initOAuthMutation.mutateAsync,
    updateSettings: updateSettingsMutation.mutateAsync,
    deleteConnection: deleteMutation.mutateAsync,
    isSaving:
      saveWebhookMutation.isPending ||
      saveCredentialMutation.isPending ||
      initOAuthMutation.isPending ||
      updateSettingsMutation.isPending,
    isDeleting: deleteMutation.isPending,
    saveError:
      saveWebhookMutation.error instanceof Error
        ? saveWebhookMutation.error.message
        : saveCredentialMutation.error instanceof Error
          ? saveCredentialMutation.error.message
          : initOAuthMutation.error instanceof Error
            ? initOAuthMutation.error.message
            : updateSettingsMutation.error instanceof Error
              ? updateSettingsMutation.error.message
              : null,
  };
};
