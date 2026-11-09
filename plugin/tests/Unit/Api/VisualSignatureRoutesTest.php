<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * The two visual-signature proxies (specs/visual-signatures.md §6, §8):
 *
 *   - `POST /visual-signature/suggest` → cloud `/suggestVisualSignature`:
 *     the thin pass, `{ locale? }` in, the cloud's answer out unchanged.
 *   - `POST /visual-signature/preview` → cloud `/previewVisualSignature`:
 *     the unsaved choice and palette mapped to camelCase, a 120 s budget,
 *     and the cloud's status and code forwarded on a refusal.
 *
 * The real License_Manager runs against a staged license payload
 * (Key_Manager is the storage edge); Cloud_Client is the network edge.
 *
 * @covers \Structura\Api\Rest_Api::suggest_visual_signature
 * @covers \Structura\Api\Rest_Api::preview_visual_signature
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class VisualSignatureRoutesTest extends TestCase
{
    private const CONNECTED_PAYLOAD = [
        'key'           => 'ST-TEST-KEY',
        'api_token'     => 'tok_live',
        'activation_id' => 'act_1',
    ];

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

    /** @param array<string, mixed>|null $payload */
    private function stage_license_payload(?array $payload): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn($payload);
    }

    /**
     * Expect one cloud call to `$route`; capture its payload and request args.
     *
     * @param array<string, mixed>      $response Cloud answer (`code` + `body`).
     * @param array<string, mixed>|null $captured Filled by reference.
     * @param array<string, mixed>|null $args     Filled by reference.
     */
    private function expect_cloud_call(string $route, array $response, ?array &$captured, ?array &$args = null): void
    {
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->with(
                $route,
                Mockery::on(function ($payload) use (&$captured) {
                    $captured = $payload;
                    return true;
                }),
                Mockery::on(function ($request_args) use (&$args) {
                    $args = $request_args;
                    return true;
                })
            )
            ->andReturn($response + ['raw' => null]);
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
    private function make_request(array $params = []): object
    {
        return new class($params) {
            /** @var array<string, mixed> */
            private $params;

            public function __construct(array $params)
            {
                $this->params = $params;
            }

            /** @return array<string, mixed> */
            public function get_json_params(): array
            {
                return $this->params;
            }
        };
    }

    // ── Suggest ────────────────────────────────────────────────────────

    /** @test */
    public function suggest_forwards_the_locale_and_returns_the_cloud_answer_unchanged(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $body = [
            'suggestion'   => [
                'pick'     => 'paper-cut',
                'runnerUp' => 'ink-and-fill',
                'reason'   => 'Warm and hand-made, like your seasonal planting guides.',
                'palette'  => ['#2F6B4F', '#C8553D'],
            ],
            'homepageRead' => true,
        ];
        $captured = null;
        $args     = null;
        $this->expect_cloud_call('/suggestVisualSignature', ['code' => 200, 'body' => $body], $captured, $args);

        $result = (new Rest_Api())->suggest_visual_signature($this->make_request(['locale' => 'de']));

        $this->assertSame($body, $result);
        $this->assertSame('de', $captured['locale']);
        $this->assertSame(60, $args['timeout']);
    }

    /** @test */
    public function suggest_drops_a_malformed_locale(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $captured = null;
        $this->expect_cloud_call(
            '/suggestVisualSignature',
            ['code' => 200, 'body' => ['suggestion' => null, 'homepageRead' => false, 'reason' => 'error']],
            $captured
        );

        $result = (new Rest_Api())->suggest_visual_signature(
            $this->make_request(['locale' => '<script>de</script>'])
        );

        $this->assertArrayNotHasKey('locale', $captured);
        // A degraded pass is still a 200 with `suggestion: null`.
        $this->assertNull($result['suggestion']);
        $this->assertSame('error', $result['reason']);
    }

    /** @test */
    public function suggest_forwards_the_rate_limit_with_its_status_and_code(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $captured = null;
        $this->expect_cloud_call('/suggestVisualSignature', [
            'code' => 429,
            'body' => [
                'suggestion' => null,
                'reason'     => 'rate_limited',
                'error'      => 'Too many AI requests from this workspace.',
                'code'       => 'ai_rate_limited',
            ],
        ], $captured);

        $result = (new Rest_Api())->suggest_visual_signature($this->make_request());

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('Too many AI requests from this workspace.', $result->get_error_message());
        $this->assertSame(['status' => 429, 'code' => 'ai_rate_limited'], $result->get_error_data());
    }

    /** @test */
    public function suggest_answers_502_when_the_cloud_is_unreachable(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->once()
            ->andReturn(new \WP_Error('http_request_failed', 'cURL error 28'));

        $result = (new Rest_Api())->suggest_visual_signature($this->make_request());

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('cloud_unreachable', $result->get_error_code());
        $this->assertSame(502, $result->get_error_data()['status']);
    }

    /** @test */
    public function suggest_is_refused_before_the_cloud_without_a_connection(): void
    {
        $this->stage_license_payload(null);
        $this->expect_no_cloud_call();

        $result = (new Rest_Api())->suggest_visual_signature($this->make_request());

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('no_workspace', $result->get_error_code());
    }

    // ── Preview ────────────────────────────────────────────────────────

    /** @test */
    public function preview_maps_a_curated_choice_and_palette_with_a_120s_budget(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $body     = ['success' => true, 'imageUrl' => 'https://cdn.test/p.webp', 'concept' => 'A seed packet'];
        $captured = null;
        $args     = null;
        $this->expect_cloud_call('/previewVisualSignature', ['code' => 200, 'body' => $body], $captured, $args);

        $result = (new Rest_Api())->preview_visual_signature($this->make_request([
            'signature' => ['kind' => 'curated', 'id' => 'paper-cut', 'version' => 1],
            'palette'   => ['#2F6B4F', 'not-a-colour', '#c8553d'],
        ]));

        $this->assertSame($body, $result);
        $this->assertSame(['kind' => 'curated', 'id' => 'paper-cut', 'version' => 1], $captured['signature']);
        $this->assertSame(['#2F6B4F', '#c8553d'], $captured['palette']);
        $this->assertArrayNotHasKey('globalArtDirection', $captured);
        $this->assertSame(120, $args['timeout']);
    }

    /** @test */
    public function preview_maps_a_free_prompt_to_camel_case(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $captured = null;
        $this->expect_cloud_call(
            '/previewVisualSignature',
            ['code' => 200, 'body' => ['success' => true, 'imageUrl' => 'u', 'concept' => 'c']],
            $captured
        );

        (new Rest_Api())->preview_visual_signature($this->make_request([
            'signature'            => null,
            'global_art_direction' => "Soft window light <b>muted</b>\nlinen",
            'medium'               => 'illustration',
        ]));

        $this->assertArrayHasKey('signature', $captured);
        $this->assertNull($captured['signature']);
        $this->assertSame("Soft window light muted\nlinen", $captured['globalArtDirection']);
        $this->assertSame('illustration', $captured['medium']);
        $this->assertArrayNotHasKey('global_art_direction', $captured);
        $this->assertArrayNotHasKey('palette', $captured);
    }

    /** @test */
    public function preview_drops_an_unknown_medium(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $captured = null;
        $this->expect_cloud_call(
            '/previewVisualSignature',
            ['code' => 200, 'body' => ['success' => true, 'imageUrl' => 'u', 'concept' => 'c']],
            $captured
        );

        (new Rest_Api())->preview_visual_signature($this->make_request([
            'global_art_direction' => 'Ink',
            'medium'               => 'watercolour',
        ]));

        $this->assertArrayNotHasKey('medium', $captured);
    }

    /** @test */
    public function preview_sanitises_a_custom_signature(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $captured = null;
        $this->expect_cloud_call(
            '/previewVisualSignature',
            ['code' => 200, 'body' => ['success' => true, 'imageUrl' => 'u', 'concept' => 'c']],
            $captured
        );

        (new Rest_Api())->preview_visual_signature($this->make_request([
            'signature' => [
                'kind'        => 'custom',
                'name'        => 'Sketchbook <i>v2</i>',
                'medium'      => '3d_render',
                'technique'   => 'Matte clay materials',
                'motifs'      => 'Tiny workers',
                'composition' => 'Isometric view',
                'avoid'       => 'Gradients',
            ],
        ]));

        $this->assertSame('Sketchbook v2', $captured['signature']['name']);
        $this->assertSame('3d_render', $captured['signature']['medium']);
    }

    /** @test */
    public function preview_refuses_an_invalid_signature_before_the_cloud(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $this->expect_no_cloud_call();

        $result = (new Rest_Api())->preview_visual_signature($this->make_request([
            'signature' => ['kind' => 'custom', 'name' => 'Half done', 'medium' => 'photography'],
        ]));

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('invalid_signature', $result->get_error_code());
        $this->assertSame(400, $result->get_error_data()['status']);
    }

    /** @test */
    public function preview_forwards_the_plan_gate_with_its_status_and_code(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $captured = null;
        $this->expect_cloud_call('/previewVisualSignature', [
            'code' => 403,
            'body' => [
                'success' => false,
                'code'    => 'permission-denied',
                'error'   => 'That style comes with paid plans.',
            ],
        ], $captured);

        $result = (new Rest_Api())->preview_visual_signature($this->make_request([
            'signature' => ['kind' => 'curated', 'id' => 'miniature-world', 'version' => 1],
        ]));

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('That style comes with paid plans.', $result->get_error_message());
        $this->assertSame(['status' => 403, 'code' => 'permission-denied'], $result->get_error_data());
    }

    /** @test */
    public function preview_is_refused_before_the_cloud_without_a_connection(): void
    {
        $this->stage_license_payload(null);
        $this->expect_no_cloud_call();

        $result = (new Rest_Api())->preview_visual_signature($this->make_request([
            'signature' => ['kind' => 'curated', 'id' => 'paper-cut', 'version' => 1],
        ]));

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('no_workspace', $result->get_error_code());
    }

    /** @test */
    public function both_routes_are_registered_behind_the_admin_permission_check(): void
    {
        $routes = [];
        Functions\when('register_rest_route')->alias(function ($namespace, $route, $args) use (&$routes) {
            $routes[$route][] = $args;
        });

        (new Rest_Api())->register_routes();

        foreach (['/visual-signature/suggest', '/visual-signature/preview'] as $route) {
            $this->assertArrayHasKey($route, $routes, $route);
            $this->assertSame('POST', $routes[$route][0]['methods']);
            $this->assertSame('check_permission', $routes[$route][0]['permission_callback'][1]);
        }
        $this->assertSame('suggest_visual_signature', $routes['/visual-signature/suggest'][0]['callback'][1]);
        $this->assertSame('preview_visual_signature', $routes['/visual-signature/preview'][0]['callback'][1]);
    }
}
