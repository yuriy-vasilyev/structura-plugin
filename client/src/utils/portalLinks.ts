/**
 * Portal deep-link builder for upgrade / signup CTAs that originate in
 * wp-admin.
 *
 * Why a typed builder rather than hand-rolled URLs
 * ------------------------------------------------
 * Pre-Phase-1.8 the AI Engine and tier-locked surfaces dropped raw
 * `https://app.structurawp.com/` strings into anchor tags, so the
 * portal's signup / login page received zero context about WHY a
 * customer arrived (which feature they were trying to unlock, which
 * provider they were swapping into, which site they came from).
 * That made the post-signup landing experience generic — a fresh
 * sign-in form with no hint that the user just came from a site
 * trying to connect a second AI provider.
 *
 * This helper centralizes the query-string contract so:
 *   - the portal can read the same params in one place and tailor
 *     copy / preselect a return path,
 *   - new wp-admin entry points (Visuals upsell, Channels upsell, etc.)
 *     pick up the contract without each surface re-inventing the
 *     query-string conventions.
 *
 * The contract intentionally ships ONLY non-secret params — the portal
 * still authenticates the user from session, never from the URL. This
 * mirrors `client/src/features/account/deepLinks.ts`, which keeps
 * add-on assignment URLs secret-free for the same reason.
 *
 * Recognized intents (kept tight on purpose; new intents need a portal
 * change anyway, so they should be added in lockstep):
 *
 *   - `connect_more_providers` — user hit the per-tier provider count
 *     cap (Phase 1.8 §1.8.4) and wants to add another. Portal copy:
 *     "Sign up for a Free license to connect a second provider."
 *   - `unlock_provider`       — user wants to connect a tier-locked
 *     provider (e.g. Anthropic at None / Free). Portal copy:
 *     "Upgrade to BYOK to connect Anthropic."
 *   - `unlock_images`         — user hit the image-cap restriction at
 *     None / Free (Phase 1.8 image-side stripping). Portal copy:
 *     "Sign up for Free to unlock image generation."
 *   - `unlock_visuals`        — Visuals page teaser landing. Reserved
 *     for the matching surface so its CTA can stop hardcoding the
 *     bare URL.
 *   - `unlock_keyword_bank`   — campaign wizard's Keyword Bank step is
 *     paid-only. The teaser CTA sends Free / anonymous users over so
 *     the portal can land them on the billing/upgrade view (logged-in
 *     Free) or signup (anonymous "none" tier).
 *   - `unlock_authority`      — campaign wizard's Authority Sources step
 *     is paid-only. Same teaser shape as Keyword Bank.
 *   - `unlock_cadence`        — campaign wizard's Publishing Frequency step
 *     on Free: daily + Smart scheduling are locked and Weekly is capped at
 *     a single day (Free publishes at most once a week). The lock CTAs
 *     send the user to billing to lift the cadence cap.
 *   - `unlock_channels`       — Channels store entry on Free / unentitled
 *     plans. Lets the portal scroll to the Channels-bundled tier card.
 *   - `unlock_video`          — Video channel (Shorts/TikTok renders) is
 *     Cloud Pro-only. Fired from the deep-link gate, the quota-exhausted
 *     "Upgrade for more videos" prompts, and the skipped-quota activity
 *     row so pricing can highlight the Cloud Pro tier.
 *   - `unlock_addon`          — Add-on card (Account page) when the user
 *     isn't entitled. The AddonCard previously hardcoded a `pricingAnchor`
 *     fragment, now passed through alongside the intent.
 *   - `manage_account`        — "open the app" links where the user
 *     already has an account (Header, LicenseStatusBanner). Not an
 *     upsell — the portal lands them on their dashboard.
 *   - `general_upgrade`       — generic "Upgrade" / "View pricing" CTAs
 *     that aren't tied to a single feature lock (CampaignsPage Free
 *     banner, the Dashboard UpgradeCard, GeneratePostPage campaign-tier
 *     teaser, AccountPage "View pricing").
 *
 * Future intents — add them here, then the portal team updates its
 * `/?intent=…` switch in lockstep.
 */
