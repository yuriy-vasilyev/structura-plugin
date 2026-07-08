<?php

namespace Structura\Core;

use Structura\Api\Persona_Shape_Transformer;

if ( ! defined('ABSPATH')) {
    exit;
}

class License_Manager
{
    /**
     * Activate the license via Firebase API
     */
    public static function activate($key): array
    {
        // TODO(siteUrl-scheme): we send the bare HOST (no scheme). The cloud
        // stores it verbatim as `activation.surfaceMetadata.siteUrl`, which is
        // therefore host-only despite the name — so cloud URL consumers
        // (Migrate / Move-to-Headless feed `guardUrl`/REST fetch) must prepend
        // `https://` or they 400 on a schemeless URL (the conversion engine now
        // does, defensively). Host-only is fine for the cloud's dedup
        // (`comparableHost` strips the scheme anyway), but sending the full
        // `get_site_url()` here would let `siteUrl` be a real URL and remove the
        // special-casing. Change all four `wp_parse_url(...PHP_URL_HOST)` send
        // sites together (Anonymous_Bootstrap + the License_Manager activate/
        // heartbeat/forget calls) and update the cloud `WpSurfaceMetadata`
        // docblock when this is done.
        $domain = wp_parse_url(get_site_url(), PHP_URL_HOST);

        // Phase 3.3 — if the plugin has a stashed activation_id from a
        // prior activation (e.g. site was disconnected and is now
        // reconnecting), include it so the cloud can revive that
        // workspace-rooted doc instead of minting a fresh one. Fresh
        // activations omit it; cloud mints the UUID server-side.
        $stashed = Key_Manager::get_license_payload();
        $existing_activation_id = is_array($stashed)
            ? ($stashed['activation_id'] ?? null)
            : null;

        $request_body = [
            'licenseKey'   => $key,
            'domain'       => $domain,
            'siteName'     => get_bloginfo('name'),
            'wpVersion'    => get_bloginfo('version'),
            // Spec: specs/v2/cloud-pregeneration-and-model-catalog.md §1.0e —
            // ship the brand surface in the same call so the cloud's stock
            // pipeline has a usable snapshot from the very first run.
            'siteIdentity' => Site_Identity_Sync::collect(),
        ];
        if ($existing_activation_id) {
            $request_body['activationId'] = $existing_activation_id;
        }

        // Phase 1.8 claim flow — if this site bootstrapped an
        // anonymous shadow workspace before activating a license,
        // pass the install id through. The cloud's `activateLicense`
        // branch (3) reads it, looks up `installs/{installId}`, and
        // rebrands the existing shadow workspace as the license's
        // workspace (sets `licenseId`, flips `anonymous: false`,
        // keeps personas + visual presets + AI keys + bound bearer
        // in place). The user's pre-account configuration carries
        // forward end-to-end.
        // Spec: `specs/v2/multi-tenant-and-public-api.md` §1.8.7 branch (3).
        $existing_install_id = get_option(Anonymous_Bootstrap::OPTION_INSTALL_ID, '');
        if (is_string($existing_install_id) && $existing_install_id !== '') {
            $request_body['existingInstallId'] = $existing_install_id;
        }

        $result = Cloud_Client::post('/activateLicense', $request_body);

        if (is_wp_error($result)) {
            Log_Service::add('error', "Connection Error: " . $result->get_error_message(), 0, 'license_activation');

            return ['success' => false, 'error' => $result->get_error_message()];
        }

        $code = $result['code'];
        $body = $result['body'];

        if ($code !== 200) {
            $msg = $body['error'] ?? 'Unknown error occurred.';
            Log_Service::add('error', "Activation failed: $msg", 0, 'license_activation');

            return ['success' => false, 'error' => $msg];
        }

        if ( ! is_array($body)) {
            Log_Service::add('error', "Activation failed: invalid server response format", 0, 'license_activation');

            return ['success' => false, 'error' => __('Invalid server response format.', 'structura')];
        }

        if (isset($body['success']) && $body['success'] === true) {
            $payload = [
                'key'           => $key,
                // Phase 3.5 (multi-tenant spec §3.5) — bearer token minted
                // in-band at activation time. Persisted in `wp_options`
                // and sent on every subsequent cloud call as
                // `Authorization: Bearer <api_token>`. Cloud_Client::post()
                // injects the header automatically; individual call sites
                // don't need to thread the token through manually.
                'api_token'     => $body['apiToken'] ?? null,
                // HMAC signing secret kept for cloud → plugin webhook
                // callback verification (`reportCloudError`). Phase 3.5
                // retired its AUTH role; signing role is independent
                // and stays.
                'secret'        => $body['activationSecret'],
                // Phase 3.3 (multi-tenant spec §3.3) — cloud mints a UUID
                // for the activation and returns it. Persist locally so
                // every subsequent cloud call sends `activation_id`.
                'activation_id' => $body['activationId'] ?? null,
                'plan'          => $body['plan'],
                // Workspace audience ("individual" / "agency") cached
                // next to the plan so the SPA's badge composes its full
                // label ("Cloud Individual") on first paint instead of
                // flashing the name-only "Cloud" until the cloud
                // heartbeat lands. Null on responses from clouds
                // predating the field (2026-06-07) — the SPA falls back
                // to heartbeat-only in that case.
                'audience'      => $body['audience'] ?? null,
                'status'        => 'active',
            ];
            // Per-activation campaign cap, resolved cloud-side from the
            // License doc (Stripe product metadata → tier fallback).
            // Cached locally so the SPA can render the "X of Y" chip on
            // first paint without waiting for the daily heartbeat to
            // populate it. `null` = unlimited; the key is OMITTED when
            // the cloud response doesn't include it (pre-rollout
            // deploys) so `get_max_campaigns()` can distinguish "not
            // known yet, fall back to tier matrix" from "explicitly
            // unlimited."
            if (array_key_exists('maxCampaigns', $body)) {
                $payload['max_campaigns'] = $body['maxCampaigns'];
            }
            Key_Manager::save_license_payload($payload);

            Log_Service::add('success', "License activated successfully. Plan: " . strtoupper($body['plan']), 0,
                'license_activation');

            // Mark this install as having a cloud activation doc on file.
            // Read by `Admin_Dashboard::enqueue_scripts` and surfaced to
            // the SPA via `structuraConfig.had_prior_activation` so the
            // `SiteNotConnectedBanner` can distinguish "fresh wp.org
            // install" (hide banner) from "previously connected, now
            // disconnected" (show banner). Cleared only by the wipe-all
            // uninstall branch — a normal Disconnect intentionally leaves
            // it set so the reconnect prompt persists.
            update_option('structura_had_prior_activation', true, false);

            // Seed a default "House voice" persona on a fresh activation so
            // the user is never stuck in the empty-personas dead-end where
            // every Campaigns-page button is silently disabled. The seeder
            // self-bails on its own option flag, so reactivations are no-ops.
            self::seed_default_persona_if_needed();

            // Run the cloud → plugin reachability handshake now so the
            // unreachable-site banner reflects reality immediately after a
            // fresh connect instead of waiting for the daily cron. A site
            // activated on localhost / behind a firewall can't receive
            // blueprints, and surfacing that at connect time (when the user
            // is actively looking) is far better than a stalled first
            // campaign. Best-effort; never blocks the activation result.
            Site_Reachability::probe_and_store();

            return $body;
        }

        Log_Service::add('error', "Activation Rejected: " . ($body['error'] ?? 'Unknown'), 0, 'license_activation',
            ['payload' => $body]);

        return ['success' => false, 'error' => $body['error'] ?? 'Invalid response from server'];
    }

