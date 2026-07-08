<?php

namespace Structura\Tests\Unit\Core;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Core\License_Manager;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for {@see License_Manager::forget_site()}.
 *
 * `forget_site` is the SPA's "Forget this site" recovery path —
 * authenticated by the user re-typing their license key (the local
 * bearer is gone by the time this is reachable). It POSTs the cloud's
 * `/forgetActivation` endpoint, and on success wipes every local
 * artefact of prior activation so the SPA returns to fresh-install
 * state. A cloud failure must leave local state untouched so the user
 * can retry — surfacing a stale "site forgotten" banner while the
 * cloud doc still exists would be more confusing than honest.
 *
 * Pinned branches:
 *   - Cloud returns transport error (WP_Error) → no local writes, error
 *     bubbled.
 *   - Cloud returns non-200 / `success: false` → no local writes, error
 *     bubbled with the cloud's message preserved.
 *   - Cloud returns success → `structura_license_data`,
 *     `structura_had_prior_activation`, and
 *     `structura_default_persona_seeded` are all deleted exactly once.
 *
 * @covers \Structura\Core\License_Manager::forget_site
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class LicenseManagerForgetSiteTest extends TestCase
{
    /** @var list<string> */
    private array $deleted_options = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->deleted_options = [];

        // `parse_url` is a PHP internal that Patchwork can't redefine
        // without explicit opt-in — let `get_site_url`'s real-looking
        // value flow through the actual `parse_url(..., PHP_URL_HOST)`.
        Functions\when('get_site_url')->justReturn('https://example.com');
        Functions\when('delete_option')->alias(function ($key) {
            $this->deleted_options[] = $key;
            return true;
        });

        Mockery::mock('alias:Structura\Core\Log_Service')->shouldReceive('add');

        if ( ! defined('STRUCTURA_VERSION')) {
            define('STRUCTURA_VERSION', '0.0.0-test');
        }
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @test */
    public function it_returns_failure_and_writes_no_local_state_on_a_cloud_transport_error(): void
    {
        $wp_error = Mockery::mock('WP_Error');
        $wp_error->shouldReceive('get_error_message')->andReturn('cURL exploded');

        Functions\when('is_wp_error')->alias(fn ($x) => $x === $wp_error);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload) {
                return $endpoint === '/forgetActivation'
                    && ($payload['licenseKey'] ?? '') === 'live_user_typed'
                    && ($payload['domain'] ?? '') === 'example.com';
            })
            ->andReturn($wp_error);

        $result = License_Manager::forget_site('live_user_typed');

        $this->assertFalse($result['success']);
        $this->assertSame('cURL exploded', $result['error']);
        $this->assertSame([], $this->deleted_options, 'Local state must survive a transport failure so the user can retry.');
    }

    /** @test */
    public function it_returns_failure_and_writes_no_local_state_when_the_cloud_rejects(): void
    {
        Functions\when('is_wp_error')->justReturn(false);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn([
                'code' => 403,
                'body' => ['success' => false, 'error' => 'Could not authenticate this license.'],
                'raw'  => null,
            ]);

        $result = License_Manager::forget_site('wrong-key');

        $this->assertFalse($result['success']);
        $this->assertSame('Could not authenticate this license.', $result['error']);
        $this->assertSame(403, $result['code']);
        $this->assertSame([], $this->deleted_options, 'A cloud rejection must NOT clear local activation state.');
    }

    /** @test */
    public function it_clears_local_activation_state_on_a_successful_forget(): void
    {
        Functions\when('is_wp_error')->justReturn(false);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn([
                'code' => 200,
                'body' => ['success' => true, 'message' => 'Activation removed.'],
                'raw'  => null,
            ]);

        $result = License_Manager::forget_site('live_user_typed');

        $this->assertTrue($result['success']);
        $this->assertSame('Activation removed.', $result['message']);

        // Every "this install was activated" marker is wiped so the SPA
        // returns to fresh-install state on the next paint.
        $this->assertContains('structura_license_data', $this->deleted_options);
        $this->assertContains('structura_had_prior_activation', $this->deleted_options);
        $this->assertContains('structura_default_persona_seeded', $this->deleted_options);
    }
}
