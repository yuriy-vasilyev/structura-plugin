/**
 * Every i18n key emitted onto a `notices` Firestore doc by a
 * classifier rule (or via the `/v1/notices/report` endpoint).
 *
 * Spec: `specs/v2/notification-center.md` §9.
 *
 * The cloud never writes literal user-facing strings to a notice;
 * it writes keys (`notices.byok.key_rejected.title`) and the
 * surface (wp-admin or the web portal) resolves them against the
 * user's current locale. That keeps content out of Firestore
 * (cheaper docs, easier to retune copy), and lets one notice
 * render correctly to a user whose locale doesn't match the
 * locale of whoever first triggered it.
 *
 * The keys here are dotted paths resolved against the `notices`
 * i18n namespace in the surface:
 *   t(doc.titleKey, doc.bodyParams, { ns: "notices" })
 *
 * Surface-owned UI strings (`Acknowledge`, `Dismiss`, "No active
 * notices") are NOT part of this contract — they don't come from
 * the cloud, and live in each surface's own translation files.
 *
 * To add a new key:
 *   1. Add it here.
 *   2. Run `pnpm sync:contracts`.
 *   3. Add translations to every `web/src/i18n/locales/{lang}/notices.json`
 *      (en/de/es/fr — all four per AGENTS.md §6).
 *   4. If the key takes variables, document them in a comment.
 */

export const NOTICE_KEYS = {
  byok: {
    credentials_missing: {
      // bodyParams: { provider: string }
      title: "notices.byok.credentials_missing.title",
      body: "notices.byok.credentials_missing.body",
      cta: "notices.byok.credentials_missing.cta",
    },
    key_rejected: {
      // bodyParams: { provider: string }
      title: "notices.byok.key_rejected.title",
      body: "notices.byok.key_rejected.body",
      cta: "notices.byok.key_rejected.cta",
    },
  },
  quota: {
    managed: {
      // bodyParams: none
      title: "notices.quota.managed.title",
      body: "notices.quota.managed.body",
      cta: "notices.quota.managed.cta",
    },
  },
  billing: {
    payment_failed: {
      title: "notices.billing.payment_failed.title",
      body: "notices.billing.payment_failed.body",
      cta: "notices.billing.payment_failed.cta",
    },
    dunning: {
      title: "notices.billing.dunning.title",
      body: "notices.billing.dunning.body",
      cta: "notices.billing.dunning.cta",
    },
  },
  license: {
    activation_failed: {
      title: "notices.license.activation_failed.title",
      body: "notices.license.activation_failed.body",
      cta: "notices.license.activation_failed.cta",
    },
  },
  connection: {
    oauth_broken: {
      // bodyParams: { integrationId: string }
      title: "notices.connection.oauth_broken.title",
      body: "notices.connection.oauth_broken.body",
      cta: "notices.connection.oauth_broken.cta",
    },
    webhook_unreachable: {
      // bodyParams: { integrationId: string }
      title: "notices.connection.webhook_unreachable.title",
      body: "notices.connection.webhook_unreachable.body",
      cta: "notices.connection.webhook_unreachable.cta",
    },
  },
  pluginHealth: {
    // Reported by the plugin's diagnostics button (POST /v1/notices/report).
    // Keys here are seeded by the cloud endpoint when the plugin posts a
    // `subjectId` — e.g. "compat", "scheduler", "version". Each subjectId
    // gets its own title/body/cta triplet in the JSON translations.
    compat: {
      title: "notices.pluginHealth.compat.title",
      body: "notices.pluginHealth.compat.body",
      cta: "notices.pluginHealth.compat.cta",
    },
    // Cloud → plugin reachability. Reported when the plugin's handshake
    // probe (Site_Reachability) finds the cloud can't POST a blueprint
    // back to the site (localhost / private / firewalled). Generated
    // posts never land, so this is an `error`-severity finding.
    connectivity: {
      title: "notices.pluginHealth.connectivity.title",
      body: "notices.pluginHealth.connectivity.body",
      cta: "notices.pluginHealth.connectivity.cta",
    },
    scheduler: {
      title: "notices.pluginHealth.scheduler.title",
      body: "notices.pluginHealth.scheduler.body",
      cta: "notices.pluginHealth.scheduler.cta",
    },
    version: {
      title: "notices.pluginHealth.version.title",
      body: "notices.pluginHealth.version.body",
      cta: "notices.pluginHealth.version.cta",
    },
  },
  generation: {
    // Emitted by the provider-failure notifier when a campaign/post
    // generation step fails for a reason that isn't already covered by
    // a more specific rule (BYOK key, quota). Workspace-scoped, deduped
    // to one open notice, auto-resolved on the next successful post.
    // bodyParams: none
    failed: {
      title: "notices.generation.failed.title",
      body: "notices.generation.failed.body",
      cta: "notices.generation.failed.cta",
    },
  },
  // Spec: specs/seo-intelligence-plan.md §6. Workspace-scoped
  // notices for monthly refresh outcomes and budget transitions.
  // The seo intel surface intentionally never names DataForSEO —
  // copy stays "magic-but-vague" (spec §3.2).
  seoIntel: {
    // Fires once per campaign after a successful monthly refresh.
    // bodyParams: { campaignName: string, newCount: string }
    refreshed: {
      title: "notices.seoIntel.refreshed.title",
      body: "notices.seoIntel.refreshed.body",
      cta: "notices.seoIntel.refreshed.cta",
    },
    // Workspace approaching 80% of its monthly budget cap. One-shot
    // per workspace per month (dedups on the workspace dedup tuple).
    // bodyParams: none
    budgetSoftLimit: {
      title: "notices.seoIntel.budgetSoftLimit.title",
      body: "notices.seoIntel.budgetSoftLimit.body",
      cta: "notices.seoIntel.budgetSoftLimit.cta",
    },
    // Workspace hit 100% of its monthly budget cap; the null-provider
    // fallback is now active until next month. One-shot per workspace
    // per month.
    // bodyParams: none
    budgetHardLimit: {
      title: "notices.seoIntel.budgetHardLimit.title",
      body: "notices.seoIntel.budgetHardLimit.body",
      cta: "notices.seoIntel.budgetHardLimit.cta",
    },
  },
} as const;
