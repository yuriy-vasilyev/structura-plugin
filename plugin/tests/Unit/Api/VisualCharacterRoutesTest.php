<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Api\Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * The recurring character's proxies (specs/visual-signatures.md §13.12):
 *
 *   - the six routes under `/visual-presets/{id}/character` → the cloud's
 *     bearer twins (`uploadVisualCharacterImage` and the rest), each behind
 *     the admin permission check, sanitised at this boundary, with the
 *     cloud's status and error key forwarded on a refusal;
 *   - `appearance` and `character` on the preset update and the preview,
 *     forwarded only when sent, the update's never on create;
 *   - an error key from the cloud keeping its case and dot under `code`.
 *
 * The real License_Manager runs against a staged license payload
 * (Key_Manager is the storage edge); Cloud_Client is the network edge.
 *
 * @covers \Structura\Api\Rest_Api::upload_visual_character_image
 * @covers \Structura\Api\Rest_Api::remove_visual_character_image
 * @covers \Structura\Api\Rest_Api::draft_visual_character_description
 * @covers \Structura\Api\Rest_Api::draw_visual_character_sheet
 * @covers \Structura\Api\Rest_Api::approve_visual_character_sheet
 * @covers \Structura\Api\Rest_Api::remove_visual_character
 * @covers \Structura\Api\Rest_Api::update_visual_preset
 * @covers \Structura\Api\Rest_Api::create_visual_preset
 * @covers \Structura\Api\Rest_Api::preview_visual_signature
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class VisualCharacterRoutesTest extends TestCase
{
    private const CONNECTED_PAYLOAD = [
        'key'           => 'ST-TEST-KEY',
        'api_token'     => 'tok_live',
        'activation_id' => 'act_1',
    ];

    private const PNG_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    protected function setUp(): void
    {
        parent::setUp();

        Functions\stubs([
            'rest_ensure_response' => function ($data) { return $data; },
            'absint'               => function ($value) { return abs((int) $value); },
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
            ->withArgs(function ($called, $payload, $request_args = []) use ($route, &$captured, &$args) {
                $captured = $payload;
                $args     = $request_args;
                return $called === $route;
            })
            ->andReturn($response + ['raw' => null]);
    }

    private function expect_no_cloud_call(): void
    {
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldReceive('post')
            ->never();
    }

    /**
     * Minimal `WP_REST_Request` stand-in (PHP 7.4-compatible): a JSON body
     * plus route params read with array access.
     *
     * @param array<string, mixed> $params JSON body.
     * @param array<string, mixed> $route  URL params.
     */
    private function make_request(array $params = [], array $route = ['id' => 'p1']): object
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

    // ── Routes ─────────────────────────────────────────────────────────

    /** @test */
    public function the_six_routes_are_registered_behind_the_admin_permission_check(): void
    {
        $routes = [];
        Functions\when('register_rest_route')->alias(function ($namespace, $route, $args) use (&$routes) {
            $routes[$route][] = $args;
        });

        (new Rest_Api())->register_routes();

        $expected = [
            '/visual-presets/(?P<id>[\w-]+)/character/images'                  => ['POST', 'upload_visual_character_image'],
            '/visual-presets/(?P<id>[\w-]+)/character/images/(?P<index>\d+)'   => ['DELETE', 'remove_visual_character_image'],
            '/visual-presets/(?P<id>[\w-]+)/character/description'             => ['POST', 'draft_visual_character_description'],
            '/visual-presets/(?P<id>[\w-]+)/character/sheet'                   => ['POST', 'draw_visual_character_sheet'],
            '/visual-presets/(?P<id>[\w-]+)/character/sheet/approve'           => ['POST', 'approve_visual_character_sheet'],
            '/visual-presets/(?P<id>[\w-]+)/character'                         => ['DELETE', 'remove_visual_character'],
        ];
        foreach ($expected as $route => [$method, $callback]) {
            $this->assertArrayHasKey($route, $routes, $route);
            $this->assertSame($method, $routes[$route][0]['methods'], $route);
            $this->assertSame($callback, $routes[$route][0]['callback'][1], $route);
            $this->assertSame('check_permission', $routes[$route][0]['permission_callback'][1], $route);
        }
    }

    /** @test */
    public function every_route_is_refused_before_the_cloud_without_a_connection(): void
    {
        $this->stage_license_payload(null);
        $this->expect_no_cloud_call();
        $api = new Rest_Api();
        $request = $this->make_request(
            ['kind' => 'person', 'data_uri' => self::PNG_URI, 'signature' => null, 'confirmed' => true],
            ['id' => 'p1', 'index' => '0']
        );

        foreach ([
            'upload_visual_character_image',
            'remove_visual_character_image',
            'draft_visual_character_description',
            'draw_visual_character_sheet',
            'approve_visual_character_sheet',
            'remove_visual_character',
        ] as $handler) {
            $result = $api->$handler($request);
            $this->assertInstanceOf(\WP_Error::class, $result, $handler);
            $this->assertSame('no_workspace', $result->get_error_code(), $handler);
        }
    }

    // ── Upload ─────────────────────────────────────────────────────────

    /** @test */
    public function upload_forwards_the_kind_and_data_uri_for_the_route_preset_with_a_60s_budget(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $body     = ['success' => true, 'draft' => ['kind' => 'person', 'images' => [['url' => 'https://signed.test/u1']]]];
        $captured = null;
        $args     = null;
        $this->expect_cloud_call('/uploadVisualCharacterImage', ['code' => 200, 'body' => $body], $captured, $args);

        $result = (new Rest_Api())->upload_visual_character_image(
            $this->make_request(['kind' => 'person', 'data_uri' => self::PNG_URI, 'path' => 'x/evil.png'], ['id' => 'p<b>1</b>'])
        );

        $this->assertSame($body, $result);
        $this->assertSame(['presetId' => 'p1', 'kind' => 'person', 'dataUri' => self::PNG_URI], $captured);
        $this->assertSame(60, $args['timeout']);
    }

    /** @test */
    public function upload_refuses_a_bad_kind_another_type_or_an_oversized_image_before_the_cloud(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $this->expect_no_cloud_call();
        $api = new Rest_Api();

        $kind = $api->upload_visual_character_image($this->make_request(['kind' => 'team', 'data_uri' => self::PNG_URI]));
        $this->assertSame('invalid_character', $kind->get_error_code());
        $this->assertSame(400, $kind->get_error_data()['status']);

        foreach ([
            'data:image/heic;base64,AAAA',
            'data:image/svg+xml;base64,PHN2Zz4=',
            'https://example.com/photo.jpg',
            'data:image/png;base64,iVBOR<script>w0K',
        ] as $uri) {
            $wrong = $api->upload_visual_character_image($this->make_request(['kind' => 'person', 'data_uri' => $uri]));
            $this->assertSame(['status' => 400, 'code' => 'visualCharacter.imageWrongType'], $wrong->get_error_data(), $uri);
        }

        $huge = 'data:image/png;base64,' . str_repeat('A', 14 * 1024 * 1024);
        $large = $api->upload_visual_character_image($this->make_request(['kind' => 'person', 'data_uri' => $huge]));
        $this->assertSame(['status' => 400, 'code' => 'visualCharacter.imageTooLarge'], $large->get_error_data());
    }

    /** @test */
    public function a_refusal_keeps_the_cloud_error_key_with_its_case_and_dot(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $captured = null;
        $this->expect_cloud_call('/uploadVisualCharacterImage', [
            'code' => 400,
            'body' => [
                'success' => false,
                'code'    => 'visualCharacter.imageHeic',
                'error'   => "HEIC is an iPhone photo format we can't use.",
            ],
        ], $captured);

        $result = (new Rest_Api())->upload_visual_character_image(
            $this->make_request(['kind' => 'person', 'data_uri' => self::PNG_URI])
        );

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame(['status' => 400, 'code' => 'visualCharacter.imageHeic'], $result->get_error_data());
    }

    /** @test */
    public function the_plan_gate_and_codes_that_are_not_keys_go_through_sanitize_key_as_before(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $captured = null;
        $this->expect_cloud_call('/approveVisualCharacterSheet', [
            'code' => 403,
            'body' => ['success' => false, 'code' => 'Plan_Gated', 'error' => 'A recurring character is part of paid plans.'],
        ], $captured);

        $result = (new Rest_Api())->approve_visual_character_sheet($this->make_request());

        $this->assertSame(['status' => 403, 'code' => 'plan_gated'], $result->get_error_data());
        $this->assertSame(['presetId' => 'p1'], $captured);
    }

    // ── Remove an upload, description, approve, Remove ─────────────────

    /** @test */
    public function remove_image_sends_the_slot_from_the_route(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $captured = null;
        $this->expect_cloud_call('/removeVisualCharacterImage', ['code' => 200, 'body' => ['success' => true, 'draft' => null]], $captured);

        (new Rest_Api())->remove_visual_character_image($this->make_request([], ['id' => 'p1', 'index' => '2']));

        $this->assertSame(['presetId' => 'p1', 'index' => 2], $captured);
    }

    /** @test */
    public function description_forwards_a_valid_locale_with_a_120s_budget_and_drops_a_malformed_one(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $captured = null;
        $args     = null;
        $this->expect_cloud_call(
            '/draftVisualCharacterDescription',
            ['code' => 200, 'body' => ['success' => true, 'description' => 'A hedgehog in a green scarf.']],
            $captured,
            $args
        );

        $result = (new Rest_Api())->draft_visual_character_description(
            $this->make_request(['kind' => 'mascot', 'locale' => '<i>fr</i>'])
        );

        $this->assertSame('A hedgehog in a green scarf.', $result['description']);
        $this->assertSame(['presetId' => 'p1', 'kind' => 'mascot'], $captured);
        $this->assertSame(120, $args['timeout']);
    }

    /** @test */
    public function remove_sends_the_preset_only_with_a_60s_budget(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $captured = null;
        $args     = null;
        $this->expect_cloud_call('/removeVisualCharacter', ['code' => 200, 'body' => ['success' => true, 'ok' => true]], $captured, $args);

        $result = (new Rest_Api())->remove_visual_character($this->make_request(['presetId' => 'other']));

        $this->assertSame(['success' => true, 'ok' => true], $result);
        $this->assertSame(['presetId' => 'p1'], $captured);
        $this->assertSame(60, $args['timeout']);
    }

    // ── Draw ───────────────────────────────────────────────────────────

    /** @test */
    public function draw_sanitises_the_signature_and_forwards_the_statement_as_a_real_boolean(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $captured = null;
        $args     = null;
        $this->expect_cloud_call('/drawVisualCharacterSheet', ['code' => 200, 'body' => ['success' => true, 'draft' => []]], $captured, $args);

        (new Rest_Api())->draw_visual_character_sheet($this->make_request([
            'kind'         => 'mascot',
            'signature'    => ['kind' => 'curated', 'id' => 'paper-cut', 'version' => '1', 'extra' => 'x'],
            'keepOwnStyle' => true,
            'confirmed'    => 'true',
            'activationId' => 'act_other',
        ]));

        $this->assertSame([
            'presetId'     => 'p1',
            'kind'         => 'mascot',
            'signature'    => ['kind' => 'curated', 'id' => 'paper-cut', 'version' => 1],
            'confirmed'    => false,
            'keepOwnStyle' => true,
        ], $captured);
        $this->assertSame(120, $args['timeout']);
    }

    /** @test */
    public function draw_refuses_an_invalid_signature_or_kind_before_the_cloud(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $this->expect_no_cloud_call();
        $api = new Rest_Api();

        $signature = $api->draw_visual_character_sheet($this->make_request([
            'kind'      => 'person',
            'signature' => ['kind' => 'custom', 'name' => 'Half done', 'medium' => 'illustration'],
            'confirmed' => true,
        ]));
        $this->assertSame('invalid_signature', $signature->get_error_code());

        $kind = $api->draw_visual_character_sheet($this->make_request(['kind' => 'Person', 'confirmed' => true]));
        $this->assertSame('invalid_character', $kind->get_error_code());
    }

    /** @test */
    public function a_failed_sheet_reaches_the_spa_with_its_key(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $captured = null;
        $this->expect_cloud_call('/drawVisualCharacterSheet', [
            'code' => 500,
            'body' => ['success' => false, 'code' => 'visualCharacter.sheetFailed', 'error' => "The sheet didn't finish."],
        ], $captured);

        $result = (new Rest_Api())->draw_visual_character_sheet($this->make_request([
            'kind'      => 'person',
            'signature' => ['kind' => 'curated', 'id' => 'ink-and-fill', 'version' => 1],
            'confirmed' => true,
        ]));

        $this->assertSame(['status' => 500, 'code' => 'visualCharacter.sheetFailed'], $result->get_error_data());
    }

    // ── Save and preview ───────────────────────────────────────────────

    /** @test */
    public function update_forwards_appearance_and_the_character_form_sanitised(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $captured = null;
        $this->expect_cloud_call('/updateVisualPreset', ['code' => 200, 'body' => ['success' => true, 'preset' => []]], $captured);

        (new Rest_Api())->update_visual_preset($this->make_request(['content' => [
            'appearance' => 'person',
            'character'  => [
                'name'        => '<b>Lena</b>',
                'description' => str_repeat('A woman with a dark bob. ', 40),
                'reference'   => 'sheet',
                'outfit'      => 'changes',
                'confirmed'   => true,
                'path'        => 'visual-characters/other/upload.png',
                'permission'  => ['kind' => 'consent', 'by' => 'someone'],
            ],
        ]]));

        $this->assertSame('person', $captured['content']['appearance']);
        $character = $captured['content']['character'];
        $this->assertSame(['name', 'description', 'reference', 'confirmed', 'outfit'], array_keys($character));
        $this->assertSame('Lena', $character['name']);
        $this->assertSame(500, mb_strlen($character['description']));
        $this->assertTrue($character['confirmed']);
        $this->assertSame('changes', $character['outfit']);
    }

    /** @test */
    public function update_without_the_fields_sends_none_of_them(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $captured = null;
        $this->expect_cloud_call('/updateVisualPreset', ['code' => 200, 'body' => ['success' => true, 'preset' => []]], $captured);

        (new Rest_Api())->update_visual_preset($this->make_request(['content' => ['ai_label' => true]]));

        $this->assertArrayNotHasKey('appearance', $captured['content']);
        $this->assertArrayNotHasKey('character', $captured['content']);
    }

    /** @test */
    public function update_refuses_an_unknown_appearance_or_reference_before_the_cloud(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $this->expect_no_cloud_call();
        $api = new Rest_Api();

        $appearance = $api->update_visual_preset($this->make_request(['content' => ['appearance' => 'team']]));
        $this->assertSame('invalid_character', $appearance->get_error_code());
        $this->assertSame(400, $appearance->get_error_data()['status']);

        $reference = $api->update_visual_preset($this->make_request(['content' => [
            'appearance' => 'person',
            'character'  => ['name' => 'Lena', 'description' => 'A woman.', 'reference' => 'photo', 'confirmed' => true],
        ]]));
        $this->assertSame('invalid_character', $reference->get_error_code());
    }

    /** @test */
    public function create_never_forwards_the_character(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $captured = null;
        $this->expect_cloud_call('/createVisualPreset', ['code' => 200, 'body' => ['success' => true, 'preset' => []]], $captured);

        (new Rest_Api())->create_visual_preset($this->make_request([
            'label'   => 'Site default',
            'content' => ['appearance' => 'person', 'character' => ['reference' => 'asIs', 'name' => 'Lena']],
        ]));

        $this->assertArrayNotHasKey('appearance', $captured['content']);
        $this->assertArrayNotHasKey('character', $captured['content']);
    }

    /** @test */
    public function preview_forwards_the_unsaved_character_and_its_flags_as_real_booleans(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $captured = null;
        $this->expect_cloud_call(
            '/previewVisualSignature',
            ['code' => 200, 'body' => ['success' => true, 'imageUrl' => 'data:image/webp;base64,UklGRg==', 'concept' => 'c']],
            $captured
        );

        (new Rest_Api())->preview_visual_signature($this->make_request([
            'signature'         => ['kind' => 'curated', 'id' => 'ink-and-fill', 'version' => 1],
            'appearance'        => 'mascot',
            'character'         => ['name' => 'Pip', 'description' => 'A hedgehog.', 'reference' => 'asIs', 'keepOwnStyle' => 'yes'],
            'useCharacterDraft' => true,
            'confirmed'         => 1,
        ]));

        $this->assertSame('mascot', $captured['appearance']);
        $this->assertSame(
            ['name' => 'Pip', 'description' => 'A hedgehog.', 'reference' => 'asIs', 'confirmed' => false, 'keepOwnStyle' => false],
            $captured['character']
        );
        $this->assertTrue($captured['useCharacterDraft']);
        $this->assertFalse($captured['confirmed']);
    }

    /** @test */
    public function preview_without_a_character_sends_the_same_body_as_before(): void
    {
        $this->stage_license_payload(self::CONNECTED_PAYLOAD);
        $captured = null;
        $this->expect_cloud_call(
            '/previewVisualSignature',
            ['code' => 200, 'body' => ['success' => true, 'imageUrl' => 'u', 'concept' => 'c']],
            $captured
        );

        (new Rest_Api())->preview_visual_signature($this->make_request([
            'signature' => ['kind' => 'curated', 'id' => 'paper-cut', 'version' => 1],
            'palette'   => ['#2F6B4F'],
        ]));

        $this->assertSame(['signature', 'palette'], array_keys($captured));
    }
}
