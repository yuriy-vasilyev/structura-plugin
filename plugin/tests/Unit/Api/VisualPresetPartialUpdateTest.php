<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * `Rest_Api::sanitize_visual_content` on a partial save (2026-10-06).
 *
 * Bug: an update that omitted `medium`, `aspect_ratio`, `format` or
 * `optimize_on_upload` forwarded the defaults (`photography`, `16:9`,
 * `webp`, `false`), so a partial save replaced the stored values. On update
 * an omitted field stays out of the patch and the cloud keeps the stored
 * value; on create the defaults stay.
 *
 * @covers \Structura\Api\Rest_Api::update_visual_preset
 * @covers \Structura\Api\Rest_Api::create_visual_preset
 */
class VisualPresetPartialUpdateTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Functions\stubs([
            'rest_ensure_response' => function ($data) { return $data; },
        ]);
    }

    /**
     * Alias-mock Cloud_Client and capture the payload forwarded to `$route`.
     *
     * @param string $route    Cloud endpoint.
     * @param array  $captured Filled by reference with the payload.
     */
    private function mock_cloud_client(string $route, array &$captured): void
    {
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->with($route, Mockery::on(function ($payload) use (&$captured) {
                $captured = $payload;
                return true;
            }))
            ->andReturn([
                'code' => 200,
                'body' => ['success' => true, 'preset' => ['presetId' => 'p1']],
            ]);
    }

    /**
     * Minimal `WP_REST_Request` stand-in (PHP 7.4-compatible).
     *
     * @param array<string, mixed> $params JSON body.
     */
    private function make_request(array $params): object
    {
        return new class($params) implements \ArrayAccess {
            /** @var array<string, mixed> */
            private $params;
            /** @var array<string, mixed> */
            private $route = ['id' => 'p1'];

            public function __construct(array $params)
            {
                $this->params = $params;
            }

            /** @return array<string, mixed> */
            public function get_json_params(): array
            {
                return $this->params;
            }

            #[\ReturnTypeWillChange]
            public function offsetExists($offset): bool
            {
                return isset($this->route[$offset]);
            }

            #[\ReturnTypeWillChange]
            public function offsetGet($offset)
            {
                return $this->route[$offset] ?? null;
            }

            #[\ReturnTypeWillChange]
            public function offsetSet($offset, $value): void
            {
                $this->route[$offset] = $value;
            }

            #[\ReturnTypeWillChange]
            public function offsetUnset($offset): void
            {
                unset($this->route[$offset]);
            }
        };
    }

    /** @test */
    public function an_update_without_medium_aspect_format_or_optimize_leaves_them_out_of_the_patch(): void
    {
        $captured = [];
        $this->mock_cloud_client('/updateVisualPreset', $captured);

        (new Rest_Api())->update_visual_preset($this->make_request([
            'content' => ['global_art_direction' => 'Warm light'],
        ]));

        $this->assertSame('Warm light', $captured['content']['globalArtDirection']);
        foreach (['medium', 'aspectRatio', 'format', 'optimizeOnUpload'] as $key) {
            $this->assertArrayNotHasKey($key, $captured['content'], $key);
        }
    }

    /** @test */
    public function an_update_without_the_art_direction_leaves_the_stored_text_alone(): void
    {
        $captured = [];
        $this->mock_cloud_client('/updateVisualPreset', $captured);

        (new Rest_Api())->update_visual_preset($this->make_request([
            'content' => ['medium' => 'illustration'],
        ]));

        $this->assertSame('illustration', $captured['content']['medium']);
        $this->assertArrayNotHasKey('globalArtDirection', $captured['content']);
    }

    /** @test */
    public function a_create_without_the_art_direction_still_sends_an_empty_one(): void
    {
        $captured = [];
        $this->mock_cloud_client('/createVisualPreset', $captured);

        (new Rest_Api())->create_visual_preset($this->make_request([
            'name'    => 'Blank',
            'content' => ['medium' => 'illustration'],
        ]));

        $this->assertSame('', $captured['content']['globalArtDirection']);
    }

    /** @test */
    public function an_update_forwards_the_fields_it_was_sent_in_either_spelling(): void
    {
        $captured = [];
        $this->mock_cloud_client('/updateVisualPreset', $captured);

        (new Rest_Api())->update_visual_preset($this->make_request([
            'content' => [
                'aspectRatio'      => '4:3',
                'format'           => 'png',
                'optimizeOnUpload' => true,
                'medium'           => 'illustration',
            ],
        ]));

        $this->assertSame('4:3', $captured['content']['aspectRatio']);
        $this->assertSame('png', $captured['content']['format']);
        $this->assertTrue($captured['content']['optimizeOnUpload']);
        $this->assertSame('illustration', $captured['content']['medium']);
    }

    /** @test */
    public function an_update_drops_an_unknown_medium_instead_of_resetting_it(): void
    {
        $captured = [];
        $this->mock_cloud_client('/updateVisualPreset', $captured);

        (new Rest_Api())->update_visual_preset($this->make_request([
            'content' => ['medium' => 'watercolour'],
        ]));

        $this->assertArrayNotHasKey('medium', $captured['content']);
    }

    /** @test */
    public function a_create_without_those_fields_still_sends_the_defaults(): void
    {
        $captured = [];
        $this->mock_cloud_client('/createVisualPreset', $captured);

        (new Rest_Api())->create_visual_preset($this->make_request([
            'label'   => 'Brand',
            'content' => ['global_art_direction' => 'Warm light'],
        ]));

        $this->assertSame('photography', $captured['content']['medium']);
        $this->assertSame('16:9', $captured['content']['aspectRatio']);
        $this->assertSame('webp', $captured['content']['format']);
        $this->assertFalse($captured['content']['optimizeOnUpload']);
    }
}
