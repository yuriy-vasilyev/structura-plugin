<?php
/**
 * PHPUnit Bootstrap — Unit Tests (Brain Monkey)
 *
 * This bootstrap sets up Brain Monkey for mocking WordPress functions
 * without requiring a full WordPress installation. Used by the "Unit"
 * test suite for pure-logic classes like Block_Serializer, Campaign_Validator, etc.
 *
 * For integration tests that need a real database, see wp-bootstrap.php.
 */

// Suppress E_DEPRECATED so warnings raised under newer PHP versions
// (e.g. `ReflectionProperty::setAccessible()` is a no-op since 8.1 and
// emits a deprecation under 8.5+) don't surface as test errors when
// PHPUnit runs in separate-process mode — the subprocess captures
// stderr and bubbles deprecations as failures. CI runs PHP 7.4 / 8.1 /
// 8.3 where these don't fire, so this is purely a local-dev cushion.
error_reporting(E_ALL & ~E_DEPRECATED);

// Composer autoloader (loads both plugin classes and test dependencies)
require_once dirname(__DIR__) . '/vendor/autoload.php';

// Lightweight stub for `\ActionScheduler_Store` — production code reads
// the `STATUS_PENDING` constant directly via the class name. Real AS
// isn't loaded under unit tests, so we mirror just the constants the
// plugin depends on. Same shape as upstream AS.
if ( ! class_exists('ActionScheduler_Store')) {
    class ActionScheduler_Store {
        const STATUS_COMPLETE = 'complete';
        const STATUS_PENDING  = 'pending';
        const STATUS_RUNNING  = 'in-progress';
        const STATUS_FAILED   = 'failed';
        const STATUS_CANCELED = 'canceled';
    }
}

// Minimal WP_Post stub for tests that exercise code type-hinting or
// `instanceof \WP_Post` (e.g. transition_post_status subscribers). Real
// WP provides the full class; unit tests only need an `->ID` property.
if ( ! class_exists('WP_Post')) {
    class WP_Post {
        public $ID = 0;
        public function __construct(int $id = 0) {
            $this->ID = $id;
        }
    }
}

// Minimal WP_REST_Request stub for tests that pass anonymous classes
// into REST handlers typed against `WP_REST_Request`. Real WP would
// provide this; under unit-only bootstrap it must be declared here.
if ( ! class_exists('WP_REST_Request')) {
    class WP_REST_Request {
        protected $params = [];
        public function get_param($key) {
            return $this->params[$key] ?? null;
        }
        public function set_param($key, $value) {
            $this->params[$key] = $value;
        }
        public function get_json_params() {
            return $this->params;
        }
        public function get_body_params() {
            return $this->params;
        }
    }
}
