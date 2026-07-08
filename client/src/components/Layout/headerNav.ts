/**
 * Pure helpers behind the header's nav + account dropdown.
 *
 * Kept out of `Header.tsx` so that file stays component-only (exporting
 * non-components alongside a component disables React Fast Refresh for the
 * whole module). These are also the unit-tested source of truth for two
 * behaviours: which routes stay inline, and which account CTAs show.
 */

import { __ } from "@wordpress/i18n";
import { isManagedPlan, type PlanId } from "@structura/types";

/** A single entry in the primary horizontal nav. */
export interface PrimaryNavItem {
  to: string;
  label: string;
}

/**
 * Build the routes shown in the primary (horizontal) nav.
 *
 * Account & Settings are intentionally absent — they moved into the
 * account dropdown anchored on the plan chip. Pulling them out of the
 * row is what keeps the nav from overflowing in longer locales: the
 * German "Einstellungen" + "Konto" + "Kanäle" run ran straight into
 * the right-hand action cluster. Channels and AI Engine stay inline
 * because they're primary destinations, not account chrome.
 */
export function buildPrimaryNavLinks(opts: {
  channelsVisible: boolean;
  plan: string;
}): PrimaryNavItem[] {
  const { channelsVisible, plan } = opts;
  return [
    { to: "/", label: __("Dashboard", "structura") },
    { to: "/campaigns", label: __("Campaigns", "structura") },
    { to: "/personas", label: __("Personas", "structura") },
    { to: "/visuals", label: __("Visuals", "structura") },
    // `/site` sits after content destinations so the primary content
    // flow (Dashboard → Campaigns → Personas → Visuals) stays the
    // reading path. Site is the identity/intelligence surface — useful
    // but not the daily-work entry point. Spec/seo-intelligence-plan.md §4.
    { to: "/site", label: __("Site", "structura") },
    // Channels is rollout-gated + plan-gated + entitlement-gated — see
    // `useChannelsVisibility` for the full decision tree. Agency sees it
    // bundled, Pro/Cloud only after purchasing the add-on SKU, Free never.
    ...(channelsVisible
      ? [{ to: "/channels", label: __("Channels", "structura") }]
      : []),
    // Managed plans (Cloud, Agency) don't surface AI Engine — they can't
    // connect their own provider keys because we run the infra for them.
    ...(!isManagedPlan(plan as PlanId)
      ? [{ to: "/ai-engine", label: __("AI Engine", "structura") }]
      : []),
  ];
}

/** Which account-menu CTAs to surface for the current license state. */
export interface AccountMenuModel {
  /** The prominent Upgrade CTA (filled, top of the menu). */
  showUpgrade: boolean;
  /**
   * Where Upgrade points:
   *   - `"pricing"` — the marketing site's pricing page. Used for the
   *     anonymous (`none`) tier, which has no account yet, so we sell the
   *     plans before asking anyone to sign in.
   *   - `"portal"` — the customer-portal billing view. Used once an
   *     account exists (Free and paid alike); upgrading is a billing
   *     change, not a first purchase.
   */
  upgradeTarget: "pricing" | "portal";
  /** "Manage account" → portal dashboard (licensed accounts only). */
  showManage: boolean;
  /**
   * "Create a free account" → portal sign-up. Anonymous tier only, and
   * deliberately the *less* prominent option next to Upgrade — the free
   * path stays available without competing with the paid CTA.
   */
  showCreateAccount: boolean;
}

/**
 * Decide which account-menu CTAs to show given license state.
 *
 *   - Anonymous (no license) → **Upgrade** → marketing pricing, plus a
 *     quieter **Create a free account** → portal sign-up.
 *   - Free → **Upgrade** → portal billing, plus **Manage account**.
 *   - Paid (BYOK, Cloud, Cloud Pro) → **Manage account** only. They're
 *     already paying; plan changes happen in the portal, so there's no
 *     "Upgrade" CTA to push here.
 *
 * While the license query is in flight we surface none of them, so the
 * menu doesn't flash the anonymous CTAs before resolving to the licensed
 * ones.
 */
export function getAccountMenuModel(opts: {
  loading: boolean;
  isLicensed: boolean;
  plan: string;
}): AccountMenuModel {
  const { loading, isLicensed, plan } = opts;
  if (loading) {
    return {
      showUpgrade: false,
      upgradeTarget: "portal",
      showManage: false,
      showCreateAccount: false,
    };
  }
  if (!isLicensed) {
    return {
      showUpgrade: true,
      upgradeTarget: "pricing",
      showManage: false,
      showCreateAccount: true,
    };
  }
  return {
    // Upgrade is an entry-tier CTA: only Free has an obvious next step we
    // surface here. Paid tiers (BYOK/Cloud/Cloud Pro) manage plan changes
    // in the portal, so no Upgrade row for them.
    showUpgrade: (plan as PlanId) === "free",
    upgradeTarget: "portal",
    showManage: true,
    showCreateAccount: false,
  };
}
