<?php

namespace Structura\Core;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Anonymous shadow workspace bootstrap — Phase 1.8 §1.8.1 + §1.8.3 of
 * `specs/v2/multi-tenant-and-public-api.md`.
 *
 * On every wp-admin page load, fires a one-shot check:
 *   - If the install already has a bound license (license_data.api_token
 *     is set + status === 'active'), no-op. The licensed activation
 *     bearer is what every cloud call uses; the anonymous bootstrap
 *     branch is irrelevant.
 *   - If the install has NEVER been bootstrapped (no install_id, no
 *     api_token), generate a UUID v4 into `structura_install_id` and
 *     POST `/bootstrapAnonymousInstall` to the cloud. On success,
 *     persist `{api_token, activation_id, plan: "none", status: "active"}`
 *     into `structura_license_data` (same shape Phase 3.5 licensed
 *     activations use, just with `plan === "none"` and no `key`),
 *     and set `structura_install_bootstrapped_at`.
 *   - If the install has an `install_id` but no `api_token` (mid-flight
 *     after a failed bootstrap, or a backup restore that wiped the
 *     license_data row but kept the install_id sticker), retry the
 *     bootstrap call. The cloud's idempotent re-bootstrap path returns
 *     the same workspaceId/activationId tuple plus a fresh bearer.
 *
 * Failure modes are all silent — no admin notice, no error toast.
 * A fresh install with no internet yet shouldn't see a scary banner;
 * the next page load will retry on its own. The SPA falls back to
 * the unlicensed-CTA teasers (PR1a) until bootstrap succeeds; once
 * the api_token is in place, the SPA's `useLicense` derives
 * `hasWorkspace === true` (PR7b) and the surfaces flip to active.
 */
class Anonymous_Bootstrap
{
    /**
     * UUID v4 stored on the WP install. Stable across the install's
     * lifetime — survives plugin upgrades, license-disconnect cycles,
     * and bootstrap retries. Cleared only by the wipe-all uninstall
     * branch + the successful claim flow that promotes the shadow
     * workspace to a real license-bound workspace.
     */
    public const OPTION_INSTALL_ID = 'structura_install_id';

    /**
     * Sentinel timestamp written after a successful bootstrap call.
     * Combined with the api_token check, this lets the maybe-bootstrap
     * gate distinguish "never tried" (no flag, no token) from
     * "succeeded once" (flag set + token in license_data) from
     * "tried + failed mid-flight" (flag missing but install_id set).
     */
    public const OPTION_BOOTSTRAPPED_AT = 'structura_install_bootstrapped_at';

    /**
     * Per-process re-entry guard. WP fires `admin_init` more than once
     * on some flows (REST + admin page in the same request); without
     * the guard the bootstrap call would fire twice and the second
     * race the per-installId rate limit (1/min) into a 429.
     */
    private static bool $ranThisRequest = false;

    public static function init(): void
    {
        // `admin_init` is the standard "wp-admin is up, run once on
        // first admin page load" hook. We don't gate on a specific
        // page — bootstrap should fire for any admin-context request
        // because subsequent admin pages all assume the api_token is
        // already in place. Front-end requests don't need it
        // (anonymous workspaces are a wp-admin concern), so the front
        // never fires.
        add_action('admin_init', [self::class, 'maybe_bootstrap']);

        // Phase 1.8 PR8 — secret backfill for installs that
        // bootstrapped on pre-PR8 plugin (api_token persisted, but
        // `secret` field missing because the bootstrap response didn't
        // expose `activationSecret` yet). Without the secret, every
        // cloud → plugin webhook signature check fails. We schedule a
        // one-shot AS task on admin_init that calls the cloud's
        // `/getActivationSecretForBackfill` endpoint and writes the
        // secret into license_data. Self-gates: skips when the secret
        // is already present, when there's no api_token (uninstalled),
        // or when the install is fully licensed (those got the secret
        // via `License_Manager::activate()`).
        add_action('admin_init', [self::class, 'maybe_backfill_secret']);
        add_action(
            'structura_backfill_activation_secret',
            [self::class, 'handle_secret_backfill_task'],
        );
    }

