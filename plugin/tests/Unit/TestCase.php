<?php
/**
 * Base TestCase for Unit Tests (Brain Monkey)
 *
 * Provides WordPress function stubs so that plugin classes can be
 * instantiated and tested without a real WordPress installation.
 *
 * Every WP function used in the tested code must be stubbed here.
 * If a test needs a specific return value, override it in the test
 * method using Brain\Monkey\Functions\expect().
 */

namespace Structura\Tests\Unit;

use Brain\Monkey;
use Brain\Monkey\Container;
use Brain\Monkey\Expectation\Expectation;
use Brain\Monkey\Expectation\FunctionStubFactory;
use Brain\Monkey\Functions;
use Brain\Monkey\Name\FunctionName;
use Mockery\Adapter\Phpunit\MockeryPHPUnitIntegration;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

abstract class TestCase extends PHPUnitTestCase
{
    use MockeryPHPUnitIntegration;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->stub_wp_functions();
        $this->stub_wpdb_global();
    }

    /**
     * Install a no-op `$wpdb` global so production code that logs (via
     * `Log_Service::add()` and friends) doesn't fatal when reached
     * through an indirectly-tested code path.
     *
     * The mock returns success for every write and an empty result for
     * every read. Tests that need to assert against specific SQL
     * activity should override the global with their own Mockery mock
     * inside the test body. Spec: every WP function our tested code
     * touches needs a stub; `$wpdb` is no different even though it's a
     * global object rather than a function.
     */
    private function stub_wpdb_global(): void
    {
        // Already mocked by a prior test that didn't clean up, or by a
        // child setUp() that wants its own fixture. Either way, leave it
        // alone so we don't blow over an in-progress arrangement.
        global $wpdb;
        if (is_object($wpdb)) {
            return;
        }

        $wpdb = \Mockery::mock('wpdb');
        $wpdb->prefix = 'wp_';
        $wpdb->shouldReceive('insert')->withAnyArgs()->andReturn(1)->byDefault();
        $wpdb->shouldReceive('update')->withAnyArgs()->andReturn(1)->byDefault();
        $wpdb->shouldReceive('delete')->withAnyArgs()->andReturn(1)->byDefault();
        $wpdb->shouldReceive('query')->withAnyArgs()->andReturn(0)->byDefault();
        $wpdb->shouldReceive('get_var')->withAnyArgs()->andReturn(0)->byDefault();
        $wpdb->shouldReceive('get_row')->withAnyArgs()->andReturn(null)->byDefault();
        $wpdb->shouldReceive('get_results')->withAnyArgs()->andReturn([])->byDefault();
        $wpdb->shouldReceive('get_col')->withAnyArgs()->andReturn([])->byDefault();
        $wpdb->shouldReceive('prepare')->withAnyArgs()->andReturnUsing(
            static function (string $sql, ...$args) {
                // Cheap %s/%d/%f interpolation good enough for assertions
                // that don't depend on exact escaping.
                $i = 0;
                return preg_replace_callback(
                    '/%[sdf]/',
                    static function () use (&$i, $args) {
                        return isset($args[$i]) ? (string) $args[$i++] : '';
                    },
                    $sql,
                );
            },
        )->byDefault();
        $wpdb->shouldReceive('esc_like')->withAnyArgs()->andReturnArg(0)->byDefault();
        $wpdb->shouldReceive('get_charset_collate')
            ->withAnyArgs()
            ->andReturn('DEFAULT CHARSET=utf8mb4')
            ->byDefault();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    /**
     * Drop-in replacement for {@see \Brain\Monkey\Functions\expect()} that
     * also works when {@see self::stub_wp_functions()} has already
     * registered a default stub for the same function name.
     *
     * Brain Monkey 2.7's `expect()` short-circuits when the function-stub
     * factory already has an entry (see `vendor/brain/monkey/inc/api.php`
     * around the `if ( ! $factory->has($name))` guard) — the expectation
     * is registered on the Container but the runtime call site is never
     * re-wired, so the test's production code keeps hitting the old stub
     * and Mockery later complains "called 0 times". This helper clears
     * the existing factory entry first (via reflection on the private
     * `$storage`), so the re-wire path runs as intended and `expect()`
     * behaves the way 99% of tests assume.
     *
     * Call this from every test that needs to expect-on a function that
     * `stub_wp_functions()` also stubs (notably `get_option`,
     * `update_option`, `add_action`, `add_filter`, `apply_filters`, and
     * the post-meta family). For functions NOT in the default stubs,
     * `Functions\expect(...)` and `$this->expectFn(...)` are equivalent.
     */
    protected function expectFn(string $function_name): Expectation
    {
        $factory = Container::instance()->functionStubFactory();
        $name = new FunctionName($function_name);

        if ($factory->has($name)) {
            // Brain Monkey doesn't expose a per-function reset, so dig
            // into the private `$storage` array. Removing the entry is
            // safe — the factory will lazily re-create it on the next
            // `expect()` / `when()` call.
            $ref = new \ReflectionClass(FunctionStubFactory::class);
            $storage = $ref->getProperty('storage');
            $storage->setAccessible(true);
            $current = $storage->getValue($factory);
            unset($current[$name->fullyQualifiedName()]);
            $storage->setValue($factory, $current);
        }

        return Functions\expect($function_name);
    }

    /**
     * Default stubs for all WordPress functions used across the plugin.
     *
     * These are "passthrough" stubs — they mimic the real WP behaviour
     * closely enough for unit-level assertions. Override any of them
     * in individual tests when you need controlled return values.
     */
    private function stub_wp_functions(): void
    {
        // ── Escaping / Sanitization (passthrough) ────────────────────────
        Functions\stubs([
            'esc_html'               => function ($text) { return htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8'); },
            'esc_attr'               => function ($text) { return htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8'); },
            'esc_url'                => function ($url) { return filter_var($url, FILTER_SANITIZE_URL); },
            'esc_url_raw'            => function ($url) { return filter_var((string) $url, FILTER_SANITIZE_URL); },
            'wp_kses_post'           => function ($text) { return $text; }, // Allow all tags in unit context
            'wp_strip_all_tags'      => function ($text) { return strip_tags($text); },
            'sanitize_text_field'    => function ($text) { return trim(strip_tags((string) $text)); },
            'sanitize_textarea_field'=> function ($text) { return trim(strip_tags((string) $text)); },
            'sanitize_key'           => function ($key) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string) $key)); },
            'sanitize_title'         => function ($title) { return sanitize_title_with_dashes($title); },
        ]);

        // ── Encoding ─────────────────────────────────────────────────────
        Functions\stubs([
            'wp_json_encode' => function ($data, $flags = 0) { return json_encode($data, $flags); },
        ]);

        // ── Hooks (no-op / passthrough) ──────────────────────────────────
        Functions\stubs([
            'add_action'    => null,
            'add_filter'    => null,
            'apply_filters' => function () {
                $args = func_get_args();
                // Return the value (second argument), ignoring the filter name
                return $args[1] ?? null;
            },
            'remove_all_actions' => null,
            'remove_all_filters' => null,
            'current_action'     => '__test__',
        ]);

        // ── Options ──────────────────────────────────────────────────────
        Functions\stubs([
            'get_option'    => function ($key, $default = false) { return $default; },
            'update_option' => true,
        ]);

        // ── Post Meta ────────────────────────────────────────────────────
        Functions\stubs([
            'get_post_meta'    => '',
            'update_post_meta' => true,
            'add_post_meta'    => true,
            'delete_post_meta' => true,
        ]);

        // ── i18n ─────────────────────────────────────────────────────────
        Functions\stubs([
            '__'       => function ($text, $domain = 'default') { return $text; },
            'esc_html__' => function ($text, $domain = 'default') { return htmlspecialchars($text, ENT_QUOTES, 'UTF-8'); },
        ]);

        // ── Misc ─────────────────────────────────────────────────────────
        Functions\stubs([
            'current_time' => function ($type = 'mysql') { return date('Y-m-d H:i:s'); },
            'is_wp_error'  => function ($thing) { return $thing instanceof \WP_Error; },
            // `wp_parse_url` / `wp_unslash` were the whole "26 baseline
            // errors" story (fixed 2026-06-07): every suite whose
            // production code reached them without a per-test
            // `Functions\when()` errored — locally AND in CI, where the
            // Tests workflow had been red for weeks. Faithful
            // passthroughs: WP's wp_parse_url is a parse_url() compat
            // wrapper, wp_unslash is stripslashes_deep(). Tests that
            // need a controlled value (e.g. LicenseManagerDeactivateTest
            // pinning the domain) keep overriding via `Functions\when()`
            // as before — `when()` re-wires an existing stub, unlike the
            // `expect()` short-circuit `expectFn()` exists for.
            'wp_parse_url' => function ($url, $component = -1) {
                return parse_url((string) $url, $component);
            },
            'wp_unslash' => function ($value) {
                $unslash = static function ($v) use (&$unslash) {
                    if (is_array($v)) {
                        return array_map($unslash, $v);
                    }
                    return is_string($v) ? stripslashes($v) : $v;
                };
                return $unslash($value);
            },
            // Log_Service::prune() uses wp_rand() to fire only 5% of
            // writes; in tests we want the deterministic "never prune"
            // branch (it just no-ops down to a SQL count) and any
            // numeric value > 5 satisfies that. wp_remote_* are touched
            // by Cloud_Client via Campaign_Cloud_Reader and must be
            // stubbed so the transport-error tests don't fatal before
            // reaching the assertion.
            'wp_rand'                    => 100,
            'wp_remote_post'             => [],
            'wp_remote_get'              => [],
            'wp_remote_retrieve_body'    => '',
            'wp_remote_retrieve_response_code' => 200,
            'wp_remote_retrieve_headers' => [],
            'home_url'                   => 'https://example.test',
            // Transient stubs — Dispatch_Failure_Tracker and other
            // memoization helpers call these on the read path. Default
            // to "miss" so tests that don't explicitly arrange a hit
            // exercise the cold path.
            'get_transient'              => false,
            'set_transient'              => true,
            'delete_transient'           => true,
        ]);

        // ── Define WP_Error if not available ─────────────────────────────
        if ( ! class_exists('WP_Error')) {
            $this->define_wp_error_stub();
        }

        // ── Constants ────────────────────────────────────────────────────
        if ( ! defined('ABSPATH')) {
            define('ABSPATH', '/tmp/wordpress/');
        }
        if ( ! defined('STRUCTURA_AS_GROUP')) {
            define('STRUCTURA_AS_GROUP', 'structura');
        }
        // Time constants — defined by WP in real envs but absent under
        // unit-only bootstrap. Plugin classes that declare TTLs via
        // `5 * MINUTE_IN_SECONDS` etc. would otherwise fatal at class
        // load time. Mirror WP's actual values so any test using a
        // computed TTL gets the same number it would in production.
        if ( ! defined('MINUTE_IN_SECONDS')) {
            define('MINUTE_IN_SECONDS', 60);
        }
        if ( ! defined('HOUR_IN_SECONDS')) {
            define('HOUR_IN_SECONDS', 60 * 60);
        }
        if ( ! defined('DAY_IN_SECONDS')) {
            define('DAY_IN_SECONDS', 24 * 60 * 60);
        }
    }

    /**
     * Minimal WP_Error stub for unit tests.
     */
    private function define_wp_error_stub(): void
    {
        // Only define once — class definition is global
        eval('
            class WP_Error {
                protected $code;
                protected $message;
                protected $data;

                public function __construct($code = "", $message = "", $data = "") {
                    $this->code    = $code;
                    $this->message = $message;
                    $this->data    = $data;
                }

                public function get_error_code()    { return $this->code; }
                public function get_error_message()  { return $this->message; }
                public function get_error_data()     { return $this->data; }
                public function get_error_messages() { return [$this->message]; }
            }
        ');
    }
}
