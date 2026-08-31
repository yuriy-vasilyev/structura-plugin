/**
 * Shared rendering helpers for the wp-admin Notices surface.
 *
 * Two surfaces consume notices today — the bell-icon popover in the
 * header and the full /notices page. Both render the same notice
 * payload, so the copy lookup, category label, CTA resolution, and
 * relative-time formatting live here once.
 *
 * The cloud emits dotted-path i18n keys
 * (`notices.byok.key_rejected.title`); the wp-admin SPA doesn't
 * have a JSON-path i18n resolver, so we maintain a flat lookup
 * table here keyed on the same paths. Translations come from
 * WordPress's `__()` so the table participates in the .pot/.po
 * pipeline alongside the rest of the wp-admin strings.
 */

import { __, sprintf } from "@wordpress/i18n";
import type { Notice, NoticeCtaHref, NoticeSeverity } from "./types";

/**
 * Map cloud `severity` to the design system Badge `intent`.
 */
export const SEVERITY_INTENT: Record<NoticeSeverity, "warning" | "destructive"> = {
  warning: "warning",
  error: "destructive",
};

/**
 * Flat dictionary of cloud-emitted notice copy keys. Built from the
 * canonical translations in `web/src/i18n/locales/en/notices.json`
 * (the cloud's source of truth) and routed through `__()` so the
 * wp-admin SPA's translation pipeline catches each entry.
 *
 * Anything missing here falls back to the literal key, which is a
 * loud-enough UI cue that the translator needs to take a look.
 */
