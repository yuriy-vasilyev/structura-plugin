/**
 * PostHog client for the Structura WordPress plugin SPA (wp-admin).
 *
 * Unlike www/ and web/ (where posthog-js is loaded eagerly with
 * `opt_out_capturing_by_default: true`), the plugin SPA is opt-in only.
 * PostHog itself isn't loaded into memory until the admin flips the
 * Settings → Privacy & Telemetry switch on, so non-consenting installs
 * never make a network request to a third-party service. The opt-in/out
 * toggle in `lib/consent.ts` calls into `setConsented()` here to drive
 * the lifecycle.
 *
 * Identification: we deliberately do NOT identify by `wp_user_id` or
 * site URL — events are tied to a generated install id stored in
 * `structuraConfig.license_key` (already license-scoped) so we can
 * count distinct activations without attaching to specific operators.
 *
 * Spec: analytics rollout Phase 2 — see `MEMORY.md` →
 * project_structura_analytics_plan.
 */

import type { PostHog } from "posthog-js";

// `window.structuraConfig` is canonically declared in `client/src/types.d.ts`
// — we only add the `posthog` instance handle here. Don't redeclare the
// config shape (TS errors on conflicting modifiers).
declare global {
  interface Window {
    posthog?: PostHog;
  }
}

let initPromise: Promise<PostHog | null> | null = null;
let consented = false;

function readConfig() {
  if (typeof window === "undefined") return null;
  const cfg = window.structuraConfig;
  if (!cfg) return null;
  const key = cfg.posthog_key;
  // Fallback for older plugin builds that don't inline `posthog_host` —
  // matches the baked-in default in Admin_Dashboard.php: our first-party
  // reverse proxy, so ad-blockers in wp-admin don't drop telemetry.
  const host = cfg.posthog_host ?? "https://p.structurawp.com";
  if (!key) return null;
  return { key, host, cfg };
}

/**
 * Load posthog-js the first time consent is granted. Subsequent calls
 * reuse the same instance. Returns `null` when the PostHog key isn't
 * configured server-side (most self-hosted installs that haven't been
 * given a key) — the caller treats `null` as "telemetry disabled".
 */
function loadPostHog(): Promise<PostHog | null> {
  if (initPromise) return initPromise;
  const conf = readConfig();
  if (!conf) return Promise.resolve(null);

  initPromise = import("posthog-js").then(({ default: posthog }) => {
    posthog.init(conf.key, {
      api_host: conf.host,
      // Correct PostHog-app URL for toolbar/UI links whenever `conf.host`
      // is a reverse proxy. Harmless on the direct US-cloud default (the
      // SDK would derive the same value).
      ui_host: "https://us.posthog.com",
      // Pin the SDK's config-defaults generation so a future posthog-js
      // upgrade can't silently flip behavior. The options we care about
      // (pageview/autocapture/person_profiles) are set explicitly below
      // and always win over the generation's defaults.
      defaults: "2026-01-30",
      // We control the opt state ourselves via setConsented(), but the
      // default-deny here is belt-and-suspenders in case the loaded
      // callback ever races with a consent flip.
      opt_out_capturing_by_default: true,
      capture_pageview: false,
      capture_pageleave: true,
      autocapture: false,
      person_profiles: "identified_only",
      persistence: "localStorage+cookie",
      loaded: (ph) => {
        const distinct =
          conf.cfg.license_key || `wp-install:${conf.cfg.site_url ?? "unknown"}`;
        ph.identify(distinct, {
          site_url: conf.cfg.site_url,
          plugin_version: conf.cfg.plugin_version,
        });
        if (consented) ph.opt_in_capturing();
      },
    });
    window.posthog = posthog;
    return posthog;
  });

  return initPromise;
}

/**
 * Apply a consent decision. Loads posthog-js the first time consent
 * flips on, and toggles capture state on every subsequent change.
 * Safe to call before the SPA has fully mounted — the load happens
 * lazily.
 */
export async function setConsented(next: boolean): Promise<void> {
  consented = next;
  if (!next) {
    // Don't bother loading posthog just to opt out — if it's not
    // loaded, there's nothing to opt out from. If it is loaded, we
    // still flip it via the consent.ts `notifyConsumers()` path which
    // calls `window.posthog.opt_out_capturing()` directly.
    const ph = window.posthog;
    ph?.opt_out_capturing();
    return;
  }
  const ph = await loadPostHog();
  ph?.opt_in_capturing();
}

/**
 * Fire-and-forget event capture. Safe to call before init / when the
 * user hasn't consented — PostHog drops the event silently in both
 * cases. Use for high-signal product events: campaign created, post
 * generated, channel connected, settings saved.
 */
export function capture(
  event: string,
  properties?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  const ph = window.posthog;
  if (!ph) return;
  try {
    ph.capture(event, properties);
  } catch {
    // No-op; capture should never throw.
  }
}
