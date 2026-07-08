/**
 * Add-webhook sub-form — used both as a standalone card (legacy Connections
 * page surface) and inside the Store's InstallModal.
 *
 * Slack and Discord both use the same shape ({ webhook_url, display_name })
 * so this form is integration-agnostic. Cloud-side validation
 * (`integration.validateTarget()`) is the source of truth for "is this URL
 * valid for this provider"; we only do basic shape checks here so the user
 * doesn't need to hit the network for an obvious typo.
 *
 * Surfacing the cloud's exact error message is critical UX:
 * "Webhook URL must be on hooks.slack.com" is a much better hint than a
 * generic 400.
 *
 * --- Variants ---------------------------------------------------------------
 * `variant="standalone"` renders the outer card chrome + header block. Used
 *   on the Connections page (historical; will go away once everything flows
 *   through the Store modal).
 * `variant="modal"` drops the outer card and header because the Dialog
 *   already supplies that chrome.
 *
 * When `availableIntegrations` has exactly one entry, the "Channel type"
 * Select is hidden — the caller (e.g. the install modal) already knows which
 * integration this is for, so asking again is noise.
 */

import { FormEvent, useMemo, useState } from "react";
import { __ } from "@wordpress/i18n";
import { Plus, RefreshCcw, Save } from "lucide-react";
import { Button, InputField, Select, cn } from "@structura/ui";
import { useChannelConnectionMutations } from "../api/useChannelConnectionMutations";
import type { ConnectionSummary } from "../types";
import { CampaignBindingsPicker } from "./CampaignBindingsPicker";
import { CadencePicker } from "./CadencePicker";

/**
 * One row in the integration picker. Slack + Discord use different webhook
 * URL shapes, so callers can tailor the placeholders per integration; the
 * defaults stay generic-but-not-wrong for any future webhook entry.
 */
export interface WebhookFormIntegrationOption {
  id: string;
  label: string;
  /** Placeholder shown in the Webhook URL input when this option is selected. */
  webhookUrlPlaceholder?: string;
  /** Placeholder shown in the Display name input when this option is selected. */
  displayNamePlaceholder?: string;
  /**
   * Whether this integration's outbound bodies are signed — when true the
   * form renders a required "Signing secret" field + a Generate button.
   * Slack/Discord (unsigned) leave it off; webhook-ping sets it. Kept as a
   * per-option flag rather than a hardcoded switch on `id` so future signed
   * webhooks (webhook-content, webhook-crm) opt in without touching this
   * component's branching.
   */
  requireSigningSecret?: boolean;
}

interface AddWebhookFormProps {
  /** Catalog ids the form lets the user pick. Defaults to the Phase 2 set. */
  availableIntegrations?: WebhookFormIntegrationOption[];
  /** Visual treatment — modal omits the outer card chrome. */
  variant?: "standalone" | "modal";
  /** Fires after the save mutation resolves successfully. Modal uses this to close itself. */
  onSuccess?: () => void;
  /**
   * Fires when the user clicks the Cancel button (modal variant only — the
   * standalone card has no cancel affordance because it's never blocking).
   */
  onCancel?: () => void;
  /**
   * When set, the form switches into edit mode:
   *   - Display name + notification locale are pre-populated from the saved
   *     connection so the user can tweak them without re-entering values.
   *   - The webhook URL field is left blank — the cloud stores that as an
   *     encrypted secret and never echoes it back, so we can't pre-fill it.
   *     The user re-pastes the URL as part of the save; a helper hint above
   *     the field explains why.
   *   - The submit button reads "Save changes" + posts `connection_id` so the
   *     cloud updates in place (same UUID, summary merged, secret rotated).
   */
  editingConnection?: ConnectionSummary;
}

