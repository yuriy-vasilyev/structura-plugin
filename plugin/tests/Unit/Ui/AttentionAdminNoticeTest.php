<?php

namespace Structura\Tests\Unit\Ui;

use Brain\Monkey\Functions;
use Structura\Tests\Unit\TestCase;
use Structura\Ui\Attention_Admin_Notice;

/**
 * Unit tests for Attention_Admin_Notice.
 *
 * Scope is deliberately tight. The class's render output is a lot of HTML
 * with inline CSS — pinning markup byte-for-byte creates noise without
 * catching anything important. What we DO pin is the behavior users
 * actually notice when it drifts:
 *
 *   - `bust_cache()` wipes the shared site transient — both the dashboard
 *     widget and the campaigns overlay depend on this to reflect an
 *     acknowledgement within one page navigation instead of waiting 60s.
 *   - `handle_dismiss()` refuses without `manage_options` — subscribers
 *     must never be able to mutate another admin's snooze list via a
 *     stale open tab.
 *   - `handle_dismiss()` refuses with a bad nonce — the stale-tab
 *     scenario should silently 400, not accidentally persist a merge.
 *   - `handle_dismiss()` merges, dedupes, and trims the snooze list
 *     against `MAX_SNOOZED_IDS` — the user-meta row stays compact even
 *     for operators who triage dozens of runs.
 *
 * Spec: `specs/plugin-quiet-mode.md` §5.6 + §7.
 *
 * @covers \Structura\Ui\Attention_Admin_Notice
 */
class AttentionAdminNoticeTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Ensure the constants from the class are available. The class file
        // is autoloaded via composer PSR-4 so we don't need an explicit
        // require here, but we do need `wp_json_encode` which the parent
        // TestCase already stubs.

        // Stub the transient API to a per-test in-memory map. Tests set and
        // read through the same stubs, which lets us assert round-trips.
        $this->transient = null;

        Functions\when('get_site_transient')->alias(function ($key) {
            return $key === Attention_Admin_Notice::TRANSIENT_KEY ? $this->transient : false;
        });
        Functions\when('set_site_transient')->alias(function ($key, $value, $ttl = 0) {
            if ($key === Attention_Admin_Notice::TRANSIENT_KEY) {
                $this->transient = $value;
            }
            return true;
        });
        Functions\when('delete_site_transient')->alias(function ($key) {
            if ($key === Attention_Admin_Notice::TRANSIENT_KEY) {
                $this->transient = null;
            }
            return true;
        });

        // User meta — per-test in-memory map.
        $this->user_meta = [];
        Functions\when('get_user_meta')->alias(function ($user_id, $key, $single = false) {
            return $this->user_meta[$user_id][$key] ?? '';
        });
        Functions\when('update_user_meta')->alias(function ($user_id, $key, $value) {
            $this->user_meta[$user_id][$key] = $value;
            return true;
        });
    }

    /**
     * @var mixed
     */
    private $transient;

    /**
     * @var array<int, array<string, mixed>>
     */
    private $user_meta = [];

    /** @test */
    public function bust_cache_deletes_the_site_transient(): void
    {
        // Pre-seed the transient to simulate a warm cache from a previous
        // admin page load.
        $this->transient = [['runId' => 'run-a', 'status' => 'failed']];

        Attention_Admin_Notice::bust_cache();

        $this->assertNull(
            $this->transient,
            'bust_cache() must delete the shared attention transient; the ' .
            'dashboard widget and campaigns overlay depend on this to reflect ' .
            'acknowledgement within one page nav.'
        );
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
            Attention_Admin_Notice::handle_dismiss();
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
        Functions\when('wp_verify_nonce')->alias(function ($nonce, $action) {
            return false; // simulate the stale-tab scenario
        });

        $_POST = ['_wpnonce' => 'not-a-real-nonce'];

        $captured = null;
        Functions\when('wp_send_json_error')->alias(function ($payload, $status) use (&$captured) {
            $captured = ['payload' => $payload, 'status' => $status];
            throw new \RuntimeException('send_json_error');
        });

        try {
            Attention_Admin_Notice::handle_dismiss();
            $this->fail('Expected handle_dismiss to short-circuit when the nonce is invalid.');
        } catch (\RuntimeException $e) {
            // expected
        }

        $this->assertSame(400, $captured['status'] ?? null);
        $this->assertSame('invalid_nonce', $captured['payload']['reason'] ?? null);

        $_POST = [];
    }

    /** @test */
    public function handle_dismiss_merges_incoming_ids_into_the_existing_user_snooze_list_and_busts_the_cache(): void
    {
        Functions\when('current_user_can')->alias(function () { return true; });
        Functions\when('wp_unslash')->alias(function ($v) { return $v; });
        Functions\when('wp_verify_nonce')->alias(function () { return true; });
        Functions\when('get_current_user_id')->alias(function () { return 7; });

        // Pre-seed both stores so we can assert the after-state properly.
        $this->transient = [['runId' => 'stale', 'status' => 'failed']];
        $this->user_meta[7] = [
            Attention_Admin_Notice::USER_SNOOZE_META => json_encode(['run-old-1', 'run-old-2']),
        ];

        $_POST = [
            '_wpnonce' => 'valid',
            'run_ids'  => ['run-old-2', 'run-new-1', '', '  '],
        ];

        $captured = null;
        Functions\when('wp_send_json_success')->alias(function ($payload) use (&$captured) {
            $captured = $payload;
            throw new \RuntimeException('send_json_success');
        });

        try {
            Attention_Admin_Notice::handle_dismiss();
            $this->fail('Expected handle_dismiss to send a JSON success response.');
        } catch (\RuntimeException $e) {
            // expected
        }

        $raw_after = $this->user_meta[7][Attention_Admin_Notice::USER_SNOOZE_META] ?? '';
        $this->assertIsString($raw_after);
        $decoded = json_decode($raw_after, true);

        // Order matters for the eviction scheme ("oldest at head"): the
        // pre-existing ids come first, then the new, deduplicated id.
        // `run-old-2` was already there, so it must NOT be duplicated.
        // Empty/whitespace ids are dropped by `sanitize_text_field`.
        $this->assertSame(['run-old-1', 'run-old-2', 'run-new-1'], $decoded);

        // `run-new-1` was the only *net-new* id — the success payload
        // reflects the incoming (pre-dedupe) count.
        $this->assertSame(2, $captured['dismissed_count'] ?? null);
        $this->assertSame(3, $captured['snoozed_total'] ?? null);

        // And the shared transient was busted so the next admin pageview
        // refetches rather than seeing the now-stale cache.
        $this->assertNull(
            $this->transient,
            'handle_dismiss must bust the shared transient so the widget + ' .
            'campaigns overlay reflect the dismissal on the next render.'
        );

        $_POST = [];
    }

    /** @test */
    public function handle_dismiss_caps_the_snooze_list_at_max_snoozed_ids(): void
    {
        Functions\when('current_user_can')->alias(function () { return true; });
        Functions\when('wp_unslash')->alias(function ($v) { return $v; });
        Functions\when('wp_verify_nonce')->alias(function () { return true; });
        Functions\when('get_current_user_id')->alias(function () { return 42; });

        // Fill the existing list to just under the cap with "old-0" … "old-N".
        $max = Attention_Admin_Notice::MAX_SNOOZED_IDS;
        $existing = [];
        for ($i = 0; $i < $max - 2; $i++) {
            $existing[] = 'old-' . $i;
        }
        $this->user_meta[42] = [
            Attention_Admin_Notice::USER_SNOOZE_META => json_encode($existing),
        ];

        // Dismiss 5 new ids — expect the merged list to evict from the HEAD
        // so the tail (most recent) wins.
        $incoming = ['new-0', 'new-1', 'new-2', 'new-3', 'new-4'];
        $_POST = ['_wpnonce' => 'valid', 'run_ids' => $incoming];

        Functions\when('wp_send_json_success')->alias(function () {
            throw new \RuntimeException('send_json_success');
        });

        try {
            Attention_Admin_Notice::handle_dismiss();
            $this->fail('Expected handle_dismiss to send a JSON success response.');
        } catch (\RuntimeException $e) {
            // expected
        }

        $decoded = json_decode(
            $this->user_meta[42][Attention_Admin_Notice::USER_SNOOZE_META],
            true
        );

        $this->assertCount(
            $max,
            $decoded,
            'Merged snooze list must be capped at MAX_SNOOZED_IDS so the ' .
            'user-meta row stays compact.'
        );
        // Last five entries are the newly-dismissed ids (tail-wins).
        $this->assertSame(
            $incoming,
            array_slice($decoded, -5),
            'Newest dismissed ids must live at the tail so eviction sheds ' .
            'the oldest first.'
        );
        // The first three of the old list were shed (we added 5 new while
        // the list was `max - 2` long → net overflow of 3).
        $this->assertNotContains('old-0', $decoded);
        $this->assertNotContains('old-1', $decoded);
        $this->assertNotContains('old-2', $decoded);
        // But the rest of the old list survived.
        $this->assertContains('old-3', $decoded);

        $_POST = [];
    }
}