    /**
     * Logical Gate for Scheduler / Action Scheduler
     */
    public static function can_use_scheduler(): bool
    {
        // Require at least a Free Registered account for background tasks
        return self::is_licensed();
    }

    /**
     * Helper to check if the user has registered ANY license.
     */
    public static function is_licensed(): bool
    {
        return self::get_plan() !== 'none';
    }

    /**
     * Get the current plan level.
     *
     * Possible return values (matches `PlanId` in packages/types plus the
     * "no license" sentinel):
     *   - 'none'   — no active license key on this site (Anonymous)
     *   - 'free'   — registered with a free license key
     *   - 'byok'    — BYOK paid tier
     *   - 'cloud'  — managed-AI paid tier
     *   - 'cloud_pro' — managed-AI paid tier with graduated volume + bundled
     *                Channels add-on
     */
    public static function get_plan(): string
    {
        $data = Key_Manager::get_license_payload();

        // If no payload or inactive, they are 'none'
        if ( ! $data || empty($data['key']) || ($data['status'] ?? '') !== 'active') {
            return 'none';
        }

        // Return the plan from the payload, defaulting to 'free' if a key exists but plan is missing
        return $data['plan'] ?? 'free';
    }

    public static function can_generate_images(): bool
    {
        return self::get_plan() !== 'none';
    }

