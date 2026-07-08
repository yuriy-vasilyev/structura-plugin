/**
 * Client-side types for the Channels feature.
 *
 * These mirror the cloud-side wire shapes (functions/src/channels/dispatcher/types.ts
 * and functions/src/channels/endpoints/connections.ts) but are intentionally narrower:
 * the client never instantiates integration classes; it only renders the
 * connection summary returned by the cloud and the per-event result rows
 * the dispatcher produced.
 *
 * Spec: specs/integrations-store-spec.md §5.1, §6, §10
 */

export type IntegrationCategory =
  | "notify"
  | "social"
  | "email"
  | "seo"
  | "ads"
  | "crm"
  | "video";

export type IntegrationSku = "free" | "channels" | "growth";

/**
 * Auth mode used by an integration — mirrors `IntegrationAuthType` in the
 * cloud contracts. The Store's install modal branches on this to decide what
 * form to render (webhook URL input, OAuth redirect, API-key field, etc.).
 */
export type IntegrationAuthType = "oauth2" | "webhook" | "apikey" | "none";

/**
 * Capabilities an integration advertises. Keep in lockstep with
 * `IntegrationCapability` on the cloud side.
 */
export type IntegrationCapability = "adapt" | "publish" | "notify";

/**
 * Connection-scoped add-on tier. Only one exists today ("channels"); "growth"
 * will join once the LinkedIn/Mailchimp bundle lands.
 */
export type ConnectionAddon = "channels";

/**
 * Structura plan identifiers — subset of cloud's `PlanId`, defined here so
 * the client doesn't need to import from `functions/`.
 */
export type PlanId = "free" | "byok" | "cloud" | "cloud_pro";

export type ConnectionStatus = "connected" | "expired" | "revoked" | "error";

/**
 * Status values the cloud dispatcher emits per integration. Mirrors
 * `DispatchResultRow["status"]` 1:1 — keep these in lockstep.
 *
 *   - `ok`              — delivered
 *   - `skipped`         — dispatcher chose not to call (SKU gate, etc.)
 *   - `transient_error` — retry-worthy
 *   - `permanent_error` — won't auto-retry; user must reconnect / reconfigure
 *   - `timeout`         — exceeded the per-integration deadline
 */
export type DispatchResultStatus =
  | "ok"
  | "skipped"
  // Deliberate anti-spam throttle (per-connection cooldown / cadence gate).
  // A benign non-delivery, presented like `skipped` — NOT a failure.
  | "rate_limited"
  | "transient_error"
  | "permanent_error"
  | "timeout";

/**
 * Catalog entry as returned by the cloud `channelsListCatalog` endpoint.
 *
 * The cloud is authoritative on `entitlement`: the UI never computes gating
 * itself, it just renders whatever `canInstall` / `blocker` says. That keeps
 * the plan + add-on checks in one place and prevents a client-side spoof
 * from "installing" something the caller isn't entitled to.
 */
export interface IntegrationCatalogEntry {
  id: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  capabilities: IntegrationCapability[];
  authType: IntegrationAuthType;
  iconUrl: string;
  docsUrl?: string;
  gating: {
    requiredPlan: PlanId;
    requiredAddon: ConnectionAddon | null;
  };
  comingSoon?: boolean;
  entitlement: {
    canInstall: boolean;
    blocker: "upgrade_plan" | "add_channels" | "coming_soon" | null;
  };
}

/**
 * Response envelope for `GET /channels/catalog`. The top-level `plan` and
 * `activeAddons` fields are handy for rendering the "You're on Pro" banner
 * and avoiding an extra license-status round-trip.
 */
export interface ListCatalogResponse {
  success: true;
  plan: PlanId;
  activeAddons: ConnectionAddon[];
  entries: IntegrationCatalogEntry[];
}

/**
 * Wire shape of the `lastError` field on a connection summary. Matches what
 * `toSummary()` projects on the cloud side: code + message + ISO timestamp,
 * any of which may be missing/null.
 */
