import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@structura/ui";
import { __, sprintf } from "@wordpress/i18n";
import apiFetch from "@wordpress/api-fetch";
import { getMaxCampaignsForTier } from "@structura/types";
import { useSettingsQuery } from "./useSettingsQuery";
import { settingsKeys } from "./keys";
import { useEffect, useRef } from "react";
import type { LicenseEntitlementsBundle } from "@/features/account/types";

/**
 * Shape of the `checkLicenseStatus` HTTP response. The legacy fields
 * (`plan`, `status`, `message`) are the original envelope; the two maps
 * were added in spec §11.6 to drive the Account-page add-on cards; and
 * `activationStatus` was added in 2026-04 so the client can detect a
 * host mismatch (e.g. site activated on `foo.ddev.site` but now served
 * via `bar.ngrok-free.dev`) without probing every activation-secret
 * gated endpoint and surfacing a generic 403 toast.
 *
 * Both maps are always present on a successful 200 response (possibly
 * empty). Error branches may omit them — treat as `{}` on the client.
 */
/**
 * Workspace summary on the heartbeat response — Phase 3.7. Drives
 * the "this site is part of workspace X" indicator the AccountPage
 * shows when the workspace has more than one activation. Optional
 * on the wire so older clouds that predate Phase 3.7 still
 * type-check; the SPA hides the indicator when absent.
 */
export interface LicenseWorkspaceSummary {
  id: string;
  name: string;
  /** Total active activations across this workspace. */
  activationsCount: number;
}

interface LicenseCloudStatus extends Partial<LicenseEntitlementsBundle> {
  plan: string | null;
  status: string | null;
  message: string;
  /**
   * Explicit enum set by newer cloud deploys:
   *   - "valid"                — current domain is a registered activation
   *   - "domain_not_activated" — license exists, but this host isn't one
   *                              of its activations (host mismatch)
   * Absent on older cloud deploys; clients must fall back to
   * `plan`/`status` null-sniffing in that case.
   */
  activationStatus?: "valid" | "domain_not_activated";
  /** Legacy plugin-side compatibility flag. */
  valid?: boolean;
  /**
   * Set by the WP-side proxy when the cloud heartbeat couldn't be
   * reached or returned a non-200 response. The SPA must NOT treat
   * a transport-error response as authoritative — pre-2026-05-05 the
   * `useEffect` at the bottom of this hook auto-pushed `plan: "none"`
   * down to the plugin whenever the cloud blipped, which deactivated
   * live licenses on every wp-admin mount.
   */
  transport_error?: boolean;
  /** Phase 3.7 workspace surface. Null when the cloud couldn't read it. */
  workspace?: LicenseWorkspaceSummary | null;
  /**
   * Workspace-audience dimension — Wave-2 rename (2026-05-04). Loose
   * `string` on the wire so older cloud deploys that omit the field
   * still type-check; consumers narrow to `"individual" | "agency"` via
   * `formatPlanLabel` and fall back to a name-only label when absent
   * or unknown.
   */
  audience?: string | null;
  /**
   * Per-activation campaign cap. Source of truth is the cloud's
   * License doc (Stripe product `max_campaigns` metadata → per-license
   * override → tier fallback); the heartbeat ships the already-
   * resolved value so the SPA doesn't reimplement the fallback rule.
   *
   *   - `number` — explicit cap.
   *   - `null`   — unlimited.
   *   - absent   — pre-rollout cloud deploy; the SPA falls back to
   *                `getMaxCampaignsForTier(plan)`.
   */
  maxCampaigns?: number | null;
}