export type PortalIntent =
  | "connect_more_providers"
  | "unlock_provider"
  | "unlock_images"
  | "unlock_visuals"
  | "unlock_keyword_bank"
  | "unlock_authority"
  | "unlock_cadence"
  | "unlock_channels"
  | "unlock_video"
  | "unlock_addon"
  | "manage_account"
  | "general_upgrade";

export interface PortalSignupLinkArgs {
  /** Why the user is being sent over. Drives portal copy. */
  intent: PortalIntent;
  /** Site domain the request originated from. Helps the portal
   *  prefill the connect-this-site step after sign-up. Optional —
   *  callers should pass `window.location.hostname` when available.
   */
  domain?: string;
  /** Current plugin plan ("none" / "free"). Lets the portal mention
   *  the upgrade path in plain words ("from Free to BYOK").
   */
  plan?: string;
  /**
   * Provider the user was trying to connect (or swap into) when the
   * cap / lock fired. Portal can preselect-language the CTA.
   */
  providerId?: string;
  /**
   * Provider the user is currently using (only relevant for
   * `connect_more_providers`). Lets the portal mention the swap
   * scenario explicitly.
   */
  fromProviderId?: string;
  /**
   * Where to send the user back to after the portal flow completes.
   * The portal surfaces this as a "Back to {site}" link on its
   * post-conversion screen, so the customer can resume the exact
   * wp-admin URL they came from — typically the campaign-wizard
   * step they were on, with `resume=draft&step=…` already wired by
   * `buildWizardResumeUrl`. Must be a full https URL; the portal
   * validates the origin server-side.
   */
  returnTo?: string;
}

const PORTAL_BASE_URL = "https://app.structurawp.com";

/**
 * Build a portal URL with intent + context query args. Returns the
 * portal root (`https://app.structurawp.com/?…`) — the portal's
 * landing page is the single entry point that branches on `intent`.
 *
 * Query keys are sorted for cache-friendliness and snapshot-test
 * stability; missing optional fields are omitted entirely (no empty
 * `&from=` strings). The `source=plugin` flag is hardcoded so the
 * portal's analytics layer can attribute traffic back to the
 * wp-admin SPA without a referrer sniff.
 */
export function buildPortalSignupUrl(args: PortalSignupLinkArgs): string {
  const params = new URLSearchParams();
  params.set("intent", args.intent);
  params.set("source", "plugin");
  if (args.domain) params.set("domain", args.domain);
  if (args.plan) params.set("plan", args.plan);
  if (args.providerId) params.set("provider", args.providerId);
  if (args.fromProviderId) params.set("from_provider", args.fromProviderId);
  if (args.returnTo) params.set("returnTo", args.returnTo);
  return `${PORTAL_BASE_URL}/?${params.toString()}`;
}

// ─── Marketing-site pricing URLs ─────────────────────────────────────────

const MARKETING_BASE_URL = "https://www.structurawp.com";

/**
 * The four shipping locales for `www.structurawp.com`. Anything else
 * (WP `en_GB`, BCP-47 `es-419`, `ja_JP`, undefined…) falls through to
 * `"en"` per spec — the marketing site only ships these four. Mirrors
 * `SupportedLocale` in `@structura/i18n-contracts`, but re-declared
 * here to keep this util free of cross-package coupling.
 */
type MarketingLocale = "en" | "de" | "es" | "fr";

/**
 * Resolve a WP-style locale (or HTML lang attr) to one of the four
 * marketing-site locales. Designed to be robust against the three
 * shapes the browser exposes:
 *
 *   - `en_US` / `de_DE`  — WP `get_locale()` style, fed through to the
 *     SPA via `<html lang>` or `@wordpress/i18n`.
 *   - `en-US` / `pt-BR`  — BCP-47 from `document.documentElement.lang`.
 *   - `en`               — already a 2-letter base.
 *
 * Exported for unit-test coverage.
 */