export interface ConnectionLastError {
  code: string;
  message: string;
  at: string | null;
}

/**
 * Connection summary as returned by the cloud `channelsListConnections` and
 * `channelsSaveWebhookConnection` endpoints.
 *
 * The encrypted token blob lives in a separate `connectionSecrets/...`
 * collection and is admin-SDK only, so it's never on this shape — only the
 * derivative state that's safe to render in wp-admin is here.
 */
export interface ConnectionSummary {
  /**
   * Stable per-connection identifier (UUID post-migration). Use this as the
   * React key and the delete/update target — multiple connections can share
   * the same `integrationId`, so keying on that would collapse sibling rows.
   *
   * Optional on read for back-compat with pre-migration docs where the
   * summary was identified by `integrationId` alone; consumers should fall
   * back to `integrationId` when this is missing.
   */
  connectionId?: string;
  integrationId: string;
  status: ConnectionStatus;
  displayName: string;
  /** Human-readable identifier for the destination (e.g. webhook host). */
  externalAccountId: string | null;
  /** ISO 8601 timestamp; null if the connection has never been (re)saved. */
  connectedAt: string | null;
  /** ISO 8601 timestamp; null until at least one notify() has fired. */
  lastUsedAt: string | null;
  /** Last failure surfaced by the integration; null when healthy. */
  lastError: ConnectionLastError | null;
  /**
   * Per-connection notification locale override.
   *
   *   - `"system"`  — follow the site locale at dispatch time (the install
   *     modal default; appropriate for a single-language WP install).
   *   - `"en" | "de" | "es" | "fr"` — explicit override; every notification
   *     posted through this connection renders in the chosen locale
   *     regardless of the post's site locale. Intended for agencies running
   *     non-English client sites while notifying a reviewer team elsewhere.
   *
   * Optional on read so pre-1.x connection docs (which never wrote this
   * field) deserialize cleanly.
   */
  notificationLocale?: string;
  /**
   * Per-campaign binding filter. When non-empty, the cloud dispatcher only
   * dispatches this connection for events whose `campaignId` is in the
   * list — skipped connections surface as `"campaign_not_bound"` in the
   * activity log.
   *
   *   - `undefined` / `null` — "all campaigns" (the default for connections
   *     made before bindings landed, and the intent new connections carry
   *     unless a user narrows them).
   *   - `(number | string)[]` — explicit allowlist. Mixed-type: legacy
   *     WP-authoritative campaigns are int post ids, cloud-authoritative
   *     ones are string nanoids. The dispatcher matches verbatim with
   *     `.includes(event.campaignId)`, so the SPA must round-trip native
   *     shapes without coercion.
   *
   * Source of truth is the cloud's `ConnectionRecord.boundCampaignIds`
   * (functions/src/channels/dispatcher/types.ts). Both the Channels
   * connection-edit modal and the Campaign-edit "Channels" section read
   * and write this field — they're two lenses on one piece of data.
   *
   * Optional on read so pre-binding connection docs deserialize cleanly.
   * Spec: specs/integrations-store-spec.md §5.2 + 2026-04-16 changelog.
   */
  boundCampaignIds?: (number | string)[] | null;
  /**
   * "Every Nth post" cadence — when set to `2+` the dispatcher only
   * fans this connection out on the Nth qualifying event. Omitted (or
   * `1`) means "every post." Combined with a 4h frequency floor so a
   * burst of N posts in 10 minutes still gets throttled. Clamped to
   * `[1, 50]` on the cloud side.
   */
  postCadenceN?: number;
  /**
   * Per-connection "attach featured image" toggle for
   * publishable+image-supporting integrations (LinkedIn today).
   * Defaults to `true` when omitted — preserves the always-on
   * pre-toggle behaviour for connections that pre-date the field.
   * Ignored by integrations that don't ship an image (Slack,
   * Discord, IndexNow, webhook-ping).
   */
  attachFeaturedImage?: boolean;
  /**
   * Public, integration-specific metadata. IndexNow writes its keyfile state
   * here (see {@link IndexNowMeta}); LinkedIn writes its posting-target state
   * (see {@link LinkedInMeta}). Other integrations leave the field absent and
   * the row UI degrades to the generic shape.
   *
   * Spec: `specs/site-identity-headless.md` §6.
   */
  externalAccountMeta?: IndexNowMeta | LinkedInMeta | Record<string, unknown>;
  /**
   * Video-channel voice id (`"ava"` … `"noah"`, see `VIDEO_VOICES` in
   * `videoChannel.ts`). Only present on `integrationId === "video"`
   * connections; the cloud defaults fresh installs to `"ava"`. Optional on
   * read — the UI falls back to the Ava default when absent so a
   * pre-video-release doc (or a non-video connection) renders cleanly.
   */
  videoVoice?: string;
  /**
   * Video-channel visual-style preset id (`"clean" | "bold" | "kinetic"`).
   * Same presence/back-compat semantics as {@link videoVoice}; defaults to
   * `"clean"` when absent.
   */
  videoStyle?: string;
}