    public static function can_generate_featured_image(): bool
    {
        return self::is_licensed();
    }

    public static function can_generate_body_images(): bool
    {
        return self::is_pro();
    }

    /**
     * Main Pro Check used by the plugin.
     *
     * "Pro" here is shorthand for "any paid tier" — it gates body-image
     * generation, paid-only SEO rules, etc. Must include every paid plan
     * slug, including Agency, otherwise Agency users are silently
     * downgraded to the Free code path (body images disabled, is_pro: false
     * in the REST payload, etc.). Spec: specs/pricing-v2-implementation.md
     * §5.1 (agency rename) + §9.2 (isManagedPlan/isPaidPlan helpers).
     */
    public static function is_pro(): bool
    {
        $plan = self::get_plan();

        // Match against all paid plan slugs
        return in_array($plan, ['byok', 'cloud', 'cloud_pro'], true);
    }

    /**
     * Maximum number of AI providers the user can configure
     * simultaneously at the calling tier — Phase 1.8 §1.8.4 + Phase
     * 1.0m feature matrix.
     *
     *   - none  → 1 (user picks openai OR gemini; Anthropic visible+locked)
     *   - free  → 2 (openai + gemini both pickable; Anthropic
     *               visible+locked)
     *   - byok / cloud / cloud_pro → 3 (all three pickable;
     *               Anthropic unlocks at byok+ per the
     *               Provider_Registry min_tier table)
     *
     * Surfaced into `structuraConfig.provider_count_cap` so the SPA's
     * AI Engine page can hide the "default for text/images"
     * toggles when the cap is 1 (single provider, no choice to
     * make) and gate the "add another provider" CTA at the cap.
     */
    public static function get_provider_count_cap(): int
    {
        switch (self::get_plan()) {
            case 'none':
                return 1;
            case 'free':
                return 2;
            case 'byok':
            case 'cloud':
            case 'cloud_pro':
                return 3;
            default:
                // Forward-compat: an unknown plan slug is treated as
                // the most-restrictive option. Better to under-show
                // an option than to silently grant access to a
                // higher tier's surfaces.
                return 1;
        }
    }

