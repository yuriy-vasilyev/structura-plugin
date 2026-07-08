<?php
/**
 * Cloud → plugin reachability probe + cache.
 *
 * Spec: 'specs/v2/notification-center.md' §11.2 (diagnostics) — companion
 * to the WP-Cron probe.
 *
 * ### Why this exists
 *
 * Every Structura post is generated in the cloud and handed back to the
 * site over a signed webhook (`/webhook/receive-blueprint`). If the
 * cloud cannot reach that URL — the classic case is a site whose
 * `home_url()` is `http://localhost`, a `*.local`/`*.test` dev domain,
 * a private LAN IP, or a box behind HTTP basic-auth / a closed firewall
 * — generation silently never lands: the campaign looks "running" but no
 * post ever appears.
 *
 * Unlike the WP-Cron check, this cannot be inferred from a constant. A
 * public-looking domain can still be unreachable (firewall, auth wall,
 * Cloudflare under-attack mode), and a URL heuristic would both miss
 * those and false-positive on perfectly reachable internal-looking
 * setups. So we use the *real* handshake the manual "Run Pulse Check"
 * button already uses (`/performPulseCheck`): the cloud signs a payload
 * and POSTs it back to our webhook, and reports whether that round-trip
 * succeeded. We run it on a schedule + on activation and cache the
 * result so the banners can render synchronously without a round-trip on
 * every pageview.
 *
 * @since 1.x.0
 */

namespace Structura\Core;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Site_Reachability {

	/**
	 * Option holding the last probe result.
	 *
	 * Shape: `array{ ok: bool, checked_at: int, message: string }`.
	 * Absent until the first probe runs — readers treat "absent" as
	 * "unknown, don't warn" to avoid a false positive before we've ever
	 * tested the round-trip.
	 *
	 * @var string
	 */
	public const OPTION = 'structura_cloud_reachability';

	/**
	 * Run the live cloud → plugin handshake and cache the verdict.
	 *
	 * Best-effort and side-effecting: callers (daily cron, post-activation,
	 * the manual pulse button, the diagnostics run) don't need the return
	 * value, but it's handed back so the REST handler can forward the
	 * cloud's message verbatim to the SPA toast.
	 *
	 * Failure-mode discipline:
	 *   - `body.success === false` → the cloud could NOT reach our webhook.
	 *     This is the condition we warn about; cache `ok = false`.
	 *   - A `WP_Error` from `Cloud_Client::post` means WE couldn't reach
	 *     the cloud (outbound). That's a different fault (often a transient
	 *     blip on the site's own egress) and says nothing about whether the
	 *     cloud can reach us, so we leave the last cached verdict untouched
	 *     rather than flip the banner on every outbound hiccup.
	 *   - No license yet → nothing to probe. Clear any stale verdict so a
	 *     site that was unreachable, then disconnected, doesn't keep warning.
	 *
	 * @return array{ok:bool,checked_at?:int,message?:string,reason?:string}
	 */
	public static function probe_and_store(): array {
		// Probe for any cloud-connected install — licensed OR anonymous
		// ("none"). Anonymous workspaces receive delivered posts over the
		// same webhook, so the cloud→site reachability verdict matters to
		// them too (Yurii wp.org testing 2026-07-08). Gate on workspace
		// presence (bearer bound); a truly unconfigured install has no
		// activation to sign a probe and nothing to verify, so clear any
		// stale verdict and bail.
		if ( ! License_Manager::has_workspace() ) {
			delete_option( self::OPTION );
			return [ 'ok' => true, 'reason' => 'no_workspace' ];
		}

		$license = License_Manager::get_license_data();
		$result  = Cloud_Client::post(
			'/performPulseCheck',
			[
				// Empty for anonymous installs — the cloud resolves the
				// activation secret from the bearer Cloud_Client injects.
				'licenseKey' => $license['license_key'] ?? '',
				// Cosmetic/log context only — the cloud resolves the
				// activation secret from the `activationId` that
				// Cloud_Client injects centrally, not from this host.
				'domain'     => wp_parse_url( get_site_url(), PHP_URL_HOST ),
				'webhookUrl' => rest_url( 'structura/v1/webhook/receive-blueprint' ),
			],
			// Keep this snappy on the cron path; the round-trip is
			// cloud→site→cloud and we don't want a hung site URL to
			// stall the daily license-health job behind it.
			[ 'timeout' => 20 ]
		);

		if ( is_wp_error( $result ) ) {
			// Outbound-to-cloud failure — see docblock. Don't touch the
			// cached verdict.
			return [ 'ok' => true, 'reason' => 'cloud_unreachable_outbound' ];
		}

		$body = is_array( $result['body'] ?? null ) ? $result['body'] : [];
		$ok   = ! empty( $body['success'] );

		$state = [
			'ok'         => $ok,
			'checked_at' => time(),
			'message'    => isset( $body['message'] ) ? (string) $body['message'] : '',
		];
		update_option( self::OPTION, $state, false );

		return $state;
	}

	/**
	 * True when the last cached probe says the cloud could NOT reach this
	 * site's webhook. Factored out so the SPA config localiser, the
	 * wp-admin notice, the diagnostics run, and unit tests share one
	 * source of truth — mirrors `Wp_Cron_Disabled_Notice::is_triggered()`.
	 *
	 * Returns false when no probe has ever run (unknown ≠ broken).
	 */
	public static function is_unreachable(): bool {
		$state = get_option( self::OPTION );
		if ( ! is_array( $state ) || ! array_key_exists( 'ok', $state ) ) {
			return false;
		}
		return $state['ok'] === false;
	}

	/**
	 * The raw cached verdict (or null when never probed). Exposed for the
	 * diagnostics summary and tests.
	 *
	 * @return array{ok:bool,checked_at:int,message:string}|null
	 */
	public static function last_state(): ?array {
		$state = get_option( self::OPTION );
		return is_array( $state ) && array_key_exists( 'ok', $state ) ? $state : null;
	}
}
