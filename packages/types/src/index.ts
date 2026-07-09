import { Timestamp } from "firebase-admin/firestore";

/**
 * Shared Structura types — consumed by the React web app, the React client
 * bundle (WordPress admin), the UI package, and (via `pnpm sync:types`) the
 * Firebase functions codebase.
 *
 * Keep this file narrowly focused on types that genuinely cross process
 * boundaries. Function-only shapes (AI payloads, cloud task contracts, etc.)
 * live in `functions/src/types/functions.ts` and should NOT be added here.
 */

export * from "./videoVoices";


/**
 * CORE IDENTITY
 * Document ID matches Firebase Auth UID.
 */
export type SystemRole = "user" | "staff" | "super_admin";

export interface User {
  uid: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  photoURL: string | null;
  createdAt: Timestamp;
  systemRole: SystemRole;
  /**
   * Set after the first successful Stripe checkout / portal exchange.
   * Absent on fresh users — treat its absence the same as "no billing
   * profile yet".
   */
  stripeCustomerId?: string;
  /**
   * Marketing attribution captured by the portal at (or shortly after) the
   * first authenticated visit — see `web/src/lib/analytics.ts` →
   * `recordAttribution`. Stamped onto the PostHog funnel events as person
   * properties (`growth/events.ts`) so signups segment by ad source.
   * Optional: older accounts predate the field, and a visitor who didn't
   * arrive via an ad has no gclid.
   */
  attribution?: UserAttribution;
  /**
   * First-occurrence stamps for the deep funnel milestones (`growth/events.ts`).
   * Each key is a `GrowthEventKind`; the ISO value is when it first fired.
   * Presence is the idempotency signal that gates the once-per-account
   * PostHog/Telegram fan-out — never reset it without understanding that
   * doing so re-fires the milestones.
   */
  growthMilestones?: Record<string, string>;
}

/**
 * Click/marketing attribution stored against a user for PostHog funnel
 * segmentation. All fields optional — captured from URL params the portal
 * sees at login, any of which may be absent depending on how the visitor
 * arrived.
 */
export interface UserAttribution {
  /** Google Ads click id — the ad-source signal for funnel segmentation. */
  gclid?: string | null;
  /** iOS app/web click ids that replace gclid in some Google surfaces. */
  gbraid?: string | null;
  wbraid?: string | null;
  /** GA4 client id (`_ga` cookie), kept for a future GA4 Measurement Protocol
   *  path so server events could join the same GA4 user. Not used yet. */
  gaClientId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  /** First URL the portal saw, for debugging attribution gaps. */
  landingUrl?: string | null;
  /** ISO timestamp the attribution was captured. */
  capturedAt?: string;
}

/**
 * LICENSING MODEL
 * This is the central entity for Structura.
 *
 * Naming history (Yurii, 2026-05-04 audit + Wave-2 rename):
 *   - v1: `free | pro | cloud | agency`
 *   - v2: `free | byok | cloud | cloud_pro`
 *
 * `byok` (Bring Your Own Key) replaces `pro` — clearer label for the
 * "user supplies the AI key" tier. `cloud_pro` is a new top-tier above
 * `cloud`; today's `agency` is conceptually replaced by
 * `cloud_pro × WorkspaceAudience.agency` (see {@link WorkspaceAudience}
 * below).
 *
 * Audience (Individual vs Agency) is a separate orthogonal axis carried
 * on the workspace doc, not encoded in `PlanId`. The two grids on the
 * pricing page (Individual / Agency) are filtered views of the same
 * tier ladder differentiated by audience.
 */
export type PlanId = "free" | "byok" | "cloud" | "cloud_pro";

/**
 * Audience discriminator for the two-grid pricing layout.
 *
 *   - `individual` — solo creator / single-site owner / small business.
 *     Free tier is Individual-only; the paid Individual tiers (BYOK,
 *     Cloud, Cloud Pro) are flat per-site.
 *   - `agency` — multi-site operator. Agency variants of the paid tiers
 *     bundle the Channels add-on; Cloud Agency and Cloud Pro Agency use
 *     graduated volume pricing.
 *
 * Lives on the workspace doc (Phase 3 of the v2 roadmap will introduce
 * the workspace collection — until then, infer/default to
 * `"individual"` for any read site that doesn't already have an
 * audience). Spec: `specs/v2/multi-tenant-and-public-api.md` §Product
 * Decisions, `specs/pricing-v2-implementation.md` §1.
 */
export type WorkspaceAudience = "individual" | "agency";

/**
 * Plans where Structura runs the AI infrastructure (no API keys required
 * from the user). Cloud Pro is a superset of Cloud — anything that asks
 * "is this a managed-AI plan?" should use this helper rather than an
 * inline `=== "cloud"` check, otherwise Cloud Pro will silently fall
 * into the BYOK code path.
 */
export const isManagedPlan = (p: PlanId): p is "cloud" | "cloud_pro" =>
  p === "cloud" || p === "cloud_pro";

/**
 * Anything that's not the free tier. Use for "requires a paid license"
 * gates (entitlement checks, billing-portal CTAs). Free still gets a
 * license key — the difference is Free can't activate paid features.
 */
export const isPaidPlan = (p: PlanId): p is "byok" | "cloud" | "cloud_pro" =>
  p !== "free";

/**
 * AI provider identifier (kept here rather than per-package so the SPA,
 * the cloud functions, and the plugin's REST proxy share one source of
 * truth on what a "provider" is).
 */
export type AIProvider = "openai" | "gemini" | "anthropic";

/**
 * Tier discriminator that includes `"none"` — the runtime state when a
 * site has no usable license bound (disconnected, expired, never
 * activated). The TypeScript `PlanId` type alone can't represent it;
 * `LicenseTier` widens to cover the real states the cloud and the
 * plugin's REST proxy have to make decisions against.
 *
 * Why this isn't just `PlanId | "none"` everywhere: lots of code
 * already imports `PlanId` and means "the four real plans". Splitting
 * the runtime tier out keeps existing call sites honest about whether
 * they're handling the no-license case explicitly.
 */
export type LicenseTier = PlanId | "none";

/**
 * Which AI providers each tier is allowed to USE (text and image
 * generation, both at campaign-create time and at run time).
 *
 * Rationale (Yurii, 2026-05-03):
 *   - `none`  — license-less / expired / disconnected. Limited to the
 *               cheapest provider so the runtime cost of an
 *               accidentally-firing campaign on a deactivated site is
 *               bounded.
 *   - `free`  — adds Gemini, which has the most generous free tier of
 *               the three providers so the demo experience doesn't
 *               feel artificially constrained.
 *   - `byok`/`cloud`/`cloud_pro` — paid; everything we ship.
 *
 * Audience (Wave-2 rename, 2026-05-04): the helpers below take an
 * optional `audience` parameter, but the matrix itself is keyed only
 * on `LicenseTier` because today's policy is identical for both
 * audiences at every tier. If a future product decision wants
 * `cloud_pro_agency` to allow a different provider set from
 * `cloud_pro_individual`, widen the matrix shape to
 * `Record<LicenseTier, Record<WorkspaceAudience, readonly AIProvider[]>>`
 * — the helper signatures already accept `audience` so call sites won't
 * need updating.
 *
 * Server-side enforcement lives in
 * `functions/src/policy/tier-policy.ts::validateProviderForTier`;
 * client-side filtering lives in
 * `useDefaultProviders.ts::availableProviders`. The matrix below is
 * the single source of truth for both.
 */
export const PROVIDERS_FOR_TIER: Record<LicenseTier, readonly AIProvider[]> = {
  none: ["openai"],
  free: ["openai", "gemini"],
  byok: ["openai", "gemini", "anthropic"],
  cloud: ["openai", "gemini", "anthropic"],
  cloud_pro: ["openai", "gemini", "anthropic"],
} as const;

/**
 * Returns the providers a given tier is allowed to use. Centralises the
 * `PROVIDERS_FOR_TIER[plan] ?? PROVIDERS_FOR_TIER.none` fallback so
 * unknown / future plans default to the safest possible policy
 * (most-restrictive) rather than silently allowing everything.
 *
 * `audience` is accepted for forward-compat (per-(plan, audience)
 * policy split) but currently ignored — both audiences resolve to
 * identical provider sets at every tier. Defaults to `"individual"` so
 * call sites without workspace context keep working unchanged.
 */
export const getProvidersForTier = (
  plan: LicenseTier | string | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  audience: WorkspaceAudience = "individual",
): readonly AIProvider[] => {
  if (plan && (plan as LicenseTier) in PROVIDERS_FOR_TIER) {
    return PROVIDERS_FOR_TIER[plan as LicenseTier];
  }
  return PROVIDERS_FOR_TIER.none;
};

/**
 * True iff the given AI provider is permitted under the given tier.
 * Use at every server-side validation site (campaign create / update /
 * run time) and as a hint in the SPA's provider picker filter.
 *
 * `audience` is accepted for forward-compat (see {@link getProvidersForTier}).
 */
export const isProviderAllowedForTier = (
  plan: LicenseTier | string | null | undefined,
  provider: AIProvider,
  audience: WorkspaceAudience = "individual",
): boolean => getProvidersForTier(plan, audience).includes(provider);

/**
 * Maximum number of campaigns a single activation may hold per tier.
 * `null` means unlimited.
 *
 * Rationale (Yurii, 2026-05-04): the BYOK tier brings its own AI keys,
 * so we don't pay token costs — but every scheduled cron firing still
 * costs us Firestore reads/writes through the scheduler, the campaign
 * store, and the runs ledger. Without an upper bound, one activation
 * could spawn 100+ scheduled campaigns and run our Firebase bill into
 * the ground for a flat-fee BYOK license. Managed tiers (Cloud, Cloud
 * Pro) are uncapped because token-budget throttling already bounds
 * their cost.
 *
 * The cap is enforced **per activation**, not per license — it composes
 * with the existing `maxSites` license limit so a BYOK user with N paid
 * activations can have N × cap total campaigns. That matches the data
 * model (campaigns are stored under each activation) and avoids
 * collection-group queries on every create.
 *
 * Audience (Wave-2 rename, 2026-05-04): the helpers below take an
 * optional `audience` parameter, but the matrix itself is keyed only
 * on `LicenseTier` because today's policy is identical for both
 * audiences at every tier. Widen the matrix shape to
 * `Record<LicenseTier, Record<WorkspaceAudience, number | null>>` if a
 * future product reason emerges to differ caps by audience.
 *
 * Spec: `specs/v2/cloud-pregeneration-and-model-catalog.md` Phase 1.0l.
 * Server-side enforcement lives in
 * `functions/src/policy/tier-policy.ts::validateCampaignCountForTier`;
 * the SPA derives `current` from the cached campaigns list to render a
 * "X of Y" chip and disable the Create button at cap.
 */
export const MAX_CAMPAIGNS_FOR_TIER: Record<LicenseTier, number | null> = {
  none: 0,
  free: 1,
  byok: 10,
  cloud: null,
  cloud_pro: null,
} as const;

/**
 * Returns the per-activation campaign cap for a tier, or `null` for
 * unlimited. Centralises the unknown-tier fallback so a future plan id
 * the matrix doesn't know yet defaults to the most-restrictive tier
 * (`none`) rather than silently allowing everything.
 *
 * `audience` is accepted for forward-compat (per-(plan, audience)
 * policy split) but currently ignored — both audiences resolve to
 * identical caps at every tier. Defaults to `"individual"`.
 */
export const getMaxCampaignsForTier = (
  plan: LicenseTier | string | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  audience: WorkspaceAudience = "individual",
): number | null => {
  if (plan && (plan as LicenseTier) in MAX_CAMPAIGNS_FOR_TIER) {
    return MAX_CAMPAIGNS_FOR_TIER[plan as LicenseTier];
  }
  return MAX_CAMPAIGNS_FOR_TIER.none;
};

/**
 * True iff a new campaign create would still fit under the tier's cap.
 * `currentCount` is the existing campaign count for the activation.
 * `null` cap (unlimited tier) always returns true without consulting
 * the count.
 *
 * `audience` is accepted for forward-compat (see {@link getMaxCampaignsForTier}).
 */
export const isCampaignCountAllowedForTier = (
  plan: LicenseTier | string | null | undefined,
  currentCount: number,
  audience: WorkspaceAudience = "individual",
): boolean => {
  const cap = getMaxCampaignsForTier(plan, audience);
  return cap === null || currentCount < cap;
};

/**
 * Resolve the per-activation campaign cap from the License doc, falling
 * back to the tier matrix when the field is absent.
 *
 * - `maxCampaigns: number` → that explicit cap (set by the Stripe
 *   webhook from `product.metadata.max_campaigns`, by the free-signup
 *   path, or by the admin createManualLicense call).
 * - `maxCampaigns: null` → unlimited. This is the deliberate default
 *   for paid Stripe plans whose product does NOT declare
 *   `max_campaigns` metadata — managed-AI tiers (Cloud, Cloud Pro)
 *   leave it unset on the product so they remain uncapped, and the
 *   webhook writes `null` here so the cloud short-circuits the count
 *   query.
 * - `maxCampaigns: undefined` → legacy license written before the
 *   field landed. Fall back to {@link getMaxCampaignsForTier} so
 *   pre-rollout licenses keep their historical caps until the next
 *   webhook fire (renewal / portal change) populates the field.
 */