    /**
     * One-shot bootstrap check. Idempotent on success; safe to call
     * multiple times in the same request (re-entry guard short-
     * circuits) and across requests (the api_token check
     * short-circuits once bootstrap has succeeded).
     */
    public static function maybe_bootstrap(): void
    {
        if (self::$ranThisRequest) {
            return;
        }
        self::$ranThisRequest = true;

        // Short-circuit the licensed case. `License_Manager::is_licensed()`
        // returns true when the license_data carries a non-empty `key`
        // AND status is active — which only happens on the licensed
        // activation path. Anonymous workspaces have no `key`, so
        // `is_licensed()` is false for them; we still need to check
        // the api_token directly to avoid re-bootstrapping a working
        // anonymous install.
        if (License_Manager::is_licensed()) {
            return;
        }

        $stashed = Key_Manager::get_license_payload();
        $existing_token = is_array($stashed) ? ($stashed['api_token'] ?? '') : '';

        if ($existing_token !== '') {
            // We already have an anonymous bearer (or a stale licensed
            // one — caller is_licensed() check above already filtered
            // the licensed-with-active-status case). Don't re-mint;
            // the bearer is good until revoked.
            return;
        }

        // No bearer yet → bootstrap (first contact OR retry).
        $install_id = self::get_or_generate_install_id();
        if ($install_id === '') {
            return;
        }

        $domain = wp_parse_url(get_site_url(), PHP_URL_HOST);
        if ( ! $domain) {
            // Unusable site URL — log and skip; next page load retries
            // (a malformed siteurl option is a WP-core problem, not
            // ours, but we shouldn't crash on it).
            Log_Service::add('warn',
                'Anonymous_Bootstrap: skipping — site URL has no parseable host.',
                0, 'anonymous_bootstrap');
            return;
        }

        $request_body = [
            'installId'      => $install_id,
            'domain'         => $domain,
            'siteName'       => get_bloginfo('name'),
            'wpVersion'      => get_bloginfo('version'),
            // Spec: specs/v2/cloud-pregeneration-and-model-catalog.md §1.0e —
            // ship the brand surface in the same call so the cloud's
            // AI engine has site context on the very first generation,
            // matching what the licensed `activateLicense` flow does.
            'siteIdentity'   => Site_Identity_Sync::collect(),
        ];

        // `Cloud_Client::post` injects the bearer when one is stashed;
        // for the bootstrap call there's no bearer yet, so the request
        // goes out unauthenticated — exactly what the cloud endpoint
        // expects.
        $result = Cloud_Client::post('/bootstrapAnonymousInstall', $request_body);

        if (is_wp_error($result)) {
            // Network error / DNS failure / cloud unreachable. Silent
            // retry next page load. Log at debug so a support engineer
            // can correlate against cloud logs if the user reports the
            // SPA stuck on the unlicensed teaser.
            Log_Service::add('debug',
                'Anonymous_Bootstrap: cloud unreachable, will retry next page load: '
                    . $result->get_error_message(),
                0, 'anonymous_bootstrap');
            return;
        }

        $code = $result['code'] ?? 0;
        $body = $result['body'] ?? [];

        if ($code !== 200 || ! is_array($body) || empty($body['success'])) {
            // 4xx / 5xx response. Don't surface to the user; the
            // unlicensed teaser is already a reasonable fallback. Log
            // for support triage.
            $err = is_array($body) ? ($body['error'] ?? 'unknown') : 'malformed response';
            Log_Service::add('warn',
                'Anonymous_Bootstrap: cloud rejected bootstrap (code='
                    . $code . ', error=' . $err . ')',
                0, 'anonymous_bootstrap');
            return;
        }

        // Success — persist the returned tuple. Same shape Phase 3.5
        // licensed activations use; the cloud-side bearer middleware
        // (Cloud_Client::post) reads `api_token` and sends
        // `Authorization: Bearer <token>` on every subsequent call.
        //
        // Phase 1.8 PR8 — the response now includes `activationSecret`
        // (the HMAC signing secret used by the cloud to sign webhook
        // callbacks back into the plugin). Pre-PR8 we deliberately
        // omitted it because anonymous installs didn't receive
        // callbacks, but PR8 enables single-post generation for None
        // tier — the cloud-side webhook delivery is the path that
        // ferries the synthesized post back, and
        // `Task_Runner::verify_webhook_signature` reads
        // `Key_Manager::get_license_payload()['secret']` to verify.
        // Without the secret bound here, every cloud webhook would
        // be rejected by the plugin's HMAC check.
        Key_Manager::save_license_payload([
            // No `key` field — anonymous workspaces have no license
            // key. License_Manager::is_licensed() reads `key` to
            // discriminate, so we don't accidentally turn into a
            // licensed install just because we have a bearer.
            'api_token'     => $body['apiToken'] ?? '',
            'activation_id' => $body['activationId'] ?? '',
            'secret'        => $body['activationSecret'] ?? '',
            'plan'          => $body['plan'] ?? 'none',
            'status'        => 'active',
        ]);

        update_option(self::OPTION_BOOTSTRAPPED_AT, time(), false);

        Log_Service::add('success',
            'Anonymous_Bootstrap: shadow workspace minted (' .
                ($body['idempotent'] ?? false ? 're-bootstrap' : 'fresh') . ').',
            0, 'anonymous_bootstrap');
    }

