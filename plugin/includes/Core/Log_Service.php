<?php

namespace Structura\Core;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Class Log_Service — Phase 3b stub.
 *
 * Spec: specs/v2/notification-center.md §8.1 retires the plugin's
 * local logs surface (the `wp_structura_logs` table, the System Logs
 * page, the /v1/logs REST routes, the Log Retention settings card,
 * and the daily `structura_prune_logs` cron). The user-facing role
 * is replaced by the cloud-canonical Notification Center; the
 * forensic role is covered by per-run timelines + adminIncidents.
 *
 * `add()` is kept as a no-op so the ~160 historical callsites in the
 * plugin remain valid without a sweeping edit. New code shouldn't
 * call it. `drop_table()` is kept so the uninstall hook continues
 * to clean up legacy `wp_structura_logs` tables that exist on
 * already-installed sites.
 */
class Log_Service
{
    /**
     * No-op. Retained as a back-compat stub for the ~160 legacy
     * `Log_Service::add()` callsites scattered through the plugin —
     * each was a `wp_structura_logs` INSERT in the pre-Phase-3b world.
     * New diagnostics flow through the Notification Center
     * (cloud) and the per-run timeline (Firestore). This stub will
     * be deleted entirely once the existing callsites are migrated
     * to either of those surfaces.
     *
     * Signature mirrors the original deliberately so a callsite
     * migrating from "log this side-effect" to "emit a notice" can
     * be a one-line swap.
     */
    public static function add(
        string $level,
        string $message,
        $campaign_id = 0,
        string $step = '',
        array $context = []
    ): void {
        // Intentionally empty. Suppress unused-arg warnings under
        // strict PHPCS without leaking a warning to the error log.
        unset($level, $message, $campaign_id, $step, $context);
    }

    /**
     * Drop the legacy `wp_structura_logs` table. Called from
     * `uninstall.php` so sites that installed under the pre-Phase-3b
     * schema get their orphan table cleaned up on plugin removal.
     *
     * `DROP IF EXISTS` so new installs (which never had the table)
     * fall through silently.
     */
    public static function drop_table(): void
    {
        global $wpdb;
        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- internal table name; uninstall path by design.
        $wpdb->query("DROP TABLE IF EXISTS " . $wpdb->prefix . 'structura_logs');
    }
}
