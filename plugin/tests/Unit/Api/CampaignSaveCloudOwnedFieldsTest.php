<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * Wire contract for cloud-owned fields on the campaign create and update
 * proxies.
 *
 * 2026-10-02: saving the edit form re-activated a paused campaign and reset
 * its progress, because the validator drops `status`, `posts_published`,
 * `keyword_queue_index`, `last_run_timestamp` and both discovery stamps and
 * the transformer filled defaults. An update now carries each only when the
 * request does; the cloud merges the patch and keeps the stored value.
 * The "with" cases use non-zero values, so a reset to 0 or null fails them.
 *
 * @covers \Structura\Api\Rest_Api::update_campaign
 * @covers \Structura\Api\Rest_Api::create_campaign
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class CampaignSaveCloudOwnedFieldsTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** @return array<string, mixed>|null The `campaign` patch sent to the cloud. */
    private function run_save(string $method, string $endpoint, array $body): ?array
    {
        $captured = null;
        Mockery::mock('alias:Structura\Core\License_Manager')
            ->shouldReceive('get_license_data')->andReturn(['license_key' => 'ST-TEST-KEY']);
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')->andReturn(['secret' => 's3']);
        Mockery::mock('alias:Structura\Scheduler\Campaign_Validator')
            ->shouldReceive('validate')
            ->andReturnUsing(static function ($params) {
                // Like the real validator, drop the cloud-owned fields.
                foreach (['status', 'posts_published', 'keyword_queue_index', 'last_run_timestamp',
                    'authority_discovered_at', 'keywords_discovered_at'] as $dropped) {
                    unset($params[$dropped]);
                }
                return $params;
            });
        $sync = Mockery::mock('alias:Structura\Scheduler\Cloud_Cadence_Sync');
        $sync->shouldReceive('invalidate_cache');
        $sync->shouldReceive('queue_immediate_sync');
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->with($endpoint, Mockery::on(function ($p) use (&$captured) {
                $captured = $p['campaign'] ?? null;
                return true;
            }))
            ->andReturn([
                'code' => 200,
                'body' => ['success' => true, 'campaign' => ['campaignId' => 'c1']],
                'raw'  => null,
            ]);

        Functions\when('home_url')->justReturn('https://site.test');
        Functions\when('wp_parse_url')->justReturn('site.test');
        Functions\when('rest_ensure_response')->returnArg(1);
        Functions\when('is_wp_error')->alias(fn($v) => $v instanceof \WP_Error);

        $rest = new Rest_Api();
        $rest->$method($this->make_request(['id' => 'c1'], $body));

        return $captured;
    }

    /** @test */
    public function an_update_without_status_leaves_the_stored_status_alone(): void
    {
        $patch = $this->run_save('update_campaign', '/patchCampaign', [
            'name'          => 'Paused one',
            'text_provider' => 'openai',
        ]);

        $this->assertIsArray($patch);
        $this->assertSame('openai', $patch['textProvider']);
        $this->assertArrayNotHasKey('status', $patch);
    }

    /** @test */
    public function an_update_with_an_explicit_status_still_changes_it(): void
    {
        $patch = $this->run_save('update_campaign', '/patchCampaign', [
            'name'   => 'Paused one',
            'status' => 'paused',
        ]);

        $this->assertSame('paused', $patch['status']);
    }

    /** @return array<string, array{string, string, mixed}> cloud key, request key, a non-default value */
    public function cloud_owned_fields(): array
    {
        return [
            'postsPublished'        => ['postsPublished', 'posts_published', 7],
            'keywordQueueIndex'     => ['keywordQueueIndex', 'keyword_queue_index', 12],
            'lastRunTimestamp'      => ['lastRunTimestamp', 'last_run_timestamp', 1790934371],
            'authorityDiscoveredAt' => ['authorityDiscoveredAt', 'authority_discovered_at', '2026-09-30T10:00:00Z'],
            'keywordsDiscoveredAt'  => ['keywordsDiscoveredAt', 'keywords_discovered_at', '2026-09-29T08:00:00Z'],
        ];
    }

    /**
     * @test
     * @dataProvider cloud_owned_fields
     */
    public function an_update_without_the_field_leaves_the_stored_value_alone(string $cloud_key): void
    {
        $patch = $this->run_save('update_campaign', '/patchCampaign', ['name' => 'Running one']);

        $this->assertIsArray($patch);
        $this->assertArrayNotHasKey($cloud_key, $patch);
    }

    /**
     * @test
     * @dataProvider cloud_owned_fields
     */
    public function an_update_that_carries_the_field_sends_its_value($cloud_key, $request_key, $value): void
    {
        $patch = $this->run_save('update_campaign', '/patchCampaign', [
            'name'       => 'Running one',
            $request_key => $value,
        ]);

        $this->assertSame($value, $patch[$cloud_key]);
    }

    /** @test */
    public function a_create_keeps_its_defaults(): void
    {
        $patch = $this->run_save('create_campaign', '/postCampaign', ['name' => 'New one']);

        $this->assertSame('active', $patch['status']);
        $this->assertSame(0, $patch['postsPublished']);
        $this->assertSame(0, $patch['keywordQueueIndex']);
        $this->assertNull($patch['lastRunTimestamp']);
        $this->assertNull($patch['authorityDiscoveredAt']);
        $this->assertNull($patch['keywordsDiscoveredAt']);
    }

    /** @param array<string, mixed> $url_params @param array<string, mixed> $json */
    private function make_request(array $url_params, array $json): object
    {
        return new class($url_params, $json) implements \ArrayAccess {
            /** @var array<string, mixed> */
            private $url_params;
            /** @var array<string, mixed> */
            private $json;

            public function __construct(array $url_params, array $json)
            {
                $this->url_params = $url_params;
                $this->json       = $json;
            }

            /** @return array<string, mixed> */
            public function get_json_params(): array
            {
                return $this->json;
            }

            #[\ReturnTypeWillChange]
            public function offsetExists($offset)
            {
                return isset($this->url_params[$offset]);
            }

            #[\ReturnTypeWillChange]
            public function offsetGet($offset)
            {
                return $this->url_params[$offset] ?? null;
            }

            #[\ReturnTypeWillChange]
            public function offsetSet($offset, $value)
            {
                $this->url_params[$offset] = $value;
            }

            #[\ReturnTypeWillChange]
            public function offsetUnset($offset)
            {
                unset($this->url_params[$offset]);
            }
        };
    }
}
