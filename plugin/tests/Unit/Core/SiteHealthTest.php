<?php

namespace Structura\Tests\Unit\Core;

use Brain\Monkey\Functions;
use Structura\Core\Site_Health;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for the Structura Site Health probes.
 *
 * The probes read from `$wpdb`, WP constants, and `wp_upload_dir()` and
 * return fixed-shape Site Health result arrays. Tests pin:
 *
 *   - The status thresholds — "good" vs "critical" on max_allowed_packet
 *     and uploads writability.
 *   - The three status variants each test method can return, to catch
 *     regressions in the result-shape helper.
 *
 * @covers \Structura\Core\Site_Health
 */
class SiteHealthTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Functions\stubs([
            'size_format' => function ($bytes) { return $bytes . ' bytes'; },
        ]);

        // `DISABLE_WP_CRON` — default to "not set", individual tests
        // redefine when they need to flip the gate.
        if ( ! defined('DISABLE_WP_CRON')) {
            define('DISABLE_WP_CRON', false);
        }
    }

    protected function tearDown(): void
    {
        // Each test may set $wpdb to a fake; clear so other tests in the
        // file get a clean slate.
        unset($GLOBALS['wpdb']);
        parent::tearDown();
    }

    // ──────────────────────────────────────────────────────────────────────
    //  max_allowed_packet probe
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function packet_size_critical_when_below_4mb(): void
    {
        $GLOBALS['wpdb'] = new class {
            // Shared-host default: 1 MB. This is exactly the config that
            // caused St. Wolfgang Apotheke's image tasks to silently drop.
            public function get_var($_query, $_col = 0) { return '1048576'; }
        };

        $result = Site_Health::test_actionscheduler_packet_size();

        $this->assertSame('critical', $result['status']);
        $this->assertStringContainsString('max_allowed_packet', $result['description']);
        $this->assertArrayHasKey('actions', $result, 'Critical status must surface a docs link so operators know where to go next.');
    }

    /** @test */
    public function packet_size_good_when_at_or_above_4mb(): void
    {
        $GLOBALS['wpdb'] = new class {
            public function get_var($_query, $_col = 0) { return (string) (4 * 1024 * 1024); }
        };

        $result = Site_Health::test_actionscheduler_packet_size();

        $this->assertSame('good', $result['status']);
    }

    /** @test */
    public function packet_size_recommended_when_query_unavailable(): void
    {
        // Some managed hosts block `SHOW VARIABLES` — we can't make a
        // critical determination, so we surface a softer "recommended"
        // result so the user still sees that something couldn't be
        // confirmed.
        $GLOBALS['wpdb'] = new class {
            public function get_var($_query, $_col = 0) { return null; }
        };

        $result = Site_Health::test_actionscheduler_packet_size();

        $this->assertSame('recommended', $result['status']);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  WP-Cron probe
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function wp_cron_good_when_constant_not_defined_or_false(): void
    {
        // DISABLE_WP_CRON defaults to false in setUp(), matching a
        // stock WP install.
        $result = Site_Health::test_wp_cron_enabled();

        $this->assertSame('good', $result['status']);
    }

    // DISABLE_WP_CRON = true is not straightforwardly testable in a single
    // Brain-Monkey process because constants are immutable once defined;
    // it's covered by the integration suite (and by manual inspection of
    // the probe's branch — a trivial `if (defined && truthy)` check).

    // ──────────────────────────────────────────────────────────────────────
    //  Uploads-writable probe
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function uploads_critical_when_wp_upload_dir_reports_error(): void
    {
        Functions\when('wp_upload_dir')->justReturn([
            'basedir' => '/var/www/wp-content/uploads',
            'error'   => 'Unable to create directory /var/www/wp-content/uploads/2026/04. Is its parent directory writable by the server?',
        ]);

        $result = Site_Health::test_uploads_writable();

        $this->assertSame('critical', $result['status']);
        $this->assertStringContainsString('Unable to create directory', $result['description']);
    }

    /** @test */
    public function uploads_good_when_wp_upload_dir_reports_no_error(): void
    {
        Functions\when('wp_upload_dir')->justReturn([
            'basedir' => '/var/www/wp-content/uploads',
            'error'   => false,
        ]);

        $result = Site_Health::test_uploads_writable();

        $this->assertSame('good', $result['status']);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  register_tests wiring
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function register_tests_appends_three_direct_probes(): void
    {
        $tests = Site_Health::register_tests(['direct' => [], 'async' => []]);

        $this->assertArrayHasKey('structura_actionscheduler_packet_size', $tests['direct']);
        $this->assertArrayHasKey('structura_wp_cron_enabled', $tests['direct']);
        $this->assertArrayHasKey('structura_uploads_writable', $tests['direct']);

        // Each probe must be a valid callable — pinning so a typo in a
        // class/method rename doesn't silently break Site Health.
        foreach ($tests['direct'] as $probe) {
            $this->assertIsCallable($probe['test']);
        }
    }
}