    /**
     * Per-activation campaign cap surfaced to the SPA. Source of truth
     * lives in the cloud's License doc (Stripe product
     * `max_campaigns` metadata → per-license override → tier
     * fallback); the plugin caches the resolved value into
     * `structura_license_data.max_campaigns` on every successful
     * activation + heartbeat.
     *
     * Returns:
     *   - `int >= 0` — hard cap on the number of campaigns this
     *     activation may create.
     *   - `null`     — unlimited (managed-AI tiers, or a paid plan
     *     whose Stripe product omits the metadata).
     *
     * Fallback: if the cached payload doesn't carry `max_campaigns`
     * yet (pre-rollout cloud, or a brand-new install whose first
     * heartbeat hasn't landed), we project the tier matrix locally
     * so the UI still shows a sensible chip. The cloud is the
     * authoritative gate either way — this PHP value is purely for
     * UX rendering.
     *
     * @return int|null
     */
    public static function get_max_campaigns()
    {
        $data = Key_Manager::get_license_payload();
        if (is_array($data) && array_key_exists('max_campaigns', $data)) {
            $cap = $data['max_campaigns'];
            if ($cap === null) {
                return null;
            }
            if (is_numeric($cap)) {
                return (int)$cap;
            }
        }

        // Tier matrix mirror — kept in lockstep with
        // `packages/types/src/index.ts::MAX_CAMPAIGNS_FOR_TIER`. This
        // branch only runs during the rollout window for licenses
        // that pre-date the field; once the next heartbeat populates
        // the cache the explicit value above takes over.
        switch (self::get_plan()) {
            case 'free':
                return 1;
            case 'byok':
                return 10;
            case 'cloud':
            case 'cloud_pro':
                return null;
            case 'none':
            default:
                return 0;
        }
    }

    /**
     * True when the install runs on an anonymous shadow workspace —
     * post-bootstrap (api_token bound) but pre-claim (no license key,
     * so the plan resolves to 'none').
     *
     * Single source for the SPA's `is_anonymous` flag. Surfaced BOTH
     * via the `structuraConfig` inline bootstrap (Admin_Dashboard,
     * first-paint snapshot) and the `/settings` REST payload
     * (get_license_data below) so the SPA can re-derive it reactively
     * after an in-SPA license activation — the inline snapshot can't
     * change without a page render.
     */
    public static function is_anonymous_workspace(): bool
    {
        $data  = Key_Manager::get_license_payload();
        $token = is_array($data) ? ($data['api_token'] ?? '') : '';
        if ( ! is_string($token) || $token === '') {
            return false;
        }

        return self::get_plan() === 'none';
    }

    /**
     * True when the install has a cloud workspace bearer bound — a
     * licensed activation OR a bootstrapped anonymous ("none") workspace.
     * Keys off the persisted `api_token` (Phase 3.5 auth), NOT the
     * `license_key`, so it's the right gate for any cloud round-trip that
     * works for both tiers (e.g. Bridge Diagnostics). Mirrors the SPA's
     * `useLicense().hasWorkspace` and the `structuraConfig.has_workspace`
     * snapshot.
     */
    public static function has_workspace(): bool
    {
        $data  = Key_Manager::get_license_payload();
        $token = is_array($data) ? ($data['api_token'] ?? '') : '';

        return is_string($token) && $token !== '';
    }

    /**
     * Get License Info for the React Dashboard
     */
    public static function get_license_data(): array
    {
        $data = Key_Manager::get_license_payload();
        $plan = self::get_plan();

        return [
            'is_pro'        => self::is_pro(),
            'is_licensed'   => self::is_licensed(),
            'plan'          => $plan,
            // Workspace audience cached at activation / heartbeat time
            // (2026-06-07). Lets the SPA's plan badge render its full
            // "Cloud Individual"-style label on first paint; the cloud
            // heartbeat stays authoritative and overrides client-side.
            'audience'      => $data['audience'] ?? null,
            'license_key'   => $data['key'] ?? '',
            'upgrade_url'   => 'https://app.structurawp.com/billing',
            // Per-activation campaign cap surfaced to the SPA so the
            // CampaignsPage chip + "New Campaign" disabled-at-cap
            // logic don't need to know about the Stripe→tier
            // fallback rule. `null` = unlimited.
            'max_campaigns' => self::get_max_campaigns(),
            // Tier-derived UI flags, duplicated from the
            // `structuraConfig` inline bootstrap (2026-06-06). That
            // bootstrap is a page-render snapshot the SPA can never
            // refresh via query invalidation, which left a stale
            // 1-provider cap on the AI Engine surfaces right after an
            // in-SPA activation of a paid key. Carrying them on the
            // settings payload makes them reactive like every other
            // license field. Purely advisory for UX rendering —
            // provider ACCESS is enforced by Provider_Registry tier
            // gating server-side.
            'provider_count_cap' => self::get_provider_count_cap(),
            'is_anonymous'       => self::is_anonymous_workspace(),
        ];
    }

