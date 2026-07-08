/**
 * Credential-input form for non-webhook integrations (email-owner, telegram,
 * whatsapp). Rendered inside the Store's InstallModal when `entry.authType`
 * is `"apikey"` or `"none"`.
 *
 * Each integration has a different set of credential fields; the form schema
 * is driven by `CREDENTIAL_FIELDS[entry.id]`. Adding a new credential-based
 * integration is: add an entry to `CREDENTIAL_FIELDS` + register the
 * validation function on the cloud endpoint.
 *
 * The form POSTs to `/structura/v1/channels/connections/credential` (WP REST
 * proxy) which forwards to the cloud `channelsSaveCredentialConnection`
 * endpoint. Secrets are AES-256-GCM encrypted at rest in
 * `connectionSecrets/{cid}` and never round-tripped to the browser.
 */

import { FormEvent, useMemo, useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { Download, ExternalLink, Plus, Save } from "lucide-react";
import { Button, InputField, Select } from "@structura/ui";
import { docsUrl } from "@/utils/docsUrl";
import { useChannelConnectionMutations } from "../api/useChannelConnectionMutations";
import { useIndexNowKey } from "../api/useIndexNow";
import type { ConnectionSummary, IntegrationCatalogEntry } from "../types";
import { CampaignBindingsPicker } from "./CampaignBindingsPicker";
import { CadencePicker } from "./CadencePicker";

// ── Per-integration field definitions ──────────────────────────────────────

interface CredentialFieldDef {
  /** Key sent in the `credentials` map (matches the cloud validation). */
  key: string;
  /** Human label for the field. */
  label: string;
  /** Placeholder hint. */
  placeholder: string;
  /**
   * HTML input type — `"password"` masks API tokens, `"email"` triggers
   * browser email validation, `"text"` is the default.
   */
  type?: "text" | "email" | "password";
  /**
   * Optional helper line shown beneath the field. Useful for explaining
   * where to find a value (e.g. "Create a bot via @BotFather on Telegram").
   */
  help?: string;
}

/**
 * Registry of credential fields keyed by integration id. The order of fields
 * in each array matches the visual order in the form.
 *
 * Keep field keys in lockstep with the cloud-side validation functions:
 *   - email-owner: `validateRecipientEmail` in EmailOwnerIntegration.ts
 *   - telegram:    `validateTelegramCredentials` in TelegramIntegration.ts
 *   - whatsapp:    `validateWhatsAppCredentials` in WhatsAppIntegration.ts
 */
const CREDENTIAL_FIELDS: Record<string, CredentialFieldDef[]> = {
  // IndexNow needs no credentials — the integration fires an auth-less HTTP
  // ping. The user only picks a display name + notification locale.
  indexnow: [],
  // Video renders happen entirely cloud-side — nothing to authenticate.
  // Install just creates the connection with the cloud defaults (voice
  // Ava, style Clean); the post-install configure hand-off (InstallModal)
  // opens the settings modal where voice/style/cadence live.
  video: [],
  "email-owner": [
    {
      key: "recipientEmail",
      label: __("Recipient email", "structura"),
      placeholder: "you@example.com",
      type: "email",
      help: __("The email address that receives publish notifications.", "structura"),
    },
  ],
  telegram: [
    {
      key: "botToken",
      label: __("Bot token", "structura"),
      placeholder: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
      type: "password",
      help: sprintf(
        // translators: %s is the BotFather username
        __("Create a bot via %s on Telegram to get this token.", "structura"),
        "@BotFather",
      ),
    },
    {
      key: "chatId",
      label: __("Chat ID", "structura"),
      placeholder: "-1001234567890",
      type: "text",
      help: __(
        "Numeric chat/group ID, or @channel username. Use @userinfobot to find yours.",
        "structura",
      ),
    },
  ],
  whatsapp: [
    {
      key: "phoneNumberId",
      label: __("Phone number ID", "structura"),
      placeholder: "1234567890123456",
      type: "text",
      help: __(
        "From your WhatsApp Business Platform dashboard (API Setup page).",
        "structura",
      ),
    },
    {
      key: "accessToken",
      label: __("Access token", "structura"),
      placeholder: "EAABsbCS1iZA8BO…",
      type: "password",
      help: __(
        "A permanent or temporary access token from Meta for Developers.",
        "structura",
      ),
    },
    {
      key: "recipientPhone",
      label: __("Recipient phone", "structura"),
      placeholder: "+14155238886",
      type: "text",
      help: __(
        "The phone number to receive notifications, in E.164 format (e.g. +14155238886).",
        "structura",
      ),
    },
  ],
};

// ── Notification locale options (shared with AddWebhookForm) ───────────────

const NOTIFICATION_LOCALE_OPTIONS = [
  { value: "system", labelKey: "System language" as const },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
] as const;

// ── Component ──────────────────────────────────────────────────────────────

interface AddCredentialFormProps {
  entry: IntegrationCatalogEntry;
  editingConnection?: ConnectionSummary;
  /**
   * Fires after a successful save with the connection the cloud returned.
   * The summary (esp. its `connectionId`) lets install flows hand off to
   * the `?configure=` settings modal — the video channel's post-install
   * step. Optional param for back-compat with callers that only close.
   */
  onSuccess?: (connection?: ConnectionSummary) => void;
  onCancel?: () => void;
}

export const AddCredentialForm = ({
  entry,
  editingConnection,
  onSuccess,
  onCancel,
}: AddCredentialFormProps) => {
  const isEdit = Boolean(editingConnection);
  const fields = CREDENTIAL_FIELDS[entry.id] ?? [];
  // Video is a renderer, not a notifier — there's no notification whose
  // language could be picked (voiceover + captions follow each post's own
  // language), so the locale select is hidden and never sent for it.
  const isVideo = entry.id === "video";

  // Build initial credential state — empty strings for each field key.
  // On edit, credentials are NOT pre-populated (secrets are never echoed
  // back from the cloud, same pattern as the webhook form).
  const emptyCredentials = () =>
    Object.fromEntries(fields.map((f) => [f.key, ""]));

  const [credentials, setCredentials] = useState<Record<string, string>>(
    emptyCredentials,
  );
  const [displayName, setDisplayName] = useState(
    editingConnection?.displayName ?? "",
  );
  const [notificationLocale, setNotificationLocale] = useState<string>(
    editingConnection?.notificationLocale ?? "system",
  );
  // Per-campaign binding filter — see `boundCampaignIds` on ConnectionSummary.
  // `null` = fire for every campaign (the default). Seeded from the existing
  // summary in edit mode so an in-place edit preserves the allowlist unless
  // the user deliberately changes it.
  const [boundCampaignIds, setBoundCampaignIds] = useState<(string | number)[] | null>(
    editingConnection?.boundCampaignIds ?? null,
  );
  // "Every Nth post" cadence — defaults to 1 (every post). Seeded from
  // the existing summary in edit mode so the user's previous choice
  // survives an unrelated form save.
  const [postCadenceN, setPostCadenceN] = useState<number>(
    editingConnection?.postCadenceN ?? 1,
  );

  const { saveCredential, isSaving, saveError } =
    useChannelConnectionMutations();

  // IndexNow needs a per-host key + a reachable keyfile URL, both of
  // which the plugin owns. The hook is only enabled for the indexnow
  // entry — every other integration gets a no-op return + zero round
  // trips. See `specs/site-identity-headless.md` §6 for the flow.
  const isIndexNow = entry.id === "indexnow";
  const indexnow = useIndexNowKey(isIndexNow);

  const notificationLocaleOptions = useMemo(
    () =>
      NOTIFICATION_LOCALE_OPTIONS.map((opt) =>
        "labelKey" in opt
          ? { value: opt.value, label: __(opt.labelKey, "structura") }
          : { value: opt.value, label: opt.label },
      ),
    [],
  );

  // All credential fields must be non-empty to enable submit.
  const allFilled = fields.every(
    (f) => (credentials[f.key] ?? "").trim() !== "",
  );

  const setField = (key: string, value: string) =>
    setCredentials((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!allFilled) return;
    // IndexNow won't have its key+keyLocation ready until the GET hook
    // resolves — refuse to submit until we have them, otherwise the
    // cloud's `validateCredentials("indexnow", ...)` rejects the empty
    // shape and the operator gets a confusing "missing key" error.
    if (isIndexNow && !indexnow.data) return;

    // Trim every credential value before sending.
    const trimmed: Record<string, string> = {};
    for (const f of fields) {
      trimmed[f.key] = (credentials[f.key] ?? "").trim();
    }
    // For IndexNow, swap in `{ key, keyLocation }` from the plugin's
    // GET endpoint. The values aren't editable from the form (they're
    // derived from the active key + the public-site profile) so we
    // don't surface them as fields.
    if (isIndexNow && indexnow.data) {
      trimmed.key = indexnow.data.key;
      trimmed.keyLocation = indexnow.data.keyLocation;
    }

    try {
      const result = await saveCredential({
        integration_id: entry.id,
        connection_id: editingConnection?.connectionId,
        credentials: trimmed,
        display_name: displayName.trim() || undefined,
        // Video hides the locale select entirely — omit the field so the
        // wire shape carries only what the user could actually choose.
        ...(isVideo ? {} : { notification_locale: notificationLocale }),
        // See AddWebhookForm — `null` is the "all campaigns" wire default;
        // an explicit empty array round-trips safely because the cloud
        // normalizes it back to `null`.
        bound_campaign_ids: boundCampaignIds,
        post_cadence_n: postCadenceN,
      });
      if (!isEdit) {
        setCredentials(emptyCredentials());
        setDisplayName("");
        setNotificationLocale("system");
        setBoundCampaignIds(null);
        setPostCadenceN(1);
      }
      onSuccess?.(result?.connection);
    } catch {
      // Mutation hook surfaces the message via `saveError`.
    }
  };

  /**
   * IndexNow needs to expose the operator-facing keyfile UX (download
   * + upload instructions for headless installs) before they hit Save
   * — the connection itself isn't useful until the keyfile is
   * reachable. Render a dedicated block at the top of the form when
   * we're setting up an IndexNow connection.
   */
  const renderIndexNowSetup = () => {
    if (!isIndexNow) return null;
    if (indexnow.isLoading) {
      return (
        <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          {__("Preparing your IndexNow keyfile…", "structura")}
        </div>
      );
    }
    if (!indexnow.data) return null;

    const { key, keyLocation, isHeadless } = indexnow.data;
    const fileName = `${key}.txt`;

    const handleDownload = () => {
      // Simple data-URL download. The keyfile contents are just the
      // key text — small enough that a Blob URL is overkill, and the
      // text encoding is ASCII so URI encoding is a no-op for valid
      // keys (the spec restricts them to [A-Za-z0-9-]).
      const dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(key)}`;
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    return (
      <div className="space-y-3 rounded-xl border border-neutral-300 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900/40">
        <p className="m-0! text-xs font-semibold tracking-wider text-neutral-700 uppercase dark:text-neutral-300">
          {__("Keyfile setup", "structura")}
        </p>
        <p className="m-0! text-sm text-neutral-700 dark:text-neutral-300">
          {isHeadless
            ? __(
                "IndexNow needs a verification file at the URL below. Download it and upload it to the root of your public website.",
                "structura",
              )
            : __(
                "Structura serves the IndexNow verification file automatically — no upload needed. The URL below is what the IndexNow aggregator will check.",
                "structura",
              )}
        </p>
        <div className="rounded-lg border border-neutral-200 bg-white p-3 font-mono text-xs break-all dark:border-neutral-800 dark:bg-neutral-900">
          {keyLocation}
        </div>
        {isHeadless && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleDownload}
          >
            <Download className="mr-1.5 h-4 w-4" />
            {sprintf(
              // translators: %s is the keyfile filename, e.g. "abc123.txt"
              __("Download %s", "structura"),
              fileName,
            )}
          </Button>
        )}
        <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
          {__(
            "After connecting, you can run “Verify” on the connection row to check that IndexNow can reach your keyfile.",
            "structura",
          )}
        </p>
        <a
          href={docsUrl("channels/indexnow")}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-neutral-500 underline-offset-2 hover:text-neutral-700 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          {__("Read the IndexNow guide", "structura")}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {renderIndexNowSetup()}
      {/* Credential fields */}
      {fields.map((field, idx) => (
        <div key={field.key} className="space-y-1">
          {isEdit && field.type === "password" && (
            <p className="m-0! rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
              {__(
                "Paste the value again to save changes \u2014 we never display saved secrets for security.",
                "structura",
              )}
            </p>
          )}
          <InputField
            label={field.label}
            placeholder={field.placeholder}
            value={credentials[field.key] ?? ""}
            onChange={(e) => setField(field.key, e.target.value)}
            type={field.type ?? "text"}
            required
          />
          {field.help && (
            <p className="m-0! text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              {field.help}
            </p>
          )}
        </div>
      ))}

      {/* Surface the cloud's error message once, below all credential fields. */}
      {saveError && (
        <p className="m-0! text-xs text-red-600 dark:text-red-400">
          {saveError}
        </p>
      )}

      {/* Display name — optional, same as webhook form. */}
      <InputField
        label={__("Display name (optional)", "structura")}
        placeholder={entry.name}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />

      {/* Notification language \u2014 hidden for video (nothing to localize;
          the render follows each post's language). */}
      {!isVideo && (
        <Select
          value={notificationLocale}
          onValueChange={(val) => setNotificationLocale(String(val))}
          options={notificationLocaleOptions}
        >
          <Select.Label>{__("Notification language", "structura")}</Select.Label>
          <Select.Trigger
            placeholder={__("Choose a language\u2026", "structura")}
          />
          <Select.Content className="w-(--button-width)">
            {notificationLocaleOptions.map((opt) => (
              <Select.Item key={opt.value} value={opt.value}>
                {opt.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      )}

      {/* Per-campaign binding filter — same picker the webhook form uses.
          `null` fires for every campaign (default); explicit list narrows
          dispatch. Two surfaces (this form and the campaign-edit Channels
          section) write to the same `boundCampaignIds` field on the
          connection doc. */}
      <CampaignBindingsPicker
        value={boundCampaignIds}
        onChange={setBoundCampaignIds}
      />

      {/* "Every Nth post" cadence — pairs with the bindings filter as a
          second axis of fan-out control. Bindings answer "which
          campaigns can post to this channel?" and cadence answers "of
          the qualifying events, how often should we actually
          dispatch?". See CadencePicker for the semantics. Video swaps
          in its render-centric wording (handoff §2.3). */}
      <CadencePicker
        value={postCadenceN}
        onChange={setPostCadenceN}
        {...(isVideo
          ? {
              label: __("Render a video every Nth post", "structura"),
              helper: __(
                "Every published post gets a video while your monthly quota lasts.",
                "structura",
              ),
            }
          : {})}
      />

      {/* Actions */}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isSaving}
          >
            {__("Cancel", "structura")}
          </Button>
        )}
        <Button
          type="submit"
          loading={isSaving}
          disabled={!allFilled || (isIndexNow && !indexnow.data)}
        >
          {isEdit ? <Save size={14} /> : <Plus size={14} />}
          <span className="ml-1">
            {isEdit
              ? __("Save changes", "structura")
              : __("Connect channel", "structura")}
          </span>
        </Button>
      </div>
    </form>
  );
};
