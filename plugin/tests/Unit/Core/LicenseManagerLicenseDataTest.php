<?php

namespace Structura\Tests\Unit\Core;

use Mockery;
use Structura\Core\License_Manager;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for {@see License_Manager::get_license_data()} and
 * {@see License_Manager::is_anonymous_workspace()}.
 *
 * `get_license_data()` is the license slice of BOTH the `/settings`
 * REST payload and the `bootstrap_settings` inline config. Since
 * 2026-06-06 it also carries `provider_count_cap` and `is_anonymous`
 * so the SPA can re-derive both REACTIVELY after an in-SPA license
 * activation — the `structuraConfig` inline snapshot can't change
 * without a page render, which kept the anonymous 1-provider cap
 * alive after a paid key was activated through the wizard's license
 * gate or Account & License. These tests pin the wire contract per
 * tier.
 *
 * @covers \Structura\Core\License_Manager::get_license_data
 * @covers \Structura\Core\License_Manager::is_anonymous_workspace
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class LicenseManagerLicenseDataTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** Alias-mock Key_Manager to return a fixed payload. */
    private function mock_payload(?array $payload): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn($payload);
    }

    /** @test */
    public function anonymous_workspace_reports_cap_1_and_is_anonymous_true(): void
    {
        // Post-bootstrap, pre-claim: api_token bound, no `key` field,
        // so the plan resolves to 'none'.
        $this->mock_payload(['api_token' => 'tok_anon', 'status' => 'active', 'plan' => 'none']);

        $data = License_Manager::get_license_data();

        $this->assertSame('none', $data['plan']);
        $this->assertSame(1, $data['provider_count_cap']);
        $this->assertTrue($data['is_anonymous']);
    }

    /** @test */
    public function paid_byok_license_reports_cap_3_and_is_anonymous_false(): void
    {
        $this->mock_payload([
            'key'       => 'ST-TEST-1234',
            'api_token' => 'tok_paid',
            'status'    => 'active',
            'plan'      => 'byok',
        ]);

        $data = License_Manager::get_license_data();

        $this->assertSame('byok', $data['plan']);
        $this->assertSame(3, $data['provider_count_cap']);
        $this->assertFalse($data['is_anonymous']);
        // Payload predates the audience cache → surfaced as null so
        // the SPA falls back to the cloud heartbeat.
        $this->assertNull($data['audience']);
    }

    /** @test */
    public function cached_workspace_audience_is_surfaced_alongside_the_plan(): void
    {
        // Cached at activation / heartbeat time (2026-06-07) so the
        // SPA's plan badge renders "Cloud Individual" on first paint
        // instead of flashing the name-only label until the heartbeat.
        $this->mock_payload([
            'key'       => 'ST-TEST-5678',
            'api_token' => 'tok_cloud',
            'status'    => 'active',
            'plan'      => 'cloud',
            'audience'  => 'individual',
        ]);

        $data = License_Manager::get_license_data();

        $this->assertSame('cloud', $data['plan']);
        $this->assertSame('individual', $data['audience']);
    }

    /** @test */
    public function free_license_reports_cap_2(): void
    {
        $this->mock_payload([
            'key'       => 'ST-FREE-1234',
            'api_token' => 'tok_free',
            'status'    => 'active',
            'plan'      => 'free',
        ]);

        $data = License_Manager::get_license_data();

        $this->assertSame(2, $data['provider_count_cap']);
        $this->assertFalse($data['is_anonymous']);
    }

    /** @test */
    public function fresh_install_with_no_payload_is_not_anonymous(): void
    {
        // Pre-bootstrap: no payload at all. `is_anonymous` must be
        // false — "anonymous" means a SUCCESSFUL anonymous bootstrap
        // (api_token bound), not merely the absence of a license.
        $this->mock_payload(null);

        $data = License_Manager::get_license_data();

        $this->assertSame('none', $data['plan']);
        $this->assertSame(1, $data['provider_count_cap']);
        $this->assertFalse($data['is_anonymous']);
    }
}