    /**
     * Daily Heartbeat: Syncs local status with Firebase
     */
    public static function verify_health(): bool
    {
        $data = Key_Manager::get_license_payload();

        if ( ! $data || ! isset($data['key'])) {
            return false;
        }

        $result = Cloud_Client::post('/checkLicenseStatus', [
            'licenseKey'   => $data['key'],
            'activationId' => $data['activation_id'] ?? '',
            'domain'       => wp_parse_url(get_site_url(), PHP_URL_HOST),
            'plan'       => $data['plan'] ?? 'none',
            'wpVersion'  => get_bloginfo('version'),
        ], ['timeout' => 15]);

        // Benefit of the doubt on network failure
        if (is_wp_error($result)) {
            return true;
        }

        $body = $result['body'];
        $status = $body['status'] ?? 'none';
        $plan   = $body['plan'] ?? 'none';

        // Sync the per-activation campaign cap whenever the cloud sent
        // it. Both branches below (non-active and active) re-save the
        // payload, so we mutate `$data` here once and let either path
        // persist it. The field is OMITTED on responses from pre-
        // rollout clouds; `get_max_campaigns()` falls back to the tier
        // matrix in that case.
        $cap_dirty = false;
        if (array_key_exists('maxCampaigns', $body)) {
            $current_cap = array_key_exists('max_campaigns', $data) ? $data['max_campaigns'] : '__missing__';
            if ($current_cap !== $body['maxCampaigns']) {
                $data['max_campaigns'] = $body['maxCampaigns'];
                $cap_dirty = true;
            }
        }

        // Same sync for the workspace audience — the badge label's
        // second axis. Cached locally (like plan) so first paint
        // doesn't flash the name-only label; the cloud heartbeat
        // remains authoritative client-side.
        $audience_dirty = false;
        if (array_key_exists('audience', $body)
            && ($body['audience'] ?? null) !== ($data['audience'] ?? null)
        ) {
            $data['audience'] = $body['audience'];
            $audience_dirty = true;
        }

        // If the status is anything other than 'active', we update the local record
        if ($status !== 'active') {
            $data['status'] = $status; // 'past_due', 'expired', 'canceled'
            $data['plan']   = $plan;

            Key_Manager::save_license_payload($data);

            Log_Service::add('warning', "License health check: Status is $status", 0, 'license_health');

            // Return false to signify the license is not "healthy"
            return false;
        }

        // Optional: Sync plan if it changed on the cloud
        $plan_dirty = $plan !== ($data['plan'] ?? 'none');
        if ($plan_dirty) {
            $data['plan'] = $plan;
        }
        if ($plan_dirty || $cap_dirty || $audience_dirty) {
            Key_Manager::save_license_payload($data);
        }

        return true;
    }

    /**
     * Silently updates the local plan to match the Cloud reality.
     */
    public static function sync_plan(string $new_plan): bool
    {
        $data = Key_Manager::get_license_payload();

        if ( ! $data) {
            return false;
        }

        $old_plan = $data['plan'] ?? 'none';

        if ($old_plan === $new_plan) {
            return true;
        }

        $data['plan'] = $new_plan;

        if ($new_plan === 'none') {
            $data['status'] = 'expired';
        }


        $saved = Key_Manager::save_license_payload($data);

        if ($saved) {
            Log_Service::add(
                'info',
                sprintf("License plan synchronized: %s -> %s", strtoupper($old_plan), strtoupper($new_plan)),
                0,
                'license_sync',
            );
        }


        // If the new plan is "none", then deactivate the site's license
        if ($new_plan === 'none') {
            $deactivated = self::deactivate();
            if ($deactivated) {
                Log_Service::add(
                    'info',
                    "License deactivated due to plan change to NONE",
                    0,
                    'license_sync',
                );
            } else {
                Log_Service::add(
                    'error',
                    "Failed to deactivate license during plan sync",
                    0,
                    'license_sync',
                );
            }
        }

        return $saved;
    }

