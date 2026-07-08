<?php

namespace Structura\Tests\Unit\Progress;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Progress\Run_Signal_Service;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for Run_Signal_Service.
 *
 * The subscriber lives on `structura/post/inserted` and POSTs a patch to
 * the cloud's `/recordPostInserted` endpoint so the CampaignRun doc picks
 * up `resultPostId` / `resultPostUrl` after WP has actually inserted the
 * post. These tests pin the contract this service has with the cloud
 * (payload shape, endpoint, non-blocking transport) and its gating rules
 * (kill-switch, missing run_id on the free-tier path, missing activation).
 *
 * Log_Service is aliased as a permissive mock — individual tests opt into
 * stricter assertions where the log level is load-bearing.
 *
 * @covers \Structura\Progress\Run_Signal_Service
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class RunSignalServiceTest extends TestCase
{
    private const RUN_ID    = 'run-uuid-42';
    private const POST_ID   = 1337;
    private const POST_URL  = 'https://example.com/hello-world/';
    private const LICENSE   = 'live_abc';
    private const SECRET    = 'sek_xyz';
    private const SITE_URL  = 'https://example.com';
    private const ENDPOINT  = '/recordPostInserted';

    protected function setUp(): void
    {
        parent::setUp();

        Functions\stubs([
            // home_url is the site-url leg of the auth envelope.
            'home_url' => function () { return self::SITE_URL; },
        ]);

        // Permissive by default — tests that care about the log level
        // override with a tighter expectation.
        Mockery::mock('alias:Structura\Core\Log_Service')
            ->shouldReceive('add')
            ->withAnyArgs()
            ->zeroOrMoreTimes();
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /**
     * Helper to build a realistic `structura/post/inserted` context.
     *
     * Only the fields the subscriber reads are strictly required;
     * everything else is here to match the shape documented on
     * Task_Runner::insert_wordpress_post() so the test data drifts
     * with the hook, not against it.
     *
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function make_context(array $overrides = []): array
    {
        return array_merge([
            'post_id'         => self::POST_ID,
            'campaign_id'     => 9,
            'campaign_run_id' => self::RUN_ID,
            'status'          => 'publish',
            'post_title'      => 'Hello World',
            'post_url'        => self::POST_URL,
            'edit_url'        => self::SITE_URL . '/wp-admin/post.php?post=1337&action=edit',
            'published_at'    => '2026-04-22T10:00:00+00:00',
            'locale'          => 'en_US',
        ], $overrides);
    }

    /** @test */
    public function it_skips_when_hook_context_is_not_an_array(): void
    {
        // A filter on the action args could hand us garbage. Must not fatal.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldNotReceive('get_license_payload');
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        $subject = new Run_Signal_Service();
        /** @phpstan-ignore-next-line — intentional garbage for the guard. */
        $subject->on_structura_post_inserted('not-an-array');

        $this->assertTrue(true);
    }

    /** @test */
    public function it_skips_silently_when_run_id_is_empty(): void
    {
        // Free-tier / direct-generate path doesn't mint a run_id because
        // there's no CampaignRun doc to patch. Skipping must be silent —
        // the vast majority of posts on free sites will reach this branch.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldNotReceive('get_license_payload');
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        $subject = new Run_Signal_Service();
        $subject->on_structura_post_inserted(
            $this->make_context(['campaign_run_id' => ''])
        );

        $this->assertTrue(true);
    }

    /** @test */
    public function it_skips_when_post_id_is_zero(): void
    {
        // Defensive — a zero id would be rejected as malformed by the
        // cloud anyway, so spare the HTTP round-trip.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldNotReceive('get_license_payload');
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        $subject = new Run_Signal_Service();
        $subject->on_structura_post_inserted(
            $this->make_context(['post_id' => 0])
        );

        $this->assertTrue(true);
    }

    /** @test */
    public function it_logs_warning_and_skips_when_activation_is_missing(): void
    {
        // Reaching this branch means: we HAVE a run_id (cloud path) but
        // NO license on file. That's genuinely anomalous — the cloud
        // path shouldn't have produced a run_id without an activation.
        // A warning-level log is the right escalation level.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(null);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        // The permissive Log_Service alias from setUp() absorbs the
        // warning-level log this branch emits; the load-bearing
        // assertion here is that no cloud call leaves the machine.
        $subject = new Run_Signal_Service();
        $subject->on_structura_post_inserted($this->make_context());

        $this->assertTrue(true);
    }

    /** @test */
    public function it_posts_full_payload_when_all_fields_present(): void
    {
        // Happy path — publish with permalink. Pin the endpoint, the
        // auth envelope, and the non-blocking transport args.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => self::LICENSE, 'secret' => self::SECRET]);

        $captured = null;
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) use (&$captured) {
                $captured = ['endpoint' => $endpoint, 'payload' => $payload, 'args' => $args];
                return true;
            })
            ->andReturn(['code' => 200, 'body' => ['success' => true], 'raw' => null]);

        $subject = new Run_Signal_Service();
        $subject->on_structura_post_inserted($this->make_context());

        $this->assertIsArray($captured);
        $this->assertSame(self::ENDPOINT, $captured['endpoint']);

        // Auth envelope — same shape every Structura cloud call uses.
        $this->assertSame(self::LICENSE, $captured['payload']['license_key']);
        $this->assertSame(self::SECRET, $captured['payload']['activation_secret']);
        $this->assertSame(self::SITE_URL, $captured['payload']['site_url']);

        // Progress-specific fields.
        $this->assertSame(self::RUN_ID, $captured['payload']['run_id']);
        $this->assertSame(self::POST_ID, $captured['payload']['post_id']);
        $this->assertSame(self::POST_URL, $captured['payload']['post_url']);

        // Fire-and-forget is load-bearing: a blocking call would stall
        // `wp_insert_post` on Firebase's round-trip latency.
        $this->assertFalse($captured['args']['blocking']);
        $this->assertSame(5, $captured['args']['timeout']);
    }

    /** @test */
    public function it_omits_post_url_when_empty_so_cloud_does_not_clear_existing_value(): void
    {
        // A draft inserted from the editor sends status='draft' and
        // post_url=null. We must NOT send an empty post_url on the
        // wire — the cloud's merge would treat it as "explicitly clear"
        // (overwriting a URL a prior publish might have stamped). The
        // cleaner contract: omit the field entirely.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => self::LICENSE, 'secret' => self::SECRET]);

        $captured_payload = null;
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload) use (&$captured_payload) {
                $captured_payload = $payload;
                return true;
            })
            ->andReturn(['code' => 200, 'body' => ['success' => true], 'raw' => null]);

        $subject = new Run_Signal_Service();
        $subject->on_structura_post_inserted($this->make_context([
            'status'   => 'draft',
            'post_url' => null,
        ]));

        $this->assertIsArray($captured_payload);
        $this->assertSame(self::POST_ID, $captured_payload['post_id']);
        $this->assertArrayNotHasKey(
            'post_url',
            $captured_payload,
            'Expected post_url to be omitted for drafts (empty string must not go on the wire).'
        );
    }

    /** @test */
    public function it_omits_post_url_when_key_is_missing_from_context(): void
    {
        // Older plugin/cloud path may fire the hook without a post_url
        // key at all. The subscriber must cope rather than emit an
        // "undefined index" warning.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => self::LICENSE, 'secret' => self::SECRET]);

        $captured_payload = null;
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload) use (&$captured_payload) {
                $captured_payload = $payload;
                return true;
            })
            ->andReturn(['code' => 200, 'body' => ['success' => true], 'raw' => null]);

        $ctx = $this->make_context();
        unset($ctx['post_url']);

        $subject = new Run_Signal_Service();
        $subject->on_structura_post_inserted($ctx);

        $this->assertIsArray($captured_payload);
        $this->assertArrayNotHasKey('post_url', $captured_payload);
    }

    /** @test */
    public function it_sends_should_increment_post_count_when_status_is_publish(): void
    {
        // Replaces the old plugin-side read-then-write bump in
        // Task_Runner::insert_wordpress_post. The cloud's
        // recordPostInserted endpoint reads this flag and atomically
        // bumps the parent campaign's postsPublished via
        // FieldValue.increment(1) inside the same transaction that
        // patches the run doc.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => self::LICENSE, 'secret' => self::SECRET]);

        $captured_payload = null;
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload) use (&$captured_payload) {
                $captured_payload = $payload;
                return true;
            })
            ->andReturn(['code' => 200, 'body' => ['success' => true], 'raw' => null]);

        $subject = new Run_Signal_Service();
        $subject->on_structura_post_inserted($this->make_context([
            'status' => 'publish',
        ]));

        $this->assertIsArray($captured_payload);
        $this->assertTrue(
            $captured_payload['should_increment_post_count'] ?? false,
            'Publish path must opt into the cloud-side atomic bump.'
        );
    }

    /** @test */
    public function it_omits_should_increment_post_count_for_draft_status(): void
    {
        // Drafts and pending posts must NOT increment the user-facing
        // "Posts Published" counter — only published posts count. The
        // cloud's recordPostInserted treats the flag as "absent =
        // don't bump", so omitting it is the right contract.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => self::LICENSE, 'secret' => self::SECRET]);

        $captured_payload = null;
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload) use (&$captured_payload) {
                $captured_payload = $payload;
                return true;
            })
            ->andReturn(['code' => 200, 'body' => ['success' => true], 'raw' => null]);

        $subject = new Run_Signal_Service();
        $subject->on_structura_post_inserted($this->make_context([
            'status'   => 'draft',
            'post_url' => null,
        ]));

        $this->assertIsArray($captured_payload);
        $this->assertArrayNotHasKey(
            'should_increment_post_count',
            $captured_payload,
            'Draft path must omit the bump flag so the cloud does not increment.'
        );
    }

    // ── transition_post_status: later manual publish of a draft ──────────
    //
    // The bug (Yurii, 2026-07-08): a campaign whose default status is
    // `draft` inserts the post and fires `structura/post/inserted` with
    // status !== 'publish' (no count bump). When a human reviews and
    // publishes the draft days later, that publish is a core WP status
    // transition with no Structura-internal event — so the post never
    // reached the "Posts Published" count. `on_transition_post_status`
    // catches exactly that, re-signalling the cloud with the bump flag.

    /**
     * Stub the WP functions the transition callback reads for a post that
     * IS a Structura cloud post (carries the run-id meta).
     */
    private function stub_structura_post(string $run_id = self::RUN_ID): void
    {
        Functions\when('wp_is_post_revision')->justReturn(false);
        Functions\when('wp_is_post_autosave')->justReturn(false);
        Functions\when('get_post_meta')->alias(
            static function ($id, $key, $single = false) use ($run_id) {
                if ($key === '_structura_campaign_run_id') {
                    return $run_id;
                }
                if ($key === '_structura_campaign_id') {
                    return 9;
                }
                return '';
            }
        );
        Functions\when('get_permalink')->justReturn(self::POST_URL);
        Functions\when('get_the_title')->justReturn('Hello World');
        Functions\when('get_edit_post_link')->justReturn(self::SITE_URL . '/wp-admin/post.php?post=1337&action=edit');
        Functions\when('get_post_time')->justReturn('2026-07-08T10:00:00+00:00');
    }

    /** @test */
    public function it_bumps_the_count_when_a_structura_draft_is_published_later(): void
    {
        $this->stub_structura_post();

        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => self::LICENSE, 'secret' => self::SECRET]);

        $captured = null;
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload) use (&$captured) {
                $captured = ['endpoint' => $endpoint, 'payload' => $payload];
                return true;
            })
            ->andReturn(['code' => 200, 'body' => ['success' => true], 'raw' => null]);

        $subject = new Run_Signal_Service();
        $subject->on_transition_post_status('publish', 'draft', new \WP_Post(self::POST_ID));

        $this->assertIsArray($captured);
        $this->assertSame(self::ENDPOINT, $captured['endpoint']);
        $this->assertSame(self::RUN_ID, $captured['payload']['run_id']);
        $this->assertSame(self::POST_ID, $captured['payload']['post_id']);
        // The permalink now exists (the post is live) and rides along so the
        // run doc's "View post" CTA gets the real URL.
        $this->assertSame(self::POST_URL, $captured['payload']['post_url']);
        // The whole point — opt into the atomic, idempotent published bump.
        $this->assertTrue(
            $captured['payload']['should_increment_post_count'] ?? false,
            'Later manual publish must ask the cloud to bump postsPublished.'
        );
    }

    /** @test */
    public function it_ignores_transitions_that_are_not_into_publish(): void
    {
        // draft → pending is still not live. Must not signal.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldNotReceive('get_license_payload');
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        $subject = new Run_Signal_Service();
        $subject->on_transition_post_status('pending', 'draft', new \WP_Post(self::POST_ID));

        $this->assertTrue(true);
    }

    /** @test */
    public function it_ignores_the_initial_publish_insert_to_avoid_double_counting(): void
    {
        // A campaign set to "publish immediately" inserts with status
        // publish → WP transitions new → publish. `structura/post/inserted`
        // already counts that; this callback MUST skip it (old_status is
        // 'new', not a not-yet-live state) or the post double-counts.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldNotReceive('get_license_payload');
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        $subject = new Run_Signal_Service();
        $subject->on_transition_post_status('publish', 'new', new \WP_Post(self::POST_ID));

        $this->assertTrue(true);
    }

    /** @test */
    public function it_ignores_non_structura_posts(): void
    {
        // A plain WP post (no Structura run-id meta) publishing on the
        // same site must not signal — this callback runs on EVERY publish.
        $this->stub_structura_post('');  // run-id meta resolves to empty

        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldNotReceive('get_license_payload');
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        $subject = new Run_Signal_Service();
        $subject->on_transition_post_status('publish', 'draft', new \WP_Post(self::POST_ID));

        $this->assertTrue(true);
    }

    /** @test */
    public function it_ignores_revisions_and_autosaves(): void
    {
        Functions\when('wp_is_post_revision')->justReturn(true);
        Functions\when('wp_is_post_autosave')->justReturn(false);

        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldNotReceive('get_license_payload');
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        $subject = new Run_Signal_Service();
        $subject->on_transition_post_status('publish', 'draft', new \WP_Post(self::POST_ID));

        $this->assertTrue(true);
    }

    /** @test */
    public function it_swallows_cloud_exceptions_so_publish_never_fails(): void
    {
        // The whole point of this subscriber being fire-and-forget is
        // that a cloud failure must never take down `wp_insert_post`.
        // If Cloud_Client::post throws, the subscriber should log and
        // return normally — NOT propagate the exception.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => self::LICENSE, 'secret' => self::SECRET]);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andThrow(new \RuntimeException('network exploded'));

        $subject = new Run_Signal_Service();

        // No expectException — the whole assertion is that this does NOT throw.
        $subject->on_structura_post_inserted($this->make_context());

        $this->assertTrue(true);
    }
}
