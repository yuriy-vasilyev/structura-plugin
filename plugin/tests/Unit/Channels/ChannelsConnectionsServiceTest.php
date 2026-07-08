<?php

namespace Structura\Tests\Unit\Channels;

use Brain\Monkey\Functions;
use Mockery;
use Structura\Channels\Channels_Connections_Service;
use Structura\Tests\Unit\TestCase;

/**
 * Unit tests for Channels_Connections_Service.
 *
 * The service is a thin proxy over Cloud_Client::post(), so the assertions
 * focus on three things:
 *   - The cloud auth envelope (license_key + activation_secret + site_url) is
 *     assembled correctly from Key_Manager + home_url() and merged with the
 *     endpoint-specific payload fields.
 *   - Transport failures (WP_Error) and cloud-reported errors (non-2xx or
 *     `success: false`) bubble up as WP_Error so REST handlers can pass them
 *     through verbatim.
 *   - Successful responses are returned as plain arrays.
 *
 * @covers \Structura\Channels\Channels_Connections_Service
 *
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
class ChannelsConnectionsServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Functions\stubs([
            'home_url' => function () { return 'https://example.com'; },
        ]);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    // ──────────────────────────────────────────────────────────────────────
    //  AUTH ENVELOPE — every method must short-circuit if the activation
    //  handshake hasn't been completed locally.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_returns_wp_error_when_no_activation_payload_is_present(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(null);

        // Cloud must NEVER be called when we have no auth material.
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        $service = new Channels_Connections_Service();

        $result = $service->list_connections();

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('channels_no_activation', $result->get_error_code());
    }

    // ──────────────────────────────────────────────────────────────────────
    //  LIST — success path.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function list_connections_passes_auth_envelope_and_returns_decoded_body(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud_body = [
            'success'     => true,
            'connections' => [
                [
                    'integrationId' => 'slack',
                    'status'        => 'connected',
                    'displayName'   => 'Slack',
                ],
            ],
        ];

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                return $endpoint === '/channelsListConnections'
                    && $payload['license_key'] === 'live_xxx'
                    && $payload['activation_secret'] === 'sek_yyy'
                    && $payload['site_url'] === 'https://example.com'
                    // Interactive call — we DO block the request, but with
                    // a tight timeout so wp-admin doesn't hang on a flaky cloud.
                    && ($args['timeout'] ?? null) === 15;
            })
            ->andReturn(['code' => 200, 'body' => $cloud_body, 'raw' => null]);

        $service = new Channels_Connections_Service();

        $this->assertSame($cloud_body, $service->list_connections());
    }

    // ──────────────────────────────────────────────────────────────────────
    //  SAVE — input validation + payload shape + display_name fallback.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function save_webhook_rejects_blank_integration_id_or_url_locally(): void
    {
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        $service = new Channels_Connections_Service();

        $this->assertInstanceOf(
            \WP_Error::class,
            $service->save_webhook_connection('', 'https://hooks.slack.com/x')
        );
        $this->assertInstanceOf(
            \WP_Error::class,
            $service->save_webhook_connection('slack', '')
        );
    }

    /** @test */
    public function save_webhook_sends_full_payload_including_display_name(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud_body = ['success' => true, 'connection' => ['integrationId' => 'slack']];

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                return $endpoint === '/channelsSaveWebhookConnection'
                    && $payload['integration_id'] === 'slack'
                    && $payload['webhook_url'] === 'https://hooks.slack.com/services/T/B/X'
                    && $payload['display_name'] === '#deploys'
                    && $payload['license_key'] === 'live_xxx';
            })
            ->andReturn(['code' => 200, 'body' => $cloud_body, 'raw' => null]);

        $service = new Channels_Connections_Service();

        $result = $service->save_webhook_connection(
            'slack',
            'https://hooks.slack.com/services/T/B/X',
            '#deploys'
        );

        $this->assertSame($cloud_body, $result);
    }

    /** @test */
    public function save_webhook_omits_display_name_when_null_or_empty(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                // Empty display name is dropped so the cloud's own fallback
                // (integration.metadata.name) takes effect — much better UX
                // than persisting an empty string.
                return ! array_key_exists('display_name', $payload);
            })
            ->andReturn(['code' => 200, 'body' => ['success' => true, 'connection' => []], 'raw' => null]);

        $service = new Channels_Connections_Service();
        $service->save_webhook_connection('slack', 'https://hooks.slack.com/x', null);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  DELETE — payload shape + idempotency relies on cloud, not us.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function delete_connection_sends_connection_id_with_legacy_integration_id_fallback(): void
    {
        // The proxy forwards the key under BOTH `connection_id` (post-migration
        // primary) and `integration_id` (legacy fallback). The cloud prefers
        // `connection_id` when both are present, so callers migrating to UUIDs
        // don't accidentally hit a legacy doc that happens to share the UUID's
        // suffix. This test pins the wire shape so neither field is dropped.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud_body = ['success' => true, 'connectionId' => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'];

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                return $endpoint === '/channelsDeleteConnection'
                    && $payload['connection_id'] === 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
                    && $payload['integration_id'] === 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
                    && $payload['license_key'] === 'live_xxx';
            })
            ->andReturn(['code' => 200, 'body' => $cloud_body, 'raw' => null]);

        $service = new Channels_Connections_Service();

        $this->assertSame(
            $cloud_body,
            $service->delete_connection('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
        );
    }

    /** @test */
    public function delete_connection_rejects_blank_connection_key(): void
    {
        Mockery::mock('alias:Structura\Core\Cloud_Client')
            ->shouldNotReceive('post');

        $service = new Channels_Connections_Service();
        $this->assertInstanceOf(\WP_Error::class, $service->delete_connection(''));
    }

    /** @test */
    public function save_webhook_omits_connection_id_when_null_or_empty(): void
    {
        // The Install flow never passes a connection_id — the cloud mints one.
        // This test pins the behavior so a future refactor doesn't start
        // coercing empty strings into payload keys, which would change the
        // install path from "create new" to "update doc with id ''".
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                return ! array_key_exists('connection_id', $payload);
            })
            ->andReturn([
                'code' => 200,
                'body' => ['success' => true, 'connection' => []],
                'raw'  => null,
            ]);

        $service = new Channels_Connections_Service();
        $service->save_webhook_connection(
            'slack',
            'https://hooks.slack.com/x',
            null,
            null,
            null
        );
    }

    /** @test */
    public function save_webhook_forwards_connection_id_when_provided_for_edit_flow(): void
    {
        // Edit flow: the client has a UUID for the row it's updating and
        // passes it through so the save is idempotent against the existing
        // doc rather than minting a sibling.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                return ($payload['connection_id'] ?? null) === 'the-uuid';
            })
            ->andReturn([
                'code' => 200,
                'body' => ['success' => true, 'connection' => []],
                'raw'  => null,
            ]);

        $service = new Channels_Connections_Service();
        $service->save_webhook_connection(
            'slack',
            'https://hooks.slack.com/x',
            null,
            null,
            'the-uuid'
        );
    }

    // ──────────────────────────────────────────────────────────────────────
    //  SIGNING SECRET — the wire field that gates HMAC-signed integrations.
    //  The plugin's job is to forward it byte-exact when supplied and omit
    //  the key entirely when not, so the cloud's preserve-on-edit branch
    //  can fire on display-name-only edits of webhook-ping connections.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function save_webhook_forwards_signing_secret_when_caller_supplies_one(): void
    {
        // Create flow for webhook-ping: caller passes the freshly-minted
        // HMAC secret and the plugin must forward it byte-exact. The cloud
        // enforces the ≥16-char floor; the plugin intentionally does NOT
        // re-validate it here so the two sides can evolve the rule without
        // a lockstep release.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $secret = str_repeat('deadbeef', 8); // 64 hex chars

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) use ($secret) {
                return ($payload['signing_secret'] ?? null) === $secret
                    && $payload['integration_id'] === 'webhook-ping';
            })
            ->andReturn([
                'code' => 200,
                'body' => ['success' => true, 'connection' => []],
                'raw'  => null,
            ]);

        $service = new Channels_Connections_Service();
        $service->save_webhook_connection(
            'webhook-ping',
            'https://example.com/api/revalidate',
            null,
            null,
            null,
            $secret
        );
    }

    /** @test */
    public function save_webhook_omits_signing_secret_when_null_so_cloud_preserves_existing(): void
    {
        // Edit-preserve flow: caller omits the secret (passes null) on a
        // display-name-only webhook-ping edit. The plugin must drop the
        // field from the wire payload entirely — the cloud reads "missing"
        // as the signal to re-use the stored encrypted blob rather than
        // mint a new one. Forwarding an empty string would instead trip
        // the cloud's ≥16-char floor and return a 400.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                return ! array_key_exists('signing_secret', $payload);
            })
            ->andReturn([
                'code' => 200,
                'body' => ['success' => true, 'connection' => []],
                'raw'  => null,
            ]);

        $service = new Channels_Connections_Service();
        $service->save_webhook_connection(
            'webhook-ping',
            'https://example.com/api/revalidate',
            'Renamed',         // user only changed this
            'system',
            'the-uuid',
            null               // preserve existing
        );
    }

    /** @test */
    public function save_webhook_treats_empty_string_signing_secret_the_same_as_null(): void
    {
        // Defensive: some callers may forward an empty string instead of
        // null (e.g. PHP REST layer that couldn't parse the param). The
        // plugin must still omit the field — the cloud's preserve path
        // keys on "absent", and an empty string would fail the floor and
        // produce an avoidable 400 that would look like a plugin bug.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                return ! array_key_exists('signing_secret', $payload);
            })
            ->andReturn([
                'code' => 200,
                'body' => ['success' => true, 'connection' => []],
                'raw'  => null,
            ]);

        $service = new Channels_Connections_Service();
        $service->save_webhook_connection(
            'webhook-ping',
            'https://example.com/api/revalidate',
            null,
            null,
            null,
            ''  // empty rather than null — should still mean "preserve"
        );
    }

    /** @test */
    public function save_webhook_omits_signing_secret_for_unsigned_integrations(): void
    {
        // Slack/Discord are notify-only and unsigned. Even if a caller
        // sloppily forwards something non-empty into the 6th arg, the
        // cloud's validation short-circuits on `requiresSigningSecret`
        // being false for those catalog entries — but the plugin should
        // still forward the field because the cloud owns the decision.
        // This test pins: when caller passes null (the normal Slack path),
        // no signing_secret key appears. It's a companion to the
        // `omits_signing_secret_when_null` test above, but pinned on the
        // slack-webhook integration id specifically so neither default
        // path regresses independently.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                return $payload['integration_id'] === 'slack-webhook'
                    && ! array_key_exists('signing_secret', $payload);
            })
            ->andReturn([
                'code' => 200,
                'body' => ['success' => true, 'connection' => []],
                'raw'  => null,
            ]);

        $service = new Channels_Connections_Service();
        $service->save_webhook_connection(
            'slack-webhook',
            'https://hooks.slack.com/services/T/B/X'
        );
    }

    // ──────────────────────────────────────────────────────────────────────
    //  ERROR PATHS — transport failures and cloud-reported errors must
    //  surface as WP_Error so REST handlers can render the exact reason.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function it_propagates_transport_wp_error_from_cloud_client(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $transport_error = new \WP_Error('http_request_failed', 'connection refused');

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')->once()->andReturn($transport_error);

        Mockery::mock('alias:Structura\Core\Log_Service')
            ->shouldReceive('add')->once();

        $service = new Channels_Connections_Service();
        $result  = $service->list_connections();

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('http_request_failed', $result->get_error_code());
    }

    /** @test */
    public function it_returns_wp_error_when_cloud_responds_with_non_success_body(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        // Mirrors what channelsSaveWebhookConnection returns on a capability
        // gate failure — preserving the cloud's own message is critical for
        // the UI to render an actionable error.
        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')->once()->andReturn([
            'code' => 400,
            'body' => ['success' => false, 'error' => 'Integration is not webhook-based.'],
            'raw'  => null,
        ]);

        Mockery::mock('alias:Structura\Core\Log_Service')
            ->shouldReceive('add')->once();

        $service = new Channels_Connections_Service();
        $result  = $service->save_webhook_connection('linkedin', 'https://x.com/hook');

        $this->assertInstanceOf(\WP_Error::class, $result);
        $this->assertSame('channels_cloud_error', $result->get_error_code());
        $this->assertSame('Integration is not webhook-based.', $result->get_error_message());
    }

    // ──────────────────────────────────────────────────────────────────────
    //  OAUTH INIT — the `post_as` field gates LinkedIn company-page scopes.
    //  Only "organization" rides the wire; everything else (incl. the default
    //  "personal") is omitted so older clouds keep requesting personal scopes.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function init_oauth_forwards_post_as_organization_when_requested(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                return $endpoint === '/channelsOAuthInit'
                    && $payload['integration_id'] === 'linkedin'
                    && ($payload['post_as'] ?? null) === 'organization';
            })
            ->andReturn(['code' => 200, 'body' => ['success' => true, 'authorizeUrl' => 'https://li/auth'], 'raw' => null]);

        $service = new Channels_Connections_Service();
        $service->init_oauth('linkedin', 'https://cb.example/cb', '', 'organization');
    }

    /** @test */
    public function init_oauth_omits_post_as_for_personal_default(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                // No post_as → cloud requests personal-profile scopes only.
                return $endpoint === '/channelsOAuthInit'
                    && ! array_key_exists('post_as', $payload);
            })
            ->andReturn(['code' => 200, 'body' => ['success' => true, 'authorizeUrl' => 'https://li/auth'], 'raw' => null]);

        $service = new Channels_Connections_Service();
        // Default 4th arg ('') and the explicit 'personal' must both be omitted.
        $service->init_oauth('linkedin', 'https://cb.example/cb');
    }

    // ──────────────────────────────────────────────────────────────────────
    //  SETTINGS — `selected_organization_urn` switches the LinkedIn target.
    //  null = "leave untouched" (field omitted); '' = "switch to personal"
    //  (a meaningful sentinel that MUST ride the wire); an org URN switches
    //  to that Page.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function update_settings_forwards_selected_organization_urn(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                return $endpoint === '/channelsUpdateConnectionSettings'
                    && ($payload['selected_organization_urn'] ?? null) === 'urn:li:organization:99999';
            })
            ->andReturn(['code' => 200, 'body' => ['success' => true, 'connection' => []], 'raw' => null]);

        $service = new Channels_Connections_Service();
        $service->update_connection_settings('conn-1', null, null, null, null, 'urn:li:organization:99999');
    }

    /** @test */
    public function update_settings_forwards_empty_string_to_switch_back_to_personal(): void
    {
        // The empty string is the "post to personal profile" sentinel — it must
        // survive the wire, unlike null which means "leave the target untouched."
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                return array_key_exists('selected_organization_urn', $payload)
                    && $payload['selected_organization_urn'] === '';
            })
            ->andReturn(['code' => 200, 'body' => ['success' => true, 'connection' => []], 'raw' => null]);

        $service = new Channels_Connections_Service();
        $service->update_connection_settings('conn-1', null, null, null, null, '');
    }

    // ──────────────────────────────────────────────────────────────────────
    //  SETTINGS — video channel voice/style. null = "leave untouched"
    //  (field omitted); a non-empty id rides the wire verbatim so the cloud
    //  can validate it against its own voice/preset catalog.
    // ──────────────────────────────────────────────────────────────────────

    /** @test */
    public function update_settings_forwards_video_voice_and_style(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                return $endpoint === '/channelsUpdateConnectionSettings'
                    && ($payload['video_voice'] ?? null) === 'marcus'
                    && ($payload['video_style'] ?? null) === 'kinetic';
            })
            ->andReturn(['code' => 200, 'body' => ['success' => true, 'connection' => []], 'raw' => null]);

        $service = new Channels_Connections_Service();
        $service->update_connection_settings('conn-video', null, null, null, null, null, 'marcus', 'kinetic');
    }

    /** @test */
    public function update_settings_omits_video_fields_when_null(): void
    {
        // Non-video connections (and older SPAs) never pass the fields — the
        // wire shape must stay byte-identical for them.
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                return ! array_key_exists('video_voice', $payload)
                    && ! array_key_exists('video_style', $payload);
            })
            ->andReturn(['code' => 200, 'body' => ['success' => true, 'connection' => []], 'raw' => null]);

        $service = new Channels_Connections_Service();
        $service->update_connection_settings('conn-1', 'en');
    }

    /** @test */
    public function update_settings_omits_selected_organization_urn_when_null(): void
    {
        Mockery::mock('alias:Structura\Core\Key_Manager')
            ->shouldReceive('get_license_payload')
            ->andReturn(['key' => 'live_xxx', 'secret' => 'sek_yyy']);

        $cloud = Mockery::mock('alias:Structura\Core\Cloud_Client');
        $cloud->shouldReceive('post')
            ->once()
            ->withArgs(function ($endpoint, $payload, $args) {
                return ! array_key_exists('selected_organization_urn', $payload);
            })
            ->andReturn(['code' => 200, 'body' => ['success' => true, 'connection' => []], 'raw' => null]);

        $service = new Channels_Connections_Service();
        // No 6th arg → null → field omitted (target untouched).
        $service->update_connection_settings('conn-1', 'en');
    }
}