    /**
     * Deactivate the license
     */
    public static function deactivate(bool $purge = false): bool
    {
        $data = Key_Manager::get_license_payload();
        if ( ! $data) {
            return true;
        }

        $domain = wp_parse_url(get_site_url(), PHP_URL_HOST);

        if ($purge && ! empty($data['key'])) {
            // Hard remove ("permanently delete all data" checkbox): delete
            // the cloud activation outright — and, when it's the last site
            // in the workspace, the whole workspace (shared personas, AI
            // keys, presets, usage history) — via the same /forgetActivation
            // path forget_site() uses. The license key is the cloud auth
            // boundary here, mirroring forget_site() (the bearer is dropped
            // below).
            Cloud_Client::post('/forgetActivation', [
                'licenseKey' => $data['key'],
                'domain'     => $domain,
            ]);
        } else {
            // Soft disconnect — release the slot; reconnect restores
            // everything. Phase 3.5: bearer auth is injected automatically by
            // Cloud_Client::post() from the persisted `api_token`; the body
            // only needs identifying context (`domain`) for cloud-side log
            // readability.
            Cloud_Client::post('/deactivateLicense', [
                'domain' => $domain,
            ]);
        }

        // Wipe every queued + recurring campaign action so they don't
        // keep firing under the next license (or under no license at
        // all). See `stop_all_campaign_pulses()` for the full
        // rationale on the disconnect → switch-to-different-license
        // flow this guards. Runs AFTER the cloud round-trip so a
        // failed deactivateLicense call still leaves the site able to
        // retry — and BEFORE the local option is deleted so a
        // subsequent reconnect to a different license starts from a
        // truly empty cron queue.
        \Structura\Scheduler\Action_Scheduler_Service::stop_all_campaign_pulses();

        // Drop the persona-seed flag so the NEXT activation re-seeds the
        // default "House voice" persona. Disconnect → reconnect-to-a-
        // different-license lands on a fresh cloud workspace with zero
        // personas; leaving the flag set (the pre-2026-05-25 bug) made
        // `seed_default_persona_if_needed()` O(1)-bail on its option
        // guard, so the new workspace got no persona and every
        // Campaigns-page button was silently disabled. Mirrors the same
        // cleanup `forget_site()` already does. Reconnecting to the SAME
        // workspace is safe too — the seeder's defensive `/listPersonas`
        // check sets the flag without writing when personas already
        // exist.
        delete_option('structura_default_persona_seeded');

        // A hard remove returns the site to true fresh-install state — so
        // the "site not connected" banner self-hides and a re-activation
        // re-seeds defaults (mirrors forget_site()).
        if ($purge) {
            delete_option('structura_had_prior_activation');
        }

        // Clear local storage
        return delete_option('structura_license_data');
    }

