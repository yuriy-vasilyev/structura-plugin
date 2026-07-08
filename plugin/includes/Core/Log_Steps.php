<?php
/**
 * Canonical step names used across every structured log line.
 *
 * Spec: specs/admin-log-triage.md §4.3.
 *
 * Mirror of `functions/src/logger/steps.ts`. Both sides must stay in
 * lockstep so Cloud Logging filters like `step="CAMPAIGN:OUTLINE"`
 * surface matched rows regardless of which side emitted them.
 *
 * Why a class of `const` (rather than a set of `define()` calls):
 *   - Namespaced under `Structura\Core` — no global naming collision.
 *   - IDE autocomplete works on callsites (`Log_Steps::CAMPAIGN_OUTLINE`).
 *   - A typo at the callsite is a fatal PHP error, not a silent string.
 *
 * When adding a step:
 *   1. Add the constant here.
 *   2. Mirror it in `functions/src/logger/steps.ts`.
 *   3. If the step represents a user-visible milestone, also update
 *      `Milestone` in `packages/types/src/index.ts` — but the two
 *      concepts are distinct (Milestone is the progress-drawer catalog,
 *      Log_Steps is the log filter key).
 */

namespace Structura\Core;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class Log_Steps
 *
 * Constants for the `step` column on `structura_logs` and for the
 * `step` field on every structured cloud log line.
 */
class Log_Steps {

	// Campaign assembly — cloud-side steps inside executeCloudCampaignStep.
	public const CAMPAIGN_KEYWORDS = 'CAMPAIGN:KEYWORDS';
	public const CAMPAIGN_OUTLINE  = 'CAMPAIGN:OUTLINE';

	// Content synthesis — each pass over the draft.
	public const CONTENT_DRAFT = 'CONTENT:DRAFT';
	public const CONTENT_VOICE = 'CONTENT:VOICE';
	public const CONTENT_SEO   = 'CONTENT:SEO';

	// Image generation — split because featured/body use different
	// providers and fail independently.
	public const IMAGE_FEATURED = 'IMAGE:FEATURED';
	public const IMAGE_BODY     = 'IMAGE:BODY';

	// Publish + distribution.
	public const PUBLISH  = 'PUBLISH';
	public const CHANNELS = 'CHANNELS';

	// Transport / orchestration layers.
	public const CLOUD_DELEGATION = 'CLOUD_DELEGATION';
	public const TASK_RUNNER      = 'TASK_RUNNER';

	// Per-post flow entry — kept lowercase for back-compat with existing
	// plugin-side log rows already persisted under `single_post`.
	public const SINGLE_POST = 'single_post';

	// Billing / account entry points.
	public const BILLING_WEBHOOK = 'BILLING:WEBHOOK';

	// License lifecycle — activation handshake.
	public const LICENSE_ACTIVATE = 'LICENSE:ACTIVATE';

	// OAuth callback entry — one step covers all integrations because
	// the provider is already carried in the log's `context` payload.
	public const OAUTH_CALLBACK = 'OAUTH:CALLBACK';

	// OAuth refresh — cloud-driven token rotation. Plugin emits this
	// step name only via the cloud's response; included here so plugin
	// callsites that surface a refresh failure use the same constant.
	public const OAUTH_REFRESH = 'OAUTH:REFRESH';

	// ── Plugin-only steps ──────────────────────────────────────────────
	//
	// These have no cloud-side counterpart — they represent work that
	// only runs inside WordPress. They're still declared here so every
	// `step` string in the plugin flows through one canonical constant
	// file; a typo at a callsite becomes a fatal PHP error rather than
	// a silent bucket nobody thought to filter on.
	//
	// When adding a new plugin-only step, DO NOT mirror into the cloud
	// steps.ts — having a step that only fires on one side is
	// legitimate and expected.

	/** Pulse/lifecycle scheduler transitions (activate/deactivate/jitter). */
	public const LIFECYCLE = 'lifecycle';

	/** WordPress post-insert + content-to-post conversion. */
	public const CONTENT_GENERATION = 'content_generation';

	/** Image generation / attachment inside WordPress. */
	public const VISUALS = 'visuals';

	/** `media_sideload_image()` + attachment bookkeeping. */
	public const SIDELOAD = 'sideload';

	/**
	 * BYOK credential gap surfaced by the cloud-only-gen resolver.
	 * Stamped on the log row when the cloud returns the structured
	 * `credentials_missing` rejection (Phase 3 of
	 * `specs/v2/cloud-only-generation.md`). The campaign stays
	 * scheduled — auto-pause is intentionally NOT triggered; the user
	 * reconnects a key and the next AS tick succeeds without a manual
	 * resume.
	 */
	public const CREDENTIALS_MISSING = 'credentials_missing';
}
