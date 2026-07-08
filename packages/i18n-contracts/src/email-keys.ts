/**
 * Email template identifiers. Each value maps to a key prefix in
 * `functions/src/i18n/locales/{lang}/emails.json`, e.g. EmailTemplate.Welcome
 * → `welcome.subject`, `welcome.heading`, `welcome.body`, ...
 *
 * Intentionally a small surface today — expand as templates are migrated
 * off hard-coded strings in `functions/src/mail/templates.ts`.
 */
export const EMAIL_TEMPLATES = {
  Welcome: "welcome",
  MagicLink: "magicLink",
  LicenseActivated: "licenseActivated",
} as const;

export type EmailTemplate =
  (typeof EMAIL_TEMPLATES)[keyof typeof EMAIL_TEMPLATES];