    /**
     * Read the persisted install id, or generate + persist a fresh
     * UUID v4 if none is stored. The id is stable for the install's
     * lifetime once written; this helper is the only writer.
     *
     * Returns the install id, or `""` on a generation failure (which
     * shouldn't happen in practice — `wp_generate_uuid4()` is a pure
     * function). The empty-string return path is a defensive guard
     * against future WP changes.
     */
    public static function get_or_generate_install_id(): string
    {
        $existing = get_option(self::OPTION_INSTALL_ID, '');
        if (is_string($existing) && $existing !== '') {
            return $existing;
        }

        $uuid = wp_generate_uuid4();
        if (! is_string($uuid) || $uuid === '') {
            return '';
        }

        // Autoload off — this option is read by the bootstrap path
        // (admin_init) but not by every page load post-bootstrap, so
        // there's no need to ship it on the WP autoload payload.
        update_option(self::OPTION_INSTALL_ID, $uuid, false);
        return $uuid;
    }

    /**
     * Phase 1.8 PR8 — admin_init gate for the activation-secret
     * backfill. Schedules a single async AS task when the install
     * has an api_token but no `secret` field on the persisted
     * license_data (i.e. it bootstrapped on a pre-PR8 plugin where
     * the bootstrap response didn't expose `activationSecret`). Idempotent:
     * skips if secret is present, if there's no api_token, or if a
     * scheduled task already exists.
     *
     * Re-entry guard: piggy-backs on `$ranThisRequest` so multiple
     * `admin_init` fires in the same WP request only schedule once.
     * The AS handler itself is also idempotent (no-ops if the secret
     * has been written between scheduling and execution), so even a
     * race that double-schedules is safe.
     */
    public static function maybe_backfill_secret(): void
    {
        $stashed = Key_Manager::get_license_payload();
        if (! is_array($stashed)) {
            return;
        }
        $token  = $stashed['api_token'] ?? '';
        $secret = $stashed['secret'] ?? '';
        if ($token === '' || $secret !== '') {
            return;
        }

        // Avoid scheduling a duplicate when one is already in the
        // pending queue. AS dedupe by hook+args, so passing an empty
        // args array means each call queues a fresh row even on a
        // double-fire — the `as_has_scheduled_action` check below is
        // the cheap dedupe.
        if (function_exists('as_has_scheduled_action')
            && as_has_scheduled_action(
                'structura_backfill_activation_secret',
                [],
                STRUCTURA_AS_GROUP,
            )) {
            return;
        }

        if (function_exists('as_enqueue_async_action')) {
            as_enqueue_async_action(
                'structura_backfill_activation_secret',
                [],
                STRUCTURA_AS_GROUP,
            );
        }
    }

    /**
     * AS-fired handler. Calls the cloud's
     * `/getActivationSecretForBackfill` endpoint to fetch the existing
     * `activationSecret` for this install's bound activation, then
     * writes it into `structura_license_data['secret']` so
     * `Task_Runner::verify_webhook_signature` can verify cloud → plugin
     * webhook callbacks.
     *
     * Idempotent and self-gating: if the secret has already been
     * written (manual repair, prior backfill run that succeeded),
     * we no-op. Failure is silent at the user-facing surface — the
     * task re-enqueues on the next admin_init fire (the gate above
     * re-evaluates fresh state).
     */
    public static function handle_secret_backfill_task(): void
    {
        $stashed = Key_Manager::get_license_payload();
        if (! is_array($stashed)) {
            return;
        }
        if (($stashed['secret'] ?? '') !== '') {
            return;
        }
        if (($stashed['api_token'] ?? '') === '') {
            return;
        }

        $result = Cloud_Client::post('/getActivationSecretForBackfill', []);
        if (is_wp_error($result)) {
            Log_Service::add('debug',
                'Anonymous_Bootstrap: secret backfill — cloud unreachable, will retry next admin_init: '
                    . $result->get_error_message(),
                0, 'anonymous_bootstrap');
            return;
        }

        $code = $result['code'] ?? 0;
        $body = $result['body'] ?? [];
        if ($code !== 200 || ! is_array($body) || empty($body['success'])) {
            Log_Service::add('debug',
                'Anonymous_Bootstrap: secret backfill rejected by cloud (code=' . $code . ').',
                0, 'anonymous_bootstrap');
            return;
        }

        $secret = $body['activationSecret'] ?? '';
        if (! is_string($secret) || $secret === '') {
            return;
        }

        // Re-read the payload before merging so we don't clobber
        // anything that landed between the gate and the cloud call
        // (e.g. a license activation completing in a parallel admin
        // request would have written the licensed `key` + `secret`
        // tuple, and overwriting that with just the anonymous secret
        // would corrupt the payload).
        $current = Key_Manager::get_license_payload();
        if (! is_array($current) || ($current['secret'] ?? '') !== '') {
            return;
        }
        $current['secret'] = $secret;
        Key_Manager::save_license_payload($current);

        Log_Service::add('success',
            'Anonymous_Bootstrap: activation secret backfilled.',
            0, 'anonymous_bootstrap');
    }
}