function copyDict(): Record<string, string> {
  return {
    "notices.byok.credentials_missing.title": __("Add a {{provider}} API key", "structura"),
    "notices.byok.credentials_missing.body": __(
      "Structura tried to generate content for you but no {{provider}} API key is connected to this workspace. Add a key in AI Settings and we'll pick up where we left off on the next run.",
      "structura",
    ),
    "notices.byok.credentials_missing.cta": __("Open AI Settings", "structura"),
    "notices.byok.key_rejected.title": __("Your {{provider}} key was rejected", "structura"),
    "notices.byok.key_rejected.body": __(
      "Your {{provider}} API key was refused by the provider. The key may have been revoked, rotated, or its billing is suspended. Update or replace it to resume generation.",
      "structura",
    ),
    "notices.byok.key_rejected.cta": __("Update key", "structura"),
    "notices.quota.managed.title": __("You've reached your generation quota", "structura"),
    "notices.quota.managed.body": __(
      "This site has used all of the included posts and images for this billing cycle. The quota refills at the start of the next cycle, or you can upgrade for a larger allowance now.",
      "structura",
    ),
    "notices.quota.managed.cta": __("Manage plan", "structura"),
    "notices.billing.payment_failed.title": __("Your last payment failed", "structura"),
    "notices.billing.payment_failed.body": __(
      "Stripe couldn't charge your card for the most recent invoice. We'll retry automatically, but you can avoid an interruption by updating your payment method now.",
      "structura",
    ),
    "notices.billing.payment_failed.cta": __("Update payment method", "structura"),
    "notices.billing.dunning.title": __("Your subscription is past due", "structura"),
    "notices.billing.dunning.body": __(
      "After several failed payment attempts your subscription has been marked past due. Service may be downgraded soon. Update your payment method to restore your plan.",
      "structura",
    ),
    "notices.billing.dunning.cta": __("Update payment method", "structura"),
    "notices.license.activation_failed.title": __("We couldn't activate your license", "structura"),
    "notices.license.activation_failed.body": __(
      "Structura tried to activate this site against your license but the cloud refused. This usually means the license expired, the seat limit was reached, or the payment status changed.",
      "structura",
    ),
    "notices.license.activation_failed.cta": __("Open account", "structura"),
    "notices.connection.oauth_broken.title": __("{{integrationId}} disconnected", "structura"),
    "notices.connection.oauth_broken.body": __(
      "Structura's connection to {{integrationId}} stopped working — the access token couldn't be refreshed. Reconnect this channel to resume publishing.",
      "structura",
    ),
    "notices.connection.oauth_broken.cta": __("Reconnect", "structura"),
    "notices.connection.webhook_unreachable.title": __("{{integrationId}} webhook unreachable", "structura"),
    "notices.connection.webhook_unreachable.body": __(
      "We couldn't reach the webhook URL configured for {{integrationId}}. The endpoint may be offline, the URL may have changed, or your firewall may be blocking us.",
      "structura",
    ),
    "notices.connection.webhook_unreachable.cta": __("Open channel settings", "structura"),
    "notices.generation.failed.title": __("A post couldn't be generated", "structura"),
    "notices.generation.failed.body": __(
      "Structura hit an error while generating content for this site. We'll automatically try again on the next scheduled run — open your campaigns to review the failed run or start a new one.",
      "structura",
    ),
    "notices.generation.failed.cta": __("View campaigns", "structura"),
    "notices.pluginHealth.compat.title": __("Plugin compatibility check failed", "structura"),
    "notices.pluginHealth.compat.body": __(
      "Diagnostics on this site detected a compatibility issue with another plugin or theme that may affect Structura. Review the diagnostics report and apply the suggested fix.",
      "structura",
    ),
    "notices.pluginHealth.compat.cta": __("Open diagnostics", "structura"),
    "notices.pluginHealth.connectivity.title": __("Structura Cloud can't reach your site", "structura"),
    "notices.pluginHealth.connectivity.body": __(
      "Posts are generated in the cloud and delivered back over a webhook. The last connection check couldn't reach your site, so generated posts have nowhere to land. This usually means a local or staging URL, a private network address, or a firewall blocking incoming requests. Diagnostics has the details and a fix.",
      "structura",
    ),
    "notices.pluginHealth.connectivity.cta": __("Open diagnostics", "structura"),
    "notices.pluginHealth.scheduler.title": __("Scheduler isn't running on time", "structura"),
    "notices.pluginHealth.scheduler.body": __(
      "WordPress cron hasn't fired the scheduler heartbeat recently. Posts and images may be delayed. Diagnostics has the details and a fix.",
      "structura",
    ),
    "notices.pluginHealth.scheduler.cta": __("Open diagnostics", "structura"),
    "notices.pluginHealth.version.title": __("Update Structura", "structura"),
    "notices.pluginHealth.version.body": __(
      "This site is running an older Structura version that's missing fixes the cloud relies on. Update the plugin to keep everything working smoothly.",
      "structura",
    ),
    "notices.pluginHealth.version.cta": __("Open Plugins", "structura"),
    "notices.seoIntel.refreshed.title": __("Fresh keyword opportunities found", "structura"),
    "notices.seoIntel.refreshed.body": __(
      "The monthly keyword refresh for {{campaignName}} surfaced {{newCount}} new opportunities. They've been added to the campaign's keyword bank and will feed upcoming posts.",
      "structura",
    ),
    "notices.seoIntel.refreshed.cta": __("View campaign", "structura"),
    "notices.seoIntel.noKeywords.title": __("Campaign is running without keywords", "structura"),
    "notices.seoIntel.noKeywords.body": __(
      "{{campaignName}} has an empty keyword bank — new posts fall back to a generic topic instead of a targeted keyphrase. This usually happens after changing the campaign language. Re-run keyword discovery to fix it.",
      "structura",
    ),
    "notices.seoIntel.noKeywords.cta": __("Re-discover keywords", "structura"),
    "notices.seoIntel.bankExhausted.title": __(
      "Campaign has covered every keyword",
      "structura",
    ),
    "notices.seoIntel.bankExhausted.body": __(
      "{{campaignName}} has already published a post for every keyword in its bank, so scheduled posts are paused rather than repeating a topic. Add or re-discover keywords to start it up again.",
      "structura",
    ),
    "notices.seoIntel.bankExhausted.cta": __("Add keywords", "structura"),
    "notices.seoIntel.bankRefreshed.title": __(
      "We added new keywords to your campaign",
      "structura",
    ),
    "notices.seoIntel.bankRefreshed.body": __(
      "{{campaignName}} was running low on fresh topics, so we researched its niche and added {{newCount}} new keywords to its keyword bank. Upcoming posts will use them.",
      "structura",
    ),
    "notices.seoIntel.bankRefreshed.cta": __("Review keywords", "structura"),
    "notices.seoIntel.duplicateTopicSkipped.title": __(
      "We skipped a duplicate post",
      "structura",
    ),
    "notices.seoIntel.duplicateTopicSkipped.body": __(
      "A scheduled post for {{campaignName}} would have used the web address “{{slug}}”, which you already publish under — so we stopped it instead of putting two near-identical pages in competition. Add or re-discover keywords so the next post covers something new.",
      "structura",
    ),
    "notices.seoIntel.duplicateTopicSkipped.cta": __("Add keywords", "structura"),
    "notices.seoIntel.budgetSoftLimit.title": __("Search data budget almost used up", "structura"),
    "notices.seoIntel.budgetSoftLimit.body": __(
      "This workspace has used 80% of its monthly search-data allowance. Keyword refreshes keep running until the cap is reached, then pause until next month.",
      "structura",
    ),
    "notices.seoIntel.budgetSoftLimit.cta": __("Learn more", "structura"),
    "notices.seoIntel.budgetHardLimit.title": __("Search data paused until next month", "structura"),
    "notices.seoIntel.budgetHardLimit.body": __(
      "This workspace has used its full monthly search-data allowance. Keyword refreshes continue with AI-only discovery, and enriched search data resumes at the start of next month.",
      "structura",
    ),
    "notices.seoIntel.budgetHardLimit.cta": __("Learn more", "structura"),
  };
}