/**
 * A LinkedIn Page the connected member administers, as captured at connect
 * time from the `organizationAcls` lookup.
 */
export interface LinkedInOrganization {
  organizationUrn: string;
  name: string;
}

/**
 * LinkedIn-specific connection metadata persisted on the connection summary.
 * Drives the post-connect "Posting target" picker in the Configure modal.
 *
 *   - `personUrn` / `displayName` — the connected human's identity, used to
 *     restore the label when switching the target back to the personal profile.
 *   - `organizationUrn` / `organizationName` — the active company-Page target.
 *     Absent when the connection posts to the personal profile.
 *   - `availableOrganizations` — every Page the member administers. Present
 *     only when the user connected with company access; the picker renders one
 *     option per entry plus "Personal profile".
 */
export interface LinkedInMeta {
  personUrn?: string | null;
  displayName?: string | null;
  organizationUrn?: string;
  organizationName?: string;
  availableOrganizations?: LinkedInOrganization[];
}

/**
 * IndexNow-specific connection metadata persisted on the connection
 * summary. Mirrored from the cloud's `externalAccountMeta` block. The
 * SPA renders the keyfile-download + verify-status UX off these
 * fields without ever touching the encrypted secrets blob.
 *
 * `verifiedAt` is ISO-8601 when present; `verifyError` carries the
 * typed error from the most recent verification attempt. Mutually
 * exclusive — verify endpoint clears one when it sets the other.
 *
 * Spec: `specs/site-identity-headless.md` §6.
 */
export interface IndexNowMeta {
  key?: string;
  keyLocation?: string;
  verifiedAt?: string | null;
  verifyError?: { code: string; message: string } | null;
}

/**
 * Per-integration row inside a `ChannelEvent.results` map. Phase 1 always
 * leaves `results` empty; Phase 2+ fills it in once integrations actually run.
 *
 * `finishedAt` is serialized to ISO 8601 over the wire (the cloud's
 * `DispatchResultRow.finishedAt` is a `Date` that gets stringified by
 * Firestore before reaching the client).
 */
export interface ChannelEventResultRow {
  status: DispatchResultStatus;
  /**
   * Integration this row is for (`"linkedin"`, `"slack-webhook"`, …). The
   * `results` map is keyed by connectionId now, so read this for the channel
   * name — the key is an opaque UUID. Optional for back-compat: legacy rows
   * were keyed by integrationId, so consumers fall back to the map key.
   */
  integrationId?: string;
  /** Connection this row is for (opaque UUID). Present post-2026-07 re-key. */
  connectionId?: string;
  externalRef?: string;
  externalUrl?: string;
  error?: { code: string; message: string };
  finishedAt: string;
}

