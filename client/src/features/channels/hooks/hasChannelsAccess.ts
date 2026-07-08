import type { PlanId } from "@structura/types";

/**
 * Plan + entitlement gate for the Channels surface.
 *
 * Single source of truth: `License.entitlements.channels`. The Stripe
 * webhook writes this key atomically in two paths:
 *
 *   - **Agency plans** — `bundled_addons: "channels"` on the agency
 *     product metadata makes `expandBundledAddons` synthesize the
 *     entitlement with `maxSeats = maxSites`. Same write that flips
 *     `License.audience` to `"agency"` writes the entitlement, so
 *     there is no race window where audience says agency but the
 *     entitlement hasn't landed yet.
 *
 *   - **Individual plans + Channels add-on SKU** — separate Stripe
 *     line item lands as its own `IncomingAddonItem` and the webhook
 *     writes `entitlements.channels` the same way.
 *
 * Both paths converge on `entitlements.channels` being present, so the
 * client only needs to check that one bit. Plan check is kept solely as
 * a defense-in-depth ceiling: a Free plan with a stale entitlement key
 * (e.g. mid downgrade-grace, before the cron resolves it) still must
 * not see Channels — the hard rule is "no Channels on Free / None / any
 * unrecognized plan".
 *
 * Decision table:
 *
 *   plan          | hasChannelsEntitlement | result
 *   --------------|------------------------|--------
 *   byok          |   true                 | true    (add-on purchased OR agency-bundled)
 *   cloud         |   true                 | true    (add-on purchased OR agency-bundled)
 *   cloud_pro     |   true                 | true    (add-on purchased OR agency-bundled)
 *   byok/cloud/   |                        |
 *   cloud_pro     |   false                | false   (no entitlement on file)
 *   free          |   any                  | false   (plan ceiling — defense in depth)
 *   none/other    |   any                  | false
 *
 * Previously this helper hard-coded `plan === "cloud_pro" → true`
 * unconditionally on the assumption that `cloud_pro` was a synonym for
 * "agency". That was wrong — `cloud_pro` is the plan tier and exists
 * in BOTH individual and agency audience grids. The old behaviour made
 * the Channels nav visible to individual cloud_pro users who hadn't
 * bought the Channels add-on, and every install attempt then bounced
 * off the catalog endpoint as `blocker: "add_channels"`.
 *
 * Spec: `specs/integrations-store-spec.md` §11 — per-add-on
 * entitlement model. `specs/pricing-v2-implementation.md` §4.4, §6.2
 * — bundled Channels on Agency (writes the same entitlement bit).
 *
 * Callers are expected to short-circuit on the license-query `loading`
 * state themselves — this helper only covers the plan + entitlement
 * branches.
 */
export const hasChannelsAccess = (
  plan: PlanId | "none" | string,
  hasChannelsEntitlement: boolean,
): boolean => {
  // Plan ceiling — Free / None / unknown plans never see Channels even
  // if a stale entitlement key leaked through (e.g. during a
  // downgrade-grace window before the cron tears it down).
  if (plan !== "byok" && plan !== "cloud" && plan !== "cloud_pro") {
    return false;
  }

  // Paid plans: trust the entitlement bit. Agency bundles flip it via
  // the webhook; individual add-on purchases flip it the same way.
  return hasChannelsEntitlement;
};
