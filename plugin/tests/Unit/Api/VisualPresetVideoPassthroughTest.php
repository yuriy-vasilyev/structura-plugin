<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * `Rest_Api::update_visual_preset` — video-styling passthrough.
 *
 * Video styling moved onto the visual preset (video-visuals handoff,
 * 2026-07): the wp-admin SPA now sends `video_style`,
 * `video_art_direction`, `caption_placement`, and `palette` inside the
 * preset `content` payload. The plugin proxy's `sanitize_visual_content`
 * whitelist previously dropped unknown keys, which would silently strand
 * the new fields on the WP side — so this suite pins:
 *
 *   1. **Forwarding** — the four new fields reach the cloud payload
 *      (camelCase, per the cloud content contract), sanitized: style and
 *      placement validated against their enums, palette reduced to
 *      well-formed hex strings.
 *   2. **Absence is preserved** — a save WITHOUT video keys (an older
 *      SPA build, or an ineligible plan whose section never rendered)
 *      forwards NO video keys, so it can never clobber a preset's saved
 *      video styling with defaults during the rollout window.
 *   3. **Garbage is dropped, not forwarded** — an out-of-enum style or
 *      placement and non-hex palette entries never reach the cloud.
 *
 * @covers \Structura\Api\Rest_Api::update_visual_preset
 */
class VisualPresetVideoPassthroughTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Functions\stubs([
            'rest_ensure_response' => function ($data) { return $data; },
        ]);
    }

    /**
     * Alias-mock Cloud_Client and capture the `/updateVisualPreset`
     * payload the handler forwards.
     *
     * @param array $captured Filled by reference with the payload.
     */
    private function mock_cloud_client(array &$captured): void
    {
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->with('/updateVisualPreset', Mockery::on(function ($payload) use (&$captured) {
                $captured = $payload;
                return true;
            }))
            ->andReturn([
                'code' => 200,
                'body' => ['success' => true, 'preset' => ['presetId' => 'p1']],
            ]);
    }

    /**
     * Minimal `WP_REST_Request` stand-in: `get_json_params()` + the
     * ArrayAccess reads the handler uses for the route `id` param.
     * PHP 7.4-compatible.
     *
     * @param array<string, mixed> $params  JSON body.
     * @param array<string, mixed> $route   Route params (`id`).
     */
    private function make_request(array $params, array $route = ['id' => 'p1']): object
    {
        return new class($params, $route) implements \ArrayAccess {
            /** @var array<string, mixed> */
            private $params;
            /** @var array<string, mixed> */
            private $route;

            public function __construct(array $params, array $route)
            {
                $this->params = $params;
                $this->route  = $route;
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
    public function it_forwards_the_video_fields_camel_cased_and_sanitized(): void
    {
        $captured = [];
        $this->mock_cloud_client($captured);

        $api = new Rest_Api();
        $api->update_visual_preset($this->make_request([
            'content' => [
                'global_art_direction' => 'IMAGE STYLE',
                'aspect_ratio'         => '16:9',
                'format'               => 'webp',
                'optimize_on_upload'   => true,
                'medium'               => 'photography',
                'video_style'          => 'kinetic',
                'video_art_direction'  => 'FOOTAGE: real workplaces',
                'caption_placement'    => 'bottom',
                // Mixed palette: valid 6-digit, valid 3-digit, garbage.
                'palette'              => ['#B36D33', '#fff', 'not-a-color', '#11223344'],
            ],
        ]));

        $this->assertSame('kinetic', $captured['content']['videoStyle']);
        $this->assertSame('FOOTAGE: real workplaces', $captured['content']['videoArtDirection']);
        $this->assertSame('bottom', $captured['content']['captionPlacement']);
        // Palette keeps only well-formed #RGB / #RRGGBB entries.
        $this->assertSame(['#B36D33', '#fff'], $captured['content']['palette']);
    }

    /** @test */
    public function it_forwards_no_video_keys_when_the_caller_sent_none(): void
    {
        $captured = [];
        $this->mock_cloud_client($captured);

        $api = new Rest_Api();
        $api->update_visual_preset($this->make_request([
            'content' => [
                'global_art_direction' => 'IMAGE STYLE',
                'aspect_ratio'         => '16:9',
                'format'               => 'webp',
                'optimize_on_upload'   => true,
            ],
        ]));

        // Rollout back-compat: an older SPA save must leave the preset's
        // video styling untouched — absent keys, not defaulted keys.
        $this->assertArrayNotHasKey('videoStyle', $captured['content']);
        $this->assertArrayNotHasKey('videoArtDirection', $captured['content']);
        $this->assertArrayNotHasKey('captionPlacement', $captured['content']);
        $this->assertArrayNotHasKey('palette', $captured['content']);
    }

    /** @test */
    public function it_drops_out_of_enum_style_and_placement_values(): void
    {
        $captured = [];
        $this->mock_cloud_client($captured);

        $api = new Rest_Api();
        $api->update_visual_preset($this->make_request([
            'content' => [
                'global_art_direction' => 'IMAGE STYLE',
                'aspect_ratio'         => '16:9',
                'format'               => 'webp',
                'optimize_on_upload'   => true,
                'video_style'          => 'vaporwave',
                'caption_placement'    => 'diagonal',
            ],
        ]));

        $this->assertArrayNotHasKey('videoStyle', $captured['content']);
        $this->assertArrayNotHasKey('captionPlacement', $captured['content']);
    }
}
