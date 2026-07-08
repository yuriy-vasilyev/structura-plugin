<?php

/**
 * Plugin Name: Structura
 * Plugin URI: https://www.structurawp.com/
 * Description: Autonomous AI content architect for WordPress.
 * x-release-please-start-version
 * Version: 2.14.1
 * x-release-please-end-version
 * Author: Xerx
 * Author URI: https://www.xerx.io
 * Text Domain: structura
 * Domain Path: /languages
 * Requires PHP: 7.4
 * Requires at least: 6.2
 * Tested up to: 7.0
 * License: GPLv2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 */

use Structura\Core\Loader;

if ( ! defined('ABSPATH')) {
    exit;
}

// 1. SAFETY CHECK: Early Exit for incompatible PHP versions
if (version_compare(PHP_VERSION, '7.4', '<')) {
    add_action('admin_notices', function () {
        ?>
        <div class="notice notice-error">
            <p>
                <?php
                printf(
                        /* translators: %s is the currently-installed PHP version string. */
                        esc_html__(
                                'Structura requires PHP 7.4 or higher. Your site is running PHP %s. Please update PHP to use this plugin.',
                                'structura'
                        ),
                        esc_html(phpversion()),
                );
                ?>
            </p>
        </div>
        <?php
    });

    return; // STOP execution here
}

// 2. Define Constants
define('STRUCTURA_VERSION', '2.14.1'); // x-release-please-version
define('STRUCTURA_PATH', plugin_dir_path(__FILE__));
define('STRUCTURA_URL', plugin_dir_url(__FILE__));
define('STRUCTURA_AS_GROUP', 'structura');

define('STRUCTURA_DEV_MODE', false);
define('STRUCTURA_API_BASE', 'https://us-central1-structura-8d158.cloudfunctions.net');

// 3. Autoload Dependencies
// Load the Composer Autoloader - this handles Freemius and standard libraries
if (file_exists(STRUCTURA_PATH . 'vendor/autoload.php')) {
    require_once STRUCTURA_PATH . 'vendor/autoload.php';
}

// Action Scheduler might need its specific entry point if not fully compliant with Composer autoloading
$as_path = STRUCTURA_PATH . 'vendor/woocommerce/action-scheduler/action-scheduler.php';
if (file_exists($as_path)) {
    require_once $as_path;
}

// 4. Load Plugin Core
require_once STRUCTURA_PATH . 'includes/Core/Loader.php';

// 5. Initialize
// Translations: wp.org auto-loads `wp-content/languages/plugins/structura-<locale>.mo`
// for hosted plugins (WP 4.6+), so no explicit load_plugin_textdomain() call
// is needed here. PCP's PluginCheck.CodeAnalysis.DiscouragedFunctions.load_plugin_textdomainFound
// rule enforces this. The local `languages/` directory still ships translations
// for users running pre-wp.org builds (GCS channel) — WP picks those up via the
// same automatic mechanism as a fallback when the wp.org-managed file is absent.
function run_structura(): void
{
    $plugin = new Loader();
    $plugin->run();
}

run_structura();

/**
 * ACTIVATION
 */
register_activation_hook(__FILE__, function () {
    // 1. Manually load the bare minimum needed for activation
    $path = plugin_dir_path(__FILE__);
    require_once $path . 'includes/Core/Log_Service.php';
    require_once $path . 'includes/Core/Data_Structure.php';

    // 2. Drop the legacy `wp_structura_logs` table on upgrade.
    //    Phase 3b (spec/v2/notification-center.md §8.1) retires the
    //    plugin's local logs surface — the cloud-canonical Notice
    //    Center replaces the user-facing role, per-run timelines
    //    replace the forensic role. Idempotent on new installs (the
    //    table never existed there).
    \Structura\Core\Log_Service::drop_table();

    // 3. Setup Custom Post Types
    \Structura\Core\Data_Structure::init();

    flush_rewrite_rules();

    // 3. Initial Cron Setup (optional but safe)
    if ( ! wp_next_scheduled('structura_daily_license_check')) {
        wp_schedule_event(time(), 'daily', 'structura_daily_license_check');
    }

    // Seed log-retention defaults on first activation so the option is
    // "yes" / 60 days out of the gate. get_option's fallback already covers
    // reads, but add_option() here means the settings UI shows the toggle
    // as ON immediately after install.
    add_option('structura_log_retention_enabled', 'yes');
    add_option('structura_log_retention_days', 60);

    // Schedule the daily retention sweep if retention is on. We stagger it
    // by an hour so it doesn't collide with the license-health check that
    // gets scheduled at activation time.
    if (get_option('structura_log_retention_enabled', 'yes') === 'yes'
        && ! wp_next_scheduled('structura_prune_logs')) {
        wp_schedule_event(time() + HOUR_IN_SECONDS, 'daily', 'structura_prune_logs');
    }

    // Page-builder compatibility detection. Run detection once so the
    // admin notice has data to show on the first post-activation
    // pageview, and register the daily Action Scheduler recheck.
    // Spec: specs/page-builder-compat.md §3.2 + §7 Phase 2C.
    require_once $path . 'includes/Compat/Builder_Compat.php';
    require_once $path . 'includes/Compat/Builder_Detector.php';
    require_once $path . 'includes/Compat/Compat_Scheduler.php';
    \Structura\Compat\Compat_Scheduler::activate();
});

/**
 * DEACTIVATION
 */
register_deactivation_hook(__FILE__, function () {
    // Stop any pending pulse tasks if necessary
    wp_clear_scheduled_hook('structura_daily_license_check');
    wp_clear_scheduled_hook('structura_prune_logs');

    // Clear the page-builder compat recheck so an admin who
    // deactivates Structura doesn't keep seeing a daily Action
    // Scheduler entry for it.
    $path = plugin_dir_path(__FILE__);
    require_once $path . 'includes/Compat/Compat_Scheduler.php';
    \Structura\Compat\Compat_Scheduler::deactivate();

    flush_rewrite_rules();
});