/**
 * Video render job status as reported by the cloud pipeline. `"skipped_quota"`
 * means the post published while the monthly video quota was exhausted, so no
 * render was attempted (and nothing was consumed).
 *
 * Note there is deliberately NO `"expired"` on the wire — expiry of the
 * 7-day signed download URL is derived client-side from
 * `status === "ready" && expiresAt < now` (see `resolveVideoRowState` in
 * `videoChannel.ts`), so the doc never needs a scheduled rewrite.
 */
export type VideoJobStatus = "rendering" | "ready" | "failed" | "skipped_quota";

/**
 * Per-platform paste packages generated alongside a video render — one
 * fully-composed string per platform upload field, with `\n\n` between
 * blocks. There is deliberately NO structured `hooks` field on the wire:
 * presentation (hook emphasis, hashtag run, advisory counters) is derived
 * client-side (see `parseCaptionBlocks` / `captionHook` in
 * `videoChannel.ts`), and copy payloads are these raw strings verbatim.
 *
 * Design handoff: marketing/design_handoff_platform_captions/README.md.
 */
export interface VideoSocialPackages {
  shorts: { title: string; description: string };
  tiktok: { caption: string };
  reels: { caption: string };
}

/**
 * Video render job attached to a channel event when the Video channel
 * dispatched for it. Mirrors the cloud-side job projection on
 * `channelsListEvents` rows; every field beyond `jobId`/`status` is
 * optional so partial pipeline states (and older clouds) deserialize
 * cleanly during the rollout window.
 */
export interface VideoJob {
  jobId: string;
  status: VideoJobStatus;
  /** Free-form pipeline stage ("generating voiceover…") while rendering. */
  stage?: string;
  /** Signed download URL — present once `status === "ready"`. */
  downloadUrl?: string;
  /** First-frame thumbnail for the 9:16 preview tile / lightbox poster. */
  thumbnailUrl?: string;
  /** Signed SRT sidecar — closed captions for the manual upload. */
  srtUrl?: string;
  durationSec?: number;
  bytes?: number;
  /** ISO 8601 expiry of the signed download URL (7-day window). */
  expiresAt?: string;
  /** Suggested caption for the manual upload (phase 1 is render-only). */
  socialCaption?: string;
  hashtags?: string[];
  /**
   * Per-platform caption packages (YouTube Shorts / TikTok / Instagram
   * Reels). Absent on videos rendered before 2026-07 — the Ready row
   * falls back to the legacy layout (no switcher, no counters; handoff
   * board 05). Read through `isSocialPackages()` so a malformed doc
   * degrades to absent instead of rendering broken paste buttons.
   */
  socialPackages?: VideoSocialPackages;
  /** Quota snapshot at decision time — populated on `skipped_quota`. */
  quotaUsed?: number;
  quotaCap?: number;
  /** Human-readable failure — populated on `failed`. */
  error?: { code: string; message: string };
}

/**
 * Activity-log entry rendered on the Channels Activity page. Mirrors the
 * cloud-side `ChannelEventDoc` (functions/src/channels/dispatcher/types.ts)
 * with all timestamps already serialized to strings.
 */
export interface ChannelEvent {
  id: string;
  type: "post_published";
  postId: number;
  campaignId: string | number;
  postTitle: string;
  postUrl: string | null;
  publishedAt: string | null;
  /** Integration IDs the dispatcher fanned out to. Empty in Phase 1. */
  dispatchedTo: string[];
  results: Record<string, ChannelEventResultRow>;
  createdAt: string;
  /**
   * Video render lifecycle for this event, when the Video channel was
   * dispatched. Optional on read — events created before the video
   * channel shipped (and non-video events) simply omit it, and the
   * Activity page falls back to the generic dispatch row.
   */
  videoJob?: VideoJob;
}

/**
 * Monthly video-render quota for the activation, returned top-level on
 * `channelsListConnections`. Optional during the rollout window — older
 * clouds don't send it and the meters simply stay hidden.
 */