export const resolveCampaignLimit = (
  license:
    | { maxCampaigns?: number | null }
    | null
    | undefined,
  tier: LicenseTier | string | null | undefined,
  audience: WorkspaceAudience = "individual",
): number | null => {
  if (license && license.maxCampaigns !== undefined) {
    return license.maxCampaigns;
  }
  return getMaxCampaignsForTier(tier, audience);
};

/**
 * Maximum number of posts a single campaign may publish per week under
 * each tier. `null` means "no weekly cap" (the gate never trips).
 *
 * Rationale (Yurii, 2026-05-25): the Free tier was too generous — a free
 * license could run a *daily* campaign (~30 posts/month, comfortably
 * under the 100/site/month abuse cap) with no incentive to upgrade.
 * Capping Free to one post per week keeps the demo genuinely useful (a
 * weekly autopilot post) while turning "publish more often" into a paid
 * upgrade reason. Paid tiers (BYOK, Cloud, Cloud Pro) are uncapped here;
 * their cost is bounded by token quotas / BYOK keys, not cadence.
 *
 * `none` is 0 only for symmetry with the other tier matrices — a
 * license-less site can't create campaigns at all
 * (`MAX_CAMPAIGNS_FOR_TIER.none === 0`), so the value is academic.
 *
 * Enforcement is layered, mirroring the campaign-count cap:
 *   - SPA: the cadence picker locks sub-weekly options for Free (DAILY +
 *     Smart scheduling sit behind a Go Pro CTA; WEEKLY allows one day).
 *   - Cloud (trust boundary): `validateCadenceForTier` rejects an
 *     over-cap cron at campaign create / update
 *     (`functions/src/policy/tier-policy.ts`).
 *   - Cloud (defence-in-depth): a per-week counter in the scheduler step
 *     backstops the create-time gate for flagged campaigns
 *     (`functions/src/billing/usageCycle.ts`).
 *
 * Existing Free campaigns created before this cap shipped are
 * grandfathered — only campaigns stamped `weeklyPostCap` are enforced
 * (see `CampaignDoc.weeklyPostCap` in `functions/src/campaigns/types.ts`).
 */
export const MAX_POSTS_PER_WEEK_FOR_TIER: Record<LicenseTier, number | null> = {
  none: 0,
  free: 1,
  byok: null,
  cloud: null,
  cloud_pro: null,
} as const;

/**
 * Returns the per-campaign weekly post cap for a tier, or `null` for
 * uncapped. Centralises the unknown-tier fallback to the most-restrictive
 * tier (`none`), matching {@link getMaxCampaignsForTier}.
 *
 * `audience` is accepted for forward-compat (per-(plan, audience) policy
 * split) but currently ignored — both audiences resolve to identical caps
 * at every tier.
 */
export const getMaxPostsPerWeekForTier = (
  plan: LicenseTier | string | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  audience: WorkspaceAudience = "individual",
): number | null => {
  if (plan && (plan as LicenseTier) in MAX_POSTS_PER_WEEK_FOR_TIER) {
    return MAX_POSTS_PER_WEEK_FOR_TIER[plan as LicenseTier];
  }
  return MAX_POSTS_PER_WEEK_FOR_TIER.none;
};

/**
 * Upper bound on how many times a 5-field cron expression fires in any
 * 7-day window, or `null` when the expression is too irregular to bound
 * safely.
 *
 * Exists so the per-tier weekly post cap
 * ({@link MAX_POSTS_PER_WEEK_FOR_TIER}) is enforced from one
 * implementation on both the SPA and the cloud. It is deliberately
 * CONSERVATIVE: any cron it can't reduce to a clean weekly/monthly shape
 * returns `null`, which callers treat as "exceeds a finite cap" — better
 * to reject an exotic schedule on a capped tier than to under-count it.
 *
 * Recognised shapes (minute + hour must each be a single integer, so the
 * cron fires once per matched day rather than many times within it):
 *   - `m h * * *`       → daily             → 7
 *   - `m h * * <dows>`  → weekly on N days  → N
 *   - `m h <doms> * *`  → monthly on N days → N  (conservative: a monthly
 *     day is counted as if it recurred weekly, so a single monthly day
 *     reads as 1 — comfortably inside a 1/week cap — while a multi-day
 *     list reads as its worst-case in-week clustering)
 *
 * Anything else — ranges/steps/lists in the minute or hour field, a
 * pinned month, both DOM and DOW constrained (cron's OR semantics make
 * the union hard to bound), or a malformed expression — returns `null`.
 *
 * @param cron - A standard 5-field cron expression (`m h dom mon dow`).
 * @returns Max fires per 7-day window, or `null` if unbounded/irregular.
 */
export const weeklyPublishCountForCron = (
  cron: string | null | undefined,
): number | null => {
  if (!cron || typeof cron !== "string") return null;
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minute, hour, dom, month, dow] = parts;

  // A single fire-time per matched day. Ranges/steps/lists/`*` in the
  // minute or hour field can fan a "daily" cron into dozens of fires a
  // day, so we refuse to bound those on a capped tier.
  const isSingleInt = (f: string) => /^\d+$/.test(f);
  if (!isSingleInt(minute) || !isSingleInt(hour)) return null;

  // A pinned month only ever REDUCES frequency, but combined with a daily
  // day-spec it's still 7/week during that month — and reasoning about
  // "which week" gets messy. Keep the bounded set to `month === "*"`.
  if (month !== "*") return null;

  // Parse a day field into a plain list of integers, or null if it uses
  // ranges/steps we won't bound.
  const parseDayList = (f: string): number[] | null =>
    /^\d+(,\d+)*$/.test(f) ? f.split(",").map(Number) : null;

  const domStar = dom === "*";
  const dowStar = dow === "*";

  if (domStar && dowStar) return 7; // daily

  if (domStar && !dowStar) {
    const days = parseDayList(dow);
    return days ? days.length : null; // weekly on N weekdays
  }

  if (!domStar && dowStar) {
    const days = parseDayList(dom);
    return days ? days.length : null; // monthly on N days (see docblock)
  }

  // Both DOM and DOW constrained — cron fires on the UNION of the two,
  // which we don't attempt to bound. Reject on capped tiers.
  return null;
};

/**
 * True iff a campaign's cron cadence is permitted under the tier's weekly
 * post cap. Uncapped tiers (`null` cap) always pass without inspecting the
 * cron. A cron that {@link weeklyPublishCountForCron} can't bound is
 * rejected on any capped tier.
 *
 * Used at the cloud trust boundary (campaign create / update) and as a
 * hint for the SPA's cadence picker. `audience` is accepted for
 * forward-compat (see {@link getMaxPostsPerWeekForTier}).
 */
export const isCadenceAllowedForTier = (
  plan: LicenseTier | string | null | undefined,
  cron: string | null | undefined,
  audience: WorkspaceAudience = "individual",
): boolean => {
  const cap = getMaxPostsPerWeekForTier(plan, audience);
  if (cap === null) return true;
  const count = weeklyPublishCountForCron(cron);
  if (count === null) return false;
  return count <= cap;
};

export type LicenseStatus = "active" | "expired" | "past_due" | "canceled" | "refunded";

/**
 * Add-on SKU identifier. See `specs/integrations-store-spec.md` §11.
 * - "channels": AI-adapted distribution add-on (LinkedIn, Mailchimp, …).
 * - "growth":   High-stakes paid-spend integrations (v1.5+). Reserved, not yet
 *               wired into any live product.
 */
export type AddonId = "channels" | "growth";

/**
 * License-level seat budget for an add-on. Written by the Stripe webhook
 * fan-out (`functions/src/subscriptions/helpers.ts`) in response to
 * subscription item changes. Spec §11.2.
 */
export interface AddonSeatBudget {
  /** How many activations can have this add-on enabled at once. */
  maxSeats: number;
  /**
   * Stripe `subscription_item` id for this add-on line. Used for
   * billing-portal deep-linking and reconciliation.
   */
  stripeSubscriptionItemId: string;
  activatedAt: Timestamp;
}

/**
 * Per-add-on grace-period state. TRUE entry means the customer has lost
 * entitlement (via downgrade or payment failure) but is inside the
 * soft-revoke window. Spec §11.5.
 *
 * The parallel `hasOpenGracePeriod` boolean on the License root is what the
 * cron queries — Firestore can't filter "any key present in this map".
 */
export type GracePeriodReason = "downgrade_orphaned" | "payment_failed";

export interface GracePeriodState {
  reason: GracePeriodReason;
  detectedAt: Timestamp;
  /**
   * Set once the initial "grace opened" email has been delivered by the
   * cron. Absent on graces freshly written by the Stripe webhook — the
   * webhook deliberately defers day-0 delivery to the cron's next run
   * (<24h later) so subscription-change handling stays transactional and
   * email failures don't retry the whole billing update. The cron detects
   * `dayZeroSentAt == null`, sends the initial notice, then stamps this
   * field. Spec §11.5.2.
   */
  dayZeroSentAt?: Timestamp;
  /** 0 = no reminders yet, 1 = day-7 reminder sent, 2 = day-14 final notice sent. */
  remindersSent: 0 | 1 | 2;
  nextRemindAt: Timestamp;
  revokeAt: Timestamp;
  /**
   * Domains that held this add-on at detection time and are at risk. Captured
   * once at detection, re-verified each reminder (customer may self-resolve
   * by reassigning seats). Spec §11.5.1.
   */
  orphanedDomains: string[];
}

/**
 * Resolution of a closed grace period, recorded in the append-only
 * subcollection for admin history + future smart-cadence analysis.
 * Spec §5.1 + §11.5.3.
 *
 * - `revoked`:       cron hit day 21 and removed seat assignment(s).
 * - `seat_added`:    customer bought more seats via Stripe, covering orphans.
 * - `reassigned`:    customer reassigned seats so assignedCount ≤ maxSeats.
 * - `self_disabled`: customer disabled the add-on on the orphaned site(s).
 * - `payment_resumed`: a `payment_failed` grace cleared because the
 *                    subscription returned to `active`. (v1 addition — spec
 *                    schema originally had 4 kinds; this 5th captures the
 *                    payment-specific recovery path.)
 */
export type GracePeriodResolution =
  | "revoked"
  | "seat_added"
  | "reassigned"
  | "self_disabled"
  | "payment_resumed";

/**
 * Append-only history of resolved grace periods.
 * Path: `/licenses/{licenseId}/gracePeriodEvents/{autoId}`.
 * Owner-readable, backend-write-only. Spec §5.1 + §11.5.3.
 */
export interface GracePeriodEvent {
  addon: AddonId;
  reason: GracePeriodReason;
  detectedAt: Timestamp;
  resolvedAt: Timestamp;
  resolution: GracePeriodResolution;
  /** Reminder count at time of resolution. 0, 1, or 2 (same domain as `GracePeriodState.remindersSent`). */
  remindersSent: number;
  /** Snapshot of orphaned domains at resolution. For `revoked`, these were just unassigned. */
  orphanedDomains: string[];
  /**
   * Deep links the cron emailed out for this grace (portal assignment URLs,
   * Stripe billing URLs, etc.). Audit trail for "which resolutions came from
   * which CTA." Empty when no links were sent (e.g. revocation-only paths).
   */
  notificationDeepLinks: string[];
}

export interface License {
  key: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string | null;
  planId: PlanId;
  /**
   * @deprecated Audience is retired as of the agency merge (2026-07-05 —
   * spec `specs/pricing-restructure.md` §10 "Slice 2"). The webhook no
   * longer writes this field; team-seat capability now derives from site
   * quantity (`maxSites`), not audience. Kept optional for back-compat
   * with existing Firestore docs written before the merge; readers must
   * tolerate its absence and will be dropped once no legacy docs remain.
   */
  audience?: WorkspaceAudience;
  maxSites: number;
  createdAt: Timestamp;
  updatedAt: Timestamp | null;
  status: LicenseStatus;
  startedAt: Timestamp | null;
  periodEndsAt: Timestamp | null;
  source: "system" | "stripe" | "manual" | "appsumo";
  activationsCount: number;

  isManagedAi: boolean;
  /**
   * Per-activation campaign cap. Copied from `product.metadata.max_campaigns`
   * by the Stripe webhook; seeded explicitly on free-signup and
   * admin-created licenses. `null` = unlimited (the deliberate default
   * for paid Stripe plans whose product omits the metadata).
   *
   * Optional during the rollout window — pre-field licenses fall back
   * to the tier matrix via `resolveCampaignLimit()` until their next
   * subscription webhook event populates the field. After the rollout
   * window this field becomes the single source of truth and the tier
   * matrix is purely a fallback for `source: "system"` free licenses.
   */
  maxCampaigns?: number | null;
  /**
   * Per-activation token cap copied from `product.metadata.max_tokens` by
   * the Stripe webhook. Each activation gets its own quota — the License
   * carries the cap (one number) while activations carry the live counter.
   * `null` for non-managed plans (BYOK / Free).
   */
  maxTokensPerActivation: number | null;
  /**
   * Per-activation image cap — same shape as `maxTokensPerActivation`.
   */
  maxImagesPerActivation: number | null;
  /**
   * @deprecated Use `maxTokensPerActivation`. Mirrors the same value
   * during the per-activation rollout for one release window so older
   * plugin builds keep working. Removed once the wp-admin SPA has
   * shipped the per-activation usage hook.
   */
  maxTokensPerMonth: number | null;
  /**
   * @deprecated Use `maxImagesPerActivation`. See `maxTokensPerMonth`.
   */
  maxImagesPerMonth: number | null;
  /**
   * @deprecated Live counters moved to the activation doc
   * (`workspaces/{wsId}/activations/{actId}.usedTokensThisMonth`).
   * Kept on the License for one release window so the wp-admin SPA's
   * existing usage hook keeps returning numbers — backed by the rollup
   * cron aggregating per-activation counters.
   */
  usedTokensThisMonth?: number;
  /** @deprecated See `usedTokensThisMonth`. */
  usedImagesThisMonth?: number;
  lastResetAt: Timestamp;

