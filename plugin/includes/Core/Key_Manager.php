<?php

namespace Structura\Core;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * License payload vault — encrypted `wp_options` storage for the
 * activation envelope (license key + Bearer api_token + plan
 * snapshot).
 *
 * Phase 4 of `specs/v2/cloud-only-generation.md` retired the BYOK
 * provider-key methods (`save_key` / `get_key` / `has_key` /
 * `delete_key`). Provider keys live in the cloud's workspace
 * credentials store now (`/workspaces/{w}/credentials/{c}`) and the
 * plugin never holds them. The class kept its name for minimal
 * call-site churn; renaming to `License_Vault` (or inlining into
 * `License_Manager`) is a follow-up.
 *
 * `wipe_all_keys` survives because uninstall.php still needs to
 * sweep legacy `structura_key_*` rows from upgraded sites.
 */
class Key_Manager
{

    /**
     * Store License Data (Encrypted)
     */
    public static function save_license_payload($data): bool
    {
        // Serialize the array (key, secret, plan) then encrypt
        $encrypted = Encryption::encrypt(maybe_serialize($data));

        return update_option('structura_license_data', $encrypted);
    }

    /**
     * Retrieve License Data (Decrypted)
     */
    public static function get_license_payload(): ?array
    {
        $encrypted = get_option('structura_license_data');
        if ( ! $encrypted) {
            return null;
        }

        $decrypted = Encryption::decrypt($encrypted);

        return maybe_unserialize($decrypted);
    }

    /**
     * Wipes the license payload AND any leftover BYOK key rows from
     * earlier plugin versions. Called by `uninstall.php` when the
     * user opts in to the "delete all data" toggle.
     */
    public static function wipe_all_keys(): void
    {
        // 1. Clear the main license payload.
        delete_option('structura_license_data');

        // 2. Sweep the leftover `structura_key_*` rows.
        self::wipe_dead_byok_keys();
    }

    /**
     * Sweep leftover `structura_key_*` rows from earlier plugin
     * versions. Phase 4 of `specs/v2/cloud-only-generation.md` retired
     * BYOK key storage in `wp_options` (keys live in
     * `/workspaces/{w}/credentials/{c}` now), but installs upgraded
     * from pre-Phase-4 versions still carry the old encrypted-key
     * options. Sweeping them is safe regardless of the wipe-all
     * toggle — they reference deleted PHP classes and serve no
     * purpose.
     */
    public static function wipe_dead_byok_keys(): void
    {
        global $wpdb;

        $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s",
                'structura_key_%',
            ),
        );
    }
}
