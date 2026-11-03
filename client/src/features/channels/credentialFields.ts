/**
 * Credential field registry for the non-webhook channels (email-owner,
 * telegram, whatsapp, plus the zero-field indexnow / video installs).
 * Shared by the install form (`AddCredentialForm`) and the Configure modal
 * (`ConfigureConnectionModal`), which edits the same fields in place.
 *
 * Keep field keys in lockstep with the cloud-side validation functions:
 *   - email-owner: `validateRecipientEmail` in EmailOwnerIntegration.ts
 *   - telegram:    `validateTelegramCredentials` in TelegramIntegration.ts
 *   - whatsapp:    `validateWhatsAppCredentials` in WhatsAppIntegration.ts
 */

import { __, sprintf } from "@wordpress/i18n";

export interface CredentialFieldDef {
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
 */
export const CREDENTIAL_FIELDS: Record<string, CredentialFieldDef[]> = {
  // IndexNow needs no credentials — the integration fires an auth-less HTTP
  // ping. The user only picks a display name + notification locale.
  indexnow: [],
  // Video renders happen entirely cloud-side — nothing to authenticate.
  // Install just creates the connection with the cloud defaults; the
  // post-install configure hand-off (InstallModal) opens the settings
  // modal where voice/cadence live.
  video: [],
  "email-owner": [
    {
      key: "recipientEmail",
      label: __("Recipient email", "structura"),
      placeholder: "you@example.com",
      type: "email",
      help: __(
        "Gets an email when a post publishes, and when a campaign holds one for review.",
        "structura",
      ),
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

/**
 * The one credential field the cloud echoes back unencrypted as the
 * connection's `externalAccountId` (the list row's second line). The
 * Configure modal prefills this field from it; every other field starts
 * blank and a blank keeps the stored value on save. Mirrors
 * `credentialExternalId()` in `functions/src/channels/endpoints/connections.ts`.
 */
const EXTERNAL_ID_FIELD: Record<string, string> = {
  "email-owner": "recipientEmail",
  telegram: "chatId",
  whatsapp: "recipientPhone",
};

/** Returns the credential field key mirrored by `externalAccountId`, if any. */
export function credentialExternalIdKey(integrationId: string): string | null {
  return EXTERNAL_ID_FIELD[integrationId] ?? null;
}

/** Returns whether the Configure modal can edit this channel's credentials in place. */
export function isCredentialEditableIntegration(integrationId: string): boolean {
  return integrationId in EXTERNAL_ID_FIELD;
}
