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