  flags: string[];

  /**
   * Per-license feature flags. Absent keys are treated as their default —
   * always check via `isFeatureEnabled()` rather than `features?.x === true`
   * so defaults stay centralized. Spec: `specs/progress-stream.md` §12.
   *
   * Rollout rule: every flag in here is *off-by-default-to-rollback*,
   * meaning the product default is TRUE and setting the key to `false`
   * opt-out kill-switches a license. That flips the conventional default
   * but matches how we actually use the map: features ship to everyone,
   * and this map exists so support can revert a specific license without
   * a redeploy when something goes wrong in the field.
   */
  features?: Partial<Record<FeatureFlag, boolean>>;

  /**
   * Per-add-on seat budget. Present only for add-ons the customer is paying
   * for this billing cycle. Absent keys mean "not entitled". Spec §11.2.
   */
  entitlements?: Partial<Record<AddonId, AddonSeatBudget>>;

  /**
   * Active grace periods, keyed by add-on id. A non-empty map means the
   * customer is mid-dunning on at least one add-on. Spec §11.5.1.
   */
  graceperiods?: Partial<Record<AddonId, GracePeriodState>>;

  /**
   * Denormalized boolean: TRUE iff any key in `graceperiods` is present.
   * Exists purely so the grace-period cron can run an indexed query without
   * scanning all licenses. Maintained transactionally alongside writes to
   * `graceperiods`. Spec §11.5.1.
   */
  hasOpenGracePeriod?: boolean;

  /**
   * Denormalized boolean: TRUE iff `activationsCount > maxSites`. Exists
   * because Firestore can't compare two fields in a `where` clause, so the
   * `checkActivationLimits` cron can't say `where activationsCount > maxSites`
   * directly — it has to filter on a precomputed boolean. Maintained
   * alongside every write that touches `activationsCount` or `maxSites`:
   *   - `onLicenseActivationChange` trigger recomputes on activation
   *     create/delete (authoritative edge on `activationsCount`).
   *   - Subscription webhook + LTD activation + admin seat-limit override
   *     recompute on `maxSites` change.
   *   - License-creation paths seed to `false` (count always starts at 0).
   * Spec §11.5.4.
   */
  isOverSeatLimit?: boolean;

  /**
   * Manual per-license monthly video cap override — support
   * escalations only. This is the PER-SITE (activation) allowance,
   * not a license-wide pool. Strongest cap source: beats the
   * Stripe-stamped `videoEntitlement.monthlyCap` and the built-in
   * default (20). Set by operators directly in Firestore; the billing
   * webhook NEVER writes or clears this field.
   */
  videoMonthlyCap?: number;

  /**
   * Video-channel entitlement mirrored from the CURRENT Stripe
   * subscription price. Stamped by `handleSubscriptionChange` on every
   * subscription create/update from the price's `video_enabled` /
   * `video_monthly_cap` metadata (product metadata is the per-key
   * fallback — see `functions/src/billing/videoEntitlement.ts`), and
   * deleted when the new price carries no video metadata.
   *
   * Optional for back-compat (2026-07 rollout window): licenses whose
   * last webhook predates the field won't have it — `cloud_pro`
   * remains video-eligible without a stamp (and even with an explicit
   * `enabled: false` stamp; video is the tier's headline feature).
   * Resolution lives in `resolveVideoGate()`
   * (`functions/src/channels/video/quota.ts`).
   */
  videoEntitlement?: VideoEntitlement;

  /**
   * 1:1 reverse pointer to the workspace this license owns. Populated
   * by the license-creation paths (Phase 3.1) atomically with the
   * license write; never absent in production.
   *
   * Spec: `specs/v2/multi-tenant-and-public-api.md` Phase 3.1.
   */
  workspaceId: string;
}

/**
 * Video-channel grant carried by a Stripe price, mirrored onto
 * `License.videoEntitlement` by the subscription webhook. See the
 * field's docblock on {@link License} for lifecycle and back-compat.
 */
export interface VideoEntitlement {
  /** True ⇒ the subscribed price includes the Video channel. */
  enabled: boolean;
  /**
   * Included videos PER SITE (activation) per billing cycle, from the
   * `video_monthly_cap` metadata. Absent ⇒ the built-in default
   * (`VIDEO_MONTHLY_CAP`, 20) applies at resolution time.
   */
  monthlyCap?: number;
  /** Stripe Price id the stamp came from — audit/debug breadcrumb. */
  priceId: string;
}

/**
 * WORKSPACES (Tenant root) — Phase 3.1
 * Path: /workspaces/{workspaceId}
 *
 * The workspace is the v2 tenant root. Every license owns exactly one
 * workspace (1:1); every workspace has at least one member (the owner).
 * Future per-tenant resources (campaigns, personas, credentials, API
 * tokens, channel connections, usage metering) hang off this doc.
 *
 * Spec: `specs/v2/multi-tenant-and-public-api.md` Phase 3.1.
 *
 * During Phases 3.1 + 3.2 the workspace doc is **admin-SDK only**: no
 * code reads from it yet. Phase 3.3 onward begins relocating data and
 * Phase 3.7 wires the SPA to it. The forward-going hooks in 3.1 ensure
 * every new license gets a workspace at creation time so the invariant
 * "every license has a workspace" is preserved without a re-migration.
 */
export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

/**
 * Workspace-wide preferences. Empty during Phase 3.1; future homes for
 * per-workspace AI-engine defaults, channel preferences, etc., will land
 * here as later phases extract them from the per-license / per-activation
 * scope.
 */
export interface WorkspaceSettings {
  // Intentionally empty during Phase 3.1. Reserved for forward growth.
}

export interface Workspace {
  /** UUID stamped on the doc. Matches the doc id. */
  id: string;
  /** Human-readable label, e.g. "Yurii's workspace". User-renameable. */
  name: string;
  /**
   * @deprecated Audience is retired as of the agency merge (2026-07-05 —
   * spec `specs/pricing-restructure.md` §10 "Slice 2"). No longer written
   * by the subscription webhook; team-seat capability now derives from
   * site quantity (`License.maxSites`), not audience. Kept optional for
   * back-compat with existing workspace docs; readers must tolerate its
   * absence and will be dropped once no legacy docs remain.
   */
  audienceType?: WorkspaceAudience;
  /**
   * 1:1 reference to the License doc this workspace was created from.
   * Optional because Phase 1.8 introduces anonymous shadow workspaces
   * (created from the plugin's first contact, no license). Anonymous
   * workspaces have `anonymous: true` and no `licenseId`. On claim,
   * this field is set and `anonymous` flips to `false`.
   */
  licenseId?: string;
  /**
   * Phase 1.8 — true for shadow workspaces created via
   * `bootstrapAnonymousInstall`. Absent on every pre-1.8 workspace
   * (read defensively as `false`).
   */
  anonymous?: boolean;
  /**
   * Phase 1.8 — install ID that bootstrapped this anonymous workspace.
   * Only set when `anonymous === true`; cleared on claim.
   */
  ownerInstallId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  settings?: WorkspaceSettings;
}

/**
 * MEMBERS (Subcollection of Workspace) — Phase 3.2
 * Path: /workspaces/{workspaceId}/members/{userId}
 *
 * A user's membership in a workspace. Doc id is the user's uid so
 * existence checks are O(1) (`exists(/workspaces/$(w)/members/$(uid))`)
 * — Firestore rules use this for the read-gate without an extra query.
 *
 * Capabilities are derived from `role` via `ROLE_CAPABILITIES` in
 * `@structura/types/permissions/roles`. Code MUST NOT branch on the
 * raw `role` string — go through `currentUserCan(ctx, capability)`
 * instead so adding a new capability touches one map, not N call sites.
 */
export interface AnonymousInstall {
  /** UUID v4 from the plugin. Matches the doc id. */
  installId: string;
  /** Shadow workspace this install bootstrapped. */
  workspaceId: string;
  /** Single activation under that workspace. */
  activationId: string;
  /** Domain at bootstrap time — for support / abuse triage. */
  domain: string;
  createdAt: Timestamp;
  /**
   * Set to the license doc id when the install is claimed by a real
   * license activation. Null until claim. After claim, the workspace
   * is no longer anonymous; this field is the audit pointer back to
   * the license that owns it now.
   */
  claimedBy: string | null;
  claimedAt?: Timestamp;
}

export interface WorkspaceMember {
  /** uid of the member. Matches the doc id. */
  userId: string;
  role: WorkspaceRole;
  /** Snapshot of the user's email at add-time, for display. */
  email: string;
  /** Snapshot of the user's display name at add-time, optional. */
  displayName?: string;
  addedAt: Timestamp;
  /**
   * uid of the user who added this member. For the owner of an
   * auto-created workspace this is the owner's own uid.
   */
  addedBy: string;
  /**
   * Per-member site visibility (added 2026-07; optional forever —
   * docs written before it shipped simply lack the field).
   *
   * ABSENT = the member sees every activation in the workspace,
   * including ones connected later. PRESENT = a fixed allowlist of
   * activation doc ids; an empty list means "no sites" (reachable
   * only via purge cleanup, never set from the UI).
   *
   * Invariant: only ever present on `editor`/`viewer` docs — owners
   * and admins always see all sites, and every promotion path
   * (`updateMemberRole`, `transferOwnership`) deletes the field.
   * Never store `null`: firestore.rules keys visibility on field
   * PRESENCE (`canSeeActivation`), so a stored null would read as
   * "no sites".
   */
  allowedActivationIds?: string[];
}

/**
 * WORKSPACE INVITATIONS (Subcollection of Workspace) — Phase 3.7 Pass B
 * Path: /workspaces/{workspaceId}/invitations/{invitationId}
 *
 * Spec: `specs/v2/multi-tenant-and-public-api.md` §3.7.
 *
 * Pending email invitations a workspace owner / admin has issued. The
 * recipient receives an email with a link of the shape
 * `https://app.structurawp.com/invitations/{token}`. The plaintext
 * token only ever travels via that email — the cloud stores its
 * SHA-256 hash on `tokenHash` and looks the doc up via a collection-
 * group query. Same shape as the Phase 3.5 `apiTokens` collection on
 * purpose: one mental model for every "secret minted server-side,
 * shown once via a side-channel, hashed at rest" surface.
 *
 * Lifecycle:
 *   - `acceptedAt` set ⇒ the invite has been consumed; the doc is
 *     kept briefly for audit before a follow-up cleanup pass deletes
 *     it (no scheduled job today; runs out-of-band when the workspace
 *     hits the per-workspace "active invitations" cap).
 *   - `revokedAt` set ⇒ the inviter cancelled the invite. The accept
 *     endpoint refuses with `invitationRevoked`.
 *   - Neither set AND `expiresAt` past ⇒ accept refuses with
 *     `invitationExpired`. The doc is left in place; the cleanup pass
 *     prunes expired invites.
 *
 * The `email` field is canonicalised lowercased before write so the
 * accept-time comparison against `request.auth.token.email` is
 * deterministic.
 */
export interface WorkspaceInvitation {
  /** UUID. Same as the Firestore doc id. */
  id: string;
  /** Workspace tenant root. */
  workspaceId: string;
  /** Lowercased recipient email. */
  email: string;
  /** Role to grant on accept. Cannot be `"owner"` — owners are
   * minted at workspace creation or via the dedicated
   * transferOwnership endpoint (Phase 3.7 Pass C, future). */
  role: Exclude<WorkspaceRole, "owner">;
  /**
   * SHA-256 of the secret token. The plaintext token only travels
   * via the email link; the cloud computes the hash on accept and
   * looks the invitation up via a collection-group query on this
   * field.
   */
  tokenHash: string;
  /** uid of the inviter. */
  invitedBy: string;
  /** Snapshot of inviter display name at invite time, for the email. */
  invitedByName: string;
  /** Snapshot of inviter email at invite time, for the email. */
  inviterEmail: string;
  /** Snapshot of workspace name at invite time, for the email. */
  workspaceName: string;
  createdAt: Timestamp;
  /** 7 days from `createdAt` — the accept endpoint refuses past this. */
  expiresAt: Timestamp;
  /** Stamped on successful accept. Doc is then a closed audit row. */
  acceptedAt?: Timestamp;
  /** uid of the user who accepted (matches the workspace member uid). */
  acceptedBy?: string;
  /** Stamped on revoke. Accept refuses if set. */
  revokedAt?: Timestamp;
  /**
   * Per-member site visibility snapshot taken at invite time; copied
   * onto the member doc on accept (editor/viewer invites only — see
   * `WorkspaceMember.allowedActivationIds` for the semantics).
   * Ids may go stale during the 7-day invite window if a site is
   * purged; stale ids are inert (they reference nothing).
   */
  allowedActivationIds?: string[];
}

