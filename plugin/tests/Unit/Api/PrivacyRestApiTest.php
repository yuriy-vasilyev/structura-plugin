<?php

namespace Structura\Tests\Unit\Api;

use Brain\Monkey\Functions;
use Structura\Api\Privacy_Rest_Api;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for `Privacy_Rest_Api` — the REST handler that stores and
 * retrieves the plugin admin's telemetry consent choice from the
 * `structura_privacy_consent` WP option.
 *
 * What this suite pins:
 *
 *   1. **Default state** — when the option has never been written, GET
 *      returns the canonical "no choice yet" envelope so the SPA's
 *      `hasMadeChoice` flag accurately reflects "never asked."
 *   2. **Round-trip** — POST writes the option, the next GET reads it
 *      back unchanged. The response shape includes `hasMadeChoice: true`
 *      so the SPA can hide any "you haven't chosen yet" advisory.
 *   3. **Version invalidation** — a stored option with a stale `version`
 *      field is treated as if no choice was ever made, prompting the
 *      admin to re-consent when policy materially changes.
 *
 * Brain Monkey stubs `get_option` / `update_option` so the test can
 * watch what the handler reads and writes without a real WP database.
 *
 * @covers \Structura\Api\Privacy_Rest_Api
 */
class PrivacyRestApiTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Pass the payload through verbatim so assertions can inspect
        // the exact array the handler returned.
        Functions\stubs([
            'rest_ensure_response' => function ($data) { return $data; },
            'get_current_user_id'  => 1,
        ]);
    }

    /** @test */
    public function get_returns_default_state_when_option_is_missing(): void
    {
        $this->expectFn('get_option')
            ->once()
            ->with('structura_privacy_consent', null)
            ->andReturn(null);

        $api = new Privacy_Rest_Api();
        $response = $api->get_consent();

        $this->assertSame(
            [
                'version'          => 1,
                'choseAt'          => null,
                'telemetryEnabled' => false,
                'hasMadeChoice'    => false,
            ],
            $response,
            'A never-written option must produce hasMadeChoice=false so the Settings card can decide whether to surface a one-time advisory.'
        );
    }

    /** @test */
    public function get_returns_default_state_when_stored_shape_is_malformed(): void
    {
        // Defensive: a previous version of the plugin (or a third-party
        // tool) might have left a non-array value under the key. The
        // handler must treat that as "no choice yet" rather than
        // crashing on isset()/array_key_exists().
        $this->expectFn('get_option')
            ->once()
            ->with('structura_privacy_consent', null)
            ->andReturn('legacy-string-value');

        $api = new Privacy_Rest_Api();
        $response = $api->get_consent();

        $this->assertFalse($response['hasMadeChoice']);
        $this->assertFalse($response['telemetryEnabled']);
    }

    /** @test */
    public function get_returns_default_state_when_version_is_stale(): void
    {
        // A schema bump (CONSENT_VERSION 1 → 2) must invalidate stored
        // choices so the admin gets re-asked. Same pattern as the
        // `structura_consent` cookie on the marketing site.
        $this->expectFn('get_option')
            ->once()
            ->with('structura_privacy_consent', null)
            ->andReturn([
                'version'          => 0,
                'choseAt'          => 1716000000,
                'telemetryEnabled' => true,
            ]);

        $api = new Privacy_Rest_Api();
        $response = $api->get_consent();

        $this->assertFalse(
            $response['hasMadeChoice'],
            'A stored choice from a stale schema version must NOT count as a recorded choice — the admin needs to re-consent.'
        );
        $this->assertFalse(
            $response['telemetryEnabled'],
            'Trackers must default to off when the stored version is stale, not honour the stale value.'
        );
    }

    /** @test */
    public function get_returns_stored_state_verbatim_when_version_matches(): void
    {
        $this->expectFn('get_option')
            ->once()
            ->with('structura_privacy_consent', null)
            ->andReturn([
                'version'          => 1,
                'choseAt'          => 1716816000,
                'telemetryEnabled' => true,
            ]);

        $api = new Privacy_Rest_Api();
        $response = $api->get_consent();

        $this->assertSame(1, $response['version']);
        $this->assertSame(1716816000, $response['choseAt']);
        $this->assertTrue($response['telemetryEnabled']);
        $this->assertTrue(
            $response['hasMadeChoice'],
            'A correctly-versioned stored choice must report hasMadeChoice=true so the SPA hides any "you haven\'t chosen yet" advisory.'
        );
    }

    /** @test */
    public function post_writes_the_option_with_version_choseat_and_telemetry_flag(): void
    {
        $this->expectFn('update_option')
            ->once()
            ->with(
                'structura_privacy_consent',
                \Mockery::on(function ($state) {
                    return is_array($state)
                        && $state['version'] === 1
                        && is_int($state['choseAt'])
                        && $state['choseAt'] > 0
                        && $state['telemetryEnabled'] === true;
                })
            )
            ->andReturn(true);

        $api = new Privacy_Rest_Api();
        $response = $api->set_consent($this->make_request(['telemetryEnabled' => true]));

        $this->assertTrue($response['telemetryEnabled']);
        $this->assertTrue($response['hasMadeChoice']);
        $this->assertIsInt($response['choseAt']);
        $this->assertGreaterThan(0, $response['choseAt']);
    }

    /** @test */
    public function post_treats_missing_telemetry_flag_as_denied(): void
    {
        // Defensive: a malformed body that omits `telemetryEnabled`
        // should NOT default to granted. The "off-by-default" posture
        // is the entire point of the consent UX — a misinterpreted
        // request must err on the side of less tracking, not more.
        $this->expectFn('update_option')
            ->once()
            ->with(
                'structura_privacy_consent',
                \Mockery::on(function ($state) {
                    return $state['telemetryEnabled'] === false;
                })
            )
            ->andReturn(true);

        $api = new Privacy_Rest_Api();
        $response = $api->set_consent($this->make_request([]));

        $this->assertFalse($response['telemetryEnabled']);
    }

    /** @test */
    public function post_persists_a_revoke_off_the_same_way_as_an_opt_in(): void
    {
        // Going from on→off must write the option (not delete it) so a
        // subsequent GET reports hasMadeChoice=true with telemetryEnabled=false.
        // That's the "explicitly revoked" state — distinct from "never chose."
        $this->expectFn('update_option')
            ->once()
            ->with(
                'structura_privacy_consent',
                \Mockery::on(function ($state) {
                    return $state['version'] === 1
                        && $state['telemetryEnabled'] === false;
                })
            )
            ->andReturn(true);

        $api = new Privacy_Rest_Api();
        $response = $api->set_consent($this->make_request(['telemetryEnabled' => false]));

        $this->assertFalse($response['telemetryEnabled']);
        $this->assertTrue(
            $response['hasMadeChoice'],
            'An explicit opt-out must report hasMadeChoice=true so the SPA differentiates revoked from never-chosen.'
        );
    }

    /** @test */
    public function permission_callback_requires_manage_options_capability(): void
    {
        // Only site admins (the data controller for the WP install) can
        // change telemetry consent — matches the rest of the Settings
        // page surface and prevents an editor-role user from silently
        // flipping the switch on the admin's behalf.
        $this->expectFn('current_user_can')
            ->once()
            ->with('manage_options')
            ->andReturn(false);

        $api = new Privacy_Rest_Api();

        $this->assertFalse($api->check_admin_permission());
    }

    /** @test */
    public function permission_callback_grants_admins(): void
    {
        $this->expectFn('current_user_can')
            ->once()
            ->with('manage_options')
            ->andReturn(true);

        $api = new Privacy_Rest_Api();

        $this->assertTrue($api->check_admin_permission());
    }

    /**
     * Mimics `WP_REST_Request::get_json_params()` — just enough of the
     * surface that `Privacy_Rest_Api::set_consent()` calls. Mirrors the
     * anonymous-class pattern used elsewhere in the test suite (e.g.
     * `RunsGetTest`).
     */
    private function make_request(array $body): \WP_REST_Request
    {
        // Subclass the bootstrap's WP_REST_Request stub so the production
        // `set_consent(WP_REST_Request $request)` strict type check
        // passes. The anonymous-class form satisfied an older signature
        // that didn't type-hint the argument.
        //
        // Constructor-property-promotion is intentionally avoided here —
        // the CI matrix still includes PHP 7.4, which parses the
        // promoted form as a syntax error. An explicit property + body
        // costs three lines and keeps the file 7.4-clean.
        return new class($body) extends \WP_REST_Request {
            /** @var array */
            private $body;

            public function __construct(array $body)
            {
                $this->body = $body;
            }

            public function get_json_params()
            {
                return $this->body;
            }
        };
    }
}
