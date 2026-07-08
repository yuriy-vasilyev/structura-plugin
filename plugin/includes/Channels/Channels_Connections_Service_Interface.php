<?php

namespace Structura\Channels;

if ( ! defined('ABSPATH')) {
    exit;
}

/**
 * Contract for the WordPress-side proxy that talks to the cloud
 * `channelsListConnections` / `channelsSaveWebhookConnection` /
 * `channelsDeleteConnection` endpoints.
 *
 * The plugin never stores connection material itself — every read or write
 * goes through the cloud, which holds the encrypted token blob in
 * `licenses/{l}/activations/{a}/connectionSecrets/{integrationId}` (admin-SDK
 * only) and the wire-safe summary in `connections/{integrationId}`.
 *
 * Implementations MUST:
 *  - Build the standard auth envelope (license_key + activation_secret +
 *    site_url) the same way `Channel_Event_Forwarder` does, so the cloud's
 *    shared `authenticate()` helper accepts it.
 *  - Return a normalized array shape on success and a `WP_Error` on any
 *    transport, auth, or cloud-reported failure. REST handlers can then
 *    forward the error verbatim to the client.
 *  - Never let exceptions bubble — REST callers expect a `WP_Error`, not a
 *    fatal.
 *
 * Spec: specs/integrations-store-spec.md §5.1, §5.3, §6.5, §7.2
 */
interface Channels_Connections_Service_Interface
{
    /**
     * Fetch the activation's current connection summaries from the cloud.
     *
     * @return array{connections: array<int, array<string, mixed>>}|\WP_Error
     */
    public function list_connections();

    /**
     * Create or replace a webhook-style connection (Slack / Discord /
     * webhook-ping) for the given integration id. The cloud validates the URL
     * against the integration's own `validateTarget()` before storing it.
     *
     * @param string      $integration_id     Catalog id, e.g. "slack-webhook".
     * @param string      $webhook_url        Provider webhook endpoint.
     * @param string|null $display_name       Optional human label; falls back
     *                                        to the integration's catalog name.
     * @param string|null $notification_locale Per-connection locale override for
     *                                        outgoing notification copy. One of:
     *                                        `"system"` (default, follows the
     *                                        site locale at dispatch time),
     *                                        or `"en" | "de" | "es" | "fr"`.
     *                                        Null or empty is treated as
     *                                        `"system"`. Unknown values are
     *                                        normalized to `"system"` on the
     *                                        cloud side so there's no shared
     *                                        validation surface to drift.
     * @param string|null $connection_id      Existing UUID to update (edit flow);
     *                                        omit for fresh installs so the cloud
     *                                        mints a new UUID.
     * @param string|null $signing_secret     HMAC signing secret, forwarded only
     *                                        for integrations that sign outbound
     *                                        request bodies (webhook-ping today).
     *                                        The cloud is the source of truth
     *                                        for which integrations require it
     *                                        and rejects the save with a
     *                                        readable 400 when it's missing
     *                                        or too short. Implementations MUST
     *                                        forward this value byte-exact — do
     *                                        NOT run it through
     *                                        `sanitize_text_field`, which
     *                                        collapses whitespace and would
     *                                        corrupt the HMAC verification
     *                                        performed by the receiver.
     *
     * @return array{connection: array<string, mixed>}|\WP_Error
     */
    public function save_webhook_connection(
        string $integration_id,
        string $webhook_url,
        ?string $display_name = null,
        ?string $notification_locale = null,
        ?string $connection_id = null,
        ?string $signing_secret = null
    );

    /**
     * Create or replace a credential-style connection (email-owner, telegram,
     * whatsapp) for the given integration id.
     *
     * @param string               $integration_id     Catalog id, e.g. "telegram".
     * @param array<string, string> $credentials       Per-integration key/value map
     *                                                 validated on the cloud side.
     * @param string|null          $display_name       Optional human label.
     * @param string|null          $notification_locale Per-connection locale override.
     * @param string|null          $connection_id      Existing UUID to update (edit flow).
     *
     * @return array{connection: array<string, mixed>}|\WP_Error
     */
    public function save_credential_connection(
        string $integration_id,
        array $credentials,
        ?string $display_name = null,
        ?string $notification_locale = null,
        ?string $connection_id = null
    );