/**
 * Is `window.location.hostname` actually a registered activation of
 * this license, according to the cloud heartbeat?
 *
 * This used to be discovered the hard way: every activation-secret
 * gated endpoint (Channels catalog, Channels connections, bindings, …)
 * would 403 on each call and the error surfaced as a generic
 * "Data Fetch Error: Security check failed." toast. That's noisy and
 * uninformative. `checkLicenseStatus` already tells us this at the
 * license level — one heartbeat per page load answers "can I even
 * hit the rest of the cloud from here?" — so we lift the detection
 * up into `useLicense` and let consumers read a single flag.
 *
 * Returns:
 *   - null   — pending or unknown (no heartbeat has landed yet, or the
 *              user is Free and no heartbeat fires at all). Consumers
 *              should treat null as "assume fine for first paint" so
 *              paid users don't see a flash of degraded UI before the
 *              cloud response arrives.
 *   - true   — current host is a recognized activation; safe to call
 *              gated endpoints.
 *   - false  — confirmed host mismatch (e.g. site activated on DDEV
 *              and now being served via ngrok share, or staging vs
 *              prod hostname). Gated endpoints WILL fail the handshake,
 *              so callers should skip them and render an inline
 *              advisory pointing the user to reconnect from Account.
 *
 * Exported for unit-test coverage — not part of the public hook API.
 */
export function deriveIsActivationValid(
  cloudStatus: Pick<
    LicenseCloudStatus,
    "activationStatus" | "plan" | "status" | "transport_error"
  > | null,
): boolean | null {
  if (!cloudStatus) return null;
  // Transport-error sentinel from the WP-side proxy. The cloud was
  // unreachable or returned a non-200; treat the same as "no signal
  // yet" so callers don't render a misleading "domain not activated"
  // advisory on every cloud blip. Pre-2026-05-05 a 401 here was
  // mistaken for "license cancelled" and triggered auto-deactivate.
  if (cloudStatus.transport_error) return null;
  if (cloudStatus.activationStatus === "valid") return true;
  if (cloudStatus.activationStatus === "domain_not_activated") return false;
  // Back-compat sniff for pre-2026-04 cloud deploys that don't emit
  // `activationStatus`: the host-mismatch branch returns null plan AND
  // null status, whereas every other 200 branch populates both fields.
  if ((cloudStatus.plan as unknown) === null && (cloudStatus.status as unknown) === null) {
    return false;
  }
  return true;
}

/**
 * Whether the current install has an active anonymous shadow
 * workspace (Phase 1.8). True when the bootstrap has succeeded
 * (`has_workspace`) AND the plan is "none" (i.e. anonymous, not
 * licensed). Pre-PR7a plugin builds leave both fields undefined,
 * which correctly evaluates to false (the legacy
 * license-required gating stays intact on older PHP).
 *
 * Exported for unit-test coverage — the surrounding hook reads
 * `window.structuraConfig` directly via this helper so the
 * derivation can be pinned without the full TanStack-Query +
 * effects machinery a `renderHook` test would need.
 */
export function deriveHasAnonymousActivation(
  config:
    | { has_workspace?: boolean; plan?: string }
    | null
    | undefined,
): boolean {
  if (!config) return false;
  return config.has_workspace === true && config.plan === "none";
}

/**
 * Read the provider count cap surfaced by PR7a (1 / 2 / 3 per
 * tier — see `License_Manager::get_provider_count_cap()` for the
 * source-of-truth mapping). Falls back to 3 on pre-PR7a plugin
 * builds where the field is missing — matches the legacy "no
 * cap layered on top of `Provider_Registry`" behaviour.
 */
export function deriveProviderCountCap(
  config:
    | { provider_count_cap?: number }
    | null
    | undefined,
): number {
  if (!config) return 3;
  return typeof config.provider_count_cap === "number"
    ? config.provider_count_cap
    : 3;
}

/**
 * Resolve the provider count cap, preferring the settings payload
 * (reactive — refetches after an in-SPA activation) over the
 * `structuraConfig` page-render snapshot (back-compat with plugin
 * builds predating the settings field, 2026-06-06).
 *
 * The snapshot-only read kept the anonymous 1-provider cap alive
 * after a paid key was activated in-SPA, wrongly cap-locking the AI
 * Engine surfaces until the next page load.
 */
export function resolveProviderCountCap(
  license: { provider_count_cap?: number } | null | undefined,
  config: { provider_count_cap?: number } | null | undefined,
): number {
  if (typeof license?.provider_count_cap === "number") {
    return license.provider_count_cap;
  }
  return deriveProviderCountCap(config);
}

