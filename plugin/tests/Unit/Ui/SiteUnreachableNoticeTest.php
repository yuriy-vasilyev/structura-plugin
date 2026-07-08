<?php

namespace Structura\Tests\Unit\Ui;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Tests\Unit\TestCase;
use Structura\Ui\Site_Unreachable_Notice;

/**
 * Unit tests for Site_Unreachable_Notice — the cross-wp-admin banner that
 * warns when the cloud can't reach this site's blueprint webhook.
 *
 * Scope mirrors AttentionAdminNoticeTest: we don't pin the HTML, we pin
 * the behaviour that matters when it drifts:
 *
 *   - `is_triggered()` is a thin delegate to the shared
 *     `Site_Reachability` verdict — the wp-admin banner, the in-SPA
 *     banner, and the diagnostics run must never disagree.
 *   - `handle_dismiss()` refuses without `manage_options` (a subscriber's
 *     stale tab can't mutate an admin's dismissal).
 *   - `handle_dismiss()` refuses a bad nonce with 400.
 *   - A valid dismiss persists the per-user timestamp.
 *
 * @covers \Structura\Ui\Site_Unreachable_Notice
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class SiteUnreachableNoticeTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @test */
    public function is_triggered_delegates_to_site_reachability(): void
    {
        Mockery::mock('alias:Structura\Core\Site_Reachability')
            ->shouldReceive('is_unreachable')
            ->once()
            ->andReturn(true);

        $this->assertTrue(Site_Unreachable_Notice::is_triggered());
    }

    /** @test */
    public function is_triggered_is_false_when_reachable(): void
    {
        Mockery::mock('alias:Structura\Core\Site_Reachability')
            ->shouldReceive('is_unreachable')
            ->once()
            ->andReturn(false);

        $this->assertFalse(Site_Unreachable_Notice::is_triggered());
    }

    /** @test */
    public function handle_dismiss_rejects_when_the_user_lacks_manage_options(): void
    {
        Functions\when('current_user_can')->alias(function ($cap) {
            return $cap !== 'manage_options';
        });

        $captured = null;
        Functions\when('wp_send_json_error')->alias(function ($payload, $status) use (&$captured) {
            $captured = ['payload' => $payload, 'status' => $status];
            throw new \RuntimeException('send_json_error'); // break flow like exit()
        });

        try {
            Site_Unreachable_Notice::handle_dismiss();
            $this->fail('Expected handle_dismiss to short-circuit when capability is missing.');
        } catch (\RuntimeException $e) {
            $this->assertSame('send_json_error', $e->getMessage());
        }

        $this->assertSame(403, $captured['status'] ?? null);
        $this->assertSame('forbidden', $captured['payload']['reason'] ?? null);
    }

    /** @test */
    public function handle_dismiss_rejects_a_bad_nonce_with_400(): void
    {
        Functions\when('current_user_can')->alias(function () { return true; });
        Functions\when('wp_unslash')->alias(function ($v) { return $v; });
        Functions\when('wp_verify_nonce')->alias(function () { return false; });

        $_POST = ['_wpnonce' => 'not-a-real-nonce'];

        $captured = null;
        Functions\when('wp_send_json_error')->alias(function ($payload, $status) use (&$captured) {
            $captured = ['payload' => $payload, 'status' => $status];
            throw new \RuntimeException('send_json_error');
        });

        try {
            Site_Unreachable_Notice::handle_dismiss();
            $this->fail('Expected handle_dismiss to short-circuit when the nonce is invalid.');
        } catch (\RuntimeException $e) {
            // expected
        }

        $this->assertSame(400, $captured['status'] ?? null);
        $this->assertSame('invalid_nonce', $captured['payload']['reason'] ?? null);

        $_POST = [];
    }

    /** @test */
    public function handle_dismiss_persists_the_per_user_timestamp(): void
    {
        Functions\when('current_user_can')->alias(function () { return true; });
        Functions\when('wp_unslash')->alias(function ($v) { return $v; });
        Functions\when('wp_verify_nonce')->alias(function () { return true; });
        Functions\when('get_current_user_id')->justReturn(7);

        $_POST = ['_wpnonce' => 'valid'];

        $saved = null;
        Functions\when('update_user_meta')->alias(function ($user_id, $key, $value) use (&$saved) {
            $saved = compact('user_id', 'key', 'value');
            return true;
        });
        Functions\when('wp_send_json_success')->alias(function () {
            throw new \RuntimeException('send_json_success'); // break flow like exit()
        });

        try {
            Site_Unreachable_Notice::handle_dismiss();
            $this->fail('Expected handle_dismiss to terminate via wp_send_json_success.');
        } catch (\RuntimeException $e) {
            $this->assertSame('send_json_success', $e->getMessage());
        }

        $this->assertSame(7, $saved['user_id'] ?? null);
        $this->assertSame(Site_Unreachable_Notice::META_DISMISSED_AT, $saved['key'] ?? null);
        $this->assertIsInt($saved['value'] ?? null);

        $_POST = [];
    }
}
