<?php
/**
 * User-triggered WP-environment diagnostics.
 *
 * Spec: 'specs/v2/notification-center.md' §4.2 / §11.2.
 *
 * Surfaces a small set of WP-side health probes — things the cloud
 * can't see from its side of the wire — and routes each finding
 * through the cloud's 'noticesReport' HTTP endpoint so it lands in
 * the user's Notification Center as a 'plugin-health' notice.
 *
 * Fires only when the user clicks "Run diagnostics" on Settings;
 * never on plugin bootstrap (per spec §11.2). Returns a summary
 * the SPA can render in a toast ('{ checksRun, findings }').
 *
 * Checks today
 * ------------
 *   - **scheduler**: 'DISABLE_WP_CRON' set in wp-config? Without
 *     wp-cron OR a system cron hitting wp-cron.php, Action
 *     Scheduler stalls and every scheduled Structura task stops
 *     ticking. Reuses 'Wp_Cron_Disabled_Notice::is_triggered()'
 *     so the probe stays a single source of truth.
 *   - **connectivity**: Can the cloud reach this site's blueprint
 *     webhook? Runs the live handshake via
 *     'Site_Reachability::probe_and_store()' (also refreshing the
 *     cached verdict the in-SPA / wp-admin banners read). Fires an
 *     'error' finding when a localhost/private/firewalled site means
 *     generated posts can never be delivered back.
 *   - **version**: Plugin behind the cloud's minimum required
 *     version? Cloud_Client flags this on every cloud call via
 *     'structura_update_required'; we just translate the option
 *     into a notice.
 *   - **compat**: Placeholder — returns no findings for v1. Hook
 *     point for future page-builder / theme conflict probes.
 *
 * Each finding is a '{ subjectId, severity, errorCode, params }'
 * blob; we map it to the cloud's title/body/cta i18n keys
 * ('notices.pluginHealth.<subjectId>.{title,body,cta}') — same
 * keys we already populated in 'web/src/i18n/locales/<locale>/notices.json'
 * and the wp-admin .po pipeline.
 */

namespace Structura\Core;

use Structura\Ui\Wp_Cron_Disabled_Notice;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Diagnostics {

	/**
	 * Single i18n key prefix for plugin-health notices. The cloud's
	 * notice classifier accepts any key starting with this prefix and
	 * the existing translations cover 'compat', 'scheduler', and
	 * 'version' subjectIds.
	 */
	private const KEY_PREFIX = 'notices.pluginHealth';

	/**
	 * Run the full check set and push each finding to the cloud. Returns
	 * a summary suitable for a REST response body — the SPA renders the
	 * count in a toast and refetches the notices query so the inbox
	 * updates without a page reload.
	 *
	 * @return array{checksRun:int, findings: array<int, array{subjectId:string,severity:string,errorCode:?string}>}
	 */
	public static function run(): array {
		$findings = [];

		// ── scheduler ─────────────────────────────────────────────
		// DISABLE_WP_CRON is the primary blocker; a system cron
		// pointing at wp-cron.php fixes it, but the probe can't
		// detect that from PHP alone — surfacing the constant gives
		// the user the right thing to investigate.
		if ( Wp_Cron_Disabled_Notice::is_triggered() ) {
			$findings[] = [
				'subjectId' => 'scheduler',
				'severity'  => 'error',
				'errorCode' => 'wp_cron_disabled',
			];
		}

		// ── connectivity ─────────────────────────────────────────
		// Run the live cloud → plugin handshake fresh (it also refreshes
		// the cached verdict the banners read) and flag when the cloud
		// can't reach this site's webhook. Without inbound reachability
		// no generated post is ever delivered, so this is an `error`, not
		// a warning. The probe self-bails to ok when there's no license
		// or our own egress to the cloud is down, so this finding only
		// fires on an authoritative "cloud could not reach us" verdict.
		$reach = Site_Reachability::probe_and_store();
		if ( isset( $reach['ok'] ) && false === $reach['ok'] ) {
			$findings[] = [
				'subjectId' => 'connectivity',
				'severity'  => 'error',
				'errorCode' => 'site_unreachable',
			];
		}

		// ── version ──────────────────────────────────────────────
		// Cloud_Client::flag_update_required() writes this option
		// whenever a cloud call returns a min-version mismatch.
		// If it's set, the plugin is below the floor and the user
		// should update.
		$min_required = get_option( 'structura_update_required', false );
		if ( $min_required ) {
			$findings[] = [
				'subjectId' => 'version',
				'severity'  => 'warning',
				'errorCode' => 'plugin_outdated',
				'params'    => [
					'current'  => defined( 'STRUCTURA_VERSION' ) ? STRUCTURA_VERSION : 'unknown',
					'required' => (string) $min_required,
				],
			];
		}

		// ── compat ───────────────────────────────────────────────
		// Placeholder for future page-builder / theme conflict
		// probes. The check set lives in self::scan_compat() so
		// the loop below stays uniform when new probes land.
		$compat_findings = self::scan_compat();
		foreach ( $compat_findings as $finding ) {
			$findings[] = $finding;
		}

		// Report each finding to the cloud. We don't short-circuit
		// on a single failure — the user gets ALL of the issues in
		// one diagnostic run so they don't have to keep clicking.
		foreach ( $findings as $finding ) {
			self::report_to_cloud( $finding );
		}

		return [
			'checksRun' => 4, // scheduler, connectivity, version, compat
			'findings'  => array_map(
				static fn( array $f ): array => [
					'subjectId' => $f['subjectId'],
					'severity'  => $f['severity'],
					'errorCode' => $f['errorCode'] ?? null,
				],
				$findings
			),
		];
	}

	/**
	 * Hook point for future page-builder / theme conflict probes.
	 * Returns the same finding shape used by self::run().
	 *
	 * @return array<int, array{subjectId:string,severity:string,errorCode:?string,params?:array<string,string>}>
	 */
	private static function scan_compat(): array {
		// Intentionally empty for v1. Add probes here as we
		// identify known-bad combos; the spec calls out page-
		// builder strip-from-save as a candidate. Keeping the
		// hook present means the SPA's "3 checks run" counter
		// stays accurate even when no findings fire.
		return [];
	}

	/**
	 * Translate a finding to the cloud's noticesReport wire shape
	 * and POST it. Best-effort — failures here don't block other
	 * findings; the surrounding loop continues.
	 */
	private static function report_to_cloud( array $finding ): void {
		$subject_id = (string) $finding['subjectId'];
		$payload    = [
			'category'  => 'plugin-health',
			'subjectId' => $subject_id,
			'severity'  => (string) $finding['severity'],
			'titleKey'  => self::KEY_PREFIX . '.' . $subject_id . '.title',
			'bodyKey'   => self::KEY_PREFIX . '.' . $subject_id . '.body',
		];
		if ( ! empty( $finding['params'] ) && is_array( $finding['params'] ) ) {
			$payload['bodyParams'] = $finding['params'];
		}
		if ( ! empty( $finding['errorCode'] ) ) {
			$payload['errorCode'] = (string) $finding['errorCode'];
		}

		// Fire-and-forget. The endpoint's own contract is fire-and-
		// forget (upsertNotice doesn't block), so a slow cloud
		// response here means the user's run takes a couple seconds.
		// We don't surface cloud errors to the UI because the
		// per-finding success isn't actionable — the user clicked
		// Run, we ran. The classifier's dedup handles re-reports
		// idempotently.
		Cloud_Client::post( '/noticesReport', $payload );
	}
}
