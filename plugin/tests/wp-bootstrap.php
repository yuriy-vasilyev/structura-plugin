<?php
/**
 * PHPUnit Bootstrap — Integration Tests (wp-phpunit)
 *
 * Boots a real WordPress environment with a test database.
 * Requires WP_TESTS_DIR to point to the WordPress PHPUnit test library.
 *
 * Setup:
 *   1. Install the WP test suite:
 *      bin/install-wp-tests.sh <db_name> <db_user> <db_pass> [db_host] [wp_version]
 *
 *   2. Set the WP_TESTS_DIR environment variable:
 *      export WP_TESTS_DIR=/tmp/wordpress-tests-lib
 *
 *   3. Run integration tests:
 *      composer test:integration
 *
 * In CI, this is handled automatically by the GitHub Actions workflow.
 */

$plugin_dir = dirname(__DIR__) . '/';

// ── 1. Load Composer autoloader FIRST ────────────────────────────────────
// This must happen before the WordPress bootstrap so that Structura\
// classes are resolvable via PSR-4 from the very start.
require_once $plugin_dir . 'vendor/autoload.php';

// ── 2. Define plugin constants before anything tries to use them ─────────
if ( ! defined('STRUCTURA_VERSION'))  define('STRUCTURA_VERSION', 'test');
if ( ! defined('STRUCTURA_PATH'))     define('STRUCTURA_PATH', $plugin_dir);
if ( ! defined('STRUCTURA_URL'))      define('STRUCTURA_URL', 'https://example.com/wp-content/plugins/structura/');
if ( ! defined('STRUCTURA_AS_GROUP')) define('STRUCTURA_AS_GROUP', 'structura');
if ( ! defined('STRUCTURA_DEV_MODE')) define('STRUCTURA_DEV_MODE', false);
if ( ! defined('STRUCTURA_API_BASE')) define('STRUCTURA_API_BASE', 'https://localhost');

// ── 3. Locate the WordPress test library ─────────────────────────────────
$wp_tests_dir = getenv('WP_TESTS_DIR');

if ( ! $wp_tests_dir) {
    $wp_tests_dir = rtrim(sys_get_temp_dir(), '/\\') . '/wordpress-tests-lib';
}

if ( ! file_exists($wp_tests_dir . '/includes/functions.php')) {
    echo "Could not find WordPress test library at: {$wp_tests_dir}\n";
    echo "Run bin/install-wp-tests.sh first, or set WP_TESTS_DIR.\n";
    exit(1);
}

// Give access to tests_add_filter() function
require_once $wp_tests_dir . '/includes/functions.php';

// ── 4. Stub Action Scheduler functions (global namespace, once) ──────────
// These are provided by woocommerce/action-scheduler at runtime but the
// package isn't loaded during tests. Declared here so they exist before
// any plugin code calls them.
if ( ! function_exists('as_schedule_cron_action')) {
    function as_schedule_cron_action() { return 1; }
}
if ( ! function_exists('as_unschedule_all_actions')) {
    function as_unschedule_all_actions() {}
}
if ( ! function_exists('as_next_scheduled_action')) {
    function as_next_scheduled_action() { return false; }
}
if ( ! function_exists('as_get_scheduled_actions')) {
    function as_get_scheduled_actions() { return []; }
}
if ( ! function_exists('as_enqueue_async_action')) {
    function as_enqueue_async_action() { return 1; }
}
if ( ! function_exists('as_schedule_single_action')) {
    function as_schedule_single_action() { return 1; }
}

// ── 5. Register the custom post type once WordPress loads ────────────────
tests_add_filter('muplugins_loaded', function () {
    register_post_type('structura_campaign', [
        'public' => false,
    ]);
});

// ── 6. Start the WP testing environment ──────────────────────────────────
require $wp_tests_dir . '/includes/bootstrap.php';