    /**
     * Hard-delete this site's cloud activation doc and wipe every
     * local artefact of prior activation. End point for the SPA's
     * "Forget this site" recovery flow.
     *
     * Auth: the caller-supplied license key is the cloud's only auth
     * boundary here — by the time this method is reachable the local
     * bearer has already been wiped by `deactivate()`, so the cloud
     * cannot authenticate the request any other way. The user types
     * the key into the confirm dialog; we forward it verbatim.
     *
     * Local state cleared on success:
     *  - `structura_license_data` (defensive — usually already gone)
     *  - `structura_had_prior_activation` (so the SPA returns to fresh-
     *    install state and `SiteNotConnectedBanner` self-hides on the
     *    next paint)
     *  - `structura_default_persona_seeded` (so a fresh activation re-
     *    seeds the House voice persona — same fresh-install behaviour
     *    as a wipe-all reinstall)
     *
     * Cloud failure leaves local state untouched so the user can
     * retry — surfacing a stale "site forgotten" banner while the
     * cloud doc still exists would be more confusing than honest.
     *
     * @param string $key  License key the user just typed into the
     *                     confirm dialog. Treated as opaque; the
     *                     cloud validates.
     *
     * @return array{success:bool,message?:string,error?:string,code?:int}
     */
    public static function forget_site(string $key): array
    {
        $domain = wp_parse_url(get_site_url(), PHP_URL_HOST);

        $result = Cloud_Client::post('/forgetActivation', [
            'licenseKey' => $key,
            'domain'     => $domain,
        ]);

        if (is_wp_error($result)) {
            Log_Service::add(
                'error',
                "Forget site connection error: " . $result->get_error_message(),
                0,
                'license_activation'
            );

            return ['success' => false, 'error' => $result->get_error_message()];
        }

        $code = $result['code'] ?? 0;
        $body = is_array($result['body'] ?? null) ? $result['body'] : [];

        if ($code !== 200 || empty($body['success'])) {
            $error = $body['error'] ?? __('Unknown error from server.', 'structura');
            Log_Service::add('error', "Forget site failed: $error", 0, 'license_activation');

            return ['success' => false, 'error' => $error, 'code' => $code];
        }

        // Cloud confirmed the activation is gone. Mirror that locally so
        // the SPA returns to fresh-install state (banner hides, getting-
        // started CTA reappears, no stale persona seed flag).
        delete_option('structura_license_data');
        delete_option('structura_had_prior_activation');
        delete_option('structura_default_persona_seeded');

        Log_Service::add('success', "Site forgotten — local activation state cleared.", 0, 'license_activation');

        return [
            'success' => true,
            'message' => $body['message'] ?? __('Site removed from your activations.', 'structura'),
        ];
    }

    /**
     * Eagerly sync the current plugin + WP version to the cloud activation record.
     * Called after plugin updates via upgrader_process_complete hook, and also
     * piggybacks on the daily health check.
     */
    public static function sync_version_to_cloud(): void
    {
        $data = Key_Manager::get_license_payload();

        if ( ! $data || empty($data['key'])) {
            return;
        }

        // Phase 3.5 — bearer header injected by Cloud_Client. Body
        // only carries the version fields the endpoint persists.
        Cloud_Client::post('/syncPluginVersion', [
            'wpVersion' => get_bloginfo('version'),
        ], ['timeout' => 10]);
    }