    /**
     * Update the user-managed settings on an existing connection
     * (campaign bindings, notification locale, post cadence) without
     * touching tokens or secrets. Used by the post-OAuth configure
     * modal and the per-row Edit affordance — both need a settings-
     * only round-trip that works for every auth type including
     * OAuth, whose install path has no other "save settings" hop.
     *
     * @param string                          $connection_id           UUID of the connection to patch.
     * @param string|null                     $notification_locale     Optional locale override.
     * @param array<int, int|string>|null     $bound_campaign_ids      Optional per-campaign binding list. `null` = unbound.
     * @param int|null                        $post_cadence_n          Optional "every Nth post" cadence; defaults to 1.
     * @param bool|null                       $attach_featured_image   Optional "attach featured image" toggle for publishable+image channels (LinkedIn, X). `null` = leave untouched; default applied by the cloud is `true`.
     * @param string|null                     $selected_organization_urn LinkedIn-only posting-target switch. `null` = leave untouched; `''` or `'personal'` = personal profile; an org URN = that company Page. Ignored for non-LinkedIn connections.
     * @param string|null                     $video_voice             Video-only voiceover voice id (e.g. `'ava'`). `null` = leave untouched; the cloud validates the id against its voice catalog. Ignored for non-video connections.
     * @param string|null                     $video_style             Video-only visual-style preset id (`'clean'|'bold'|'kinetic'`). Same semantics as `$video_voice`.
     *
     * @return array{connection: array<string, mixed>}|\WP_Error
     */
    public function update_connection_settings(
        string $connection_id,
        ?string $notification_locale = null,
        ?array $bound_campaign_ids = null,
        ?int $post_cadence_n = null,
        ?bool $attach_featured_image = null,
        ?string $selected_organization_urn = null,
        ?string $video_voice = null,
        ?string $video_style = null
    );

    /**
     * Hard-delete a single connection.
     *
     * Accepts either a UUID (`$connection_key` == the row's `connectionId`,
     * minted by the cloud post-migration) or a legacy integration id for
     * pre-migration rows where doc id == integration id. The cloud endpoint
     * handles both via its `connection_id` / `integration_id` fallback.
     *
     * @return array{connectionId: string}|\WP_Error
     */
    public function delete_connection(string $connection_key);

    /**
     * Fetch the cloud-hosted integration catalog, annotated with per-caller
     * entitlement (can the current plan + add-ons install each entry?).
     *
     * Used by the Store UI to render the card grid and pick the right CTA
     * (Install vs Upgrade plan vs Add Channels) without a second round-trip
     * for license status.
     *
     * @return array{
     *     success: true,
     *     plan: string,
     *     activeAddons: array<int, string>,
     *     entries: array<int, array<string, mixed>>
     * }|\WP_Error
     */
    public function list_catalog();

    /**
     * Initiate an OAuth flow for the given integration. Calls the cloud's
     * `channelsOAuthInit` endpoint which issues a signed state JWT and
     * builds the provider's authorize URL.
     *
     * @param string $integration_id  Catalog id, e.g. "linkedin".
     * @param string $redirect_uri    The cloud callback URL the provider
     *                                should redirect to after authorization.
     * @param string $return_url      Absolute URL the cloud callback should
     *                                land the user on after the OAuth dance
     *                                finishes — typically the wp-admin
     *                                Channels page. Carried verbatim through
     *                                the signed state JWT and respected even
     *                                on subdirectory installs / multisite /
     *                                custom login-URL plugins, which the
     *                                cloud can't derive from `home_url()`.
     * @param string $post_as         Posting target — LinkedIn only.
     *                                "organization" requests the company-page
     *                                scopes so the user can post on behalf of a
     *                                Page they administer; anything else
     *                                (default "") requests personal-profile
     *                                scopes only.
     *
     * @return array{success: true, authorizeUrl: string, state: string}|\WP_Error
     */
    public function init_oauth(string $integration_id, string $redirect_uri, string $return_url = '', string $post_as = '');
}
