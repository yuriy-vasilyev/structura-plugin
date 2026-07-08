import type { PlanId } from "@structura/types";
import { useLicense } from "@/features/settings";
import { hasChannelsAccess } from "./hasChannelsAccess";

// Re-export so existing callers that imported the pure helper from the
// hook module keep working. The canonical location is `./hasChannelsAccess`
// — unit tests should import directly from there to avoid pulling in the
// `useLicense` import chain.
export { hasChannelsAccess };

/**
 * Decides whether the Channels surface (top-level nav entry, routes, per-
 * campaign tab, unhealthy-connection banner) should be visible for the
 * current user.
 *
 * Two gates, both must pass:
 *
 *   1. Plan gate — only paid plans can interact with Channels. Free users
 *      hitting an empty Store/Connections page is confusing; the nav stays
 *      hidden and the upgrade nudge lives elsewhere (billing page).
 *
 *   2. Entitlement gate — Channels is billed two different ways:
 *        • Agency: bundled. The Stripe product carries
 *          `metadata.bundled_addons = "channels"`, so the cloud webhook
 *          writes the entitlement automatically. Agency users always see
 *          the UI.
 *        • Pro / Cloud: optional add-on, sold as a separate Stripe SKU.
 *          The nav only appears once the user has actually purchased it,
 *          i.e. `license.entitlements.channels` is populated. This matches
 *          how the Channels Store is billed (`integrations-store-spec.md`
 *          §11) and prevents non-entitled users from landing on a page
 *          whose primary actions require an entitlement they don't have.
 *
 * A third `STRUCTURA_CHANNELS_ENABLED` rollout flag used to gate this
 * surface during development; it was removed on 2026-04-21 once Channels
 * shipped to production. Plan + entitlement checks are authoritative on
 * their own now.
 *
 * Specs:
 *   - `specs/pricing-v2-implementation.md` §4.4, §6.2 — bundled Channels
 *     on Agency.
 *   - `specs/integrations-store-spec.md` §11 — per-add-on entitlement model.
 *
 * Returns `false` while the license query is still loading — the nav flash
 * from `false → true` mid-mount is less jarring than a nav item that
 * momentarily points at a page the user isn't entitled to.
 */
export const useChannelsVisibility = (): boolean => {
  const { plan, entitlements, loading } = useLicense();

  if (loading) return false;

  return hasChannelsAccess(plan as PlanId, Boolean(entitlements?.channels));
};

