<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * `Rest_Api::sanitize_visual_content`: the preset's visual `signature`
 * (specs/visual-signatures.md §4, 2026-11-09).
 *
 * The proxy used to drop every key it did not know, so a signature picked
 * in wp-admin never reached the cloud. This suite pins:
 *
 *   1. **Forwarding** of a curated and a custom signature, sanitised and
 *      capped like the cloud caps them, on create and update.
 *   2. **`null` is forwarded** as `null`: it clears the stored signature
 *      back to the free prompt. An absent key stays absent, so an older SPA
 *      build keeps the stored signature.
 *   3. **Invalid shapes are refused** with a 400 before any cloud call.
 *   4. **The cloud's error code** (`plan_gated`) reaches the SPA, so a gated
 *      save can show its own message.
 *
 * @covers \Structura\Api\Rest_Api::update_visual_preset
 * @covers \Structura\Api\Rest_Api::create_visual_preset
 * @covers \Structura\Api\Rest_Api::list_visual_presets
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class VisualSignaturePassthroughTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Functions\stubs([
            'rest_ensure_response' => function ($data) { return $data; },
        ]);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /**
     * Expect one cloud call to `$route`, capture its payload and answer `$response`.
     *
     * @param array<string, mixed>|null $captured Filled by reference.
     * @param array<string, mixed>|null $response Cloud answer; a 200 success by default.
     */
    private function expect_cloud_call(string $route, ?array &$captured, ?array $response = null): void
    {
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->with($route, Mockery::on(function ($payload) use (&$captured) {
                $captured = $payload;
                return true;
            }))
            ->andReturn($response ?? [
                'code' => 200,
                'body' => ['success' => true, 'preset' => ['presetId' => 'p1']],
            ]);
    }

    private function expect_no_cloud_call(): void
    {
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->never();
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

    /**
     * Update the preset with `$content` and return the forwarded `content`.
     *
     * @param array<string, mixed> $content
     * @return array<string, mixed>
     */
    private function forward_update(array $content): array
    {
        $captured = null;
        $this->expect_cloud_call('/updateVisualPreset', $captured);

        (new Rest_Api())->update_visual_preset($this->make_request(['content' => $content]));

        return $captured['content'];
    }

    /** @return array<string, string> */
    private function custom_signature(array $overrides = []): array
    {
        return array_merge([
            'kind'        => 'custom',
            'name'        => 'Northfield sketchbook',
            'medium'      => 'illustration',
            'technique'   => 'Black ink linework, one flat fill colour',
            'motifs'      => 'Plants and leaves',
            'composition' => 'One hero object, centred',
            'avoid'       => 'Text and lettering',
        ], $overrides);
    }

    /** @test */
    public function it_forwards_a_curated_signature_on_update(): void
    {
        $content = $this->forward_update([
            'signature' => ['kind' => 'curated', 'id' => 'paper-cut', 'version' => 1],
        ]);

        $this->assertSame(['kind' => 'curated', 'id' => 'paper-cut', 'version' => 1], $content['signature']);
    }

    /** @test */
    public function it_reads_a_numeric_string_version_as_an_integer(): void
    {
        $content = $this->forward_update([
            'signature' => ['kind' => 'curated', 'id' => 'ink-and-fill', 'version' => '2'],
        ]);

        $this->assertSame(2, $content['signature']['version']);
    }

    /** @test */
    public function it_forwards_a_custom_signature_sanitised_and_capped(): void
    {
        $content = $this->forward_update([
            'signature' => $this->custom_signature([
                'name'      => '  <b>Northfield</b> sketchbook  ',
                'technique' => str_repeat('a', 1200),
                'motifs'    => "Plants\nand leaves <script>x</script>",
            ]),
        ]);

        $signature = $content['signature'];
        $this->assertSame('custom', $signature['kind']);
        $this->assertSame('Northfield sketchbook', $signature['name']);
        $this->assertSame('illustration', $signature['medium']);
        // The cloud caps each field at 1,000 characters (functions choice.ts).
        $this->assertSame(1000, strlen($signature['technique']));
        $this->assertStringNotContainsString('<script>', $signature['motifs']);
        $this->assertSame('One hero object, centred', $signature['composition']);
        $this->assertSame('Text and lettering', $signature['avoid']);
        $this->assertSame(
            ['kind', 'name', 'medium', 'technique', 'motifs', 'composition', 'avoid'],
            array_keys($signature)
        );
    }

    /** @test */
    public function it_caps_a_custom_name_at_eighty_characters(): void
    {
        $content = $this->forward_update([
            'signature' => $this->custom_signature(['name' => str_repeat('n', 120)]),
        ]);

        $this->assertSame(80, strlen($content['signature']['name']));
    }

    /** @test */
    public function it_forwards_null_to_clear_the_signature(): void
    {
        $content = $this->forward_update([
            'global_art_direction' => 'My own words',
            'signature'            => null,
        ]);

        $this->assertArrayHasKey('signature', $content);
        $this->assertNull($content['signature']);
        $this->assertSame('My own words', $content['globalArtDirection']);
    }

    /** @test */
    public function it_forwards_no_signature_when_the_caller_sent_none(): void
    {
        $content = $this->forward_update(['global_art_direction' => 'My own words']);

        // An older SPA save must keep the stored signature.
        $this->assertArrayNotHasKey('signature', $content);
    }

    /** @test */
    public function it_forwards_a_signature_on_create(): void
    {
        $captured = null;
        $this->expect_cloud_call('/createVisualPreset', $captured);

        (new Rest_Api())->create_visual_preset($this->make_request([
            'label'   => 'Default',
            'content' => [
                'global_art_direction' => '',
                'signature'            => ['kind' => 'curated', 'id' => 'editorial-reportage', 'version' => 1],
                'palette'              => ['#2F6B4F', '#C8553D'],
            ],
        ]));

        $this->assertSame('editorial-reportage', $captured['content']['signature']['id']);
        $this->assertSame(['#2F6B4F', '#C8553D'], $captured['content']['palette']);
    }

    /**
     * @return array<string, array{0: mixed}>
     */
    public function invalid_signatures(): array
    {
        return [
            'a string'                 => ['paper-cut'],
            'a number'                 => [3],
            'a list'                   => [['curated', 'paper-cut']],
            'kind free'                => [['kind' => 'free']],
            'an unknown kind'          => [['kind' => 'remix', 'id' => 'paper-cut']],
            'curated without version'  => [['kind' => 'curated', 'id' => 'paper-cut']],
            'curated with version 0'   => [['kind' => 'curated', 'id' => 'paper-cut', 'version' => 0]],
            'curated with a float'     => [['kind' => 'curated', 'id' => 'paper-cut', 'version' => 1.5]],
            'curated with a bad id'    => [['kind' => 'curated', 'id' => '../paper cut', 'version' => 1]],
            'custom with a bad medium' => [['medium' => 'oil_painting']],
            'custom without a name'    => [['name' => '   ']],
            'custom with empty motifs' => [['motifs' => '']],
            'custom with a list field' => [['avoid' => ['text']]],
        ];
    }

    /**
     * @test
     * @dataProvider invalid_signatures
     *
     * @param mixed $signature A whole signature, or overrides for a custom one.
     */
    public function it_refuses_an_invalid_signature_before_the_cloud($signature): void
    {
        $this->expect_no_cloud_call();
        $is_custom_override = is_array($signature)
            && ! array_key_exists('kind', $signature)
            && array_keys($signature) !== [0, 1];
        $value = $is_custom_override ? $this->custom_signature($signature) : $signature;

        $result = (new Rest_Api())->update_visual_preset($this->make_request([
            'content' => ['signature' => $value],
        ]));

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('invalid_signature', $result->get_error_code());
        $this->assertSame(400, $result->get_error_data()['status']);
    }

    /** @test */
    public function it_refuses_an_invalid_signature_on_create_too(): void
    {
        $this->expect_no_cloud_call();

        $result = (new Rest_Api())->create_visual_preset($this->make_request([
            'label'   => 'Default',
            'content' => ['signature' => ['kind' => 'curated', 'id' => 'paper-cut']],
        ]));

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame(400, $result->get_error_data()['status']);
    }

    /** @test */
    public function it_forwards_the_cloud_plan_gate_code_with_its_status(): void
    {
        $captured = null;
        $this->expect_cloud_call('/updateVisualPreset', $captured, [
            'code' => 403,
            'body' => [
                'success' => false,
                'error'   => 'That signature needs a paid plan.',
                'code'    => 'plan_gated',
            ],
        ]);

        $result = (new Rest_Api())->update_visual_preset($this->make_request([
            'content' => ['signature' => ['kind' => 'curated', 'id' => 'paper-cut', 'version' => 1]],
        ]));

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('cloud_error', $result->get_error_code());
        $this->assertSame('That signature needs a paid plan.', $result->get_error_message());
        $this->assertSame(['status' => 403, 'code' => 'plan_gated'], $result->get_error_data());
    }

    /**
     * The cloud returns the activation's stored thin-pass result with the
     * preset list (2026-11-09); the proxy must hand it to the SPA as is, so
     * the Visuals page shows the stored pick without running the pass again.
     *
     * @test
     */
    public function it_forwards_the_stored_suggestion_with_the_preset_list(): void
    {
        $body = [
            'success'          => true,
            'boundPresetId'    => 'p1',
            'presets'          => [['presetId' => 'p1', 'label' => 'Default']],
            'visualSuggestion' => [
                'pick'     => 'paper-cut',
                'runnerUp' => 'ink-and-fill',
                'reason'   => 'Warm and hand-made, like your seasonal planting guides.',
                'palette'  => ['#2F6B4F', '#C8553D'],
                'at'       => '2026-11-09T14:00:00.000Z',
            ],
        ];
        $captured = null;
        $this->expect_cloud_call('/listVisualPresets', $captured, ['code' => 200, 'body' => $body]);

        $result = (new Rest_Api())->list_visual_presets();

        $this->assertSame($body, $result);
    }

    /** @test */
    public function an_error_without_a_cloud_code_keeps_its_old_shape(): void
    {
        $captured = null;
        $this->expect_cloud_call('/updateVisualPreset', $captured, [
            'code' => 500,
            'body' => ['success' => false, 'error' => 'Failed to update preset.'],
        ]);

        $result = (new Rest_Api())->update_visual_preset($this->make_request([
            'content' => ['global_art_direction' => 'x'],
        ]));

        $this->assertSame(['status' => 500], $result->get_error_data());
    }
}