export interface VideoQuota {
  used: number;
  cap: number;
}

/**
 * Bound-visual-preset digest for the Video channel's read-only style
 * summary in the Configure dialog (video-visuals handoff §3). Mirrors
 * `BoundVisualPresetSummary` in
 * `functions/src/channels/endpoints/connections.ts` — deliberately NOT
 * the whole preset: the dialog is read-only and `hasPalette` (not the
 * hexes) is all its meta line needs. `videoStyle` / `captionPlacement`
 * arrive pre-resolved to the renderer's effective defaults
 * (clean / bottom) so the dialog shows what actually renders.
 */
export interface BoundVisualPresetSummary {
  presetId: string;
  label: string;
  videoStyle: "clean" | "bold" | "kinetic";
  captionPlacement: "top" | "middle" | "bottom";
  hasPalette: boolean;
}

// ── Endpoint response envelopes ─────────────────────────────────────────────

export interface ListConnectionsResponse {
  success: true;
  connections: ConnectionSummary[];
  /**
   * Monthly video quota — present once the cloud ships the video channel
   * and the activation has (or can have) a video connection. Read
   * defensively for at least one release window.
   */
  videoQuota?: VideoQuota;
  /**
   * Bound-preset digest for the Video dialog's style summary. Tri-state
   * on the wire, and the distinction matters:
   *
   *   - object  → summary row (preset owns video styling)
   *   - `null`  → "no preset bound yet" edge state
   *   - absent  → OLDER CLOUD (pre video-visuals) — the dialog keeps
   *     rendering its legacy per-connection style radios for at least
   *     one release window.
   */
  boundVisualPreset?: BoundVisualPresetSummary | null;
}

export interface SaveConnectionResponse {
  success: true;
  connection: ConnectionSummary;
}

/**
 * Response from `POST /channels/oauth/init`. Contains the provider's
 * authorize URL — the client redirects the browser to it.
 */
export interface OAuthInitResponse {
  success: true;
  authorizeUrl: string;
}

export interface DeleteConnectionResponse {
  success: true;
  /**
   * Stable id of the connection that was deleted — echoed back so optimistic
   * cache updates can splice the exact row out even when multiple connections
   * share the same `integrationId`. Matches what cloud `channelsDeleteConnection`
   * returns post-migration.
   */
  connectionId: string;
}

/**
 * Body the WP REST proxy expects for POST `/channels/connections/webhook`.
 * `display_name` is optional — the cloud falls back to the integration's
 * catalog name when omitted. `notification_locale` is also optional and,
 * when omitted, the cloud treats it as `"system"` (follow the site locale
 * at dispatch time).
 *
 * Accepted `notification_locale` values:
 *   - `"system"` — follow site locale at dispatch (default)
 *   - `"en" | "de" | "es" | "fr"` — explicit per-connection override
 *
 * Unknown values are normalized to `"system"` cloud-side, so the plugin
 * stays forward-compatible if we add a new supported code without a
 * plugin release.
 */
export interface SaveWebhookConnectionInput {
  integration_id: string;
  /**
   * Explicit connection id to update in place. Omit (or leave undefined) to
   * mint a fresh UUID-keyed row — the default for "Install" clicks in the
   * Store. The Edit flow passes the current `connection.connectionId` through
   * so the save is idempotent against the existing row.
   */
  connection_id?: string;
  webhook_url: string;
  /**
   * HMAC signing secret for integrations whose outbound bodies are signed
   * (webhook-ping today). Ignored by the cloud for unsigned webhook
   * integrations (slack, discord). The install UI generates a 32-byte hex
   * value via `crypto.getRandomValues` when the integration flags it as
   * required; users can also paste their own provided it's ≥16 chars
   * (cloud-side minimum).
   */
  signing_secret?: string;
  display_name?: string;
  notification_locale?: string;
  /**
   * Per-campaign binding filter (see `ConnectionSummary.boundCampaignIds`).
   * Omit or pass `null` for the "all campaigns" default. Pass an empty
   * array and the cloud normalizes it back to `null`.
   */
  bound_campaign_ids?: (string | number)[] | null;
  /**
   * "Every Nth post" cadence (see `ConnectionSummary.postCadenceN`).
   * Omit for the default `1` (every post). Clamped to `[1, 50]` cloud-side.
   */
  post_cadence_n?: number;
}

