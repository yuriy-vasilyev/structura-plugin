<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * `Rest_Api::sanitize_visual_content` — the EU AI label switch
 * (specs/ai-image-label.md, 2026-10-05).
 *
 * The visual preset gains `aiLabel`. The wp-admin SPA will send it as
 * `ai_label` (the snake_case the other preset fields use) or `aiLabel`; the
 * proxy forwards it camelCased, per the cloud content contract. This suite
 * pins:
 *
 *   1. **Forwarding** on create and update, both spellings.
 *   2. **Absence is preserved** — a save without the key forwards no key, so
 *      an older SPA build can never switch a preset's label off. (`medium`
 *      defaults to `photography` on create only; VisualPresetPartialUpdateTest.)
 *   3. **Strict boolean** — anything but a JSON boolean is dropped, never
 *      coerced: `"false"` must not become `true`.
 *
 * @covers \Structura\Api\Rest_Api::update_visual_preset
 * @covers \Structura\Api\Rest_Api::create_visual_preset
 */
class VisualPresetAiLabelPassthroughTest extends TestCase
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
     * @param string $route    Cloud endpoint, e.g. `/updateVisualPreset`.
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
     * @param array<string, mixed> $route  Route params (`id`).
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

    /** @return array<string, mixed> */
    private function content(array $extra = []): array
    {
        return array_merge([
            'global_art_direction' => 'IMAGE STYLE',
            'aspect_ratio'         => '16:9',
            'format'               => 'webp',
            'optimize_on_upload'   => true,
        ], $extra);
    }

    /** @test */
    public function it_forwards_ai_label_on_update_camel_cased(): void
    {
        $captured = [];
        $this->mock_cloud_client('/updateVisualPreset', $captured);

        (new Rest_Api())->update_visual_preset($this->make_request([
            'content' => $this->content(['ai_label' => true]),
        ]));

        $this->assertTrue($captured['content']['aiLabel']);
        $this->assertArrayNotHasKey('ai_label', $captured['content']);
    }

    /** @test */
    public function it_forwards_a_camel_cased_false(): void
    {
        $captured = [];
        $this->mock_cloud_client('/updateVisualPreset', $captured);

        (new Rest_Api())->update_visual_preset($this->make_request([
            'content' => $this->content(['aiLabel' => false]),
        ]));

        $this->assertFalse($captured['content']['aiLabel']);
    }

    /** @test */
    public function it_forwards_ai_label_on_create(): void
    {
        $captured = [];
        $this->mock_cloud_client('/createVisualPreset', $captured);

        (new Rest_Api())->create_visual_preset($this->make_request([
            'label'   => 'Brand',
            'content' => $this->content(['ai_label' => true]),
        ]));

        $this->assertTrue($captured['content']['aiLabel']);
    }

    /** @test */
    public function it_forwards_no_ai_label_when_the_caller_sent_none(): void
    {
        $captured = [];
        $this->mock_cloud_client('/updateVisualPreset', $captured);

        (new Rest_Api())->update_visual_preset($this->make_request([
            'content' => $this->content(),
        ]));

        // An older SPA save must leave the stored label untouched.
        $this->assertArrayNotHasKey('aiLabel', $captured['content']);
    }

    /** @test */
    public function it_drops_a_non_boolean_ai_label_instead_of_coercing_it(): void
    {
        foreach (['false', 'true', 1, 0, null] as $value) {
            $captured = [];
            Mockery::close();
            $this->mock_cloud_client('/updateVisualPreset', $captured);

            (new Rest_Api())->update_visual_preset($this->make_request([
                'content' => $this->content(['ai_label' => $value]),
            ]));

            $this->assertArrayNotHasKey('aiLabel', $captured['content'], var_export($value, true));
        }
    }
}