/** Interpolate `{{name}}` placeholders defensively (server-controlled values). */
function interpolate(template: string, params?: Record<string, string>): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? params[name] : m,
  );
}

export function resolveCopy(key: string, params?: Record<string, string>): string {
  const tpl = copyDict()[key] ?? key;
  return interpolate(tpl, params);
}

export function categoryLabel(category: Notice["category"]): string {
  switch (category) {
    case "billing":       return __("Billing", "structura");
    case "license":       return __("License", "structura");
    case "connection":    return __("Connection", "structura");
    case "quota":         return __("Quota", "structura");
    case "byok":          return __("AI key", "structura");
    case "generation":    return __("Generation", "structura");
    case "plugin-health": return __("Plugin health", "structura");
    case "seo-intel":     return __("SEO intelligence", "structura");
  }
}

/**
 * Resolve a cloud-emitted CTA href to a URL the wp-admin SPA can
 * open. `wp-admin` and `both` targets become hash-routed paths
 * inside the SPA; `portal` opens app.structurawp.com in a new tab;
 * `external` passes through unchanged.
 */
export function resolveCta(cta: Notice["cta"]): { href: string; external: boolean } | null {
  if (!cta) return null;
  const href: NoticeCtaHref = cta.href;
  switch (href.kind) {
    case "wp-admin":
      return { href: hashFromWpAdminRoute(href.route), external: false };
    case "both":
      return { href: hashFromWpAdminRoute(href.wpAdmin), external: false };
    case "portal":
      return { href: `https://app.structurawp.com${href.route}`, external: true };
    case "external":
      return { href: href.url, external: true };
  }
}

function hashFromWpAdminRoute(route: string): string {
  const idx = route.indexOf("#");
  if (idx >= 0) return `#${route.slice(idx + 1)}`;
  return route;
}

/** Low-fidelity relative time — the inbox isn't a forensics view. */
export function formatRelative(ts: number): string {
  const deltaMs = Date.now() - ts;
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return __("just now", "structura");
  if (minutes < 60) return sprintf(__("%dm ago", "structura"), minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return sprintf(__("%dh ago", "structura"), hours);
  const days = Math.floor(hours / 24);
  return sprintf(__("%dd ago", "structura"), days);
}
