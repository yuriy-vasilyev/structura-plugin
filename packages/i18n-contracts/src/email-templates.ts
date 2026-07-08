/**
 * Canonical, ordered list of localized email template ids — the single source
 * of truth shared by the cloud renderer registry
 * (`functions/src/mail/index.ts`'s `LOCALIZED_TEMPLATE_RENDERERS`) and the
 * admin "Test Email" dropdown in the web portal.
 *
 * Why this lives in the shared package: the web can't import from `functions/`,
 * so the dropdown used to hardcode its own copy of the list — which drifted
 * (missing templates, stale ids). With the list here, both sides import it and
 * a compile-time assertion in the registry guarantees the renderers cover
 * exactly these ids. Add a template once, here (and add its renderer), and both
 * the dropdown and the registry stay in lockstep.
 *
 * Order is the order shown in the admin dropdown.
 *
 * NOTE: distinct from `email-keys.ts`'s `EMAIL_TEMPLATES`, which maps to i18n
 * message-key prefixes — these are the renderer ids the admin panel sends.
 */
export const LOCALIZED_EMAIL_TEMPLATE_IDS = [
  "free-tier-welcome",
  "activation-reminder",
  "license-activated",
  "license-limit-reached",
  "license-limit-exceeded",
  "subscription-started",
  "subscription-cancelled",
  "payment-failed",
  "account-deleted",
  "magic-link-login",
  "admin-license-override",
  "plugin-diagnostic-report",
  "campaign-text-step-failed-byok",
  "campaign-text-step-failed-cloud",
  "campaign-image-step-failed-byok",
  "campaign-image-step-failed-cloud",
  "headless-draft-ready",
  "video-ready",
  "workspace-member-update",
] as const;

/** Union of every localized email template id. */
export type LocalizedEmailTemplateId = (typeof LOCALIZED_EMAIL_TEMPLATE_IDS)[number];