export function resolveMarketingLocale(
  raw: string | null | undefined,
): MarketingLocale {
  if (!raw) return "en";
  const base = raw.toLowerCase().split(/[_-]/, 1)[0];
  if (base === "de" || base === "es" || base === "fr") return base;
  return "en";
}

/**
 * Read the current browser locale from `<html lang>`. The plugin SPA
 * runs inside wp-admin where WP sets this attribute from
 * `get_user_locale()`. Returns `null` when unset (e.g. SSR / tests) so
 * callers can fall through to the default.
 */
export function readCurrentLocale(): string | null {
  if (typeof document === "undefined") return null;
  return document.documentElement.lang || null;
}

export interface MarketingPricingLinkArgs {
  /**
   * Why the user is being sent over. Mirrors `PortalIntent` — the
   * marketing pricing page reads the same `intent` query key so the
   * highlight / scroll-target tier can be derived consistently
   * whether the user lands on the portal (logged in) or the public
   * pricing page (logged out / comparing tiers).
   */
  intent: PortalIntent;
  /** Site domain the request originated from. */
  domain?: string;
  /** Current plugin plan ("none" / "free"). */
  plan?: string;
  /**
   * Suggested tier to highlight when the page loads. Lets the
   * Keyword-Bank teaser deep-link straight into the BYOK / Cloud
   * card it just sold the customer on. Marketing site treats it as
   * a hint, not a constraint.
   */
  suggest?: "byok" | "cloud" | "cloud_pro";
  /**
   * Optional locale override. When omitted, derived from
   * `document.documentElement.lang` so a German wp-admin lands the
   * customer on `/de/pricing` rather than the English default.
   */
  locale?: string | null;
  /**
   * Resume link the marketing site surfaces in its "already comparing
   * from inside Structura?" advisory band. Lets the customer hop
   * straight back to the wizard step they came from without losing
   * their draft. Same shape as `PortalSignupLinkArgs.returnTo`.
   */
  returnTo?: string;
  /**
   * Optional scroll-to anchor on the marketing page (e.g. `#addons`,
   * `#agency-volume`). Honors the existing convention where add-on
   * cards already pointed the pricing link at the right section
   * within the page.
   */
  anchor?: string;
}

/**
 * Build a context-rich URL into the marketing site's pricing page.
 *
 * The marketing site lives at `www.structurawp.com/{locale}/pricing`
 * — `[locale]` is a required segment per `www/app/[locale]/...`, so
 * we always prepend the resolved locale ourselves rather than relying
 * on the Next middleware to redirect (a redirect would drop the query
 * string in some browsers and obscure the source attribution).
 *
 * Query keys mirror `buildPortalSignupUrl` so the user's "go to app"
 * vs "see pricing on the web" paths surface the same context to
 * whichever surface they land on.
 */
export function buildMarketingPricingUrl(
  args: MarketingPricingLinkArgs,
): string {
  const locale = resolveMarketingLocale(
    args.locale === undefined ? readCurrentLocale() : args.locale,
  );
  const params = new URLSearchParams();
  params.set("intent", args.intent);
  params.set("source", "plugin");
  if (args.domain) params.set("domain", args.domain);
  if (args.plan) params.set("plan", args.plan);
  if (args.suggest) params.set("suggest", args.suggest);
  if (args.returnTo) params.set("returnTo", args.returnTo);
  // Hash fragment is appended after the query string per RFC 3986 —
  // not URL-encoded since the marketing site reads it as a scroll
  // target, not a query param.
  const anchor = args.anchor ? sanitizePricingAnchor(args.anchor) : "";
  return `${MARKETING_BASE_URL}/${locale}/pricing?${params.toString()}${anchor}`;
}

/**
 * Normalize the anchor: leading `#` is optional from callers (legacy
 * call sites pass `"#addons"` or `"addons"` inconsistently), but the
 * output is always a single `#…` so the URL composes cleanly.
 */
function sanitizePricingAnchor(raw: string): string {
  const trimmed = raw.replace(/^#+/, "");
  return trimmed ? `#${trimmed}` : "";
}