/**
 * Body the WP REST proxy expects for POST `/channels/connections/credential`.
 * Used by non-webhook integrations (email-owner, telegram, whatsapp) where
 * the user enters API keys, tokens, or recipient addresses instead of a
 * webhook URL.
 *
 * `credentials` is a flat key/value map whose shape varies per integration:
 *   - email-owner:  `{ recipientEmail }`
 *   - telegram:     `{ botToken, chatId }`
 *   - whatsapp:     `{ phoneNumberId, accessToken, recipientPhone }`
 *
 * The cloud validates the credential shape per integration via the matching
 * `validate*Credentials()` function in `functions/src/channels/endpoints/connections.ts`.
 */
export interface SaveCredentialConnectionInput {
  integration_id: string;
  /**
   * Explicit connection id to update in place. Omit for fresh install.
   */
  connection_id?: string;
  credentials: Record<string, string>;
  display_name?: string;
  notification_locale?: string;
  /**
   * Per-campaign binding filter (see `ConnectionSummary.boundCampaignIds`).
   * Omit or pass `null` for the "all campaigns" default.
   */
  bound_campaign_ids?: (string | number)[] | null;
  /** "Every Nth post" cadence — same semantics as on webhook saves. */
  post_cadence_n?: number;
}

/**
 * Body the WP REST proxy expects for POST `/channels/connections/settings`.
 *
 * Settings-only edit for an existing connection — works across every
 * auth type including OAuth (whose install flow has no other "save
 * settings" hop). All three user-managed fields are optional on the
 * wire: omit one to leave it untouched; pass `null` to
 * `bound_campaign_ids` to clear an existing binding.
 */
export interface UpdateConnectionSettingsInput {
  connection_id: string;
  notification_locale?: string;
  bound_campaign_ids?: (string | number)[] | null;
  post_cadence_n?: number;
  /**
   * Per-connection "attach featured image" toggle. Default `true`
   * applies on the cloud when omitted; pass `false` explicitly to
   * publish text-only social posts. Only meaningful on integrations
   * that upload an image alongside the post (LinkedIn, X).
   */
  attach_featured_image?: boolean;
  /**
   * LinkedIn-only posting-target switch. Omit to leave the target untouched;
   * `"personal"` (or `""`) posts to the personal profile; an org URN from
   * {@link LinkedInMeta.availableOrganizations} posts as that company Page.
   * The cloud validates the URN against the connection's administered Pages.
   */
  selected_organization_urn?: string;
  /**
   * Video-only voiceover voice id (one of `VIDEO_VOICES`). Only send for
   * `integrationId === "video"` connections — the cloud validates the id
   * against its own voice catalog and ignores the field elsewhere.
   */
  video_voice?: string;
  /**
   * Video-only visual-style preset id (`clean | bold | kinetic`). Same
   * send-only-for-video rule as {@link video_voice}.
   */
  video_style?: string;
}

/**
 * Response from POST `/channels/video/retry` (WP proxy →
 * cloud `channelsVideoRetry`). Retries a failed render or regenerates an
 * expired one; the returned `jobId` is the (re)queued job.
 */
export interface VideoRetryResponse {
  success: true;
  jobId: string;
}

/**
 * Argument shape for `initOAuth`. `postAsOrg` is LinkedIn-only — when `true`
 * the cloud requests the company-page OAuth scopes so the user can post on
 * behalf of a Page they administer.
 */
export interface OAuthInitInput {
  integrationId: string;
  postAsOrg?: boolean;
}
