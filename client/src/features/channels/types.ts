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
 *
 * `insights` (2026-07, Google Search Console) marks a READ-ONLY inbound
 * data source: the dispatcher never fans out to it and no dispatch
 * settings (bindings, cadence, locale) apply. The cloud may ship new
 * capability strings before the plugin updates, so render surfaces must
 * treat unknown values defensively (see `capabilityLabel` in labels.ts).
 */
export type IntegrationCapability = "adapt" | "publish" | "notify" | "insights";

/**
 * Integration id of the Google Search Console channel. Exported (like
 * `VIDEO_INTEGRATION_ID` in videoChannel.ts) because three surfaces
 * branch on it: the install modal's read-only note, the configure
 * modal's property picker, and the connection row's meta line.
 */
export const GSC_INTEGRATION_ID = "google-search-console";

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
  externalAccountMeta?:
    | IndexNowMeta
    | LinkedInMeta
    | GoogleSearchConsoleMeta
    | Record<string, unknown>;
  /**
   * Video-channel voiceover voice. Canonical `provider:id` form
   * (`"openai:nova"`, `"gemini:Zephyr"`) post voice-picker-v2; legacy
   * persona ids (`"ava"` … `"noah"`) stay valid forever and resolve via
   * `resolveStoredVideoVoice()` in `@structura/types`. Only present on
   * `integrationId === "video"` connections. Optional on read — the UI
   * falls back to `DEFAULT_VIDEO_VOICE` (`gemini:Zephyr`) when absent so
   * a pre-video-release doc (or a non-video connection) renders cleanly.
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
 * A verified Search Console property the connected Google account can read,
 * as captured at connect time from the GSC `sites` lookup.
 *
 * `siteUrl` is the property id in Google's two shapes:
 *   - URL-prefix: `"https://example.com/"` — rendered verbatim.
 *   - Domain property: `"sc-domain:example.com"` — rendered as the bare
 *     domain with a "Domain property" tag (the prefix is Google-internal).
 *
 * `permissionLevel` is Google's access string — `siteOwner` /
 * `siteFullUser` / `siteRestrictedUser` / `siteUnverifiedUser`. The connect
 * modal renders it as a permission badge and treats ONLY
 * `siteUnverifiedUser` as unusable (Search Analytics rejects it; Restricted
 * is enough for Structura's read-only pulls). Typed as `string` (not a
 * union) so a new Google level degrades gracefully on older plugins.
 */
export interface GoogleSearchConsoleProperty {
  siteUrl: string;
  permissionLevel: string;
}

/**
 * Google Search Console connection metadata persisted on the connection
 * summary. Drives the four-state connect modal (design handoff:
 * marketing/design_handoff_gsc_connect_flow): auto-matched confirm,
 * property picker, no-property guidance, insufficient-permission error.
 *
 *   - `googleEmail` — the connected Google account (also the connection's
 *     `displayName`); `null` when the userinfo lookup failed at connect.
 *   - `property` — the active property id (`externalAccountId` mirrors it);
 *     `null` when the connect flow couldn't auto-match one to this site.
 *   - `availableProperties` — every property the account can SEE, including
 *     `siteUnverifiedUser` entries (that presence is how the
 *     insufficient-permission state renders). Empty means the account has
 *     no property at all → guidance state. Derive through
 *     `deriveGscConnectView` / `usableGscProperties` in `gscConnect.ts`.
 *
 * Mirrors the cloud's `externalAccountMeta` block (spec:
 * specs/gsc-integration.md §4).
 */
export interface GoogleSearchConsoleMeta {
  googleEmail?: string | null;
  property?: string | null;
  availableProperties?: GoogleSearchConsoleProperty[];
}