/**
 * WORKSPACE CREDENTIALS (Subcollection of Workspace) — Phase 1 of
 * `specs/v2/cloud-only-generation.md` (overlaps with Phase 3.4 of
 * the multi-tenant spec — this is the only resource from §3.4 we
 * need today).
 *
 * BYOK provider keys (OpenAI, Gemini, Anthropic) the customer
 * brings into the cloud once and then never thinks about again.
 * The cloud encrypts the secret at rest and decrypts on the hot
 * path during a generation call (cached for 60s in-process so the
 * decrypt round-trip doesn't fire on every retry / fallback step).
 *
 * Why on the workspace, not the activation: the same key serves
 * every WP install + future portal API call under the workspace.
 * Storing it per-activation would force the customer to paste the
 * same key on every site they connect, and would break the future
 * "I rotate my OpenAI key" UX (they'd have to walk every site
 * instead of editing once at the workspace).
 *
 * Reads + writes are admin-SDK only. Encryption is AES-256-GCM
 * with a 32-byte master key from Secret Manager (`BYOK_MASTER_KEY`);
 * the spec calls for Cloud KMS but the AES+Secret approach is
 * functionally equivalent at our scale and trivial to upgrade
 * later by swapping the helper in `auth/credentialsCrypto.ts`.
 */
export type CredentialProvider = "openai" | "gemini" | "anthropic";

export interface WorkspaceCredential {
  /** UUID. Same as the Firestore doc id. */
  credId: string;
  workspaceId: string;
  provider: CredentialProvider;
  /** Human label ("Yurii's OpenAI prod"). */
  label: string;
  /**
   * Base64-encoded ciphertext envelope: `<12-byte IV>|<auth tag>|<ct>`.
   * The cleartext provider key is never persisted on the cloud.
   * Layout details + the AES-256-GCM scheme live in
   * `functions/src/auth/credentialsCrypto.ts`.
   */
  encryptedKey: string;
  /**
   * Display-safe preview of the original key — first 3 + last 4 chars
   * (`"sk-...gPsA"`). Stored at create time so the portal + plugin
   * surfaces can render "is this the right key?" without a per-render
   * decrypt round-trip. Optional because credentials predating Phase 5b
   * may not have it; readers fall back to label only.
   */
  maskedKey?: string;
  /**
   * Version tag the encryption helper writes alongside the
   * ciphertext so a future master-key rotation can re-encrypt
   * gradually rather than all-at-once. `"v1"` today; bump on
   * rotate.
   */
  keyVersion: string;
  /** uid of the user who added the credential. */
  addedBy: string;
  addedAt: Timestamp;
  /**
   * Last time the cloud successfully decrypted + used the
   * credential. Updated on a 1/minute-per-credential debounce
   * (matches the apiTokens lastUsedAt pattern) so the portal can
   * render "last used 2 minutes ago" without write storms.
   */
  lastUsedAt?: Timestamp;
  /**
   * Stamped on revoke. Once set, `getActiveCredential` skips this
   * row — same lifecycle bit the apiTokens collection uses.
   */
  revokedAt?: Timestamp;
}

/**
 * VISUAL PRESETS (Subcollection of Workspace)
 * Path: /workspaces/{workspaceId}/visualPresets/{presetId}
 *
 * Replaces the Phase 3.4 singleton at `workspaces/{w}/visualSettings/global`.
 * The library + per-activation binding model mirrors `WorkspaceCredential`:
 * any site can browse the workspace library; each site picks the preset
 * it wants via `LicenseActivation.visualPresetBinding`.
 */
/**
 * Caption/motion style key for the Video channel renderer. Mirrors
 * `VIDEO_STYLE_KEYS` in `functions/src/channels/video/edl.ts` — keep the
 * two in sync (a renderer-unknown key silently falls back to `clean`).
 */
export type VideoStyleKey = "clean" | "bold" | "kinetic";

/** Vertical band the rendered video's captions occupy on the 9:16 canvas. */
export type VideoCaptionPlacement = "top" | "middle" | "bottom";

export interface VisualPreset {
  presetId: string;
  workspaceId: string;
  label: string;
  globalArtDirection: string;
  aspectRatio: string;
  format: string;
  optimizeOnUpload: boolean;
  /**
   * Video caption/motion style for the Video channel. Absent ⇒ `"clean"`.
   *
   * Optional for at least one release window (rollout back-compat,
   * AGENTS.md §10): presets written before 2026-07 carry no video fields,
   * and the channel connection's legacy `videoStyle` setting remains a
   * read fallback until the release migration
   * (`scripts/admin/migrate-video-style-to-presets.mjs`) has copied it here.
   */
  videoStyle?: VideoStyleKey;
  /**
   * Motion/footage/pacing art direction for rendered videos
   * (FOOTAGE/PACING/MOOD/SETTINGS prose, AI-suggested and user-editable).
   * Sibling of `globalArtDirection` (the image art direction) — the two
   * are NEVER merged. The video adapt prompt prefers this and falls back
   * to `globalArtDirection` when absent (pre-2026-07 behaviour).
   */
  videoArtDirection?: string;
  /**
   * Where the caption band sits on the vertical canvas. Absent ⇒
   * `"bottom"` (native for Shorts/TikTok/Reels). The release migration
   * writes `"middle"` explicitly onto presets bound to existing Video
   * connections so those customers keep today's centered captions.
   */
  captionPlacement?: VideoCaptionPlacement;
  /**
   * Caption-accent colour mode. Reserved enum — only `"auto"` ships
   * (caption accents derive from `palette`). Stored as an enum rather
   * than a boolean so a future `"off"`/custom override needs no
   * migration. Absent ⇒ `"auto"`.
   */
  paletteCaptions?: "auto";
  /**
   * Brand palette extracted by the visual suggest pass — 3–6 `#RRGGBB`
   * strings, FIRST entry is the accent caption art uses. Absent on
   * presets saved before the suggest pass learned to extract it; caption
   * accents then stay on the stock styling.
   */
  palette?: string[];
  /** uid or `activation:{activationId}` when the source was a plugin save. */
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * ACTIVATIONS (Subcollection)
 * Path: /workspaces/{workspaceId}/activations/{activationId}
 *
 * Spec: `specs/v2/multi-tenant-and-public-api.md` §3.3.
 *
 * Activations are platform-discriminated installations keyed by UUID. The
 * legacy `licenses/{l}/activations/{sanitized_domain}` shape is gone — the
 * DB was wiped clean before Phase 3.3 cutover so there's nothing to bridge.
 */
/**
 * Per-site seat assignment for an add-on. Presence of an entry = this
 * activation consumes one seat from `License.entitlements.{addon}.maxSeats`.
 * Spec §11.2.
 */
export interface AddonSeatAssignment {
  assignedAt: Timestamp;
  /** uid of the caller who flipped the seat (owner or domain-level admin). */
  assignedBy: string;
}

/**
 * Lifecycle state of a `LicenseActivation` document.
 *
 * Soft-delete preserves data through disconnect/reconnect cycles and makes
 * "which activations consume a seat?" a property the cron and the
 * heartbeat read off the document instead of guessing from existence.
 *
 *   - `"active"`       — normal operation. Holds a seat. Bound API tokens
 *                        authenticate (`apiTokens/{tokenId}.revokedAt` unset),
 *                        and `activationSecret` is present for HMAC signing
 *                        of cloud → plugin webhook callbacks.
 *   - `"disconnected"` — soft-deleted. All activation-bound API tokens are
 *                        revoked at disconnect time (Phase 3.5) so further
 *                        authenticated requests 401. `activationSecret` is
 *                        also field-deleted so any latent HMAC-verification
 *                        path can't accept a forged callback. Seat freed.
 *                        Subcollection data (campaigns/runs/generations/
 *                        usage_logs/siteIdentity) preserved.
 *                        `connectionSecrets/*` is the one exception — it's
 *                        cascade-deleted on disconnect because OAuth tokens
 *                        to a user's third-party accounts shouldn't outlive
 *                        the disconnect.
 */
export type LicenseActivationStatus = "active" | "disconnected";

/**
 * Platform discriminator for an activation. Spec: `specs/v2/multi-tenant-
 * and-public-api.md` §3.3 and `specs/v2/headless-surface.md`.
 *
 * `wp` is the long-standing production surface. `headless` is the first non-WP
 * surface to ship for real — Structura as a headless content backend (campaigns
 * run in the portal, posts served from a public read endpoint). `shopify` /
 * `webflow` remain forward-prep so those adapters land additively. `api` stays
 * RESERVED for the future public CRUD-API product and is deliberately distinct
 * from `headless` (a content-delivery surface, not a management API).
 */
export type ActivationSurface =
  | "wp"
  | "shopify"
  | "webflow"
  | "api"
  | "headless";

/**
 * Surface-specific identity bag carried on the activation doc. The shape
 * is discriminated by the activation's `surface` field on the parent doc;
 * narrow with a type guard before reading surface-specific properties.
 *
 * WordPress is the only surface in production today; the other variants
 * are forward-prep so future surface adapters slot in without a schema
 * migration.
 */
export type ActivationSurfaceMetadata =
  | WpSurfaceMetadata
  | ShopifySurfaceMetadata
  | WebflowSurfaceMetadata
  | ApiSurfaceMetadata
  | HeadlessSurfaceMetadata;

export interface WpSurfaceMetadata {
  /**
   * The site's bare HOST, not a full URL — the plugin sends
   * `wp_parse_url(get_site_url(), PHP_URL_HOST)` (e.g. `"blog.example.com"`, NO
   * scheme), stored here verbatim. The name is historical; treat it as a host.
   * Consumers that need a real URL (the Migrate / Move-to-Headless engines
   * feeding `guardUrl` / WP REST) MUST prepend `https://` first — a schemeless
   * value 400s the SSRF guard. Host-only is fine for dedup (`comparableHost`).
   * See the `TODO(siteUrl-scheme)` note in the plugin's `License_Manager::activate`.
   */
  siteUrl: string;
  /** WordPress site title (`get_bloginfo('name')`). */
  siteName?: string;
  /** WordPress core version, for support triage. */
  wpVersion?: string;
  /** Structura plugin version, for update-adoption tracking. */
  pluginVersion?: string;
}

export interface ShopifySurfaceMetadata {
  /** `*.myshopify.com` shop domain. */
  shopDomain: string;
  /** Granted access scope string from the Shopify OAuth grant. */
  accessScope?: string;
}

export interface WebflowSurfaceMetadata {
  /** Webflow site UUID. */
  siteId: string;
}

export interface ApiSurfaceMetadata {
  /** Human label for the API-only activation (no underlying surface). */
  tokenName?: string;
}

/**
 * Identity bag for a `headless` activation — a non-WP "site" whose posts are
 * generated in the cloud and served from the public read endpoint. Spec:
 * `specs/v2/headless-surface.md`. Unlike `wp`, there is no install reaching
 * back into the cloud, so this is user-entered at site-creation time in the
 * portal (cold-start brand layer comes from an `analyzeSite` crawl of `baseUrl`).
 */
export interface HeadlessSurfaceMetadata {
  /** Display name for the site (user-entered). */
  siteName: string;
  /**
   * Public base URL of the consumer's site, e.g. `"https://example.com"`.
   * REQUIRED for this surface: internal links and canonical URLs in served
   * posts resolve against it, and the read payload emits absolute links so
   * consumers never reconstruct permalink logic. Persisted normalised (no
   * trailing slash).
   */
  baseUrl: string;
  /**
   * Permalink pattern the consumer's frontend routes posts under, e.g.
   * `"/blog/%postname%"`. Mirrors the WP surface's headless-mode permalink
   * setting so the onboarding wizard reuses the same field. Optional during
   * rollout — readers default to `"/%postname%"` when absent.
   */
  permalinkSchema?: string;
}

/**
 * A client-supplied referral / affiliate link to weave into relevant posts.
 *
 * A specific, verbatim URL (tracking params preserved) the client owns — not a
 * bare authority domain. Structura inserts at most one relevance-matched link
 * per post. Configured at the site level (`seoIntel.referralLinks`, a seed) and
 * per campaign; paid tiers only. Mirror of the `ReferralLink` in
 * `functions/src/types/functions.ts` (hand-synced per the shared-types drift note).
 *
 * @since 2.12.0
 */
export interface ReferralLink {
  /** Verbatim destination URL — tracking params preserved, never rewritten. */
  url: string;
  /** Product/brand name, e.g. "Acme Boards". Seeds anchor text + relevance. */
  label: string;
  /** Topics/keywords this link is relevant to; drives per-post gating. */
  relevanceKeywords?: string[];
  /** Optional exact anchor override; when absent the AI writes a natural anchor. */
  anchorText?: string;
}

export interface LicenseActivation {
  /**
   * UUID activation id. Same value as the Firestore doc id; stamped on
   * the doc so readers don't reverse-engineer it from the path.
   */
  id: string;
  /** Workspace tenant root that owns this activation. */
  workspaceId: string;
  /** Platform discriminator — see `ActivationSurface`. */
  surface: ActivationSurface;
  /** Surface-specific identity bag — see `ActivationSurfaceMetadata`. */
  surfaceMetadata: ActivationSurfaceMetadata;
  /**
   * HMAC signing key the cloud uses when calling back into the plugin's
   * webhook URL (`webhookUrl` carried in the campaign payload — fan-out
   * error reports, pulse checks). The plugin verifies the signature with
   * the same secret to confirm the callback originated from this cloud
   * tenant rather than a forged caller.
   *
   * Phase 3.5 retired this field's role as the AUTH credential — the
   * plugin now authenticates outbound calls with `Authorization: Bearer
   * <apiToken>` per the API token subcollection. The HMAC signing role
   * is independent and stays. Removed via `FieldValue.delete()` at
   * disconnect time so a stale callback can't reach a disconnected
   * site.
   */
  activationSecret?: string;

