<?php

namespace Structura\Tests\Unit\Ui;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Tests\Unit\TestCase;
use Structura\Ui\Image_Uploads_Unwritable_Notice;

/**
 * Unit tests for Image_Uploads_Unwritable_Notice — the banner that warns
 * when wp-content/uploads isn't writable, so generated images can't save.
 *
 * Mirrors SiteUnreachableNoticeTest: we pin the behaviour that matters
 * when it drifts, not the HTML:
 *
 *   - `is_triggered()` reflects the `wp_upload_dir()` error key — the
 *     wp-admin banner, the SPA toggle-disable flag, and Site Health must
 *     never disagree about whether uploads are writable.
 *   - `handle_dismiss()` refuses without `manage_options`.
 *   - A valid dismiss persists the per-user timestamp.
 *
 * @covers \Structura\Ui\Image_Uploads_Unwritable_Notice
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class ImageUploadsUnwritableNoticeTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @test */
    public function is_triggered_when_wp_upload_dir_reports_an_error(): void
    {
        Functions\when('wp_upload_dir')->justReturn([
            'path'  => '/var/www/wp-content/uploads/2026/06',
            'error' => 'Unable to create directory wp-content/uploads/2026/06. Is its parent directory writable by the server?',
        ]);

        $this->assertTrue(Image_Uploads_Unwritable_Notice::is_triggered());
    }

    /** @test */
    public function is_not_triggered_when_uploads_are_writable(): void
    {
        Functions\when('wp_upload_dir')->justReturn([
            'path'  => '/var/www/wp-content/uploads/2026/06',
            'error' => false,
        ]);

        $this->assertFalse(Image_Uploads_Unwritable_Notice::is_triggered());
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
            Image_Uploads_Unwritable_Notice::handle_dismiss();
            $this->fail('Expected handle_dismiss to short-circuit when capability is missing.');
        } catch (\RuntimeException $e) {
            $this->assertSame('send_json_error', $e->getMessage());
        }

        $this->assertSame(403, $captured['status'] ?? null);
        $this->assertSame('forbidden', $captured['payload']['reason'] ?? null);
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
            Image_Uploads_Unwritable_Notice::handle_dismiss();
            $this->fail('Expected handle_dismiss to terminate via wp_send_json_success.');
        } catch (\RuntimeException $e) {
            $this->assertSame('send_json_success', $e->getMessage());
        }

        $this->assertSame(7, $saved['user_id'] ?? null);
        $this->assertSame(Image_Uploads_Unwritable_Notice::META_DISMISSED_AT, $saved['key'] ?? null);
        $this->assertIsInt($saved['value'] ?? null);

        $_POST = [];
    }
}