/**
 * Mirror-connection state carried on every GSC read response.
 *
 *   - `not_connected` — no GSC connection on this activation.
 *   - `expired`       — connection needs a re-auth; last-known page data
 *                       is still returned so surfaces can show history.
 *   - `pulling`       — first mirror pull is running; poll until `ready`.
 *   - `ready`         — mirror is fresh through `freshThrough`.
 *
 * Spec: specs/gsc-integration.md §5.
 */
export type GscMirrorState =
  | "not_connected"
  /** OAuth done but no property chosen — send to the Configure picker. */
  | "property_pending"
  | "expired"
  | "pulling"
  | "ready";

/**
 * One 28-day metric window (current or previous) for a page.
 *
 * `ctr` is the wire's 0..1 fraction — format via
 * `formatCtr` from `@structura/ui/search-perf`, never `* 100` by hand,
 * so the plugin and portal always agree on rounding.
 */
export interface GscMetricTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** One day of the ≤90-day ascending daily series. `d` is `YYYY-MM-DD`. */
export interface GscSeriesPoint {
  d: string;
  clicks: number;
  impressions: number;
  position: number;
}

/** One row of `topQueries` (≤25, ordered by impressions on the wire). */
export interface GscTopQuery {
  q: string;
  clicks: number;
  impressions: number;
  position: number;
}

/**
 * Per-page stats block of the post-stats response. `null` at the
 * envelope level means GSC has no rows for this URL yet (collecting /
 * zero states — the caller branches on publish recency).
 */
export interface GscPageStats {
  url: string;
  last28: GscMetricTotals;
  prev28: GscMetricTotals;
  series: GscSeriesPoint[];
  topQueries: GscTopQuery[];
  /**
   * URL Inspection verdict. Only `"unknown"` is emitted this slice —
   * surfaces omit the index badge entirely until real verdicts land,
   * so keep reads defensive (`indexed` / `not_indexed` arrive later).
   */
  indexState?: string;
}

/**
 * Response from GET `/gsc/post-stats?page_url=…` (WP proxy → cloud GSC
 * mirror). `page` may be non-null even when `state === "expired"` —
 * last-known data survives a dead connection.
 */
