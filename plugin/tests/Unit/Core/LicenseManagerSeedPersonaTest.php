<?php

namespace Structura\Tests\Unit\Core;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Core\License_Manager;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for {@see License_Manager::seed_default_persona_if_needed()}.
 *
 * The seeder is the centrepiece of the "no more empty-personas dead-end"
 * fix: a fresh license activation auto-creates a default "House voice"
 * persona via the existing cloud `postPersona` endpoint, so the
 * Campaigns page never silently disables every generation button.
 *
 * These tests pin the branches that matter for correctness:
 *   - Fingerprint bail (the fast path — flag matches THIS workspace).
 *   - Stale/legacy flag re-seeds (a different workspace's fingerprint, or the
 *     pre-2026-07-20 bare 'yes', must NOT block seeding the new workspace).
 *   - Cloud-said-personas-exist fallthrough (sets flag, never POSTs).
 *   - Clean seed (POSTs with the activating admin's user id, sets flag).
 *
 * The seed flag is a `sha256(api_token)` fingerprint so a workspace reset
 * (new bearer) re-seeds instead of staying stuck at 'yes'.
 *
 * The TestCase pre-stubs `update_option`, so we re-bind it inline with
 * `Functions\when()->alias(...)` to capture writes into a tracker array
 * the test method can assert against.
 *
 * @covers \Structura\Core\License_Manager::seed_default_persona_if_needed
 * @covers \Structura\Core\License_Manager::resolve_seed_author
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class LicenseManagerSeedPersonaTest extends TestCase
{
    /**
     * Per-test capture of update_option(key, value) writes.
     *
     * @var array<string, mixed>
     */
    private array $optionWrites = [];

    /**
     * Per-test capture of get_option(key) reads.
     *
     * @var array<string, mixed>
     */
    private array $optionReads = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->optionWrites = [];
        $this->optionReads  = [];

        Functions\when('home_url')->justReturn('https://example.com');
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        Functions\when('delete_transient')->justReturn(true);
        Functions\when('user_can')->justReturn(true);

        Functions\when('get_option')->alias(function ($key, $default = false) {
            return $this->optionReads[$key] ?? $default;
        });
        Functions\when('update_option')->alias(function ($key, $value) {
            $this->optionWrites[$key] = $value;
            return true;
        });

        if ( ! defined('STRUCTURA_VERSION')) {
            define('STRUCTURA_VERSION', '0.0.0-test');
        }
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    // ── Branch 1: fingerprint bail (THIS workspace already seeded) ──────

    /** @test */
    public function it_is_a_noop_when_the_flag_matches_this_workspace_fingerprint(): void
    {
        // Flag holds the fingerprint of the CURRENT workspace bearer → bail.
        $this->optionReads['structura_default_persona_seeded'] =
            hash('sha256', 'bearer_token_for_seeding');

        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn([
                'api_token' => 'bearer_token_for_seeding',
                'plan'      => 'free',
                'status'    => 'active',
            ]);

        // No cloud call — the workspace was already seeded.
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        License_Manager::seed_default_persona_if_needed();

        $this->assertSame([], $this->optionWrites, 'No options should be written on the fast-path bail.');
    }

    // ── Branch 1b: stale/legacy flag re-seeds a fresh workspace ────────

    /**
     * Regression (2026-07-20): a server-side shadow-workspace wipe left the
     * WP option stuck at 'yes' (or a prior workspace's fingerprint), so the
     * freshly-provisioned, empty workspace never got a House voice and
     * onboarding dead-ended on "No personas yet". A flag that doesn't match
     * the current bearer must NOT bail.
     *
     * @test
     */
    public function it_reseeds_when_the_stored_flag_is_from_a_different_workspace(): void
    {
        // Legacy bare 'yes' (or any other workspace's fingerprint) present.
        $this->optionReads['structura_default_persona_seeded'] = 'yes';

        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn([
                'api_token' => 'fresh_workspace_bearer',
                'plan'      => 'free',
                'status'    => 'active',
            ]);

        Functions\when('wp_get_current_user')->justReturn((object) ['ID' => 1]);
        Functions\when('get_userdata')->justReturn((object) ['ID' => 1]);
        Mockery::mock('alias:Structura\Core\Log_Service')->shouldReceive('add');

        $posted = false;
        $cloud  = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->withArgs(function ($endpoint) { return $endpoint === '/listPersonas'; })
            ->andReturn(['code' => 200, 'body' => ['personas' => []], 'raw' => null]);
        $cloud->shouldReceive('post')
            ->withArgs(function ($endpoint) use (&$posted) {
                if ($endpoint === '/postPersona') {
                    $posted = true;
                }
                return $endpoint === '/postPersona';
            })
            ->andReturn(['code' => 200, 'body' => ['persona' => ['personaId' => 'new_one']], 'raw' => null]);

        License_Manager::seed_default_persona_if_needed();

        $this->assertTrue($posted, 'A stale flag from another workspace must NOT block the seed.');
        $this->assertSame(
            hash('sha256', 'fresh_workspace_bearer'),
            $this->optionWrites['structura_default_persona_seeded'] ?? null,
            'Flag must be updated to the NEW workspace fingerprint.'
        );
    }

    // ── Branch 2: defensive listPersonas fallthrough ───────────────────

    /** @test */
    public function it_sets_the_flag_without_posting_when_personas_already_exist(): void
    {
        // is_licensed() → true via active license payload.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn([
                'key'       => 'live_xxx',
                'secret'    => 'sek_yyy',
                'api_token' => 'bearer_token_for_seeding',
                'plan'      => 'free',
                'status'    => 'active',
            ]);

        // Cloud says "you already have a persona". Seeder MUST set the
        // flag and exit without writing.
        //
        // PR5 stripped the legacy `license_key` / `activation_secret` /
        // `site_url` body fields — bearer auth on the wire is enough.
        // The payload is now empty.
        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload) {
                return $endpoint === '/listPersonas' && $payload === [];
            })
            ->andReturn([
                'code' => 200,
                'body' => ['personas' => [['personaId' => 'existing_one']]],
                'raw'  => null,
            ]);

        License_Manager::seed_default_persona_if_needed();

        $this->assertSame(
            hash('sha256', 'bearer_token_for_seeding'),
            $this->optionWrites['structura_default_persona_seeded'] ?? null,
            'Flag must be set to the workspace fingerprint even when the seeder discovers existing personas.'
        );
    }

    // ── Branch 3: clean seed ───────────────────────────────────────────

    /** @test */
    public function it_posts_a_default_persona_using_the_current_admin_as_author(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn([
                'key'       => 'live_xxx',
                'secret'    => 'sek_yyy',
                'api_token' => 'bearer_token_for_seeding',
                'plan'      => 'free',
                'status'    => 'active',
            ]);

        // Activating admin = user 7 with edit_posts (stubbed).
        Functions\when('wp_get_current_user')->justReturn((object) ['ID' => 7]);
        Functions\when('get_userdata')->justReturn((object) ['ID' => 7]);

        // Log_Service::add() is called on success — alias-mock to no-op.
        Mockery::mock('alias:Structura\Core\Log_Service')->shouldReceive('add');

        // Track the postPersona payload for assertion after the call.
        $captured_post_payload = null;

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->withArgs(function ($endpoint) { return $endpoint === '/listPersonas'; })
            ->andReturn([
                'code' => 200,
                'body' => ['personas' => []],
                'raw'  => null,
            ]);
        $cloud->shouldReceive('post')
            ->withArgs(function ($endpoint, $payload) use (&$captured_post_payload) {
                if ($endpoint !== '/postPersona') {
                    return false;
                }
                $captured_post_payload = $payload;
                return true;
            })
            ->andReturn([
                'code' => 200,
                'body' => ['persona' => ['personaId' => 'new_one']],
                'raw'  => null,
            ]);

        License_Manager::seed_default_persona_if_needed();

        $this->assertNotNull($captured_post_payload, 'postPersona must be called on a clean seed.');

        $persona = $captured_post_payload['persona'] ?? [];
        // PR5 — `license_key` / `activation_secret` body fields are no
        // longer sent on writes; bearer auth carries the activation.
        // The wire payload is just `{ persona }`.
        $this->assertArrayNotHasKey('license_key', $captured_post_payload);
        $this->assertArrayNotHasKey('activation_secret', $captured_post_payload);
        $this->assertSame('House voice', $persona['name'] ?? null);
        $this->assertSame('professional', $persona['tone'] ?? null);
        $this->assertSame('grade_12', $persona['readingLevel'] ?? null);
        $this->assertSame(7, (int) ($persona['authorId'] ?? 0), 'Author should be the activating admin.');
        $this->assertIsString($persona['systemPrompt'] ?? null);
        $this->assertNotSame('', trim((string) ($persona['systemPrompt'] ?? '')));

        $this->assertSame(
            hash('sha256', 'bearer_token_for_seeding'),
            $this->optionWrites['structura_default_persona_seeded'] ?? null,
            'Flag must be set to the workspace fingerprint after a successful seed.'
        );
    }

    // ── Author resolution: missing user falls back to ID 1 ─────────────

    /** @test */
    public function it_falls_back_to_user_1_when_no_admin_context(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn([
                'key'       => 'live_xxx',
                'secret'    => 'sek_yyy',
                'api_token' => 'bearer_token_for_seeding',
                'plan'      => 'free',
                'status'    => 'active',
            ]);

        // No-current-user path: ID 0 → resolve_seed_author falls back to
        // 1 without ever calling get_userdata.
        Functions\when('wp_get_current_user')->justReturn((object) ['ID' => 0]);
        Functions\when('get_userdata')->justReturn(null);

        Mockery::mock('alias:Structura\Core\Log_Service')->shouldReceive('add');

        $captured_post_payload = null;

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->withArgs(function ($endpoint) { return $endpoint === '/listPersonas'; })
            ->andReturn(['code' => 200, 'body' => ['personas' => []], 'raw' => null]);
        $cloud->shouldReceive('post')
            ->withArgs(function ($endpoint, $payload) use (&$captured_post_payload) {
                if ($endpoint !== '/postPersona') {
                    return false;
                }
                $captured_post_payload = $payload;
                return true;
            })
            ->andReturn(['code' => 200, 'body' => ['persona' => []], 'raw' => null]);

        License_Manager::seed_default_persona_if_needed();

        $this->assertNotNull($captured_post_payload);
        $this->assertSame(
            1,
            (int) ($captured_post_payload['persona']['authorId'] ?? 0),
            'Empty admin context must fall back to user 1.'
        );
    }
}
