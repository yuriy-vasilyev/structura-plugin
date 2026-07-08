/**
 * Every message key the backend may emit in an `HttpsError` details envelope.
 *
 * Organized by domain. To add a new key:
 *   1. Add it here (source of truth).
 *   2. Run `pnpm sync:contracts` to regenerate `functions/src/i18n-contracts/`.
 *   3. Add the translation to every `web/src/i18n/locales/{lang}/error.json`.
 *   4. If the key takes variables, add a typed entry to `ErrorParams` below.
 *
 * These keys are dotted paths resolved against the client's `error` i18next
 * namespace, so the client call looks like:
 *     t(err.details.messageKey, err.details.params, { ns: "error" })
 * and `error.json` stores nested objects per domain:
 *     { "portal": { "linkInvalid": "This login link is no longer valid." } }
 */
export const ERROR_KEYS = {
  auth: {
    missingAuthHeader: "auth.missingAuthHeader",
    malformedAuthHeader: "auth.malformedAuthHeader",
    invalidToken: "auth.invalidToken",
    notSignedIn: "auth.notSignedIn",
  },
  portal: {
    linkInvalid: "portal.linkInvalid",
    linkExpired: "portal.linkExpired",
    tokenRequired: "portal.tokenRequired",
    tokenGenerationFailed: "portal.tokenGenerationFailed",
    exchangeFailed: "portal.exchangeFailed",
  },
  admin: {
    // Single user-facing message for all insufficient-privilege cases —
    // super_admin-only, staff-or-super_admin, setSystemRole, sendTestEmail.
    // Translators don't need to hand-tune copy for each gate.
    insufficientPrivileges: "admin.insufficientPrivileges",
    manualLicenseMissingFields: "admin.manualLicenseMissingFields",
    userMissingEmail: "admin.userMissingEmail",
    licenseNotFound: "admin.licenseNotFound",
    invalidRole: "admin.invalidRole",
    roleUpdateFailed: "admin.roleUpdateFailed",
    licenseIdRequired: "admin.licenseIdRequired",
    // Incidents dashboard (spec: admin-log-triage.md §5.3) — any shape
    // problem on the `/admin/incidents` query params funnels through
    // this single key. Admin UI is English-only by spec §8 but we still
    // route through the typed error envelope so HttpsError details carry
    // a stable messageKey clients can branch on.
    incidentsInvalidArgument: "admin.incidentsInvalidArgument",
    // Admin analytics dashboard (functions/src/admin/dashboard.ts) — the
    // workspace drill-down endpoint validates its `workspaceId` argument
    // and the existence of the target workspace through these keys.
    workspaceIdRequired: "admin.workspaceIdRequired",
    workspaceNotFound: "admin.workspaceNotFound",
  },
  mail: {
    // `available` is a comma-separated list of template IDs — operator-
    // facing, but it's what the super-admin dropdown echoes back.
    unknownTemplateId: "mail.unknownTemplateId",
    noRecipient: "mail.noRecipient",
  },
  subscriptions: {
    priceIdRequired: "subscriptions.priceIdRequired",
    alreadyActive: "subscriptions.alreadyActive",
    priceNotFound: "subscriptions.priceNotFound",
    productMisconfigured: "subscriptions.productMisconfigured",
    checkoutSessionFailed: "subscriptions.checkoutSessionFailed",
    // Webhook-internal errors — user never sees them directly, but the
    // envelope still keeps Sentry / operator tooling consistent.
    metadataMissingUid: "subscriptions.metadataMissingUid",
    userNotFound: "subscriptions.userNotFound",
    planIdUndeterminable: "subscriptions.planIdUndeterminable",
    audienceMissingOrInvalid: "subscriptions.audienceMissingOrInvalid",
    licenseNotFound: "subscriptions.licenseNotFound",
    ltdMetadataMissing: "subscriptions.ltdMetadataMissing",
    ltdMetadataIncomplete: "subscriptions.ltdMetadataIncomplete",
  },
  billing: {
    noBillingProfile: "billing.noBillingProfile",
    portalSessionFailed: "billing.portalSessionFailed",
    // Add-on assignment deep-link funnel (spec §11.4).
    addonIdRequired: "billing.addonIdRequired",
    addonUnknown: "billing.addonUnknown",
    addonNotEntitled: "billing.addonNotEntitled",
    addonDeeplinkFailed: "billing.addonDeeplinkFailed",
    // Caller-input validation for the deep-link callable.
    domainRequired: "billing.domainRequired",
    returnToInvalid: "billing.returnToInvalid",
    intentInvalid: "billing.intentInvalid",
    // State-shape errors during deep-link minting + verify + execute.
    activationNotFound: "billing.activationNotFound",
    noSeatsAvailable: "billing.noSeatsAvailable",
    // Funnel-side verify + execute.
    assignmentTokenInvalid: "billing.assignmentTokenInvalid",
    assignmentTokenExpired: "billing.assignmentTokenExpired",
    assignmentFailed: "billing.assignmentFailed",
  },
  channels: {
    // Spec: specs/integrations-store-spec.md §6, §7
    // OAuth lifecycle
    oauthStateInvalid: "channels.oauthStateInvalid",
    oauthCodeExchangeFailed: "channels.oauthCodeExchangeFailed",
    oauthScopeMissing: "channels.oauthScopeMissing",
    // Connection lookup / state
    connectionNotFound: "channels.connectionNotFound",
    connectionExpired: "channels.connectionExpired",
    connectionRevoked: "channels.connectionRevoked",
    // Catalog & entitlement
    integrationUnknown: "channels.integrationUnknown",
    notEntitled: "channels.notEntitled",
    // Publish / dispatch
    publishFailed: "channels.publishFailed",
    rateLimited: "channels.rateLimited",
    webhookUrlInvalid: "channels.webhookUrlInvalid",
    // Adaptation (AI rewrite for a channel)
    adaptationFailed: "channels.adaptationFailed",
  },
  workspaces: {
    // Phase 3.1+3.2 — initially operator-facing only. Phase 3.7
    // wires the portal to workspace UI; Pass A (member role + remove)
    // adds the user-facing rejection paths below. Translations now
    // land in `web/src/i18n/locales/{lang}/error.json`.
    alreadyExists: "workspaces.alreadyExists",
    notFound: "workspaces.notFound",
    memberAlreadyExists: "workspaces.memberAlreadyExists",
    memberNotFound: "workspaces.memberNotFound",
    cannotRemoveLastOwner: "workspaces.cannotRemoveLastOwner",
    // Phase 3.7 Pass A — member role/remove guards.
    invalidRole: "workspaces.invalidRole",
    cannotDemoteLastOwner: "workspaces.cannotDemoteLastOwner",
    cannotChangeOwnRole: "workspaces.cannotChangeOwnRole",
    cannotRemoveSelf: "workspaces.cannotRemoveSelf",
    // Phase 3.7 Pass B — invitation flow.
    invalidEmail: "workspaces.invalidEmail",
    cannotInviteOwner:
      "workspaces.cannotInviteOwner",
    invitationAlreadyMember: "workspaces.invitationAlreadyMember",
    invitationAlreadyPending: "workspaces.invitationAlreadyPending",
    invitationNotFound: "workspaces.invitationNotFound",
    invitationExpired: "workspaces.invitationExpired",
    invitationRevoked: "workspaces.invitationRevoked",
    invitationAlreadyAccepted: "workspaces.invitationAlreadyAccepted",
    invitationEmailMismatch: "workspaces.invitationEmailMismatch",
    // Phase 3.7 Pass C — workspace settings (rename).
    nameRequired: "workspaces.nameRequired",
    nameTooLong: "workspaces.nameTooLong",
    // Phase 3.7 Pass D — transfer ownership.
    cannotTransferToSelf: "workspaces.cannotTransferToSelf",
    targetAlreadyOwner: "workspaces.targetAlreadyOwner",
    // Per-member site visibility — allowedActivationIds guards.
    cannotRestrictAdmin: "workspaces.cannotRestrictAdmin",
    cannotChangeOwnSiteAccess: "workspaces.cannotChangeOwnSiteAccess",
    unknownActivationIds: "workspaces.unknownActivationIds",
    // cloud-only-generation Phase 2 — rejection codes the engine
    // surfaces when key resolution or rate-limiting blocks a run.
    credentialsMissing: "workspaces.credentialsMissing",
    tierQuotaExceeded: "workspaces.tierQuotaExceeded",
    // cloud-only-generation Phase 5 — portal-side credential
    // management endpoints (create / revoke). The provider/api-key
    // validation guards live at the wire boundary so a portal compromise
    // can't store junk into the workspace credentials collection.
    credentialInvalidProvider: "workspaces.credentialInvalidProvider",
    credentialInvalidApiKey: "workspaces.credentialInvalidApiKey",
    credentialNotFound: "workspaces.credentialNotFound",
    // Plan-tier entitlement gates — the chosen provider/capability isn't
    // available on the workspace's current plan (mirrors the plugin's
    // Provider_Registry min_tier table + agency-only member invites).
    credentialProviderNotInPlan: "workspaces.credentialProviderNotInPlan",
    inviteNotInPlan: "workspaces.inviteNotInPlan",
    // Portal visual-preset CRUD — a preset still bound to a site
    // can't be deleted (it would break image generation there).
    presetBound: "workspaces.presetBound",
  },
  account: {
    // Account self-deletion (`deleteAccount`) preconditions. The owner
    // must wind these down themselves before we tear the account down:
    // cancellation has refund/proration consequences, and removing the
    // team is an explicit decision we won't make on their behalf.
    cancelSubscriptionFirst: "account.cancelSubscriptionFirst",
    removeMembersFirst: "account.removeMembersFirst",
  },
  sites: {
    // Hard cap on the number of sites (activations) a license may own,
    // shared across surfaces (WP + Headless). Surfaced by the portal
    // "Add Site" flow when `activationsCount >= maxSites` so it can prompt an
    // upgrade. (The legacy WP activation path only WARNS over-cap by email;
    // this is the new hard pre-create gate — `specs/v2/headless-surface.md` #15.)
    limitReached: "sites.limitReached",
    // A site with the same host is already active in this workspace —
    // duplicate creates are invariably double-submits or wizard retries.
    alreadyConnected: "sites.alreadyConnected",
    // Anti-rotation: site slots stay committed for the rest of the
    // billing cycle after disconnect, so a 1-site license can't
    // serially generate for unlimited sites by connect → generate →
    // disconnect cycling.
    slotCommitted: "sites.slotCommitted",
    // Image generation (e.g. the headless editor's "Regenerate image") needs a
    // visual preset bound to the site for art direction; surfaced so the dialog
    // can point the user at Settings → Visuals.
    visualPresetUnbound: "sites.visualPresetUnbound",
    // The headless post editor lets you backdate a post's publish date, but a
    // future date is rejected — we don't run a scheduler, so a future date would
    // simply hide the post from the public feed with no way to surface it later.
    publishDateInFuture: "sites.publishDateInFuture",
  },
  campaigns: {
    // Portal campaign-create gates — parity with the plugin REST path's
    // machine-readable rejections (personas_required, etc.).
    personasRequired: "campaigns.personasRequired",
    providerNotAllowed: "campaigns.providerNotAllowed",
    limitReached: "campaigns.limitReached",
    cadenceLimit: "campaigns.cadenceLimit",
    // Portal "Run now" gates (campaigns/portal-run.ts).
    paused: "campaigns.paused",
    weeklyCapReached: "campaigns.weeklyCapReached",
  },
  common: {
    internal: "common.internal",
  },
} as const;

