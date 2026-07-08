<?php

namespace Structura\Tests\Unit\Scheduler;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Scheduler\Campaign_Cloud_Reader;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for Campaign_Cloud_Reader — the cloud-side analog of
 * Campaign_Repository::get_campaign_data() that Task_Runner falls through
 * to once `structura_campaigns_authoritative_in_cloud` is set.
 *
 * Covers:
 *   - License-not-activated → null (handshake gate)
 *   - Cloud unreachable → null (transport error)
 *   - Cloud non-200 → null (auth or server failure)
 *   - Cloud miss (empty body.campaign) → null
 *   - Cloud 200 → cluster-shape array via Campaign_Shape_Transformer
 *   - patch_campaign 200/non-200 paths (run-time mutation routing)
 *
 * @covers \Structura\Scheduler\Campaign_Cloud_Reader
 *
 * Uses `Mockery::mock('alias:…')` for the static dependencies. Aliased
 * mocks register a PHP class with that name in the current process and
 * can't be re-aliased; running each test in its own subprocess sidesteps
 * the "class already exists" collisions when the suite runs multiple
 * tests that mock the same target.
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class CampaignCloudReaderTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    protected function setUp(): void
    {
        parent::setUp();
        Functions\stubs([
            'home_url' => 'https://example.com',
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  get_campaign_data — read path
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function get_campaign_data_returns_null_when_license_payload_is_missing(): void
    {
        // No active license → the handshake gate fires before any cloud
        // call. Cloud must NEVER be invoked when we have no auth material.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(null);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        $this->assertNull(Campaign_Cloud_Reader::get_campaign_data('camp-abc'));
    }

    /** @test */
    public function get_campaign_data_returns_null_for_empty_campaign_id(): void
    {
        // Defensive: empty id is a bug at the caller — don't waste a cloud
        // round-trip looking it up. Same semantics as `get_post(0)`.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldNotReceive('get_license_payload');
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        $this->assertNull(Campaign_Cloud_Reader::get_campaign_data(''));
    }

    /** @test */
    public function get_campaign_data_returns_null_when_cloud_is_unreachable(): void
    {
        // Transport failure — wp_remote_post returned WP_Error. Caller
        // treats null as "skip step rather than retry forever," so this
        // path must not throw.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn(new \WP_Error('http_request_failed', 'Network down'));

        $this->assertNull(Campaign_Cloud_Reader::get_campaign_data('camp-abc'));
    }

    /** @test */
    public function get_campaign_data_returns_null_on_non_200(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn([
                'code' => 404,
                'body' => ['error' => 'Campaign not found.'],
                'raw'  => null,
            ]);

        $this->assertNull(Campaign_Cloud_Reader::get_campaign_data('camp-missing'));
    }

    /** @test */
    public function get_campaign_data_returns_null_when_body_campaign_is_empty(): void
    {
        // 200 OK but no campaign field — defensive against a degenerate
        // cloud response. Treat the same as a miss.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn([
                'code' => 200,
                'body' => ['campaign' => []],
                'raw'  => null,
            ]);

        $this->assertNull(Campaign_Cloud_Reader::get_campaign_data('camp-abc'));
    }

    /** @test */
    public function get_campaign_data_returns_cluster_shape_on_success(): void
    {
        // Happy path: cloud returns a flat CampaignDoc; reader hands back
        // the WP cluster shape downstream Task_Runner code expects. This
        // pins the wire-shape integration with Campaign_Shape_Transformer
        // — drift here would silently break every step on cloud-auth sites.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud_doc = [
            'campaignId'   => 'camp-abc',
            'name'         => 'Test Campaign',
            'objective'    => 'WordPress tutorials',
            'campaignMode' => 'traffic_magnet',
            'textProvider' => 'openai',
            'textModel'    => 'gpt-5.2',
            'imageProvider' => null,
            'imageModel'   => '',
            'fallbackTextProvider'  => null,
            'fallbackImageProvider' => null,
            'personaId'    => 7,
            'language'     => 'en',
            'replaceLongDashes' => true,
            'disableEmojis'     => false,
            'postLength'        => 1000,
            'seoRules'          => [],
            'enabledBlocks'     => ['core/paragraph'],
            'featuredImage'     => true,
            'bodyImages'        => false,
            'disclosureEnabled' => false,
            'disclosureText'    => '',
            'postStatus'        => 'publish',
            'categoryMode'      => 'auto',
            'allowedCategories' => [],
            'tagMode'           => 'auto',
            'allowedTags'       => [],
            'cronSchedule'      => '0 9 * * 1',
            'endMode'           => 'infinite',
            'endValue'          => null,
            'authorityDomains'  => [],
            'authorityDiscoveredAt' => null,
            'keywordBank'       => [],
            'keywordsDiscoveredAt' => null,
            'pregenerationEnabled' => true,
            'status'            => 'active',
            'postsPublished'    => 5,
        ];

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload) {
                return $endpoint === '/getCampaign'
                    && $payload['license_key'] === 'live_xxx'
                    && $payload['activation_secret'] === 'sek_yyy'
                    && $payload['campaign_id'] === 'camp-abc';
            })
            ->andReturn([
                'code' => 200,
                'body' => ['campaign' => $cloud_doc],
                'raw'  => null,
            ]);

        $cluster = Campaign_Cloud_Reader::get_campaign_data('camp-abc');

        $this->assertIsArray($cluster);
        $this->assertSame('camp-abc', $cluster['id']);
        $this->assertSame('Test Campaign', $cluster['identity']['name']);
        $this->assertSame('openai', $cluster['intelligence']['textProvider']);
        $this->assertSame(7, $cluster['intelligence']['personaId']);
        $this->assertSame('0 9 * * 1', $cluster['schedule']['cron']);
        $this->assertSame(5, $cluster['stats']['postsPublished']);
        $this->assertSame('active', $cluster['status']);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  patch_campaign — write path
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function patch_campaign_returns_false_for_empty_id_or_patch(): void
    {
        // Defensive: empty inputs are caller bugs. Don't waste a cloud
        // round-trip; return false so the caller can log and move on.
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        $this->assertFalse(Campaign_Cloud_Reader::patch_campaign('', ['x' => 1]));
        $this->assertFalse(Campaign_Cloud_Reader::patch_campaign('camp-abc', []));
    }

    /** @test */
    public function patch_campaign_returns_false_when_license_payload_is_missing(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(null);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        $this->assertFalse(
            Campaign_Cloud_Reader::patch_campaign('camp-abc', ['status' => 'paused'])
        );
    }

    /** @test */
    public function patch_campaign_sends_payload_and_returns_true_on_200(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload) {
                return $endpoint === '/patchCampaign'
                    && $payload['license_key'] === 'live_xxx'
                    && $payload['activation_secret'] === 'sek_yyy'
                    && $payload['campaign_id'] === 'camp-abc'
                    && $payload['campaign'] === ['postsPublished' => 12];
            })
            ->andReturn([
                'code' => 200,
                'body' => ['success' => true],
                'raw'  => null,
            ]);

        $this->assertTrue(
            Campaign_Cloud_Reader::patch_campaign('camp-abc', ['postsPublished' => 12])
        );
    }

    /** @test */
    public function patch_campaign_returns_false_on_non_200(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn([
                'code' => 500,
                'body' => ['error' => 'Internal'],
                'raw'  => null,
            ]);

        $this->assertFalse(
            Campaign_Cloud_Reader::patch_campaign('camp-abc', ['status' => 'completed'])
        );
    }

    /** @test */
    public function patch_campaign_returns_false_on_wp_error_transport(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn(new \WP_Error('http_request_failed', 'down'));

        $this->assertFalse(
            Campaign_Cloud_Reader::patch_campaign('camp-abc', ['status' => 'paused'])
        );
    }
}
