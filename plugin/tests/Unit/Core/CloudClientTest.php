<?php

namespace Structura\Tests\Unit\Core;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Core\Cloud_Client;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for {@see Cloud_Client}'s anonymous-bearer self-heal.
 *
 * Regression guard (2026-07-20): the plugin used to cache an anonymous
 * bearer "good until revoked" and never re-check it, so if the backing
 * shadow workspace was deleted/revoked server-side, every cloud call
 * 401'd forever until wp_options were cleared by hand. Cloud_Client now
 * drops the stale credentials after {@see Cloud_Client::SELF_HEAL_401_THRESHOLD}
 * consecutive 401s so Anonymous_Bootstrap re-mints on the next admin
 * load.
 *
 * The threshold (not "heal on first 401") is load-bearing: the cloud
 * returns the SAME `401 Unauthorized.` for a genuinely dead token AND
 * for a transient Firestore hiccup during the token lookup, so a single
 * 401 must NOT trigger a re-bootstrap.
 *
 * @covers \Structura\Core\Cloud_Client::post
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class CloudClientTest extends TestCase
{
    private const STRIKES_OPTION = 'structura_anon_auth_401_strikes';

    /** @var array<string, mixed> */
    private array $optionsStore = [];

    /** HTTP status the stubbed transport returns for the next post() call. */
    private int $responseCode = 200;

    protected function setUp(): void
    {
        parent::setUp();

        $this->optionsStore = [];
        $this->responseCode = 200;

        if ( ! defined('STRUCTURA_VERSION')) {
            define('STRUCTURA_VERSION', '0.0.0-test');
        }
        if ( ! defined('STRUCTURA_API_BASE')) {
            define('STRUCTURA_API_BASE', 'https://cloud.example.test');
        }

        // Option store backed by a simple array so we can assert the
        // strike counter's progression.
        Functions\when('get_option')->alias(function ($key, $default = false) {
            return $this->optionsStore[$key] ?? $default;
        });
        Functions\when('update_option')->alias(function ($key, $value, $autoload = null) {
            $this->optionsStore[$key] = $value;
            return true;
        });
        Functions\when('delete_option')->alias(function ($key) {
            unset($this->optionsStore[$key]);
            return true;
        });

        // Transport + response stubs. Body content is irrelevant to the
        // self-heal (only the status code matters), so a bare object is
        // enough to keep json_decode + the version-enforcement branch
        // happy.
        Functions\when('remove_action')->justReturn(true);
        Functions\when('is_wp_error')->justReturn(false);
        Functions\when('wp_remote_post')->justReturn(['fake_response' => true]);
        Functions\when('wp_remote_retrieve_body')->justReturn('{}');
        Functions\when('wp_remote_retrieve_response_code')->alias(function () {
            return $this->responseCode;
        });

        Mockery::mock('alias:Structura\Core\Log_Service')->shouldReceive('add');
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /**
     * Alias-mock Key_Manager. `get_license_payload` is the discriminator
     * for anonymous-vs-licensed; the returned mock lets each test pin its
     * own `clear_license_payload` expectation.
     *
     * @param array<string,mixed>|null $payload
     */
    private function mockKeyManager(?array $payload): \Mockery\MockInterface
    {
        $mock = Mockery::mock('alias:Structura\Core\Key_Manager');
        $mock->shouldReceive('get_license_payload')->andReturn($payload);
        return $mock;
    }

    /**
     * Reset the per-request verdict guard so the next post() call is
     * treated as a fresh WP request (a new admin page load).
     */
    private function simulateNewRequest(): void
    {
        $reflection = new \ReflectionClass(Cloud_Client::class);
        $prop = $reflection->getProperty('authVerdictRecordedThisRequest');
        $prop->setAccessible(true);
        $prop->setValue(null, false);
    }

    /** An anonymous payload = a bearer, no license key. */
    private function anonymousPayload(): array
    {
        return [
            'api_token'     => 'anon-bearer',
            'activation_id' => 'act-uuid',
            'plan'          => 'none',
            'status'        => 'active',
        ];
    }

    // ─── The core regression ───────────────────────────────────────────

    /** @test */
    public function it_clears_the_anonymous_bearer_after_two_consecutive_401s(): void
    {
        $km = $this->mockKeyManager($this->anonymousPayload());
        $km->shouldReceive('clear_license_payload')->once();

        // First admin load: 401 → one strike, no clear yet.
        $this->simulateNewRequest();
        $this->responseCode = 401;
        Cloud_Client::post('/listProviderCredentials', []);
        $this->assertSame(1, $this->optionsStore[self::STRIKES_OPTION] ?? 0);

        // Second admin load: 401 again → threshold reached, credentials
        // cleared and the strike counter wiped.
        $this->simulateNewRequest();
        $this->responseCode = 401;
        Cloud_Client::post('/listProviderCredentials', []);
        $this->assertArrayNotHasKey(
            self::STRIKES_OPTION,
            $this->optionsStore,
            'Strike counter must be cleared once the bearer is dropped.',
        );
        // clear_license_payload()->once() is verified on Mockery::close().
    }

    /** @test */
    public function it_does_not_clear_on_a_single_401(): void
    {
        $km = $this->mockKeyManager($this->anonymousPayload());
        $km->shouldReceive('clear_license_payload')->never();

        $this->simulateNewRequest();
        $this->responseCode = 401;
        Cloud_Client::post('/listProviderCredentials', []);

        $this->assertSame(
            1,
            $this->optionsStore[self::STRIKES_OPTION] ?? 0,
            'A lone 401 (possibly a transient cloud hiccup) must only accrue a strike, not re-bootstrap.',
        );
    }

    /** @test */
    public function it_resets_strikes_when_the_bearer_authenticates_again(): void
    {
        $km = $this->mockKeyManager($this->anonymousPayload());
        $km->shouldReceive('clear_license_payload')->never();

        // Load 1: transient 401 → strike 1.
        $this->simulateNewRequest();
        $this->responseCode = 401;
        Cloud_Client::post('/listProviderCredentials', []);
        $this->assertSame(1, $this->optionsStore[self::STRIKES_OPTION] ?? 0);

        // Load 2: the token works (200) → strikes reset.
        $this->simulateNewRequest();
        $this->responseCode = 200;
        Cloud_Client::post('/listProviderCredentials', []);
        $this->assertArrayNotHasKey(self::STRIKES_OPTION, $this->optionsStore);

        // Load 3: a fresh 401 is back to strike 1, nowhere near the
        // threshold — proving the counter must be *consecutive*.
        $this->simulateNewRequest();
        $this->responseCode = 401;
        Cloud_Client::post('/listProviderCredentials', []);
        $this->assertSame(1, $this->optionsStore[self::STRIKES_OPTION] ?? 0);
    }

    // ─── Scope guards ──────────────────────────────────────────────────

    /** @test */
    public function it_never_clears_a_licensed_bearer(): void
    {
        // Licensed payload — has a `key`. A revoked licensed token needs
        // an explicit re-activation, never a silent wipe here.
        $km = $this->mockKeyManager([
            'api_token'     => 'licensed-bearer',
            'activation_id' => 'act-uuid',
            'key'           => 'LICENSE-KEY-123',
            'status'        => 'active',
        ]);
        $km->shouldReceive('clear_license_payload')->never();

        $this->simulateNewRequest();
        $this->responseCode = 401;
        Cloud_Client::post('/listProviderCredentials', []);
        $this->simulateNewRequest();
        $this->responseCode = 401;
        Cloud_Client::post('/listProviderCredentials', []);

        $this->assertArrayNotHasKey(
            self::STRIKES_OPTION,
            $this->optionsStore,
            'Licensed installs must not accrue anonymous-bearer strikes at all.',
        );
    }

    /** @test */
    public function it_ignores_responses_when_no_bearer_was_sent(): void
    {
        // No stashed payload → the bootstrap handshake itself sends no
        // bearer, so a 401 carries no verdict about our (absent) token.
        $km = $this->mockKeyManager(null);
        $km->shouldReceive('clear_license_payload')->never();

        $this->simulateNewRequest();
        $this->responseCode = 401;
        Cloud_Client::post('/bootstrapAnonymousInstall', []);

        $this->assertArrayNotHasKey(self::STRIKES_OPTION, $this->optionsStore);
    }

    /** @test */
    public function it_records_only_one_verdict_per_request(): void
    {
        // Several authenticated calls in ONE page load must not stack
        // multiple strikes off a single transient window.
        $km = $this->mockKeyManager($this->anonymousPayload());
        $km->shouldReceive('clear_license_payload')->never();

        $this->simulateNewRequest();
        $this->responseCode = 401;
        Cloud_Client::post('/listProviderCredentials', []);
        // Same request (guard NOT reset) — second 401 is ignored.
        Cloud_Client::post('/listProviderCredentials', []);

        $this->assertSame(
            1,
            $this->optionsStore[self::STRIKES_OPTION] ?? 0,
            'Only one strike may be recorded per WP request.',
        );
    }

    /** @test */
    public function post_refuses_to_send_anything_before_cloud_consent(): void
    {
        // wp.org review 2026-08-27 (guidelines 7 & 9): no request may leave
        // the site until the admin has opted in. This guard sits in front of
        // EVERY caller, not just the bootstrap.
        $this->mockKeyManager(null);
        $this->simulateNewRequest();
        $sent = 0;
        Functions\when('wp_remote_post')->alias(function () use (&$sent) {
            $sent++;
            return ['fake_response' => true];
        });

        $result = Cloud_Client::post('/bootstrapAnonymousInstall', ['installId' => 'x']);

        $this->assertSame(0, $sent, 'wp_remote_post must not be reached before consent.');
        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('structura_cloud_consent_required', $result->get_error_code());
    }

    /** @test */
    public function post_goes_through_once_consent_is_on_record(): void
    {
        $this->mockKeyManager(null);
        $this->simulateNewRequest();
        $this->optionsStore['structura_cloud_consent'] = 'yes';
        $sent = 0;
        Functions\when('wp_remote_post')->alias(function () use (&$sent) {
            $sent++;
            return ['fake_response' => true];
        });

        Cloud_Client::post('/bootstrapAnonymousInstall', ['installId' => 'x']);

        $this->assertSame(1, $sent);
    }
}
