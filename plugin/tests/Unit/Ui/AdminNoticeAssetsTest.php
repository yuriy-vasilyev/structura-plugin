<?php

namespace Structura\Tests\Unit\Ui;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Tests\Unit\TestCase;
use Structura\Ui\Admin_Notice_Assets;
use Structura\Ui\Dashboard_Widget;
use Structura\Ui\Headless_Onboarding_Notice;
use Structura\Ui\Site_Unreachable_Notice;

/**
 * wp.org review 2026-08-27 — "Use wp_enqueue commands". Every Structura
 * admin notice used to print its own <script>/<style>; they now emit
 * markup + data attributes and enqueue `assets-static/admin-notices.js`
 * through {@see Admin_Notice_Assets}. These tests pin that contract so
 * the inline blocks can't creep back.
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class AdminNoticeAssetsTest extends TestCase
{
    /** @var array<int, array<int, mixed>> */
    private array $enqueuedScripts = [];

    /** @var array<int, array<int, mixed>> */
    private array $enqueuedStyles = [];

    protected function setUp(): void
    {
        parent::setUp();

        if ( ! defined('STRUCTURA_URL')) {
            define('STRUCTURA_URL', 'https://example.test/wp-content/plugins/structura/');
        }
        if ( ! defined('STRUCTURA_VERSION')) {
            define('STRUCTURA_VERSION', '0.0.0-test');
        }

        $this->enqueuedScripts = [];
        $this->enqueuedStyles  = [];
        Functions\when('wp_enqueue_script')->alias(function (...$args) {
            $this->enqueuedScripts[] = $args;
        });
        Functions\when('wp_enqueue_style')->alias(function (...$args) {
            $this->enqueuedStyles[] = $args;
        });

        Functions\when('current_user_can')->justReturn(true);
        Functions\when('get_current_user_id')->justReturn(1);
        Functions\when('get_user_meta')->justReturn('');
        Functions\when('admin_url')->alias(static function ($path = '') {
            return 'https://example.test/wp-admin/' . $path;
        });
        Functions\when('wp_create_nonce')->justReturn('nonce-123');
        Functions\when('wp_parse_url')->alias('parse_url');
        Functions\when('home_url')->justReturn('https://cms.example.test');
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function render(callable $fn): string
    {
        ob_start();
        $fn();
        return (string) ob_get_clean();
    }

    private function assertNoInlineAssets(string $html): void
    {
        $this->assertStringNotContainsString(
            '<script',
            $html,
            'Notices must not print inline <script>; behaviour lives in assets-static/admin-notices.js.'
        );
        $this->assertStringNotContainsString('<style', $html);
    }

    /** @test */
    public function site_unreachable_notice_ships_data_attributes_and_enqueues_the_shared_handler(): void
    {
        Mockery::mock('alias:Structura\Core\Site_Reachability')
            ->shouldReceive('is_unreachable')->andReturn(true);

        $html = $this->render([Site_Unreachable_Notice::class, 'maybe_render']);

        $this->assertNotSame('', $html, 'Precondition: the notice renders in this scenario.');
        $this->assertNoInlineAssets($html);
        $this->assertStringContainsString(
            'data-structura-dismiss-action="' . Site_Unreachable_Notice::AJAX_ACTION . '"',
            $html
        );
        $this->assertStringContainsString('data-structura-dismiss-nonce="nonce-123"', $html);
        $this->assertStringContainsString(
            'data-structura-dismiss-url="https://example.test/wp-admin/admin-ajax.php"',
            $html
        );
        $this->assertStringContainsString('data-structura-dismiss-trigger', $html);

        $this->assertSame(Admin_Notice_Assets::SCRIPT_HANDLE, $this->enqueuedScripts[0][0] ?? null);
        $this->assertStringEndsWith('assets-static/admin-notices.js', (string) ($this->enqueuedScripts[0][1] ?? ''));
        $this->assertTrue($this->enqueuedScripts[0][4] ?? false, 'Footer script — must not block first paint.');
    }

    /** @test */
    public function headless_onboarding_notice_relies_on_wordpress_dismiss_button_plus_data_attributes(): void
    {
        $html = $this->render([Headless_Onboarding_Notice::class, 'maybe_render']);

        $this->assertNotSame('', $html, 'Precondition: cms.* host renders the notice.');
        $this->assertNoInlineAssets($html);
        $this->assertStringContainsString('is-dismissible', $html);
        $this->assertStringContainsString(
            'data-structura-dismiss-action="' . Headless_Onboarding_Notice::AJAX_ACTION . '"',
            $html
        );
        $this->assertCount(1, $this->enqueuedScripts);
    }

    /** @test */
    public function dashboard_widget_enqueues_its_stylesheet_only_on_the_dashboard_screen(): void
    {
        Dashboard_Widget::maybe_enqueue_style('edit.php');
        $this->assertSame([], $this->enqueuedStyles, 'Other admin screens must not load the widget CSS.');

        Dashboard_Widget::maybe_enqueue_style('index.php');
        $this->assertSame(Admin_Notice_Assets::WIDGET_STYLE_HANDLE, $this->enqueuedStyles[0][0] ?? null);
        $this->assertStringEndsWith('assets-static/dashboard-widget.css', (string) ($this->enqueuedStyles[0][1] ?? ''));
    }

    /** @test */
    public function no_ui_class_opens_a_bare_script_or_style_tag(): void
    {
        // Tripwire for the whole includes/Ui directory: a bare `<script>` /
        // `<style>` line is exactly what the wp.org reviewer's scanner flags.
        $offenders = [];
        foreach (glob(dirname(__DIR__, 3) . '/includes/Ui/*.php') as $file) {
            foreach (file($file) as $n => $line) {
                if (preg_match('#^\s*<(script|style)>\s*$#', $line)) {
                    $offenders[] = basename($file) . ':' . ($n + 1);
                }
            }
        }
        $this->assertSame([], $offenders, 'Inline <script>/<style> found — enqueue it via Admin_Notice_Assets instead.');
    }
}