// Kept in lockstep with the cloud catalog ids in
// functions/src/channels/integrations/WebhookNotifyIntegration.ts
// (SLACK_WEBHOOK_INTEGRATION_ID, DISCORD_WEBHOOK_INTEGRATION_ID) and
// WebhookPingIntegration.ts (WEBHOOK_PING_INTEGRATION_ID).
const DEFAULT_INTEGRATIONS: WebhookFormIntegrationOption[] = [
  {
    id: "slack-webhook",
    label: "Slack",
    webhookUrlPlaceholder: "https://hooks.slack.com/services/…",
    displayNamePlaceholder: "#deploys",
  },
  {
    id: "discord-webhook",
    label: "Discord",
    webhookUrlPlaceholder: "https://discord.com/api/webhooks/…",
    displayNamePlaceholder: "#general",
  },
  {
    id: "webhook-ping",
    label: "Webhook",
    // Generic consumer — any HTTPS endpoint. The placeholder shows a
    // revalidator-style path because that's the canonical first use case
    // (Next.js / Astro headless frontends calling back into WP for fresh
    // content); users with a different consumer will replace the whole URL.
    webhookUrlPlaceholder: "https://example.com/api/revalidate",
    displayNamePlaceholder: "Next.js revalidator",
    requireSigningSecret: true,
  },
];

/**
 * Mint a high-entropy signing secret via the Web Crypto API. 32 bytes → 64
 * hex chars, which matches the cloud catalog's expected shape and
 * comfortably clears the 16-char minimum enforced on the save endpoint.
 *
 * Using `crypto.getRandomValues` keeps this dependency-free — no Node
 * `crypto` shim in the admin bundle, no third-party RNG library. The API is
 * available in every browser the wp-admin SPA supports today.
 */
function generateSigningSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Notification-language options for the webhook install flow.
 *
 * `"system"` (the default) means: render each notification in the site locale
 * the publishing event was emitted under — this is what a single-language WP
 * install wants and matches the "System language" default in campaign
 * settings. Explicit codes let an agency running a non-English client site
 * still deliver alerts in their reviewer team's language (e.g. generate
 * Spanish content but notify the GB reviewer team in English).
 *
 * The option labels are rendered in each option's own language on purpose
 * (Deutsch / Español / Français) so the dropdown reads correctly even if the
 * WP admin's own locale differs — matches how browser and OS locale pickers
 * behave.
 *
 * Keep this list in lockstep with cloud-side `SUPPORTED_NOTIFICATION_LOCALES`
 * in `functions/src/channels/endpoints/connections.ts` and the `MESSAGES`
 * record in `WebhookNotifyIntegration.ts`.
 */
const NOTIFICATION_LOCALE_OPTIONS = [
  // `__()`ing only the System label keeps "English / Deutsch / Español /
  // Français" in their native form; the System entry follows the WP admin
  // language because that's what a single-site user actually reads the list
  // in.
  { value: "system", labelKey: "System language" as const },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
] as const;

