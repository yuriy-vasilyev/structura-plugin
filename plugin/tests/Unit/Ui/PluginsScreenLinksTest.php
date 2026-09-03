<?php

namespace Structura\Tests\Unit\Ui;

use Brain\Monkey\Functions;
use Structura\Tests\Unit\TestCase;
use Structura\Ui\Admin_Dashboard;

/**
 * Pins the Plugins-screen affordances added after the wp.org
 * first-impression program (2026-09-03): action links into the SPA and
 * meta links out to docs/support/account.
 *
 * `plugin_row_meta` is a global filter, so the negative case (another
 * plugin's row stays untouched) is the one that matters most.
 *
 * @covers \Structura\Ui\Admin_Dashboard::add_action_links
 * @covers \Structura\Ui\Admin_Dashboard::add_row_meta
 */
class PluginsScreenLinksTest extends TestCase
{
    private const BASENAME = 'structura/structura.php';

    protected function setUp(): void
    {
        parent::setUp();
        if ( ! defined('STRUCTURA_PATH')) {
            define('STRUCTURA_PATH', '/var/www/wp-content/plugins/structura/');
        }
        Functions\when('plugin_basename')->justReturn(self::BASENAME);
        Functions\when('admin_url')->alias(function ($path = '') {
            return 'https://example.test/wp-admin/' . ltrim($path, '/');
        });
    }

    /** @test */
    public function action_links_prepend_dashboard_and_settings_before_core_links(): void
    {
        $links = (new Admin_Dashboard())->add_action_links(['deactivate' => '<a href="#">Deactivate</a>']);

        $this->assertCount(3, $links);
        $this->assertStringContainsString('admin.php?page=structura"', $links[0]);
        $this->assertStringContainsString('>Dashboard<', $links[0]);
        $this->assertStringContainsString('admin.php?page=structura#/settings"', $links[1]);
        $this->assertStringContainsString('>Settings<', $links[1]);
        // Core's Deactivate must survive, and stay last.
        $this->assertSame('<a href="#">Deactivate</a>', end($links));
    }

    /** @test */
    public function row_meta_appends_docs_support_and_account_for_our_row(): void
    {
        $links = (new Admin_Dashboard())->add_row_meta(['Version 2.23.0'], self::BASENAME);

        $this->assertSame('Version 2.23.0', $links[0]);
        $joined = implode(' ', $links);
        $this->assertStringContainsString('https://docs.structurawp.com/', $joined);
        $this->assertStringContainsString('https://www.structurawp.com/support', $joined);
        $this->assertStringContainsString('https://app.structurawp.com/', $joined);
        // External links open in a new tab without leaking the opener.
        $this->assertSame(3, substr_count($joined, 'rel="noopener noreferrer"'));
    }

    /** @test */
    public function row_meta_leaves_other_plugins_rows_untouched(): void
    {
        $input = ['Version 5.7.2', '<a href="#">View details</a>'];

        $links = (new Admin_Dashboard())->add_row_meta($input, 'akismet/akismet.php');

        $this->assertSame($input, $links);
    }
}
