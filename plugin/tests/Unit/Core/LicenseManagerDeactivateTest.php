<?php

namespace Structura\Tests\Unit\Core;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Core\License_Manager;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for {@see License_Manager::deactivate()}.
 *
 * Deactivate is the SPA's "Disconnect" path. Beyond releasing the cloud
 * slot and stopping every campaign pulse, it must drop the
 * `structura_default_persona_seeded` flag so a subsequent reconnect — to
 * a DIFFERENT license, i.e. a fresh cloud workspace — re-seeds the
 * default "House voice" persona. Leaving the flag set (the pre-2026-05-25
 * bug) made `seed_default_persona_if_needed()` O(1)-bail on its option
 * guard, so the new workspace got zero personas and the Campaigns page
 * silently disabled every generation button.
 *
 * Pinned branches:
 *   - No local payload → early return true, no cloud call, no option
 *     writes (idempotent disconnect of an already-disconnected site).
 *   - Payload present → cloud `/deactivateLicense` POSTed once, pulses
 *     stopped, and BOTH `structura_default_persona_seeded` and
 *     `structura_license_data` deleted.
 *
 * @covers \Structura\Core\License_Manager::deactivate
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class LicenseManagerDeactivateTest extends TestCase
{
    /** @var list<string> */
    private array $deleted_options = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->deleted_options = [];

        Functions\when('get_site_url')->justReturn('https://example.com');
        Functions\when('wp_parse_url')->justReturn('example.com');
        Functions\when('delete_option')->alias(function ($key) {
            $this->deleted_options[] = $key;
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

    /** @test */
    public function it_returns_true_and_writes_no_state_when_no_license_payload_exists(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->once()
            ->andReturn(null);

        // Nothing else should run on an already-disconnected site.
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');
        Mockery::mock('alias:Structura\Scheduler\Action_Scheduler_Service')
            ->shouldNotReceive('stop_all_campaign_pulses');

        $result = License_Manager::deactivate();

        $this->assertTrue($result);
        $this->assertSame([], $this->deleted_options);
    }

    /** @test */
    public function it_clears_the_persona_seed_flag_and_license_data_on_deactivate(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->once()
            ->andReturn(['key' => 'live_abc', 'api_token' => 'tok', 'status' => 'active']);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload) {
                return $endpoint === '/deactivateLicense'
                    && ($payload['domain'] ?? '') === 'example.com';
            })
            ->andReturn(['code' => 200, 'body' => ['success' => true], 'raw' => null]);

        Mockery::mock('alias:Structura\Scheduler\Action_Scheduler_Service')
            ->shouldReceive('stop_all_campaign_pulses')
            ->once();

        $result = License_Manager::deactivate();

        $this->assertTrue($result);
        // The seed flag MUST be cleared so the next activation re-seeds
        // a fresh workspace's default persona — the headline regression.
        $this->assertContains('structura_default_persona_seeded', $this->deleted_options);
        $this->assertContains('structura_license_data', $this->deleted_options);
    }
}