export const AddWebhookForm = ({
  availableIntegrations = DEFAULT_INTEGRATIONS,
  variant = "standalone",
  onSuccess,
  onCancel,
  editingConnection,
}: AddWebhookFormProps) => {
  const isEdit = Boolean(editingConnection);

  // Seed from the connection summary in edit mode. We keep the webhook URL
  // input blank because the cloud never round-trips secrets — the user
  // re-pastes it even for a display-name change so the same submit path
  // covers both "rename" and "rotate URL" without a separate endpoint.
  const [integrationId, setIntegrationId] = useState(
    editingConnection?.integrationId ?? availableIntegrations[0]?.id ?? "",
  );
  const [webhookUrl, setWebhookUrl] = useState("");
  // Signing secret is never echoed back by the cloud (stored encrypted), so
  // the field starts blank in both install and edit mode. On edit, leaving
  // the field blank tells the cloud to preserve the existing secret (so a
  // display-name-only edit doesn't require the user to dig out the value);
  // typing or generating a new one is treated as an explicit rotation —
  // the consumer needs the new value too. handleSubmit + the cloud share
  // this contract; the amber hint above the field surfaces it to the user.
  const [signingSecret, setSigningSecret] = useState("");
  const [displayName, setDisplayName] = useState(
    editingConnection?.displayName ?? "",
  );
  // Default to `"system"` — same semantics as campaign settings: follow the
  // site locale at dispatch time unless the user explicitly overrides it.
  const [notificationLocale, setNotificationLocale] = useState<string>(
    editingConnection?.notificationLocale ?? "system",
  );
  // Per-campaign binding filter. `null` means "all campaigns" — the wire
  // default and what a fresh install always starts as. Seeded from the
  // connection summary on edit so an existing allowlist is preserved unless
  // the user explicitly changes it. Legacy docs written before bindings
  // landed ship the field as `undefined` / `null` which both coerce to `null`
  // here — same as "all campaigns" semantically.
  const [boundCampaignIds, setBoundCampaignIds] = useState<(string | number)[] | null>(
    editingConnection?.boundCampaignIds ?? null,
  );
  // "Every Nth post" cadence. See CadencePicker + ConnectionSummary.postCadenceN.
  const [postCadenceN, setPostCadenceN] = useState<number>(
    editingConnection?.postCadenceN ?? 1,
  );

  const { saveWebhook, isSaving, saveError } = useChannelConnectionMutations();

  // Memoize so the Select context value is stable between renders — otherwise
  // the inner Listbox re-mounts and the dropdown closes after every keystroke
  // in the sibling InputField inputs.
  const selectOptions = useMemo(
    () => availableIntegrations.map((opt) => ({ value: opt.id, label: opt.label })),
    [availableIntegrations],
  );

  // Same stability trick for the notification-language list. The System entry
  // is translated through `__` so it honors the current WP admin locale; the
  // explicit-locale labels stay in their own language on purpose.
  const notificationLocaleOptions = useMemo(
    () =>
      NOTIFICATION_LOCALE_OPTIONS.map((opt) =>
        "labelKey" in opt
          ? { value: opt.value, label: __(opt.labelKey, "structura") }
          : { value: opt.value, label: opt.label },
      ),
    [],
  );

  // When there's only one integration to install (e.g. the modal scoped this
  // to "slack-webhook"), hiding the Select keeps the form focused on the
  // fields the user actually needs to fill in.
  const showIntegrationSelect = availableIntegrations.length > 1;

  // Placeholders track the currently-selected integration so the URL hint
  // matches the provider — Discord webhooks live on `discord.com/api/webhooks`,
  // not `hooks.slack.com`, and showing the wrong host is actively misleading.
  const selectedOption = availableIntegrations.find((opt) => opt.id === integrationId);
  const webhookUrlPlaceholder =
    selectedOption?.webhookUrlPlaceholder ?? "https://hooks.example.com/…";
  const displayNamePlaceholder =
    selectedOption?.displayNamePlaceholder ?? __("#general", "structura");
  const requiresSigningSecret = Boolean(selectedOption?.requireSigningSecret);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!integrationId || !webhookUrl) return;
    // Mirror the cloud-side gate so an obviously empty / too-short secret
    // never reaches the network. The cloud is still the source of truth for
    // validation; this is just to surface the issue inline before submit.
    //
    // Edit mode loosens the rule: an empty secret means "keep the existing
    // one" and the cloud preserves it from the stored blob. A non-empty
    // value in edit mode is a rotation and still has to clear the 16-char
    // floor. Fresh installs always require a ≥16-char secret for signed
    // integrations.
    const trimmedSecret = signingSecret.trim();
    if (requiresSigningSecret) {
      if (!isEdit && trimmedSecret.length < 16) return;
      if (isEdit && trimmedSecret !== "" && trimmedSecret.length < 16) return;
    }

    try {
      await saveWebhook({
        integration_id: integrationId,
        // When editing, pass the existing UUID through so the cloud updates
        // in place rather than minting a sibling doc. On fresh install we
        // omit this and the cloud mints a new UUID.
        connection_id: editingConnection?.connectionId,
        webhook_url: webhookUrl.trim(),
        // Only attach the secret when the integration declares it AND the
        // user actually supplied one. In edit mode an empty string means
        // "keep existing" — we send `undefined` so the cloud's preserve path
        // kicks in rather than submitting a would-be-rejected empty value.
        // Slack/Discord never forward the field either way.
        signing_secret:
          requiresSigningSecret && trimmedSecret !== ""
            ? trimmedSecret
            : undefined,
        display_name: displayName.trim() || undefined,
        // Always post the locale — the cloud normalizes unknown/empty to
        // "system" so sending it unconditionally keeps the wire payload
        // explicit about user intent.
        notification_locale: notificationLocale,
        // Bindings: `null` = "all campaigns" (the default). An explicit empty
        // array means the user toggled into "Selected only" without ticking
        // anything — cloud normalizes it back to `null`, so either shape is
        // safe, but we pass the array through so the intent is preserved on
        // the wire for dispatcher logs + auditability.
        bound_campaign_ids: boundCampaignIds,
        post_cadence_n: postCadenceN,
      });
      // Only reset on success so a failed attempt keeps the user's input
      // around and the error message stays meaningful. In edit mode we don't
      // reset display_name / locale — the modal closes immediately on
      // onSuccess so the reset would flash through briefly if we touched it.
      if (!isEdit) {
        setWebhookUrl("");
        setSigningSecret("");
        setDisplayName("");
        setNotificationLocale("system");
        setBoundCampaignIds(null);
        setPostCadenceN(1);
      } else {
        setWebhookUrl("");
        setSigningSecret("");
      }
      onSuccess?.();
    } catch {
      // Mutation hook surfaces the message via `saveError`.
    }
  };

  const isModal = variant === "modal";

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "space-y-4",
        !isModal &&
          "rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-800",
      )}
    >
      {!isModal && (
        <div>
          <h3 className="m-0! text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {__("Add a webhook channel", "structura")}
          </h3>
          <p className="mt-1! mb-0! text-xs text-neutral-500 dark:text-neutral-400">
            {__(
              "Paste an incoming-webhook URL from Slack or Discord. Structura will post a notification each time a campaign publishes.",
              "structura",
            )}
          </p>
        </div>
      )}

      <div className={cn("grid gap-3", showIntegrationSelect && "sm:grid-cols-2")}>
        {showIntegrationSelect && (
          <Select
            value={integrationId}
            onValueChange={(val) => setIntegrationId(String(val))}
            options={selectOptions}
            // Locked on edit — swapping provider mid-edit would mean deleting
            // this connection and creating a new one, which is exactly what
            // our delete + install flow is for. Keeping the picker disabled
            // rather than hidden preserves the visual form shape in edit
            // mode so the user can still see which provider they're editing.
            disabled={isEdit}
          >
            <Select.Label>{__("Channel type", "structura")}</Select.Label>
            <Select.Trigger placeholder={__("Choose an integration…", "structura")} />
            <Select.Content className="w-(--button-width)">
              {selectOptions.map((opt) => (
                <Select.Item key={opt.value} value={opt.value}>
                  {opt.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        )}

        <InputField
          label={__("Display name (optional)", "structura")}
          placeholder={displayNamePlaceholder}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        {/* On edit, the URL is blank by design — we never echo the saved
            secret back to the browser, so the user re-pastes it. The helper
            text makes that explicit instead of leaving the user wondering
            why the field is empty on an "Edit" form. Rendered outside
            InputField because the design-system primitive only exposes a
            label + error slot today. */}
        {isEdit && (
          <p className="m-0! rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
            {__(
              "Paste the webhook URL again to save changes — we never display your saved URL for security.",
              "structura",
            )}
          </p>
        )}
        <InputField
          label={__("Webhook URL", "structura")}
          placeholder={webhookUrlPlaceholder}
          value={webhookUrl}
          onChange={(event) => setWebhookUrl(event.target.value)}
          type="url"
          required
          // Surface the cloud's exact reason inline so the user can fix the
          // input without re-reading a toast.
          error={saveError ?? undefined}
        />
      </div>

      {/* Signing secret — only for integrations whose outbound bodies are
          HMAC-signed (webhook-ping today). The consumer endpoint verifies
          `X-Structura-Signature` against this exact value, so on create we
          treat it as required rather than an "advanced" toggle — that keeps
          users from ending up with a silently-broken consumer. On edit we
          deliberately loosen the gate: the cloud doesn't echo secrets back,
          so forcing retype for something as mundane as a display-name change
          would be a sharp edge. Empty + edit means "preserve what's stored";
          a filled-in value is treated as an explicit rotation. The amber
          hint makes that contract explicit to the user. */}
      {requiresSigningSecret && (
        <div className="space-y-2">
          {isEdit && (
            <p className="m-0! rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
              {__(
                "Leave this blank to keep your current signing secret. Click Generate to rotate — your consumer will need the new value too.",
                "structura",
              )}
            </p>
          )}
          <InputField
            label={__("Signing secret", "structura")}
            placeholder={__(
              "64 hex characters — click Generate to mint",
              "structura",
            )}
            value={signingSecret}
            onChange={(event) => setSigningSecret(event.target.value)}
            // type=text on purpose so users can copy the generated value
            // straight into their consumer's env config. Password-masking
            // it would force an extra "reveal" step for zero real benefit —
            // the secret lives in wp-admin next to the WP login anyway.
            type="text"
            // Required only on create. On edit, empty means "keep the
            // stored secret" — see the amber hint above and the path-aware
            // gate in handleSubmit. HTML5 `required` would otherwise block
            // display-name-only edits.
            required={!isEdit}
          />
          <div className="flex items-center justify-between gap-2">
            {/* Helper text rendered as a sibling rather than via an InputField
                slot because the design-system primitive only exposes label +
                error (no helperText) today. Matches the amber hint pattern
                already used on the edit-mode URL helper above. */}
            <p className="m-0! text-[11px] text-neutral-500 dark:text-neutral-400">
              {__(
                "Your consumer verifies each delivery against this secret. At least 16 characters; Generate mints 32 bytes of random.",
                "structura",
              )}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setSigningSecret(generateSigningSecret())}
            >
              <RefreshCcw size={14} className="mr-1" />
              {__("Generate", "structura")}
            </Button>
          </div>
        </div>
      )}

      {/* Notification language.
          "System language" (default) means the notification follows the
          event's site locale at dispatch time — this is what single-language
          WP installs want. Explicit locales let an agency decouple the
          reviewer team's language from the client site's language (e.g.
          Spanish post → English Slack for a GB reviewer team). */}
      <Select
        value={notificationLocale}
        onValueChange={(val) => setNotificationLocale(String(val))}
        options={notificationLocaleOptions}
      >
        <Select.Label>{__("Notification language", "structura")}</Select.Label>
        <Select.Trigger placeholder={__("Choose a language…", "structura")} />
        <Select.Content className="w-(--button-width)">
          {notificationLocaleOptions.map((opt) => (
            <Select.Item key={opt.value} value={opt.value}>
              {opt.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>

      {/* Per-campaign binding filter. Default is "all campaigns" so a fresh
          install stays maximally useful; agencies running one connection
          across many client campaigns narrow it here. The campaign-edit
          "Channels" section is the second lens on the same field — both
          surfaces read/write `boundCampaignIds` on the connection doc. */}
      <CampaignBindingsPicker
        value={boundCampaignIds}
        onChange={setBoundCampaignIds}
      />

      {/* "Every Nth post" cadence — paired with the bindings filter. See
          CadencePicker for semantics. */}
      <CadencePicker value={postCadenceN} onChange={setPostCadenceN} />

      <div className="flex justify-end gap-2">
        {/* Cancel is modal-only — the standalone card has no parent to
            dismiss to. Rendered before Submit so keyboard users tab to
            Submit last (matches the visual primary-action ordering). */}
        {isModal && onCancel && (
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
          disabled={
            !webhookUrl ||
            !integrationId ||
            // Fresh installs must clear the 16-char floor before the button
            // activates. Edit mode allows an empty secret (preserve path) but
            // still gates rotation attempts shorter than 16 chars so the user
            // sees an inert button instead of submitting a would-be-rejected
            // rotation.
            (requiresSigningSecret &&
              !isEdit &&
              signingSecret.trim().length < 16) ||
            (requiresSigningSecret &&
              isEdit &&
              signingSecret.trim() !== "" &&
              signingSecret.trim().length < 16)
          }
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