/**
 * Flat union of every wire-level error key. This is what travels in
 * `HttpsError.details.messageKey` and is what the client passes to `t()`.
 */
export type ErrorKey =
  | (typeof ERROR_KEYS.auth)[keyof typeof ERROR_KEYS.auth]
  | (typeof ERROR_KEYS.portal)[keyof typeof ERROR_KEYS.portal]
  | (typeof ERROR_KEYS.admin)[keyof typeof ERROR_KEYS.admin]
  | (typeof ERROR_KEYS.mail)[keyof typeof ERROR_KEYS.mail]
  | (typeof ERROR_KEYS.subscriptions)[keyof typeof ERROR_KEYS.subscriptions]
  | (typeof ERROR_KEYS.billing)[keyof typeof ERROR_KEYS.billing]
  | (typeof ERROR_KEYS.channels)[keyof typeof ERROR_KEYS.channels]
  | (typeof ERROR_KEYS.workspaces)[keyof typeof ERROR_KEYS.workspaces]
  | (typeof ERROR_KEYS.account)[keyof typeof ERROR_KEYS.account]
  | (typeof ERROR_KEYS.sites)[keyof typeof ERROR_KEYS.sites]
  | (typeof ERROR_KEYS.campaigns)[keyof typeof ERROR_KEYS.campaigns]
  | (typeof ERROR_KEYS.common)[keyof typeof ERROR_KEYS.common];

/**
 * Per-key typed parameter map. Keys that take variables MUST be listed here
 * so TypeScript forces callers of `httpsError()` to supply them.
 *
 * Keys that take no variables are simply omitted.
 */
export interface ErrorParams {
  "auth.invalidToken": { reason: string };
  "mail.unknownTemplateId": { available: string };
  // Channels — operator-facing detail rendered into the user message.
  // Billing — operator-facing detail for unknown add-on echoes.
  "billing.addonUnknown": { id: string };
  "billing.addonNotEntitled": { addonId: string };
  "billing.activationNotFound": { domain: string };
  "billing.noSeatsAvailable": { addonId: string; maxSeats: number };
  "channels.integrationUnknown": { id: string };
  "channels.notEntitled": { sku: string };
  "channels.publishFailed": { reason: string };
  "channels.rateLimited": { retryAfterSeconds: number };
  "channels.adaptationFailed": { reason: string };
  "sites.limitReached": { maxSites: number };
  "sites.alreadyConnected": { domain: string };
  "sites.slotCommitted": { maxSites: number };
  "campaigns.limitReached": { limit: number };
  "campaigns.cadenceLimit": { maxPerWeek: number };
}
