<?php
/**
 * Structura Uninstall
 *
 * v2 (2026-05-01) — wipes plugin-side data only. Cloud-side data
 * (campaigns, personas, visual settings, generations, stock entries)
 * lives on Firestore and is owned by the user's account at
 * app.structurawp.com — uninstalling the plugin doesn't delete it.
 *
 * The matching cloud "wipe my data" path is the GDPR/account-delete
 * flow on the portal (spec: 1.0k Wipe Site). That's deliberately
 * separate from plugin uninstall so a user can re-install on a
 * different WP host without losing their content history.
 *
 * Plugin-side cleanup scope:
 *   - Custom DB tables (logs, secrets) created by the plugin.
 *   - WP options the plugin owns (license cache, install-level prefs).
 *   - Action Scheduler rows in the `structura` group.
 *   - Daily cron hook.
 *
 * Things this DELIBERATELY does NOT clean up:
 *   - Posts the plugin generated. The user might want to keep
 *     them. Their `_structura_*` post meta keys survive uninstall;
 *     a re-install picks them up via `_structura_campaign_id`
 *     pointing back to the cloud doc (still available on the
 *     user's account).
 *   - WP attachment meta (`_structura_generation_id`,
 *     `_structura_image_topic`, `_structura_image_slot`).
 *     Same rationale.
 */

if ( ! defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

$should_wipe = get_option('structura_delete_data_on_uninstall') === 'yes';

// Helpers needed for both the unconditional dead-data sweep below
// AND the opt-in full wipe path further down.
require_once __DIR__ . '/includes/Core/Encryption.php';
require_once __DIR__ . '/includes/Core/Key_Manager.php';

// ── Unconditional dead-data sweep ──────────────────────────────────
//
// These options reference deleted PHP classes or cloud-resident
// data that's stale by definition. Leaving them around just means
// a noisier `_cluster_intelligence` migration on reinstall and
// confused diagnostics. Sweep regardless of the wipe-all toggle.
//
// Spec: `specs/v2/cloud-only-generation.md` §Phase 6.
\Structura\Core\Key_Manager::wipe_dead_byok_keys();

$dead_options = [
    // Visual settings — moved to the cloud activation doc
    // (`visualSettings/global`) in Phase 1.0d. The wp_options copies
    // are stale on installs that ever opened the SPA.
    'structura_visual_art_direction',
    'structura_visual_aspect_ratio',
    'structura_visual_format',
    'structura_visual_optimize',
    // Default-provider selection moved to the workspace doc in
    // Phase 4 of `cloud-only-generation.md`. Local copies are dead.
    'structura_default_text_provider',
    'structura_default_image_provider',
    // Pre-cloud BYOK provider settings bag — referenced
    // `Provider_Registry::resolve_*_adapter` which no longer exists.
    'structura_ai_settings',
];

foreach ($dead_options as $opt) {
    delete_option($opt);
}

if ($should_wipe) {
    // 1. Load remaining helpers needed for the full wipe.
    require_once __DIR__ . '/includes/Core/Log_Service.php';

    // 2. Drop custom tables + encrypted license payload.
    \Structura\Core\Log_Service::drop_table();
    \Structura\Core\Key_Manager::wipe_all_keys();

    // 3. Clear plugin-owned WP options. v2 trimmed this list
    //    considerably: stats counters and per-feature settings
    //    moved to cloud Firestore (single source of truth — see
    //    memory note `feedback_cloud_is_single_source_of_truth_v2`).
    $options = [
        'structura_license_data',
        'structura_delete_data_on_uninstall',
        // Cron-time bookkeeping the plugin still owns locally.
        'structura_stat_generated_images',
        // Prior-activation memory drives the SPA's "This site isn't
        // connected" banner. Wipe-all → reinstall must look like a
        // fresh wp.org install (no banner), per the contract at
        // client/src/components/Shared/SiteNotConnectedBanner.tsx
        // §"Fresh-install suppression".
        'structura_had_prior_activation',
        // Phase 1.8 — anonymous shadow workspace bootstrap state.
        // Both options are wiped so a wipe-all → reinstall presents
        // as a brand-new install; the next admin page load will
        // generate a fresh install_id and bootstrap a new shadow
        // workspace. Leaving the install_id around would let a
        // post-uninstall reinstall accidentally re-claim the prior
        // shadow workspace (whose data the user explicitly chose to
        // forget). Spec: `specs/v2/multi-tenant-and-public-api.md`
        // §1.8.1 Storage table.
        'structura_install_id',
        'structura_install_bootstrapped_at',
    ];

    foreach ($options as $option) {
        delete_option($option);
    }
}

// Cron + Action Scheduler cleanup runs regardless of `$should_wipe`
// because leaving these scheduled would keep firing the plugin's
// hooks against a missing class — noisy in PHP error logs.
wp_clear_scheduled_hook('structura_daily_license_check');

$group = 'structura';

if (class_exists('ActionScheduler_DBStore')) {
    try {
        \ActionScheduler_DBStore::instance()->cancel_actions_by_group($group);
    } catch (\Exception $e) {
        // Fail silently if AS is already gone or errors out.
    }
}