  /**
   * Sticky hint that this site's inbound webhook is blocked (a host
   * firewall / security plugin / cache intercepts the cloud's delivery POST,
   * or the site is unreachable). While `true` the cloud skips the webhook
   * push and persists the deliverable for the plugin to PULL (polling
   * fallback). Cleared by the re-probe cron once `pulse-check` answers again.
   * Back-compat: optional; absent / `false` = push-first (the default).
   */
  webhookDeliveryBlocked?: boolean;
  /** Server timestamp when `webhookDeliveryBlocked` last flipped to `true`. */
  webhookDeliveryBlockedAt?: Timestamp;

  /** Lifecycle state — see `LicenseActivationStatus`. */
  status: LicenseActivationStatus;
  /** Server timestamp when status flipped to `"disconnected"`. */
  disconnectedAt?: Timestamp;
  activatedAt: Timestamp;

  /**
   * Per-site add-on assignment. Absent keys = add-on not enabled on this
   * site. Spec §11.2 — the dispatcher silently drops events for activations
   * missing the relevant key.
   */
  entitlements?: Partial<Record<AddonId, AddonSeatAssignment>>;

  /**
   * The workspace-level `VisualPreset.presetId` this site is bound to.
   * Image generations on this activation resolve their style/aspect/format
   * from the bound preset. `null` / absent = unbound; the cloud refuses to
   * generate (surfaces `visual_preset_unbound`). We deliberately do NOT
   * fall back to a workspace-level default — the old singleton silently
   * propagated edits across every site under a workspace, which is the
   * bug this binding model fixes.
   */
  visualPresetBinding?: string | null;

  /**
   * Live per-activation token counter for the current cycle. Bumped by
   * `FieldValue.increment(totalTokens)` after every text generation; reset
   * to 0 by the monthly cron when `quotaCycleStartedAt` is older than the
   * cycle window. Compared against `License.maxTokensPerActivation` at
   * the generation gate (`checkAndEnforceLimits`).
   */
  usedTokensThisMonth?: number;
  /** Live per-activation image counter — same shape as `usedTokensThisMonth`. */
  usedImagesThisMonth?: number;
  /**
   * Anchor for the current usage cycle on this activation. The reset cron
   * rolls counters back to 0 when this is older than the cycle window
   * (`now - 30d`). Independent of `License.lastResetAt` so per-activation
   * resets can stagger if needed (rare; for now they march together).
   */
  quotaCycleStartedAt?: Timestamp;

  /**
   * Cached snapshot of the WP install's brand surface, pushed by the plugin
   * once at activation and refreshed via option-change hooks (`blogname`,
   * `blogdescription`, `WPLANG`/`_locale`, `theme_mods_{stylesheet}` for
   * `custom_logo`).
   *
   * Why on the activation doc: stock-generation runs in the cloud read it
   * synchronously to build a campaign's prompt context — a per-run REST
   * round-trip back to WP would add ~300ms and a hard dependency on the
   * site being reachable. Spec: `specs/v2/cloud-pregeneration-and-model-catalog.md` §1.0e.
   *
   * Optional because the plugin's first sync may race the activation
   * write; cloud readers tolerate `undefined` and fall back to the
   * plugin-supplied `site_context` on the request payload.
   */
  siteIdentity?: SiteIdentity;

  /**
   * Per-site brand positioning (what the business does / who it serves /
   * the problem it solves). Activation-scoped as of 2026-06-02.
   *
   * Previously lived on `workspace.positioning`, which leaked one site's
   * positioning onto every other site under the same workspace — an agency
   * (or a multi-site dogfood account) running N distinct businesses got the
   * SAME positioning injected into every site's generated posts. See
   * `scripts/admin/audit-positioning-scope.mjs` and
   * `specs/v2/multi-tenant-and-public-api.md` §"Data model changes".
   *
   * Optional and read defensively: absent on legacy activations and during
   * the rollout window. Readers fall back to `workspace.positioning` ONLY
   * when the workspace has exactly one active activation (legacy single-site
   * safety); multi-activation workspaces get NO fallback. NOTE the
   * deliberate divergence from `visualPresetBinding` above, which refuses
   * any fallback — positioning keeps the single-site fallback so the 99%
   * one-site-per-workspace case keeps working before the backfill runs.
   */
  positioning?: {
    what: string;
    who: string;
    problem: string;
    /** How the value was authored — user-typed, AI-drafted, or AI-then-edited. */
    source: "user" | "ai_draft" | "edited";
    /** ISO 8601 timestamp the value was last captured. */
    capturedAt: string;
  };

  /**
   * Per-site SEO intelligence inputs. Activation-scoped as of 2026-06-02 for
   * the same reason as {@link LicenseActivation.positioning} — keywords,
   * authority domains, and competitors are site-level facts, not brand-level.
   *
   * `emailDigestOptIn` deliberately STAYS on `workspace.settings.seoIntel`:
   * it's a per-tenant notification preference, not a site fact. Optional /
   * read defensively; same 1-vs-N legacy fallback as `positioning`.
   */
  seoIntel?: {
    /** Aspirational keywords the site wants to rank for. Seeds campaign keywords. */
    targetKeywords?: string[];
    /** Vetted outbound-link authority domains, prefilled into each campaign. */
    authorityDomains?: string[];
    /** User-managed competitor URLs driving per-site gap-keyword discovery. */
    competitorUrls?: string[];
    /**
     * Client referral / affiliate links, prefilled into each new campaign's
     * `referralLinks`. A per-client/per-site affiliation. See {@link ReferralLink}.
     * @since 2.12.0
     */
    referralLinks?: ReferralLink[];
  };

  /**
   * BYOK credential bindings for this site — `provider → credId` into the
   * workspace credential library (`/workspaces/{w}/credentials/{c}`). A
   * provider is usable on this activation only when it has an entry here;
   * the generation gate resolves the bound credential via
   * `getActiveCredential(db, workspaceId, activationId, provider)`. Written
   * by the portal AI-engine step (`setActivationCredentialBinding`) and the
   * plugin's workspace-key picker. Absent on managed tiers, which resolve a
   * master key instead. Optional / read defensively.
   */
  aiBindings?: Partial<Record<AIProvider, string>>;

  /**
   * Per-site default provider + model for headless generation, chosen in
   * the portal setup wizard's AI-engine step. SEEDS new campaigns
   * (`defaultCampaignInput` reads it) — generation itself stays
   * campaign-doc-driven, so an existing campaign's explicit choice always
   * wins. Independent of {@link aiBindings}: bindings make a provider
   * *usable*, `aiDefaults` records which usable provider/model is the
   * *default* for text vs images.
   *
   * BYOK/free concept only — managed tiers (`cloud`/`cloud_pro`) skip the
   * AI-engine step and keep the campaign-level default. Optional during
   * rollout (back-compat window, CLAUDE.md §10); readers fall back to the
   * existing hardcoded campaign default when absent.
   */
  aiDefaults?: {
    textProvider: AIProvider;
    textModel: string;
    imageProvider: AIProvider | null;
    imageModel: string;
  };

  /**
   * Default persona for this site — a workspace-library persona id used when a
   * campaign run carries no explicit `personaId`. Optional; absent before the
   * persona library/binding model and on sites that never set a default.
   */
  personaDefaultBinding?: string;
  /**
   * Workspace-library persona ids bound to this site (the rotation pool).
   * Optional; absent → callers fall back to the whole library for rotation.
   */
  personaMemberships?: string[];

