declare module "*.png";
declare module "*.jpg";
declare module "*.svg";

// Augment Vitest's `Assertion` interface with @testing-library/jest-dom
// matchers (`toBeInTheDocument`, `toHaveAttribute`, ...). The runtime
// import lives in `vitest.setup.ts`; this just makes the matchers visible
// to tsc -b for the test files under `src/**/__tests__/`.
import "@testing-library/jest-dom/vitest";

export {};

declare global {
  interface Window {
    wp: any;
    structuraConfig: {
      rest_url: string;
      webhook_url: string;
      nonce: string;
      domain: string;
      // `debug_mode_enabled` was retired alongside the Debug mode
      // toggle — admin incidents + Notification Center + per-failure
      // emails cover every observability case it previously enabled.
      /**
       * True when `DISABLE_WP_CRON` is set in the host's wp-config.php
       * — Action Scheduler silently stalls in this state unless a
       * system cron is hitting wp-cron.php. Drives the in-SPA
       * `WpCronDisabledBanner`; the matching cross-wp-admin banner
       * (`Wp_Cron_Disabled_Notice` on the PHP side) uses the same
       * detection.
       *
       * Optional for back-compat with plugin builds predating the
       * flag; defaults to false when missing.
       */
      wp_cron_disabled?: boolean;
      /**
       * True when the cloud could not reach this site's blueprint
       * webhook on the last handshake probe (`Site_Reachability`) —
       * the localhost / private / firewalled case where generated
       * posts can never be delivered back. Drives the in-SPA
       * `CloudUnreachableBanner`; the matching cross-wp-admin banner
       * (`Site_Unreachable_Notice` on the PHP side) reads the same
       * cached verdict.
       *
       * Optional for back-compat with plugin builds predating the
       * flag; defaults to false (treated as reachable/unknown) when
       * missing.
       */
      cloud_unreachable?: boolean;
      /**
       * True when `wp-content/uploads` is not writable, so generated
       * images can't be sideloaded (`wp_upload_dir()` returns an error).
       * Posts still publish — image-less — but every image fails until
       * the permission is fixed. Drives the image-generation toggles to
       * render disabled with a "why" + fix link; the matching
       * cross-wp-admin banner (`Image_Uploads_Unwritable_Notice` on the
       * PHP side) reads the same probe.
       *
       * Optional for back-compat with plugin builds predating the flag;
       * defaults to false (treated as writable/unknown) when missing.
       */
      uploads_unwritable?: boolean;
      /**
       * Has this site ever been bound to an active license? Read by
       * `SiteNotConnectedBanner` so a true wp.org-fresh install (no
       * license, no prior activation) doesn't see a warning telling
       * it to "reconnect" — there's nothing to reconnect to.
       *
       * Server-resolved from the existence of the
       * `structura_default_persona_seeded` option, which is set on
       * the first successful activation and survives manual
       * `Disconnect`. The wipe-all uninstall branch clears it, so a
       * full wipe-then-reinstall returns to fresh-install state.
       *
       * Optional for back-compat with plugin builds predating the
       * flag; consumers should treat `undefined` as `true` (preserve
       * the legacy "always show banner when disconnected" behavior
       * on older PHP).
       */
      had_prior_activation?: boolean;
      /**
       * Bootstrap payload for `useSettingsQuery`. Same shape the
       * `/structura/v1/settings` endpoint returns, minus the
       * cloud-derived per-provider `connected` / `masked_key` fields
       * (which would require a synchronous cloud HTTP from PHP).
       * Wired as TanStack Query `initialData` so first paint skips
       * the bootstrap roundtrip; a single background revalidation
       * fills in cloud-derived fields ~500ms later.
       *
       * Optional for back-compat with plugin builds predating this
       * — when missing the SPA falls back to the original behavior
       * (fetch on mount with the AppLoader showing).
       *
       * Typed as `unknown` here so we don't double-declare the
       * `UnifiedSettings` shape; `useSettingsQuery.ts` casts at the
       * boundary where the type is in scope.
       */
      bootstrap_settings?: unknown;
      /**
       * Phase 1.8 — workspace presence signals surfaced from PHP
       * (`Admin_Dashboard::enqueue_scripts`) so first paint can derive
       * `useLicense().hasWorkspace` without waiting for a REST round-
       * trip. All four are read on every admin page load and reflect
       * the state of `structura_license_data` at request time.
       *
       *   - `has_workspace`: true when the install has any bearer
       *     bound (licensed activation OR successful anonymous
       *     bootstrap from PR7a). Drives the SPA's flip of 7 hook
       *     gates from `hasUsableLicense` to `hasWorkspace`.
       *   - `is_anonymous`: true when the install has a bearer AND
       *     plan === "none" (i.e. anonymous shadow workspace
       *     post-bootstrap). Lets the SPA distinguish "anonymous
       *     workspace bootstrapped" from "licensed user", which
       *     matters for the AI Engine page (provider count cap +
       *     Anthropic locked teaser) and for the Visuals page's
       *     permanent unlicensed teaser on `none` tier.
       *   - `provider_count_cap`: 1 for none, 2 for free, 3 for paid.
       *     The AI Engine SPA reads this to hide the
       *     "default for text/images" toggles when cap === 1
       *     (single provider, no choice) and to gate the "add
       *     provider" CTA at the cap.
       *   - `activation_id`: the activation UUID — passed through so
       *     anonymous SPA queries can reference the activation
       *     without waiting for `useSettingsQuery` to resolve.
       *   - `plan`: one of "none" / "free" / "byok" / "cloud" /
       *     "cloud_pro" — read on first paint to drive the
       *     `is_anonymous` derivation and the AI Engine's tier-
       *     specific cap.
       *
       * All five are optional for back-compat with plugin builds
       * predating PR7a — when missing, the SPA falls through to the
       * legacy `hasUsableLicense`-based gating (the workspace flip is
       * a strict superset of the license flip, so falling through is
       * safe behavior on older PHP).
       *
       * Spec: `specs/v2/multi-tenant-and-public-api.md` §Phase 1.8.
       */
      has_workspace?: boolean;
      is_anonymous?: boolean;
      provider_count_cap?: number;
      activation_id?: string;
      plan?: string;
      /**
       * Analytics rollout Phase 2 — PostHog publishable key + host,
       * minted server-side via `STRUCTURA_POSTHOG_KEY` /
       * `STRUCTURA_POSTHOG_HOST` constants in wp-config.php. Empty
       * (or omitted on builds predating Phase 2) means PostHog is
       * disabled for this install — `lib/posthog.ts#loadPostHog` no-ops
       * and the Privacy & Telemetry card still toggles state but never
       * loads posthog-js.
       */
      posthog_key?: string;
      posthog_host?: string;
      /**
       * Surfaced so the SPA's PostHog bootstrap can attach them as
       * person properties when telemetry is enabled. `license_key`
       * doubles as the PostHog distinct_id so events accumulate
       * against the install. All three are read at posthog init time
       * only — no other consumers.
       */
      license_key?: string;
      site_url?: string;
      plugin_version?: string;
    };
  }
}