export interface GscPostStatsResponse {
  success: true;
  state: GscMirrorState;
  /**
   * Connection doc id when a connection exists — used to deep-link the
   * channels Configure modal for `property_pending`.
   */
  connectionId?: string;
  /** Connected property id (e.g. `sc-domain:example.com`). */
  property?: string;
  /** `YYYY-MM-DD` the mirror is fresh through (GSC lags ~2 days). */
  freshThrough?: string;
  page: GscPageStats | null;
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
 * TTS provider availability for the video voice picker, returned
 * top-level on `channelsListConnections`. Mirrors `VideoTtsAvailability`
 * in `functions/src/channels/endpoints/connections.ts`.
 *
 *   - `managed: true` (cloud / cloud_pro) — renders narrate on platform
 *     master keys, so both provider groups are selectable and the picker
 *     shows no gate UI.
 *   - `managed: false` (BYOK) — a provider group is selectable iff the
 *     matching `providers` flag is `true` (active workspace credential).
 *
 * Optional during the rollout window: an older cloud omits it, and the
 * picker treats absence like `managed` (no gate UI) — never lock a user
 * out on missing data.
 */
export interface VideoTtsAvailability {
  managed: boolean;
  providers: { openai: boolean; gemini: boolean };
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
  /**
   * TTS provider availability for the voice picker's BYOK gating. Absent
   * on older clouds (pre voice-picker-v2) for at least one release
   * window — treated as "no gates" (see {@link VideoTtsAvailability}).
   */
  videoTts?: VideoTtsAvailability;
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
   * Google Search Console-only property switch. Must be one of the
   * connection's `externalAccountMeta.availableProperties[].siteUrl`
   * values — the cloud validates and 400s with a user-facing message
   * otherwise, so a tampered client can't point the connection at an
   * arbitrary property. Omit to leave the property untouched. Unlike
   * `selected_organization_urn` there is NO empty-string sentinel — the
   * WP proxy drops empty values instead of forwarding them.
   */
  selected_gsc_property?: string;
  /**
   * Video-only voiceover voice — canonical `provider:id` from
   * `VIDEO_VOICE_CATALOG` (`@structura/types`). The picker always writes
   * the canonical form; the cloud also accepts (and canonicalizes)
   * legacy persona ids. Only send for `integrationId === "video"`
   * connections — the cloud validates the id against its own voice
   * catalog and ignores the field elsewhere.
   */
  video_voice?: string;
  /**
   * Video-only visual-style preset id (`clean | bold | kinetic`). Same
   * send-only-for-video rule as {@link video_voice}.
   */
  video_style?: string;
}

/**
 * Response from POST `/gsc/refresh-properties` (WP proxy → cloud
 * `gscRefreshProperties`). Re-lists the account's Search Console
 * properties on the STORED token — no OAuth round-trip — and powers the
 * connect modal's "I've verified — check again" / "Try again" actions.
 *
 *   - `ok: true`  — the re-list ran; `properties` is the fresh list and
 *     `selected` is the server's auto-selection (it auto-selects a fresh
 *     match when none was chosen yet), or `null` when nothing matched.
 *   - `ok: false` — the re-list failed (dead token, Google 5xx …);
 *     `error` carries the user-facing message.
 *
 * The server persists any auto-selection itself, so the client only
 * re-derives its view state and invalidates the connections cache.
 */
export interface GscRefreshPropertiesResponse {
  success: boolean;
  ok: boolean;
  properties: GoogleSearchConsoleProperty[];
  selected: string | null;
  googleEmail: string | null;
  error?: string;
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
  /**
   * SPA hash route to land on after the OAuth bounce (wire: `return_hash`).
   * The WP proxy whitelists it to hash-route shape (`#/...`) and defaults to
   * `#/channels/connections` when absent — only the onboarding wizard's GSC
   * connect card passes `"#/onboarding"` so the round-trip re-enters the
   * wizard instead of dumping the user on the Channels page.
   */
  returnHash?: string;
}

/**
 * The dashboard glance card's one highlighted post — biggest positive
 * 28-day clicks gainer. Mirrors `GscTopMover` in
 * `functions/src/gsc/state.ts` (`deltaPercent` is always positive).
 */
export interface GscTopMover {
  title: string | null;
  url: string;
  postId: string | null;
  /** Rounded percent clicks change vs the prior 28 days (positive only). */
  deltaPercent: number;
}

/**
 * Response from GET `/gsc/overview?summary=1` (WP proxy → cloud
 * `gscSiteOverview` in summary mode) — the wp-admin dashboard glance
 * card's wire. Summary mode carries totals + top mover only (no series,
 * no page table); `totals28`/`prev28` may be non-null even when
 * `state === "expired"` (last-known data survives a dead connection).
 */
export interface GscOverviewSummaryResponse {
  success: true;
  state: GscMirrorState;
  /** Connected property id (e.g. `sc-domain:example.com`). */
  property?: string;
  /** `YYYY-MM-DD` the mirror is fresh through (GSC lags ~2 days). */
  freshThrough?: string;
  /**
   * Connection doc id when a connection exists — used to deep-link the
   * channels Configure modal for `property_pending`.
   */
  connectionId?: string;
  /** 28-day totals; `null` when the mirror has no rows in the window. */
  totals28: GscMetricTotals | null;
  /** The prior 28-day window — delta baseline. */
  prev28: GscMetricTotals | null;
  /** Open (non-dismissed) opportunities. */
  opportunityCount: number;
  /** Highlighted gainer; `null`/absent when nothing moved up meaningfully. */
  topMover?: GscTopMover | null;
  /**
   * Deep link to the customer portal's Search performance page. Built
   * cloud-side (wp-admin has no portal ids of its own).
   */
  portalReportUrl: string;
}