  /**
   * Set on a headless activation created by the WP→headless conversion: the
   * source WP activation id it was converted from. Powers idempotency (a re-run
   * finds the in-flight target instead of creating a duplicate) and traces
   * provenance. Optional/additive — absent on every natively-created activation.
   */
  convertedFrom?: string;
  /** Server timestamp the conversion that created this activation started. */
  conversionStartedAt?: Timestamp;
}

/**
 * API TOKENS (Subcollection of Workspace) — Phase 3.5
 * Path: /workspaces/{workspaceId}/apiTokens/{tokenId}
 *
 * Spec: `specs/v2/multi-tenant-and-public-api.md` §3.5.
 *
 * Bearer-token credentials that authenticate cloud requests. Two flavours:
 *
 *   - **Activation-bound** (`boundActivationId` set): minted in-band when an
 *     activation is created; the plugin persists the secret in `wp_options`
 *     and sends it as `Authorization: Bearer <secret>` on every cloud call.
 *     Revoked at disconnect time so a `disconnected` activation has no
 *     usable token.
 *
 *   - **Workspace-wide** (`boundActivationId` undefined): created from the
 *     customer portal for programmatic access (Phase 5). Authorises
 *     workspace-scoped reads/writes regardless of activation.
 *
 * The secret string itself is shown ONCE at creation time and never
 * persisted in cleartext on the cloud — only the SHA-256 hash lives on
 * the doc, so a Firestore breach never reveals usable tokens. Lookups
 * hash the presented bearer and query a collection-group index on
 * `tokenHash`. Doc id (`tokenId`) is a UUID; it is NOT the secret.
 */
export interface ApiToken {
  /** UUID. Same as the Firestore doc id; stamped on the doc for O(1) reads. */
  tokenId: string;
  /**
   * SHA-256 of the secret string the client presents in the
   * `Authorization: Bearer …` header. The middleware hashes the
   * incoming token and queries a collection-group index on this field.
   */
  tokenHash: string;
  /** Workspace tenant root that owns this token. */
  workspaceId: string;
  /** Human label for the token (`"WP plugin (example.com)"`, `"CI deploy"`). */
  name: string;
  /**
   * Capability strings the token may exercise. Plugin-minted tokens
   * carry `["plugin:wp"]` (sentinel for "everything the WP plugin needs
   * to do"); future portal-minted tokens carry the explicit capability
   * strings from `CAPABILITIES`. Per-endpoint scope enforcement lands
   * in Phase 5.3 — today the middleware records scopes but does not
   * filter on them.
   */
  scopes: string[];
  /**
   * UUID of the activation this token is bound to. Present on plugin-
   * minted tokens; absent on workspace-wide tokens (Phase 5). When set,
   * the middleware exposes it on the request context so endpoints can
   * scope writes to the bound activation without trusting a body field.
   */
  boundActivationId?: string;
  createdAt: Timestamp;
  /**
   * Last time the token successfully authenticated. Updated on a
   * 1/minute-per-token debounce to avoid write storms — the field is
   * informational (used by the portal to show "last used 2h ago"),
   * not load-bearing.
   */
  lastUsedAt?: Timestamp;
  /**
   * Server timestamp when the token was revoked. Once set, the
   * middleware rejects every subsequent presentation with 401.
   * Activation disconnect revokes every activation-bound token in one
   * batch; portal revoke fires for individual tokens.
   */
  revokedAt?: Timestamp;
}

/**
 * Brand surface a WordPress site advertises to the cloud's stock-generation
 * pipeline. Mirrors the shape `Context_Builder::build_brand_context()` /
 * `build_cloud_context().site_identity` produce on the plugin side, with two
 * additions only the cloud needs:
 *
 *   - `homeUrl`: the public origin the cloud calls for the recent-posts
 *     digest endpoint (`{homeUrl}/wp-json/wp/v2/posts?…`). WP REST is
 *     anonymous-readable for `status=publish`, so no token is required.
 *   - `updatedAt`: lets cloud readers detect a stale activation (e.g.
 *     site renamed last week, sync hook fired, but Firestore write lost
 *     to a transient outage) — staleness is informational; reads still
 *     proceed with the cached value.
 *
 * Both `name` and `tagline` are optional because WP installs sometimes ship
 * with empty defaults and the cloud should still gracefully build prompts
 * (the existing fallback in `Abstract_Text_Adapter` handles empty strings).
 */
export interface SiteIdentity {
  /** `get_bloginfo('name')` — site title. */
  name?: string;
  /** `get_bloginfo('description')` — tagline. */
  tagline?: string;
  /**
   * `get_bloginfo('language')` (BCP-47 form, e.g. `en-US`). Cloud uses this
   * for SERP `hl` resolution + i18n templating; falls back to the campaign-
   * level `intelligence.language` when missing.
   */
  language?: string;
  /**
   * Resolved custom-logo URL (or site icon as fallback). Empty string is a
   * sentinel for "set on this site, but the file is gone" — we keep the
   * entry rather than dropping it so a cloud reader can distinguish
   * "never synced" from "synced but cleared".
   */
  logoUrl?: string;
  /**
   * `home_url('/')` — the WP install's own origin. Stored normalised (no
   * trailing slash). May differ from `domain` when WP_HOME is not the
   * activation hostname (DDEV → ngrok shares, staging fronted by a CDN).
   *
   * This is where the cloud fetches the recent-posts digest from
   * (`{homeUrl}/wp-json/wp/v2/posts`), so it always points at the
   * authoring origin even in headless deployments. For "the public face
   * readers visit" use {@link publicUrl} instead.
   */
  homeUrl?: string;
  /**
   * The public website readers actually visit. In non-headless mode this
   * equals `homeUrl`. In headless mode (`isHeadless: true`) it points at
   * the front-end origin (e.g. `https://xerx.io` while WP runs at
   * `cms.xerx.io`). Always normalised — no trailing slash.
   *
   * Cloud-side AI grounding (homepage scrape, smart-suggestion landing
   * URLs, brand context) consumes this rather than `homeUrl`. Cloud
   * readers should use `publicUrl ?? homeUrl` for back-compat — pre-1.x
   * plugins won't sync the field.
   *
   * Spec: `specs/site-identity-headless.md` §3.1.
   */
  publicUrl?: string;
  /**
   * `true` when the operator has explicitly enabled headless mode and
   * provided a `publicUrl` distinct from `homeUrl`. Drives UI copy on
   * the cloud side ("Headless mode") and unlocks `keyPages`-based
   * grounding. Optional for back-compat: missing/false = inherit-from-WP.
   *
   * Spec: `specs/site-identity-headless.md` §3.1.
   */
  isHeadless?: boolean;
  /**
   * Short paragraph (≤ 600 chars) describing what the public site is for.
   * Auto-populated from a one-shot Jina scrape of `publicUrl` when the
   * operator first enables headless mode; manually editable thereafter.
   * Feeds the grounding payload as a low-cost "elevator pitch" string
   * when the homepage scrape fails or the cache is cold.
   *
   * Spec: `specs/site-identity-headless.md` §3.1.
   */
  description?: string;
  /**
   * Curated list of high-value non-blog pages. In non-headless mode this
   * is auto-detected from the WP nav menu (today's `detect_landing_urls`
   * behaviour, surfaced for editing). In headless mode it's user-curated
   * because Structura can't see the public site's nav from inside WP.
   *
   * Used for the `landing_urls` payload (smart suggestions, campaign
   * synthesis) and as internal-link candidates fed to the AI alongside
   * recent posts.
   *
   * Spec: `specs/site-identity-headless.md` §3.1.
   */
  keyPages?: KeyPage[];
  /**
   * How to derive a public URL for a given post.
   *
   * - `inherit` — return `get_permalink()` unchanged (default for
   *   non-headless installs).
   * - `prefixSwap` — replace `homeUrl` host+path with `publicUrl` host
   *   plus `/{lang}/blog/{slug}`. Used by Structura's own deployments.
   * - `template` — use `permalinkTemplate` with `{slug}` / `{lang}` /
   *   `{year}` / `{month}` tokens. Escape hatch for unusual front-ends.
   *
   * Spec: `specs/site-identity-headless.md` §3.1.
   */
  permalinkStrategy?: "inherit" | "prefixSwap" | "template";
  /**
   * Required when `permalinkStrategy === "template"`. Tokens: `{slug}`,
   * `{lang}`, `{year}`, `{month}`. Always concatenated against
   * `publicUrl`. Example: `"/news/{year}/{slug}"`.
   *
   * Ignored for other strategies; cloud writers store whatever the
   * plugin sends so operators can switch strategies without losing the
   * template they had configured.
   */
  permalinkTemplate?: string;
  /**
   * Default language token for `prefixSwap` / `template` resolution
   * when the post itself doesn't carry one. Falls back to the BCP-47
   * prefix of `language` (`en-US` → `en`), or `"en"` if neither is set.
   */
  defaultPermalinkLang?: string;
  /**
   * Server-stamped on every write. Cloud readers can compare against
   * `License.updatedAt` or campaign creation time to detect a sync that
   * lagged behind a campaign-launch surface (rare; informational only).
   */
  updatedAt: Timestamp;
}

/**
 * A high-value non-blog page on the public site, used for AI grounding
 * and as an internal-link candidate.
 *
 * Spec: `specs/site-identity-headless.md` §3.1.
 */
export interface KeyPage {
  /** Absolute URL on the public site. Required, must parse as a URL. */
  url: string;
  /** Human label for UI / AI prompts. e.g. `"About"`, `"Pricing"`. */
  label: string;
  /**
   * Open-enum role hint. Lets the cloud bias internal-link selection by
   * intent (e.g. "link to a `pricing` page from a comparison post").
   */
  role:
    | "about"
    | "features"
    | "services"
    | "pricing"
    | "case_studies"
    | "blog_index"
    | "contact"
    | "other";
}

/**
 * PLUGIN CAPABILITIES
 * What the plugin is allowed to do based on the Plan.
 */
export interface PluginConfig {
  capabilities: {
    canUseBulkPublish: boolean;
    canUseAutoTagging: boolean;
    canUseAdvancedModels: boolean; // e.g., GPT-4o vs GPT-4o-mini
    hasPrioritySupport: boolean;
    isWhiteLabeled: boolean;
  };
}

/**
 * UTILITY TYPES
 */
export type FirestoreDocument<Data> = Data & { id: string };

/**
 * STRIPE TYPES (Simplified for Portal usage)
 */
export interface StripePrice {
  id: string;
  active: boolean;
  currency: string;
  unit_amount: number;
  interval: "month" | "year" | null;
  stripe_metadata_planId: PlanId;
  metadata: Record<string, string>;
}

export interface StripeProduct {
  id: string;
  active: boolean;
  name: string;
  description: string | null;
  images: string[];
  metadata: Record<string, string>;
}

/**
 * CAMPAIGN SEO STRATEGY
 * Shared between the React client, Firebase functions, and the WordPress plugin.
 *
 * - traffic_magnet: Broad informational content targeting high search volume.
 * - quick_wins:     Niche, low-competition topics the site can rank for quickly.
 * - conversion:     Bottom-of-funnel content designed to drive user action.
 * - authority:      Deep expert content that builds long-term topical trust.
 */
export type CampaignMode = "traffic_magnet" | "quick_wins" | "conversion" | "authority";

/**
 * SERP DATA TYPES
 * Shapes returned by the Serper.dev integration and cached on the campaign.
 */
export interface SerpResult {
  title: string;
  link: string;
  snippet: string;
}

export interface SerpContext {
  topCompetitors: SerpResult[];
  targetKeyphraseMetrics: {
    volume: number;
    difficulty: number;
  };
}

/**
 * AUTH CONTEXT
 * Used in the React apps to track current state
 */
export interface AuthUser extends User {
  activeLicenses: License[];
}

/**
 * FEATURE FLAGS
 * Keys allowed inside `License.features`. Add new flags here before writing
 * them anywhere else so the type system catches typos across cloud + plugin
 * + client. Each new entry should list its default in the comment and the
 * spec section that introduced it.
 *
 * Currently empty — `cloudOnlyGeneration` lived here briefly during the
 * Phase 3 rollout window of `specs/v2/cloud-only-generation.md`, then
 * was retired (zero users, so the gradual-rollout safety net was moot
 * and the dual code path added complexity for no benefit). Kept as
 * `never` rather than deleted so the `License.features` map still has
 * a named shape and `isFeatureEnabled` stays callable for future flags.
 */
export type FeatureFlag = never;

/**
 * Boolean check — true iff `License.features?.[flag] === true`. Treats
 * missing maps and missing keys as `false`. The single source of truth
 * for "is this feature on for this license?" — every cloud + plugin +
 * client read should funnel through here.
 */
export function isFeatureEnabled(
  license: { features?: Partial<Record<FeatureFlag, boolean>> } | null | undefined,
  flag: FeatureFlag,
): boolean {
  return !!license?.features?.[flag];
}

/**
 * CAMPAIGN RUN / PROGRESS STREAM
 * Shared contract between the cloud scheduler (writer), the plugin REST
 * bridge (reader that proxies to the client), and the React client (reader
 * that renders the drawer). Spec: `specs/progress-stream.md` §4.
 */

/**
 * Lifecycle of a single generation run. `queued` and `running` are non-
 * terminal; the rest are terminal. `cancelled` is reserved for a future
 * abort-mid-run feature (spec §3, out of scope) but included in the union
 * so readers handle it defensively from day one.
 *
 * `succeeded_with_warnings` is a third terminal success variant introduced
 * with `specs/run-detail-view.md` (§11 Q2): the post published, but a
 * partial failure occurred — e.g. one of two images couldn't be generated,
 * or a non-critical channel (LinkedIn, Slack) failed to fan out. The
 * campaign card on the Campaigns list still "heals" (it treats both
 * `succeeded` and `succeeded_with_warnings` as positive), but the Needs
 * Attention widget (Phase 2) will surface the warning with a ⚠ treatment
 * separate from the ✗ failure treatment. Clients that don't yet know this
 * value MUST treat it as a successful terminal state (the `Run complete`
 * fallback already does — anything not in the fail/cancel set renders
 * green) so older bundles don't break.
 */
export type RunStatus =
  | "queued"
  | "running"
  // Non-terminal. The cloud finished synthesis but could NOT push the
  // blueprint to the plugin's webhook (host firewall/cache/security
  // intercepted the inbound POST, or the site was unreachable). The cloud
  // persists the deliverable and waits for the plugin to PULL it via the
  // polling fallback; `ackDeliverable` then promotes this to `succeeded` /
  // `succeeded_with_warnings`. Older clients must treat unknown ids as
  // in-progress (not terminal).
  | "awaiting_pull"
  | "succeeded"
  | "succeeded_with_warnings"
  | "failed"
  | "cancelled";

/**
 * Curated milestones the user sees in the progress drawer. The cloud
 * writes the id; the client maps it to human copy in
 * `client/src/features/progress/milestones.ts`. Adding a milestone is
 * always additive — older clients must treat unknown ids as "pass-through"
 * (render the id muted, keep the bar moving). Spec: `specs/progress-stream.md` §5.
 */
export type Milestone =
  | "queued"
  | "stock_check"
  | "research"
  // Surfaced sub-phases of the research window (between `research` and
  // `outlining`). Each is emitted by `gatherResearch` ONLY when that phase
  // actually executes — `competitor_analysis` when the Jina outline scrape
  // runs, `authority` when vetted-domain link resolution runs. Both are
  // Pro-gated work, so on Free tier they never emit (and the SPA hides them).
  // Added 2026-05-27 to make the real SEO research depth visible rather than
  // hiding it inside a single "Researching your topic" beat.
  | "competitor_analysis"
  | "authority"
  | "outlining"
  | "drafting"
  | "link_validation"
  // `images` is the legacy single-bucket milestone. Runs created
  // before 2026-05-22 carry their image-gen duration here. New
  // runs stamp `image_featured` and `image_body` separately
  // (cms.xerx.io feedback: a 10-minute "Generating images" row
  // wasn't actionable; users want to see per-slot progress).
  // We keep `images` in the union so old run-detail pages still
  // render their stamped duration; the cloud's tracker no longer
  // emits it.
  | "images"
  | "image_featured"
  | "image_body"
  | "assembling"
  | "publishing"
  // Channels fan-out happens AFTER `publishing` from the plugin's
  // `structura/post/inserted` hook. The run is already terminal-success
  // by the time this milestone gets stamped, so it's the only milestone
  // that lands on a doc with `status: "succeeded"`. The cloud's
  // `channelsPostPublished` endpoint patches `stepDurationsMs.channels`
  // plus `channelsResolvedCount` once fan-out completes — the SPA's
  // RunTimeline reads both to render a "{count} channel(s)" chip.
  | "channels"
  | "done"
  | "error";

/**
 * Top-level discriminator for which generation pipeline produced the
 * run. Drives the milestone set the SPA renders in the timeline:
 *
 *  - `"sync"` → the full ~30-60s synthesis path (research → outlining
 *    → drafting → … → publishing). Default for any run that doesn't
 *    explicitly set the field.
 *  - `"stock"` → served from a pre-baked stock entry. The timeline
 *    collapses to queued → stock_check → publishing (3 steps),
 *    matching the actual <1s work the cloud did. See
 *    `functions/src/stock/serve.ts::deliverStockServedRun`.
 *
 * Adding a new flow is additive — older clients fall through to the
 * "sync" rendering path. Spec: specs/v2/cloud-pregeneration-and-model-catalog.md §1.4.
 */
export type CampaignRunFlow = "sync" | "stock";

/**
 * Error payload attached to a `failed` run. `userMessage` is the string the
 * drawer shows to the end-user and must therefore be safe to display (no
 * stack traces, no raw provider responses, no secrets). `code` is a stable
 * machine id the UI can branch on (e.g. showing a "reconnect Slack" CTA
 * for `channel_unauthorized`). `logRunId` correlates back into System Logs
 * so the user can click through — it is NOT a secret and may be shown.
 */
export interface CampaignRunError {
  code: string;
  userMessage: string;
  logRunId: string;
  /**
   * Classifier bucket for provider-side failures (added 2026-05-01).
   * Populated for synthesis catches that route through the cloud's
   * `classifyProviderError`; absent for code-path failures (channels
   * dispatch, blueprint validation, etc.). The SPA branches on this
   * to pick retry-style copy ("try again in a minute") vs
   * action-required copy ("re-enter your API key in AI Engine").
   */
  errorKind?:
    | "auth"
    | "credit"
    | "quota"
    | "rate_limit"
    | "transient"
    // Cloud → plugin webhook delivery failure (DNS, TLS, timeout,
    // ECONNRESET, 4xx/5xx from the plugin receiver). Distinct from
    // `transient` because the remediation differs sharply: "check
    // your site is reachable" vs "wait a minute and retry the AI
    // call." Added 2026-05-10 alongside `WebhookDeliveryError`.
    | "delivery_failed"
    | "other";
  /**
   * Operator-facing one-liner safe to render in the Technical
   * Inspector card on the run-detail page. Holds the classifier's
   * categorical summary (e.g. "Provider returned a transient/
   * server-side error."), not the raw provider error body.
   */
  devMessage?: string;
}

/**
 * Snapshot of everything the run was told to work with, captured at
 * queue time and never mutated after. The receipt view in
 * `specs/run-detail-view.md` §5.4 renders this as "What this run used".
 *
 * Why snapshot instead of reading through to the live campaign doc:
 *   - The run is immutable; the campaign that drove it is not. A user
 *     who edits keywords after a failure and then opens the run detail
 *     would otherwise see the EDITED keywords attributed to the OLD
 *     run. The snapshot preserves "this is what ran," divorced from
 *     "this is what the campaign currently says."
 *   - Retry (Phase 3) replays from this snapshot — so the semantics of
 *     "try this exact thing again" are well-defined. See spec §11 Q3.
 *
 * All fields are optional from the TypeScript perspective so old
 * clients that don't yet populate the block (or very-old CampaignRun
 * docs that predate this field) continue to read cleanly. The writer
 * in `functions/src/runs/store.ts::setInputs` stamps the whole block
 * in one merge write.
 */
export interface CampaignRunInputs {
  /**
   * Keywords the run was told to target. Typically the single picked
   * keyword (from the keyword-bank round-robin) plus any existing
   * keyphrases already spent on the campaign.
   */
  keywords?: string[];
  /**
   * Knowledge sources the run was pointed at (vetted authority
   * domains, per-post resolved authority URLs, etc.). `type`
   * distinguishes competitor-sourced hints from first-party
   * internal pages and explicit authority sources.
   */
  authorities?: Array<{
    url: string;
    title: string;
    type: "source" | "competitor" | "internal";
  }>;
  /**
   * Persona reference — Firestore nanoid only (changed 2026-05-01).
   *
   * Cloud is the source of truth for personas in v2; the SPA
   * re-fetches the persona doc by `personaId` from `usePersonasQuery`
   * when it wants to render the name. Pre-2026-05-01 we stored
   * `{ id: <legacy WP post id>, name: <denormalized> }` — but the
   * cloud was incorrectly stamping the systemPrompt under `name`
   * AND the legacy id was unusable against the v2 personas
   * collection (keyed by nanoid). Resolving from a live query
   * fixes both.
   */
  persona?: {
    personaId: string;
  };
  /**
   * Provider + model pair that was asked to run. `providers.text` is
   * what went into the draft AI call; `providers.image` is what was
   * picked for image generation. These are the PRIMARY ids — if
   * fallback fired, the actually-used pair is in `fallbackProviders`
   * below.
   */
  providers?: {
    text?: { id: string; model: string };
    image?: { id: string; model: string };
  };
  /**
   * Present only when the per-campaign fallback actually kicked in.
   * An unused fallback isn't rendered in the receipt — noise.
   * `fallbackProviders.text` is the pair that ended up doing the
   * draft work after the primary failed.
   */
  fallbackProviders?: {
    text?: { id: string; model: string };
    image?: { id: string; model: string };
  };
  /**
   * Free-text audience descriptor as configured on the campaign.
   * Load-bearing only when the user glances at the receipt, hence
   * optional; callers should leave undefined rather than writing
   * empty string.
   */
  targetAudience?: string;
  /**
   * Campaign schedule ("daily", "weekly", cron string, etc.). Useful
   * context on the receipt when a customer is debugging "why did
   * THIS run fire" — the cadence answers half the question.
   */
  rhythm?: string;
}

/**
 * What the run produced — populated incrementally on terminal. For a
 * successful run this is the post/image/channel receipt. For a failed
 * run it may be partial (e.g. one image generated before the publish
 * step blew up); the receipt view annotates the partial with
 * "Generated 1 of 2 images before stopping." per `specs/run-detail-view.md`
 * §5.5.
 *
 * Channels / images / the WP post id are populated by plugin signals
 * after the cloud's terminal write — cloud cannot know the final WP
 * post id at succeed() time because the plugin hasn't inserted the
 * post yet. The cloud writes whatever IS knowable at terminal (the
 * channels summary it has forwarded through `post-published`, image
 * cloud refs, etc.); the rest gets patched by follow-up phases.
 */
export interface CampaignRunOutputs {
  post?: {
    /**
     * Source post identifier. WP plugin patches this as a numeric post id
     * via the post-insert signal; typed as `number | string` so future
     * surface adapters (Webflow, Shopify GraphQL) can patch their native
     * non-numeric ids without forcing every deployed plugin to upgrade.
     * Spec: `specs/v2/multi-tenant-and-public-api.md` §6 (surface adapters).
     */
    id?: number | string;
    title?: string;
    url?: string;
    status?: "publish" | "draft";
  };
  images?: Array<{
    slot: "featured" | "body";
    /** WP media ID after sideload. Absent on cloud-generated-only runs. */
    mediaId?: number;
    alt: string;
    caption?: string;
    /** Thumbnail URL for the receipt view — prefer WP's thumbnail size. */
    thumbnailUrl?: string;
  }>;
  /**
   * Image slots the cloud-tier inline path tried but couldn't generate
   * (Spec §1.0h Phase 2). Each entry names the slot and the human-
   * readable provider/error string the engine surfaced. A non-empty
   * list promotes the run's terminal status to
   * `succeeded_with_warnings` — the post still lands, but the drawer's
   * receipt branch shows the missing slots and their reasons rather
   * than pretending everything was fine.
   *
   * Free-tier runs leave this undefined: their image flow is the
   * AS-driven legacy chain that fails per-task in System Logs rather
   * than rolling up into the run doc.
   */
  imageFailures?: Array<{
    slot: "featured" | "body";
    reason: string;
  }>;
  /**
   * Per-channel fan-out result aggregated at the post-published
   * endpoint. `succeeded` + `failed` + `skipped` drive the
   * succeeded_with_warnings promotion: a non-empty `failed` list
   * means the run technically published but something degraded.
   */
  channelsSummary?: {
    succeeded: string[];
    failed: string[];
    skipped: string[];
  };
}

/**
 * The single per-run document that powers the progress drawer. One doc
 * per run, keyed by `runId` under
 * `/licenses/{licenseKey}/activations/{activation}/runs/{runId}`.
 *
 * Invariants (enforced by the writer in `functions/src/runs/store.ts`):
 *   - `progressPercent` is monotonic — forward jumps are fine, backward
 *     moves are a bug.
 *   - `currentStep` and `progressPercent` are set together in one write.
 *   - `updatedAt` is always `serverTimestamp()` so 5-minute stale detection
 *     works across client clock skew.
 *   - Terminal writes (`succeeded`/`succeeded_with_warnings`/`failed`/
 *     `cancelled`) MUST set `endedAt` AND `durationMs`. Not setting
 *     `durationMs` on terminal is a bug.
 *   - `inputs` is written exactly once at queue time (spec
 *     run-detail-view.md §4) and MUST NOT be mutated after. Later
 *     merge writes simply don't include the key.
 *
 * Lifecycle: TTL 30 days after terminal state (bumped from the original
 * 24h — see `specs/run-detail-view.md` §2.7). Supports the Needs
 * Attention widget's 30-day rolloff and gives support conversations a
 * reasonable window. Aggregate timing is rolled up separately to
 * `/licenses/{l}/runAggregates/{yyyy-mm}` (Phase 2, progress-stream §6.2).
 */
export interface CampaignRunDoc {
  schemaVersion: 1;
  /** UUID. Matches the `campaign_run_id` the plugin sent in the generate payload. */
  runId: string;
  /**
   * Campaign id — `number` for legacy WP-authoritative campaigns (post id);
   * `string` (nanoid) for cloud-authoritative campaigns since Phase 1.0a.
   * The serialized wire shape preserves the runtime type verbatim so the
   * SPA's `CampaignRunProgress` matcher can compare against the prop
   * campaignId without coercion (the `===` check at the matcher's mount
   * gate previously broke when a nanoid prop was compared to a wire
   * `campaignId: 0` after coercion in `toWireRun`).
   */
  campaignId: number | string;
  /**
   * Owning activation's doc id, denormalized so per-site surfaces (the
   * portal's campaign Runs tab, agency dashboards) can filter the
   * workspace-rooted runs collection without repath'ing storage.
   * Optional for one release window: docs written before 2026-06-12 by
   * tracker-only paths (no `primeProgressDoc`) lack it.
   */
  activationId?: string;
  /** Denormalized for display; avoids a cross-doc read just to render the title. */
  campaignName: string;
  status: RunStatus;
  currentStep: Milestone;
  /** 0–100, monotonic. May skip forward; never moves back. */
  progressPercent: number;
  /** Curated UI string. Never a raw log line. See spec §9. */
  headline: string;
  /** Optional second line of context ("Section 2 of 5"). */
  subtext?: string;
  startedAt: Timestamp;
  updatedAt: Timestamp;
  /** Present only on terminal status. */
  endedAt?: Timestamp;
  /** Present only on terminal status. Equal to `endedAt - startedAt`. */
  durationMs?: number;
  /**
   * Per-step elapsed time in ms. Populated incrementally as milestones
   * advance — not just on terminal — so the stepper view can show
   * "Research ✓ 12s" while the run is still in drafting.
   */
  stepDurationsMs: Partial<Record<Milestone, number>>;
  /**
   * The actual milestone the run was on when it failed. Written by
   * `tracker.fail()` immediately before flipping `currentStep` to
   * the `error` sentinel.
   *
   * Why this exists separately from `currentStep`: `currentStep` is
   * the user-facing label and gets clobbered to `"error"` on failure
   * so the drawer shows the failure receipt copy. The SPA's
   * `RunTimeline` needs the underlying milestone to render the
   * timeline correctly — without this field the timeline can't tell
   * which step failed and renders every row as `not_reached` (the
   * "all greyed out, no durations" symptom Yurii reported on
   * 2026-05-02).
   *
   * Optional on the wire so older cloud builds that don't write it
   * yet still parse cleanly; UIs fall back to inferring from the
   * highest-index milestone present in `stepDurationsMs`.
   */
  failedAtStep?: Milestone;
  /** Only when status === 'failed'. */
  error?: CampaignRunError;
  /**
   * Populated once the post is inserted into the source surface. WP plugin
   * patches this as a numeric post id; typed as `number | string` so future
   * surface adapters can carry non-numeric ids (modeled on `acknowledgedBy`
   * — same forward-compatibility rationale).
   */
  resultPostId?: number | string;
  resultPostUrl?: string;
  /**
   * Snapshot of what this run was asked to use. Written once at queue
   * time; immutable after. See `CampaignRunInputs` docblock for the
   * reasoning behind snapshotting rather than reading-through.
   */
  inputs?: CampaignRunInputs;
  /**
   * What this run produced. Populated on terminal, may be partial on
   * failure. See `CampaignRunOutputs` docblock.
   */
  outputs?: CampaignRunOutputs;
  /**
   * When the run was acknowledged ("dismissed") from the Needs Attention
   * widget on the Overview dashboard. Absent means the run is still
   * surfacing as an attention item. Writes are server-only — the plugin
   * bridge posts to `/v1/runs/{runId}/acknowledge`, which flips this
   * sentinel via admin SDK. Spec: `specs/run-detail-view.md` §4, §6.5.
   *
   * Only meaningful for terminal problem states (`failed`,
   * `succeeded_with_warnings`). Other statuses MAY carry the field if
   * set during a transient state, but the widget query filters by
   * status anyway.
   */
  acknowledgedAt?: Timestamp;
  /**
   * WordPress user id of the admin who dismissed the run. Stored as a
   * string to stay forward-compatible with non-numeric user ids (e.g.
   * multisite with external auth). Paired with `acknowledgedAt`.
   */
  acknowledgedBy?: string;
  /**
   * Phase 1.4 — set when this run was served from the stock pre-
   * generation pipeline instead of running synchronous synthesis.
   * Sync-generated runs leave this absent; the field's presence IS
   * the "this run came from stock" signal for downstream consumers.
   * The drawer / RunDetailPage renders a "Pre-generated" badge when
   * present (Phase 1.6).
   */
  servedFromStock?: {
    stockId: string;
    textFromStock: boolean;
    imagesFromStock: boolean;
  };
  /**
   * Which generation pipeline produced this run. Drives the timeline
   * step set rendered by the SPA. Absent on legacy runs (treat as
   * `"sync"`). New runs always stamp this field at queue time —
   * synchronous synthesis writes `"sync"`, the stock-served path
   * writes `"stock"`. See `CampaignRunFlow`.
   */
  flow?: CampaignRunFlow;
  /**
   * True for ad-hoc one-off generations from the SPA's `/generate`
   * form. Stamped at queue time by `primeProgressDoc`. Drives:
   *   - the dashboard "Recent generations" widget filter,
   *   - the single-post detail page's "Run again" pre-fill behaviour,
   *   - the timeline's tier-locked-step rendering (single-post runs
   *     never use `stock_check`, so the SPA renders that chip as a
   *     locked-tier upsell rather than a real step).
   *
   * Absent on registered-campaign runs.
   */
  isEphemeral?: boolean;
  /**
   * Verbatim copy of the inline `body.campaign` payload the plugin
   * shipped, written at queue time when `isEphemeral === true`. Lets
   * the SPA's "Run again" button pre-fill the `/generate` form
   * without losing any of the user's original choices, and the
   * RunTimeline lock-state heuristic check whether images /
   * link_validation were requested. Registered-campaign runs leave
   * this absent and load from their cloud campaign doc instead.
   */
  inputSnapshot?: Record<string, unknown>;
  /**
   * Number of channel connections the dispatcher actually fanned this
   * run's published post out to. Written by `channelsPostPublished`
   * AFTER the run is already terminal — so the field's presence
   * doesn't gate the run's `done` state, only the SPA's
   * `channels` milestone chip ("3 channels" / "No channels").
   *
   * Absent when the dispatcher hasn't run yet (in-flight grace
   * window) or on tiers without Channels entitlement. Zero is a
   * legitimate value (paid tier, no connections configured).
   */
  channelsResolvedCount?: number;
}

/**
 * Wire shape returned by `GET /v1/runs/{runId}` (cloud) and
 * `GET /wp-json/structura/v1/runs/{runId}` (plugin bridge).
 *
 * Timestamps are serialized as ISO 8601 strings when they leave Firestore
 * — the `Timestamp` class only exists server-side. Clients must parse
 * with `new Date(...)` (which round-trips ISO 8601 without surprises).
 *
 * `schemaVersion` is fixed at 1 today; bumps are additive-only for one
 * full release window per the back-compat rule in `CLAUDE.md` §10.
 */
export type RunStatusSerialized = Omit<
  CampaignRunDoc,
  "startedAt" | "updatedAt" | "endedAt" | "acknowledgedAt"
> & {
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  acknowledgedAt?: string;
};

// =============================================================================
// PERMISSIONS — Phase 3.2 of `specs/v2/multi-tenant-and-public-api.md`
// =============================================================================
//
// Capabilities are the unit of authorization. Cloud functions check
// `currentUserCan(ctx, capability)` (see `functions/src/permissions/can.ts`)
// — they MUST NOT branch on the raw role string. Adding a new capability
// touches one map (`ROLE_CAPABILITIES`), not N call sites.

/**
 * Naming convention: `{domain}.{verb}` where domain matches a Firestore
 * collection or a logical area (`workspace`, `members`, `campaigns`,
 * `runs`, `personas`, `credentials`, `billing`).
 */
export const CAPABILITIES = [
  // Workspace itself
  "workspace.read",
  "workspace.update",
  "workspace.delete",
  "workspace.transfer",

  // Members management
  "members.read",
  "members.invite",
  "members.update",
  "members.remove",

  // Campaigns
  "campaigns.read",
  "campaigns.create",
  "campaigns.update",
  "campaigns.delete",

  // Campaign runs
  "runs.read",
  "runs.trigger",
  "runs.cancel",

  // Personas
  "personas.read",
  "personas.create",
  "personas.update",
  "personas.delete",

  // BYOK credentials (encrypted, admin-SDK-only at write time)
  "credentials.read",
  "credentials.write",

  // Billing — viewing invoices vs. managing the subscription
  "billing.read",
  "billing.manage",
] as const;

export type Capability = typeof CAPABILITIES[number];

/**
 * Role intent (informal):
 *   - **owner** — full control. Can delete the workspace, transfer
 *     ownership, manage billing.
 *   - **admin** — runs the workspace day-to-day. Same as owner except
 *     can't delete the workspace, can't transfer it, can't change the
 *     paid plan / credit card.
 *   - **editor** — produces content. Read+write on campaigns, runs,
 *     personas. Read-only on workspace and members.
 *   - **viewer** — read-only across the board. No credentials access
 *     (those are sensitive even at read-time), no billing access.
 *
 * The exhaustive `Record<WorkspaceRole, …>` shape forces every role to
 * make a decision when a new role is added — TypeScript catches a
 * forgotten role.
 */
const OWNER_CAPS: ReadonlyArray<Capability> = CAPABILITIES; // every cap

const ADMIN_CAPS: ReadonlyArray<Capability> = CAPABILITIES.filter(
  (c) => c !== "workspace.delete" && c !== "workspace.transfer" && c !== "billing.manage",
);

const EDITOR_CAPS: ReadonlyArray<Capability> = [
  // Read scope
  "workspace.read",
  "members.read",
  "campaigns.read",
  "runs.read",
  "personas.read",
  // Write scope — content production
  "campaigns.create",
  "campaigns.update",
  "campaigns.delete",
  "runs.trigger",
  "runs.cancel",
  "personas.create",
  "personas.update",
  "personas.delete",
];

const VIEWER_CAPS: ReadonlyArray<Capability> = [
  "workspace.read",
  "members.read",
  "campaigns.read",
  "runs.read",
  "personas.read",
  // No credentials.read — encrypted BYOK keys are sensitive even at read.
  // No billing.* — viewers shouldn't see invoices either.
];

export const ROLE_CAPABILITIES: Readonly<Record<WorkspaceRole, ReadonlySet<Capability>>> = {
  owner: new Set(OWNER_CAPS),
  admin: new Set(ADMIN_CAPS),
  editor: new Set(EDITOR_CAPS),
  viewer: new Set(VIEWER_CAPS),
};

/**
 * Pure function — returns true iff the given role grants the given
 * capability. Use this from non-Firestore contexts (tests, UI).
 * Cloud handlers should use `currentUserCan(ctx, capability)` instead
 * so membership lookup + caching are handled uniformly.
 */
export function roleHasCapability(role: WorkspaceRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

// ---------------------------------------------------------------------------
// Persona authoring vocabulary — shared template library
// ---------------------------------------------------------------------------

/**
 * The seven persona tones. Shared so the plugin SPA (`client/`) and the
 * customer portal (`web/`) draft from ONE vocabulary — a tone added here
 * appears in both surfaces. Human-facing LABELS are translated per-surface
 * (WP `__()` vs react-i18next), so only the value union lives here.
 */
export type PersonaTone =
  | "professional"
  | "casual"
  | "humorous"
  | "authoritative"
  | "enthusiastic"
  | "empathetic"
  | "controversial";

/** The four persona reading levels. See {@link PersonaTone} for the i18n split. */
export type PersonaReadingLevel = "grade_5" | "grade_8" | "grade_12" | "phd";

/** Tone values in display order — surfaces map each to a translated label. */
export const PERSONA_TONE_VALUES: readonly PersonaTone[] = [
  "professional",
  "casual",
  "humorous",
  "authoritative",
  "enthusiastic",
  "empathetic",
  "controversial",
];

/** Reading-level values in display order — surfaces translate the labels. */
export const PERSONA_READING_LEVEL_VALUES: readonly PersonaReadingLevel[] = [
  "grade_5",
  "grade_8",
  "grade_12",
  "phd",
];

/**
 * A starter persona archetype. Field names are snake_case to match the
 * plugin's existing `PersonaForm` shape (the portal maps to its camelCase
 * persona input at create time). `system_prompt` is an LLM directive and
 * stays English regardless of UI locale; `name` carries an English default
 * that each surface may translate.
 */
export interface PersonaTemplate {
  name: string;
  tone: PersonaTone;
  reading_level: PersonaReadingLevel;
  system_prompt: string;
}

/**
 * The shared starter-persona library shown in both surfaces' "Templates"
 * pickers. Single source of truth — previously duplicated in
 * `client/src/features/personas/data/personaTemplates.ts`; lifted here so
 * the portal reuses the exact set rather than drifting a second copy.
 */
export const PERSONA_TEMPLATES: readonly PersonaTemplate[] = [
  {
    name: "Skeptical Tech Journalist",
    tone: "authoritative",
    reading_level: "grade_12",
    system_prompt:
      "You are a seasoned tech journalist who questions every marketing claim. You provide deep analysis, look for hidden trade-offs, and write with a hint of healthy cynicism. Your goal is to find the 'catch' in every new product.",
  },
  {
    name: "Friendly Lifestyle Blogger",
    tone: "casual",
    reading_level: "grade_8",
    system_prompt:
      "You write relatable, warm, and engaging content about daily life. You use personal anecdotes, emoji-lite formatting, and focus on practical, easy-to-implement tips for busy families.",
  },
  {
    name: "PhD Research Scientist",
    tone: "professional",
    reading_level: "phd",
    system_prompt:
      "You are a rigorous academic researcher. Your writing is dense with data citations, formal in structure, and avoids all hyperbole. You focus on evidence-based conclusions and technical accuracy above all else.",
  },
  {
    name: "The Growth Hacker",
    tone: "enthusiastic",
    reading_level: "grade_8",
    system_prompt:
      "You are obsessed with ROI, conversion rates, and rapid scaling. Your writing is punchy, high-energy, and full of action items. You speak directly to the 'hustle' culture and focus on quick wins.",
  },
  {
    name: "Humorous Social Critic",
    tone: "humorous",
    reading_level: "grade_12",
    system_prompt:
      "You use wit, irony, and satire to discuss modern social trends. You are observant and slightly snarky, making complex points through relatable comedic comparisons.",
  },
  {
    name: "Zen Wellness Guide",
    tone: "empathetic",
    reading_level: "grade_8",
    system_prompt:
      "You are a calm, mindful wellness coach. Your writing uses soft language, focuses on holistic health, and encourages the reader to slow down and practice self-care.",
  },
  {
    name: "No-Nonsense Financial Advisor",
    tone: "authoritative",
    reading_level: "grade_12",
    system_prompt:
      "You are a blunt, math-first financial expert. You hate 'get rich quick' schemes. Your writing focuses on long-term stability, risk management, and cold, hard numbers.",
  },
  {
    name: "The Conspiracy Theorist",
    tone: "controversial",
    reading_level: "grade_8",
    system_prompt:
      "You question the mainstream narrative. You 'connect the dots' that others miss. Your writing is intense, provocative, and urges readers to 'wake up' to hidden truths.",
  },
  {
    name: "Home DIY Craftsman",
    tone: "casual",
    reading_level: "grade_5",
    system_prompt:
      "You are a hands-on builder who explains things simply. You use 'tool-belt' metaphors and focus on step-by-step clarity. You write for people who aren't afraid to get their hands dirty.",
  },
  {
    name: "Luxury Travel Concierge",
    tone: "professional",
    reading_level: "grade_12",
    system_prompt:
      "You represent the pinnacle of high-end travel. Your language is sophisticated and sensory, focusing on exclusivity, fine dining, and hidden five-star gems around the globe.",
  },
  {
    name: "The Devil's Advocate",
    tone: "controversial",
    reading_level: "grade_12",
    system_prompt:
      "Your job is to take the unpopular side of any argument to spark debate. You are logical but provocative, forcing readers to defend their assumptions through Socratic questioning.",
  },
  {
    name: "Compassionate Medical Expert",
    tone: "empathetic",
    reading_level: "grade_8",
    system_prompt:
      "You explain complex health issues with warmth and clarity. You avoid jargon where possible and focus on the patient's emotional journey alongside their physical recovery.",
  },
  {
    name: "The Cyberpunk Futurist",
    tone: "authoritative",
    reading_level: "grade_12",
    system_prompt:
      "You live on the edge of tomorrow. Your writing is neon-soaked, focusing on AI, transhumanism, and the intersection of biology and silicon. You write as if the future is already here.",
  },
  {
    name: "Eco-Warrior Activist",
    tone: "enthusiastic",
    reading_level: "grade_8",
    system_prompt:
      "You are passionate about the planet. Your writing is urgent, call-to-action focused, and highlights the environmental impact of every industry. You advocate for radical sustainability.",
  },
  {
    name: "Boutique Fashion Critic",
    tone: "humorous",
    reading_level: "grade_12",
    system_prompt:
      "You have a sharp eye for style and a sharper tongue. You critique runway trends with flair, focusing on aesthetic history and the 'cultural vibe' of current silhouettes.",
  },
  {
    name: "Old-School Investigative Reporter",
    tone: "authoritative",
    reading_level: "grade_12",
    system_prompt:
      "You follow the money. Your writing is objective, dry, and relies on deep-dive 'leaked' info and interviews. You write in a classic 'inverted pyramid' newspaper style.",
  },
  {
    name: "The Stoic Philosopher",
    tone: "authoritative",
    reading_level: "phd",
    system_prompt:
      "You apply ancient wisdom to modern problems. Your writing is brief, impactful, and focuses on what is within our control. You value virtue and reason over emotion.",
  },
  {
    name: "Foodie Storyteller",
    tone: "enthusiastic",
    reading_level: "grade_8",
    system_prompt:
      "You don't just write recipes; you write memories. Your language is rich with taste, smell, and texture descriptions. You believe every meal tells a story of culture and family.",
  },
  {
    name: "Direct-Response Copywriter",
    tone: "enthusiastic",
    reading_level: "grade_5",
    system_prompt:
      "You write for the sale. Your content is full of headlines, bullet points, and psychological triggers. You focus on pain points and the immediate benefits of a solution.",
  },
  {
    name: "The Minimalist Architect",
    tone: "professional",
    reading_level: "grade_12",
    system_prompt:
      "You believe less is more. Your writing is clean, structured, and avoids all 'fluff.' You focus on the functional beauty of design and the clarity of open space.",
  },
];