    /**
     * Auto-seed a default "House voice" persona on the activation if one
     * doesn't exist yet.
     *
     * Called inline after a successful `activate()`, and again as a backfill
     * via `admin_init` for installs whose license was activated before this
     * code shipped — and (Phase 1.8) for fresh anonymous shadow workspaces
     * the moment `Anonymous_Bootstrap::maybe_bootstrap()` mints a bearer.
     * Without the seed, anonymous installs land in the empty-personas
     * dead-end where every Campaigns-page button is silently disabled,
     * which is exactly the regression this seeder was added to prevent
     * back when only licensed activations could reach it.
     *
     * Three layers of idempotency:
     *
     *   1. Option flag `structura_default_persona_seeded` — O(1) bail.
     *   2. 5-minute cooldown transient — prevents wp-admin pageloads from
     *      hammering /listPersonas while the cloud is unreachable on a
     *      brand-new install. Cleared on first success.
     *   3. Defensive cloud `listPersonas` check — if the user already has
     *      personas (flag was lost, restore-from-backup, etc.), set the
     *      flag and exit without writing.
     *
     * Failures (network or non-200) leave the flag UNSET so the next
     * admin_init retry succeeds. License activation itself is unaffected —
     * this method swallows all errors.
     */
    public static function seed_default_persona_if_needed(): void
    {
        if (get_option('structura_default_persona_seeded') === 'yes') {
            return;
        }

        // Phase 1.8 §1.8.4 — gate on workspace presence (api_token bound)
        // rather than license presence. `is_licensed()` keys off the
        // `key` field which anonymous workspaces deliberately don't carry,
        // so the historical guard silently no-op'd on every anonymous
        // install and the user landed on Campaigns with zero personas.
        // The seeder runs once per workspace; if the user later claims
        // the anonymous workspace into a paid license the seed carries
        // forward (claim flow promotes the same workspace doc).
        $payload   = Key_Manager::get_license_payload();
        $api_token = is_array($payload) ? ($payload['api_token'] ?? '') : '';
        if ( ! $api_token) {
            return;
        }

        // Cooldown so a /listPersonas hiccup on an unseeded install doesn't
        // turn every wp-admin pageload into a 30-second blocking call.
        // Once the option flag flips to 'yes' this transient never matters.
        if (get_transient('structura_default_persona_seed_cooldown')) {
            return;
        }
        set_transient('structura_default_persona_seed_cooldown', 1, 5 * MINUTE_IN_SECONDS);

        // Defense-in-depth: if any persona already exists for this
        // activation, just set the flag and exit without writing.
        // Bearer auth is auto-injected by Cloud_Client::post() — the
        // legacy license_key + activation_secret + site_url body fields
        // are no longer read by the cloud handler (PR5).
        $list = Cloud_Client::post('/listPersonas', [], ['timeout' => 15]);

        if (is_wp_error($list)) {
            return;
        }

        $existing = $list['body']['personas'] ?? [];
        if (is_array($existing) && count($existing) > 0) {
            update_option('structura_default_persona_seeded', 'yes');
            delete_transient('structura_default_persona_seed_cooldown');
            return;
        }

        // Author = the activating admin (or the admin viewing wp-admin on
        // the backfill path). Falls back to user 1 if no current user has
        // edit_posts — same fallback Rest_Api::validate_persona_author()
        // applies on user-driven persona creation.
        $current_user = wp_get_current_user();
        $author_id    = self::resolve_seed_author(
            ($current_user && $current_user->ID) ? (int) $current_user->ID : 0
        );

        $cloud_input = Persona_Shape_Transformer::wp_input_to_cloud([
            'name'          => __('House voice', 'structura'),
            'system_prompt' => __(
                "Write clearly and naturally for this site's audience. Adapt tone to the topic and keep guidance practical.",
                'structura'
            ),
            'tone'          => 'professional',
            'reading_level' => 'grade_12',
            'author_id'     => $author_id,
        ]);

        $result = Cloud_Client::post(
            '/postPersona',
            ['persona' => $cloud_input],
            ['timeout' => 15]
        );

        if (is_wp_error($result)) {
            return;
        }

        if (($result['code'] ?? 0) !== 200) {
            Log_Service::add(
                'warning',
                'Default persona seed failed (HTTP ' . ($result['code'] ?? '0') . ').',
                0,
                'persona_seed'
            );
            return;
        }

        update_option('structura_default_persona_seeded', 'yes');
        delete_transient('structura_default_persona_seed_cooldown');
        Log_Service::add(
            'info',
            'Default "House voice" persona seeded on this activation.',
            0,
            'persona_seed'
        );
    }

    /**
     * Mirrors Rest_Api::validate_persona_author() so the seeder applies the
     * same fallback semantics: must be a real WP user with `edit_posts`,
     * else fall back to user 1. Kept here (rather than reaching into the
     * REST instance) so this static helper has no Rest_Api dependency.
     */
    private static function resolve_seed_author(int $user_id): int
    {
        if ($user_id > 0) {
            $user = get_userdata($user_id);
            if ($user && user_can($user->ID, 'edit_posts')) {
                return (int) $user->ID;
            }
        }
        return 1;
    }
}