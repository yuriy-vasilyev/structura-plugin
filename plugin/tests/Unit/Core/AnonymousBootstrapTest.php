<?php

namespace Structura\Tests\Unit\Core;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Core\Anonymous_Bootstrap;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for {@see Anonymous_Bootstrap::maybe_bootstrap()}.
 *
 * Phase 1.8 §1.8.1 + §1.8.3 entry point. Hooks `admin_init` so a
 * fresh wp.org install with no license bound generates a UUID v4
 * install id, calls `/bootstrapAnonymousInstall` once, and
 * persists the returned bearer + activation id into
 * `structura_license_data` with `plan: "none"`. Subsequent admin
 * page loads short-circuit on the api_token check.
 *
 * Pinned properties:
 *   - License-bound install no-ops (the licensed bearer is what
 *     every cloud call uses; bootstrap is irrelevant).
 *   - Anonymous install with an existing api_token no-ops (already
 *     bootstrapped — re-call would just hit the per-installId
 *     rate cap).
 *   - Fresh install: UUID generated + persisted, cloud call fires
 *     with the right body shape, license_data populated with
 *     api_token / activation_id / plan: "none" / status: "active",
 *     bootstrapped-at sentinel stamped.
 *   - Retry path: install_id exists but api_token doesn't (failed
 *     mid-flight) → reuses the persisted UUID, calls cloud, persists
 *     the returned tuple.
 *   - Cloud transport error: silent (no admin notice), no license_data
 *     write, no bootstrapped-at stamp.
 *   - Cloud rejection (4xx / malformed response): silent, no writes.
 *
 * @covers \Structura\Core\Anonymous_Bootstrap::maybe_bootstrap
 * @covers \Structura\Core\Anonymous_Bootstrap::get_or_generate_install_id
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class AnonymousBootstrapTest extends TestCase
{
    /** @var array<string, mixed> */
    private array $optionsStore = [];

    /** @var list<array{key: string, value: mixed, autoload: mixed}> */
    private array $optionWrites = [];

    /** @var list<string> */
    private array $optionDeletes = [];

    /**
     * Reset both `Anonymous_Bootstrap::$ranThisRequest` and the
     * test-side option store + capture lists between tests.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $this->optionsStore   = [];
        $this->optionWrites   = [];
        $this->optionDeletes  = [];

        // Reset the static re-entry guard via reflection so each
        // test starts from a fresh state. The guard is private +
        // process-scoped; without the reset, the second test in
        // the same process would silently no-op.
        //
        // `setAccessible(true)` is REQUIRED on PHP 7.4 (CI matrix
        // floor) and a no-op-then-deprecated on 8.1+. Tests/bootstrap
        // suppresses `E_DEPRECATED`, so calling it unconditionally is
        // safe in both eras.
        $reflection = new \ReflectionClass(Anonymous_Bootstrap::class);
        $prop = $reflection->getProperty('ranThisRequest');
        $prop->setAccessible(true);
        $prop->setValue(null, false);

        Functions\when('get_site_url')->justReturn('https://example.com');
        Functions\when('get_bloginfo')->alias(function ($what) {
            switch ($what) {
                case 'name':    return 'Test Site';
                case 'version': return '6.5.2';
                default:        return '';
            }
        });
        Functions\when('wp_generate_uuid4')->justReturn(
            '11111111-1111-4111-8111-111111111111',
        );
        // `time()` is a PHP internal Brain Monkey can't redefine
        // without explicit Patchwork config. Tests assert "some
        // value was written" rather than pinning the specific
        // timestamp, so the real `time()` is fine.

        Functions\when('get_option')->alias(function ($key, $default = false) {
            return $this->optionsStore[$key] ?? $default;
        });
        Functions\when('update_option')->alias(function ($key, $value, $autoload = null) {
            $this->optionWrites[]     = ['key' => $key, 'value' => $value, 'autoload' => $autoload];
            $this->optionsStore[$key] = $value;
            return true;
        });
        Functions\when('delete_option')->alias(function ($key) {
            $this->optionDeletes[] = $key;
            unset($this->optionsStore[$key]);
            return true;
        });

        Mockery::mock('alias:Structura\Core\Log_Service')->shouldReceive('add');
        Mockery::mock('alias:Structura\Core\Site_Identity_Sync')
            ->shouldReceive('collect')
            ->andReturn(['name' => 'Test Site']);

        if ( ! defined('STRUCTURA_VERSION')) {
            define('STRUCTURA_VERSION', '0.0.0-test');
        }
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /**
     * Helper — alias-mock `License_Manager::is_licensed()` to a fixed
     * return value. Each test that exercises the licensed-vs-anonymous
     * branching declares its expected value up-front.
     */
    private function mockIsLicensed(bool $value): void
    {
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('is_licensed')
            ->andReturn($value);
    }

    /**
     * Helper — alias-mock `Key_Manager`. The `get_license_payload`
     * shape is the discriminator for "licensed vs anonymous vs
     * fresh"; the `save_license_payload` capture lets us assert the
     * persisted shape.
     */
    private function mockKeyManager(?array $payload, array &$saved): void
    {
        $mock = Mockery::mock('alias:Structura\Core\Key_Manager');
        $mock->shouldReceive('get_license_payload')->andReturn($payload);
        $mock->shouldReceive('save_license_payload')
            ->andReturnUsing(function ($p) use (&$saved) {
                $saved[] = $p;
                return true;
            });
    }

    // ─── No-op paths ───────────────────────────────────────────────

    /** @test */
    public function it_no_ops_when_the_install_is_already_licensed(): void
    {
        $this->mockIsLicensed(true);
        $saved = [];
        $this->mockKeyManager(['key' => 'live-key'], $saved);

        // Cloud_Client must NOT be called — assert via shouldNotReceive.
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        Anonymous_Bootstrap::maybe_bootstrap();

        $this->assertSame([], $saved, 'Licensed installs must not trigger a save.');
        $this->assertSame([], $this->optionWrites, 'No options must be written for a licensed install.');
    }

    /** @test */
    public function it_no_ops_when_the_install_already_has_an_anonymous_bearer(): void
    {
        $this->mockIsLicensed(false);
        $saved = [];
        // Anonymous-bootstrapped state: api_token + activation_id set,
        // no key. Re-running bootstrap would burn the per-installId
        // rate cap; the gate has to short-circuit.
        $this->mockKeyManager(
            [
                'api_token'     => 'anon-bearer',
                'activation_id' => 'act-uuid',
                'plan'          => 'none',
                'status'        => 'active',
            ],
            $saved,
        );

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        Anonymous_Bootstrap::maybe_bootstrap();

        $this->assertSame([], $saved);
    }

    // ─── Fresh-create path ─────────────────────────────────────────

    /** @test */
    public function it_generates_an_install_id_and_bootstraps_on_a_fresh_install(): void
    {
        $this->mockIsLicensed(false);
        $saved = [];
        $this->mockKeyManager(null, $saved);

        $capturedRequest = null;
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload) use (&$capturedRequest) {
                $capturedRequest = ['endpoint' => $endpoint, 'payload' => $payload];
                return $endpoint === '/bootstrapAnonymousInstall';
            })
            ->andReturn([
                'code' => 200,
                'body' => [
                    'success'      => true,
                    'workspaceId'  => 'ws-uuid',
                    'activationId' => 'act-uuid',
                    'apiToken'     => 'fresh-bearer',
                    'installId'    => '11111111-1111-4111-8111-111111111111',
                    'plan'         => 'none',
                    'idempotent'   => false,
                ],
            ]);

        Functions\when('is_wp_error')->justReturn(false);

        Anonymous_Bootstrap::maybe_bootstrap();

        // Cloud call fired with the right body.
        $this->assertNotNull($capturedRequest);
        $this->assertSame(
            '11111111-1111-4111-8111-111111111111',
            $capturedRequest['payload']['installId'],
        );
        $this->assertSame('example.com', $capturedRequest['payload']['domain']);
        $this->assertSame('Test Site', $capturedRequest['payload']['siteName']);
        $this->assertSame('6.5.2', $capturedRequest['payload']['wpVersion']);

        // Install id was persisted.
        $installIdWrite = array_filter(
            $this->optionWrites,
            fn ($w) => $w['key'] === Anonymous_Bootstrap::OPTION_INSTALL_ID,
        );
        $this->assertCount(1, $installIdWrite);

        // Bootstrapped-at sentinel was stamped.
        $bootstrappedAtWrite = array_filter(
            $this->optionWrites,
            fn ($w) => $w['key'] === Anonymous_Bootstrap::OPTION_BOOTSTRAPPED_AT,
        );
        $this->assertCount(1, $bootstrappedAtWrite);

        // license_data was persisted with the anonymous shape — no
        // `key` field, plan === "none", status active. `secret` is
        // present but empty: anonymous installs have no per-activation
        // HMAC, so the field is reserved as an empty string for shape
        // compatibility with the licensed payload.
        $this->assertCount(1, $saved);
        $this->assertSame(
            [
                'api_token'     => 'fresh-bearer',
                'activation_id' => 'act-uuid',
                'secret'        => '',
                'plan'          => 'none',
                'status'        => 'active',
            ],
            $saved[0],
        );
        $this->assertArrayNotHasKey('key', $saved[0]);
    }

    // ─── Retry path ────────────────────────────────────────────────

    /** @test */
    public function it_reuses_an_existing_install_id_on_a_retry_after_failed_first_attempt(): void
    {
        $this->mockIsLicensed(false);
        $saved = [];
        $this->mockKeyManager(null, $saved);

        // Pre-seed the install id from a prior failed attempt — but
        // license_data is empty (the cloud call last time
        // crashed mid-flight after the UUID was stored).
        $this->optionsStore[Anonymous_Bootstrap::OPTION_INSTALL_ID] = 'prior-uuid';

        $capturedRequest = null;
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload) use (&$capturedRequest) {
                $capturedRequest = ['endpoint' => $endpoint, 'payload' => $payload];
                return $endpoint === '/bootstrapAnonymousInstall';
            })
            ->andReturn([
                'code' => 200,
                'body' => [
                    'success'      => true,
                    'workspaceId'  => 'ws-uuid',
                    'activationId' => 'act-uuid',
                    'apiToken'     => 'retry-bearer',
                    'installId'    => 'prior-uuid',
                    'plan'         => 'none',
                    'idempotent'   => true, // re-bootstrap path
                ],
            ]);

        Functions\when('is_wp_error')->justReturn(false);

        Anonymous_Bootstrap::maybe_bootstrap();

        // Cloud was called with the PERSISTED install id, not a fresh one.
        $this->assertSame('prior-uuid', $capturedRequest['payload']['installId']);
        // No fresh install id was minted (only the bootstrapped-at
        // stamp + the license_data write should appear; no second
        // install_id write).
        $installIdWrites = array_filter(
            $this->optionWrites,
            fn ($w) => $w['key'] === Anonymous_Bootstrap::OPTION_INSTALL_ID,
        );
        $this->assertCount(0, $installIdWrites);

        // license_data is now populated.
        $this->assertCount(1, $saved);
        $this->assertSame('retry-bearer', $saved[0]['api_token']);
    }

    // ─── Failure paths ─────────────────────────────────────────────

    /** @test */
    public function it_silently_returns_on_a_cloud_transport_error(): void
    {
        $this->mockIsLicensed(false);
        $saved = [];
        $this->mockKeyManager(null, $saved);

        $wpError = Mockery::mock('WP_Error');
        $wpError->shouldReceive('get_error_message')->andReturn('cURL connect failed');
        Functions\when('is_wp_error')->alias(fn ($x) => $x === $wpError);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn($wpError);

        Anonymous_Bootstrap::maybe_bootstrap();

        // Install id was generated (so the next retry uses the same
        // one), but no license_data write fired and no bootstrapped-at
        // sentinel was stamped.
        $installIdWrites = array_filter(
            $this->optionWrites,
            fn ($w) => $w['key'] === Anonymous_Bootstrap::OPTION_INSTALL_ID,
        );
        $this->assertCount(1, $installIdWrites);

        $bootstrappedAtWrites = array_filter(
            $this->optionWrites,
            fn ($w) => $w['key'] === Anonymous_Bootstrap::OPTION_BOOTSTRAPPED_AT,
        );
        $this->assertCount(0, $bootstrappedAtWrites);

        $this->assertSame([], $saved, 'license_data must NOT be persisted on transport failure.');
    }

    /** @test */
    public function it_silently_returns_on_a_cloud_rejection(): void
    {
        $this->mockIsLicensed(false);
        $saved = [];
        $this->mockKeyManager(null, $saved);

        Functions\when('is_wp_error')->justReturn(false);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn([
                'code' => 429,
                'body' => ['success' => false, 'error' => 'rate_limited_install'],
            ]);

        Anonymous_Bootstrap::maybe_bootstrap();

        $this->assertSame([], $saved);
    }

    /** @test */
    public function it_silently_returns_when_the_response_body_is_malformed(): void
    {
        $this->mockIsLicensed(false);
        $saved = [];
        $this->mockKeyManager(null, $saved);

        Functions\when('is_wp_error')->justReturn(false);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn([
                'code' => 200,
                'body' => 'not-json-shaped',
            ]);

        Anonymous_Bootstrap::maybe_bootstrap();

        $this->assertSame([], $saved);
    }

    // ─── Re-entry guard ────────────────────────────────────────────

    /** @test */
    public function it_only_runs_once_per_request(): void
    {
        $this->mockIsLicensed(false);
        $saved = [];
        $this->mockKeyManager(null, $saved);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn([
                'code' => 200,
                'body' => [
                    'success'      => true,
                    'workspaceId'  => 'ws-uuid',
                    'activationId' => 'act-uuid',
                    'apiToken'     => 'fresh-bearer',
                    'installId'    => '11111111-1111-4111-8111-111111111111',
                    'plan'         => 'none',
                ],
            ]);

        Functions\when('is_wp_error')->justReturn(false);

        // First call — fires the cloud request.
        Anonymous_Bootstrap::maybe_bootstrap();
        // Second call same request — re-entry guard short-circuits;
        // Mockery's `once()` would fail if the mock saw a second call.
        Anonymous_Bootstrap::maybe_bootstrap();

        $this->assertCount(1, $saved);
    }

    // ─── get_or_generate_install_id direct ─────────────────────────

    /** @test */
    public function get_or_generate_install_id_returns_existing_value_unchanged(): void
    {
        $this->optionsStore[Anonymous_Bootstrap::OPTION_INSTALL_ID] = 'existing-uuid';

        $result = Anonymous_Bootstrap::get_or_generate_install_id();

        $this->assertSame('existing-uuid', $result);
        $this->assertCount(0, $this->optionWrites, 'No write must fire when the id already exists.');
    }

    /** @test */
    public function get_or_generate_install_id_generates_and_persists_when_missing(): void
    {
        $result = Anonymous_Bootstrap::get_or_generate_install_id();

        $this->assertSame('11111111-1111-4111-8111-111111111111', $result);
        $this->assertCount(1, $this->optionWrites);
        $this->assertSame(Anonymous_Bootstrap::OPTION_INSTALL_ID, $this->optionWrites[0]['key']);
        $this->assertSame(false, $this->optionWrites[0]['autoload'], 'Autoload should be off — only the bootstrap path reads this.');
    }
}