/**
 * Resolve the anonymous-workspace flag with the same precedence as
 * {@link resolveProviderCountCap}: settings payload first (reactive),
 * `structuraConfig.is_anonymous` snapshot as the back-compat
 * fallback. Defaults to `false` when neither side carries the flag
 * (pre-PR7a plugin builds) so the legacy-licensed code path stays
 * intact.
 */
export function resolveIsAnonymous(
  license: { is_anonymous?: boolean } | null | undefined,
  config: { is_anonymous?: boolean } | null | undefined,
): boolean {
  if (typeof license?.is_anonymous === "boolean") {
    return license.is_anonymous;
  }
  return config?.is_anonymous === true;
}

export const useLicense = () => {
  const queryClient = useQueryClient();
  const { data: license, isLoading: isSettingsLoading } = useSettingsQuery((s) => s.license);
  const { successToast, errorToast } = useToast();

  const isSyncing = useRef(false);

  const hasKey = !!license?.license_key && !license.license_key.includes("*");

  /**
   * Tri-state license-presence gate for cloud-backed query hooks.
   *
   * Background: every cloud-backed SPA query goes through the plugin's
   * REST proxy, which short-circuits with `403 "Active license required."`
   * when no license key is bound to the site. Pre-2026-05-03, every
   * page load on a disconnected install fired N parallel queries, all
   * 403'd, all routed through the global `QueryCache.onError` toast at
   * `client/src/index.tsx`, producing a stack of identical "Data Fetch
   * Error: Active license required." toasts.
   *
   * The fix is to gate cloud-backed queries on this flag rather than
   * letting them fire and fail. We keep it tri-state so consumers can
   * tell the difference between "settings still loading" and "settings
   * loaded, no license bound":
   *
   *   - `null`  — settings query is still in flight on first paint.
   *               Don't fire cloud queries yet, but also don't render
   *               the "Connect this site" empty state (would flash).
   *   - `true`  — settings loaded, license key bound. Cloud queries
   *               are safe to fire.
   *   - `false` — settings loaded, no usable license key. Cloud
   *               queries should stay disabled; render the inline
   *               "Connect this site" empty state instead.
   *
   * `license_key.includes("*")` reads as masked-key shape coming back
   * from the plugin (defence-in-depth — settings should never ship a
   * masked key, but if it ever does, we treat it as "no usable key"
   * since we can't authenticate with it).
   */
  const hasUsableLicense: boolean | null = isSettingsLoading
    ? null
    : hasKey;

  /**
   * Tri-state workspace-presence gate — Phase 1.8 §1.8.4.
   *
   * Superset of `hasUsableLicense` that also accepts anonymous shadow
   * workspaces (the install has a bearer bound but no license key).
   * Cloud-backed query hooks for surfaces that should work for
   * anonymous users (personas, AI keys, available models, site
   * profile, SEO rules, site indexing) gate on this instead of
   * `hasUsableLicense` post-PR7b. Surfaces that stay paid-only
   * (campaigns, runs, dashboard analytics, channels, visual
   * presets, workspace AI keys library) keep gating on
   * `hasUsableLicense`.
   *
   * Same tri-state shape:
   *   - `null`  — settings still loading on first paint. Don't fire
   *               cloud queries yet.
   *   - `true`  — install has a usable bearer (license OR anonymous
   *               bootstrap). Cloud queries gated on this are safe
   *               to fire.
   *   - `false` — no bearer at all (fresh install, bootstrap not yet
   *               run / cloud unreachable). Render the unlicensed
   *               teaser fallback.
   *
   * Reads `structuraConfig.has_workspace` (set by PR7a's
   * Admin_Dashboard surface) for the anonymous case. Optional for
   * back-compat with pre-PR7a plugin builds; `undefined` falls
   * through to `hasUsableLicense` so the legacy license-only gating
   * stays intact on older PHP.
   */
  const hasAnonymousActivation: boolean =
    typeof window !== "undefined"
      ? deriveHasAnonymousActivation(window.structuraConfig ?? null)
      : false;

  const hasWorkspace: boolean | null = isSettingsLoading
    ? null
    : hasKey || hasAnonymousActivation;

  /**
   * True when the active workspace is anonymous (bootstrapped via
   * PR6 + PR7a, no license claimed yet). Drives the AI Engine
   * page's provider count cap + Anthropic-locked teaser, and the
   * Visuals page's permanent unlicensed teaser on `none` tier.
   *
   * Prefers the settings payload (2026-06-06) so the flag flips
   * REACTIVELY after an in-SPA activation — `activate()` invalidates
   * the cache, the settings refetch carries the new value. The
   * `structuraConfig.is_anonymous` page-render snapshot stays as the
   * fallback for plugin builds predating the settings field (and it
   * matches what PHP computes: bearer bound + plan === "none").
   */
  const isAnonymous: boolean = resolveIsAnonymous(
    license,
    typeof window !== "undefined" ? window.structuraConfig : null,
  );

  /**
   * Maximum number of AI providers the user can configure
   * simultaneously at the calling tier (source of truth:
   * `License_Manager::get_provider_count_cap`).
   *
   *   - 1 for `none` (anonymous; pick openai OR gemini)
   *   - 2 for `free` (openai + gemini, no Anthropic)
   *   - 3 for `byok` / managed (all three providers)
   *
   * Prefers the settings payload (2026-06-06) over the
   * `structuraConfig` page-render snapshot for the same reactivity
   * reason as `isAnonymous` above — the snapshot kept the anonymous
   * 1-provider cap alive after a paid key was activated in-SPA,
   * wrongly cap-locking the AI Engine surfaces until the next page
   * load.
   *
   * Falls back to 3 on pre-PR7a plugin builds — the cap is a
   * UX restriction layered on top of the existing
   * `Provider_Registry` tier gating, so an undefined value just
   * means "no cap layered on top," which matches pre-PR7a
   * behavior.
   */
  const providerCountCap: number = resolveProviderCountCap(
    license,
    typeof window !== "undefined" ? window.structuraConfig : null,
  );

  const { data: cloudStatus, isLoading: isCloudVerifying } = useQuery<LicenseCloudStatus | null>({
    queryKey: ["license-cloud-verify", license?.license_key],
    queryFn: async () => {
      if (!license?.license_key || license.license_key.includes("*")) return null;

      // Browser → cloud direct fetches were retired in 2026-05-05:
      // Phase 3.5's bearer-auth model keeps the activation token in
      // `wp_options`, never in browser-reachable storage, so this hook
      // proxies through `/structura/v1/license/cloud-status`. The PHP
      // handler attaches the bearer via `Cloud_Client::post()` and
      // returns the cloud body verbatim on 200, or a sentinel envelope
      // (`{plan: null, status: null, transport_error: true}`) on a
      // network blip / 4xx / 5xx so the sync useEffect below can
      // distinguish "fresh authoritative reading" from "no signal."
      return apiFetch<LicenseCloudStatus | null>({
        path: "/structura/v1/license/cloud-status",
        method: "POST",
      }).then((json) => {
        if (!json) return null;
        return {
          ...json,
          entitlements: json.entitlements ?? {},
          graceperiods: json.graceperiods ?? {},
        };
      });
    },
    // Paid-only gate. The cloud heartbeat is a *verification* of what
    // PHP already told us — not the source of truth for the initial
    // render. Running it for Free users (a) is wasted work since Free
    // has nothing to verify, and (b) used to make the UI flicker
    // through a false "not licensed" state on every mount. Free users
    // can't purchase add-ons (integrations-store-spec §11), so they
    // have no entitlements worth fetching here either.
    enabled: !!license?.is_pro && hasKey,
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  // Derived Access Logic.
  //
  // Hybrid truth: trust the PHP/DB license snapshot immediately so the
  // UI renders on first paint, and let the cloud heartbeat refine it
  // afterwards. This avoids a visible "Free user" flash on every
  // mount while the cloud query is pending for paid licensees.
  const plan = cloudStatus?.plan || license?.plan || "none";
  const status = cloudStatus?.status || (license?.is_pro ? "active" : "none");
  // Workspace-audience axis. Same hybrid as `plan` above: the PHP-side
  // cache (persisted at activation / heartbeat since 2026-06-07) gives
  // first paint its full badge label, and the cloud heartbeat
  // overrides once it lands. Stays null only when neither side has
  // ever heard the field (pre-rollout plugin + no heartbeat yet) —
  // consumers must still handle the pending state. Falsy values
  // normalise to `null` so consumers never see `""` or `undefined`
  // and can branch on truthiness cleanly.
  const audience = cloudStatus?.audience || license?.audience || null;

  // Per-activation campaign cap. Resolution order:
  //   1. Cloud heartbeat (always populated by current cloud) — most
  //      authoritative; reflects any per-license override or Stripe
  //      product metadata change the moment the heartbeat returns.
  //   2. PHP-cached `license.max_campaigns` — first-paint value cached
  //      by the plugin from the activation response / prior heartbeat.
  //      Avoids a "null → real number" flicker before the cloud query
  //      settles.
  //   3. Tier matrix (`getMaxCampaignsForTier`) — last-resort fallback
  //      for pre-rollout cloud and plugin builds where neither layer
  //      surfaces the field.
  //
  // `undefined` means "not yet known"; `null` means "explicitly
  // unlimited." Consumers compare against `null` for the unlimited
  // case and against a number otherwise.
  const maxCampaigns: number | null =
    cloudStatus?.maxCampaigns !== undefined
      ? cloudStatus.maxCampaigns
      : license?.max_campaigns !== undefined
        ? license.max_campaigns
        : getMaxCampaignsForTier(plan);

  // A "Paid" license is specifically an ACTIVE one. While cloud is
  // still pending, fall back to the PHP `is_pro` flag + the PHP plan
  // so paid users don't see a one-frame degraded UI on every mount.
  // Once cloud responds, it becomes authoritative.
  const isPaidLicense = cloudStatus
    ? cloudStatus.status === "active" &&
      ["byok", "cloud", "cloud_pro"].includes(cloudStatus.plan ?? "")
    : Boolean(license?.is_pro) && ["byok", "cloud", "cloud_pro"].includes(license?.plan ?? "");
  const isLicensed = plan !== "none";

  // See `deriveIsActivationValid` for the decision table. Pulled out as
  // a pure helper so we can unit-test it directly without renderHook.
  const isActivationValid = deriveIsActivationValid(cloudStatus ?? null);

  // Sync Plan to WordPress DB if they differ.
  //
  // Defensive gates layered on after the 2026-05-05 incident:
  //
  //   - `transport_error` skips sync when the WP-side proxy couldn't
  //     reach the cloud (network blip, 4xx, 5xx). Pre-incident, a
  //     transient cloud failure produced `{plan: "none"}` on the
  //     wire, this effect pushed `plan="none"` to `/license/sync`,
  //     and the plugin's sync handler interpreted that as "license
  //     was cancelled" and called `License_Manager::deactivate()` —
  //     soft-deleting the activation on every wp-admin mount.
  //   - `status === "active"` skips sync on grace-period / past_due /
  //     canceled responses. Those statuses are still authoritative
  //     enough to surface in the warning toast below, but the plan
  //     field on those responses isn't reliable for sync (a license
  //     in grace still has its paid plan; a `canceled` license's
  //     plan field shouldn't be mirrored down to wp_options without
  //     a deliberate flow).
  useEffect(() => {
    if (!cloudStatus) return;
    if (cloudStatus.transport_error) return;
    if (cloudStatus.status !== "active") return;
    const cloudPlan = cloudStatus.plan;
    if (!cloudPlan) return;
    if (cloudPlan === license?.plan) return;
    if (isSyncing.current) return;

    isSyncing.current = true;
    apiFetch({
      path: "/structura/v1/license/sync",
      method: "POST",
      data: { plan: cloudPlan },
    })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: settingsKeys.all });
        successToast(sprintf(__('Plan synchronized: "%s".', "structura"), cloudPlan));
      })
      .finally(() => {
        isSyncing.current = false;
      });
  }, [
    cloudStatus,
    cloudStatus?.plan,
    cloudStatus?.status,
    cloudStatus?.transport_error,
    license?.plan,
    queryClient,
    successToast,
  ]);

  // Show warning if license is found but not active (e.g. past_due or expired)
  useEffect(() => {
    if (cloudStatus?.status && cloudStatus.status !== "active" && cloudStatus.status !== "none") {
      errorToast(cloudStatus.message || __("Your license is no longer active.", "structura"));
    }
  }, [cloudStatus?.status, cloudStatus?.message, errorToast]);

  const invalidate = () => {
    // Connecting or disconnecting a site swaps the entire workspace
    // behind the cache: personas, campaigns, channels, dashboard, AND
    // settings all belonged to the previous license/workspace. The
    // pre-2026-05-25 behaviour invalidated only `settings` +
    // `license-cloud-verify`, so reconnecting a DDEV install from one
    // license to another left the prior workspace's personas cached —
    // the campaign create flow then showed "old" personas in the
    // dropdown (and a stale campaign list) until each query's 5-minute
    // staleTime elapsed. Drop the whole cache instead and let active
    // queries refetch against the new workspace — the same blunt reset
    // the `SiteNotConnectedBanner` "Forget this site" flow uses.
    queryClient.invalidateQueries();
  };

  const activateMutation = useMutation({
    mutationFn: (key: string) =>
      apiFetch({
        path: "/structura/v1/license/activate",
        method: "POST",
        data: { key },
      }),
    onSuccess: () => {
      successToast(__("Pro features unlocked!", "structura"));
      invalidate();
    },
  });

  const deactivateMutation = useMutation({
    // `purge` opts into a hard remove (delete the cloud activation, and the
    // workspace if it's the last site) instead of a reversible disconnect.
    mutationFn: (opts?: { purge?: boolean }) =>
      apiFetch({
        path: "/structura/v1/license/deactivate",
        method: "POST",
        data: { purge: opts?.purge ?? false },
      }),
    onSuccess: (_data, opts) => {
      successToast(
        opts?.purge
          ? __("Site removed.", "structura")
          : __("License deactivated.", "structura"),
      );
      invalidate();
    },
  });

  /**
   * THE HYBRID TRUTH:
   * 1. If we are still checking Cloud, we assume the PHP plan is correct.
   * 2. Once Cloud responds, it overrides everything.
   */
  const isPro = license?.is_pro;

  const maskedKey = license?.license_key
    ? `${license.license_key.substring(0, 8)}***********${license.license_key.slice(-4)}`
    : "";

  return {
    isPaidLicense,
    isLicensed,
    /**
     * Tri-state license-presence gate for cloud-backed query hooks.
     * See the `hasUsableLicense` derivation above. Consumers should
     * use this on the `enabled` option of any TanStack Query that
     * eventually hits a cloud-backed endpoint:
     *
     *   const { hasUsableLicense } = useLicense();
     *   useQuery({ enabled: hasUsableLicense === true, ... });
     *
     * Treat `null` as "not yet known — don't fire" and `false` as
     * "no license bound — render the disconnected empty state."
     */
    hasUsableLicense,
    /**
     * Tri-state workspace-presence gate — Phase 1.8 §1.8.4.
     * Superset of `hasUsableLicense` that also accepts anonymous
     * shadow workspaces. See the derivation comment above for the
     * gating-table guidance. Use on `enabled:` for cloud-backed
     * query hooks whose surface is workspace-scoped (personas, AI
     * keys, available models, etc.):
     *
     *   const { hasWorkspace } = useLicense();
     *   useQuery({ enabled: hasWorkspace === true, ... });
     *
     * Surfaces that stay paid-only (campaigns, runs, dashboard
     * analytics, channels, visual presets) keep gating on
     * `hasUsableLicense`.
     */
    hasWorkspace,
    /**
     * True when the active workspace is anonymous (bootstrapped via
     * Phase 1.8 — bearer bound but no license). Drives the AI Engine
     * page's provider count cap + Anthropic-locked teaser, and the
     * Visuals page's permanent unlicensed teaser on `none` tier.
     */
    isAnonymous,
    /**
     * Maximum number of AI providers the user can configure
     * simultaneously at the calling tier. Phase 1.8 §1.8.4 + the
     * feature matrix in §Phase 1.8. Drives the AI Engine page's
     * "add provider" CTA gating and the visibility of the
     * default-for-text/images toggles (hidden when cap === 1).
     */
    providerCountCap,
    /**
     * Whether `window.location.hostname` is a registered activation of
     * this license, derived from the `checkLicenseStatus` heartbeat.
     * See the derivation comment above — in short: `null` while pending
     * or for unpaid users (no heartbeat), `false` for a confirmed host
     * mismatch (DDEV → ngrok, staging → prod hostname), `true` otherwise.
     * Consumers of activation-secret gated endpoints (e.g. Channels)
     * should gate their queries on `isActivationValid !== false` and
     * render an inline advisory when it's `false`.
     */
    isActivationValid,
    plan,
    /**
     * Workspace-audience suffix for plan-badge labels. `null` until the
     * cloud heartbeat lands (PHP snapshot doesn't carry it). Consumers
     * should compose via `formatPlanLabel(plan, audience)` which falls
     * back to a name-only label when audience is null.
     */
    audience,
    /**
     * Per-activation campaign cap, already resolved through cloud →
     * PHP cache → tier fallback. `null` = unlimited. Drives the
     * CampaignsPage "X of Y" chip and the at-cap disabled state on
     * the New Campaign button — consumers should NOT re-resolve from
     * tier (the cap is per-license now, not per-tier).
     */
    maxCampaigns,
    // Mirrors the derived `status` above — PHP `is_pro` flag is the
    // first-paint fallback so consumers (LicenseStatusBanner, plan
    // badges, gating predicates) don't see "none" flicker through
    // before the cloud query settles.
    status,
    license: { ...license, masked_key: maskedKey },
    cloudStatus,
    /**
     * Per-add-on seat budgets + current-site assignment view, from the
     * cloud's `checkLicenseStatus` heartbeat (spec §11.6). Empty object
     * when cloudStatus isn't loaded yet — callers should treat absence
     * of a key as "license not entitled to this add-on".
     */
    entitlements: cloudStatus?.entitlements ?? {},
    /**
     * Currently-open grace periods keyed by add-on. Empty object when
     * cloudStatus isn't loaded yet. Absence of a key means no open
     * grace (the common case).
     */
    graceperiods: cloudStatus?.graceperiods ?? {},
    /**
     * Phase 3.7 — workspace summary surfaced by the heartbeat. Drives
     * the "this site is part of workspace X" indicator the AccountPage
     * shows when `activationsCount > 1`. `null` for single-activation
     * workspaces (the common case at v1) and for clouds that predate
     * Phase 3.7. Consumers should always null-check before reading.
     */
    workspace: cloudStatus?.workspace ?? null,
    loading: isSettingsLoading,
    /**
     * True while the entitlement-bearing cloud heartbeat is still in
     * flight for a paid license. `entitlements.*` (and `audience`,
     * `isActivationValid`, etc.) live ONLY on this heartbeat, not on the
     * fast-resolving PHP settings query that `loading` tracks — so any
     * gate that reads an entitlement must wait on this too. Otherwise it
     * sees `entitlements = {}` during the settings-loaded-but-cloud-
     * pending window and wrongly concludes "not entitled."
     *
     * The heartbeat is `enabled: !!license?.is_pro && hasKey`, so this is
     * `false` for Free / anonymous installs (query disabled → no hang)
     * and only meaningful for paid licensees. See the channels-route
     * guard in App.tsx, which would otherwise fire its `/channels/*` →
     * `/` redirect before the heartbeat could confirm the entitlement.
     */
    entitlementsLoading: isCloudVerifying,
    processing: activateMutation.isPending || deactivateMutation.isPending,
    activate: activateMutation.mutateAsync,
    deactivate: deactivateMutation.mutateAsync,
    gateProps: (featureName: string, level: "free" | "byok" = "free") => {
      const hasAccess = level === "byok" ? isPro : isLicensed;

      const message = !isLicensed
        ? __("Register for a Free Account to unlock %s", "structura")
        : __("Upgrade to Pro to unlock %s", "structura");

      return {
        disabled: !hasAccess,
        title: !hasAccess ? sprintf(message, featureName) : undefined,
      };
    },
  };
};
