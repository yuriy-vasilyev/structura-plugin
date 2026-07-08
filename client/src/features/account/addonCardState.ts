/**
 * Pure state-machine for rendering the Channels add-on card on the
 * Account page (spec §11.6). Given the wire-format `entitlements[addon]`
 * and `graceperiods[addon]` from `checkLicenseStatus`, map them to one of
 * three discrete view states so the component stays a dumb switch.
 *
 * Channels is now BUNDLED into every paid plan — one seat per site,
 * auto-granted by the Stripe webhook. There is no manual per-site seat
 * assignment anymore, so the card only ever needs to tell three stories:
 *
 *   bundled_included  — The license is entitled to Channels
 *                       (`entitlements.channels` is present, which the
 *                       webhook writes only for paid plans). We confirm
 *                       inclusion + usage; there is no per-site enable /
 *                       disable, so no CTA.
 *
 *   not_entitled      — Free / disconnected: the license carries no
 *                       Channels entitlement. Upsell CTA to a paid plan.
 *
 *   grace_orphan      — An open grace period lists this site
 *                       (`isOrphanedHere`) — typically a payment_failed
 *                       dunning window. Renders the warning banner so a
 *                       pending revocation is impossible to miss. Wins
 *                       over the other two states.
 *
 * Priority order: grace_orphan > bundled_included > not_entitled.
 *
 * This module is intentionally I/O-free so we can test every branch
 * without React or Firestore fakes.
 */

import type { AddonId } from "@structura/types";
import type { AddonEntitlementView, AddonGraceView } from "./types";

export type AddonCardStateKind =
  | "not_entitled"
  | "bundled_included"
  | "grace_orphan";

/**
 * Discriminated result. The `entitlement` / `grace` fields are optional
 * on each branch — they're threaded through when relevant so the card
 * component doesn't have to re-plumb them.
 */
export type AddonCardState =
  | {
      kind: "not_entitled";
      addon: AddonId;
    }
  | {
      kind: "bundled_included";
      addon: AddonId;
      /**
       * The seat budget for this license. Present whenever we reach the
       * bundled state (the state is keyed on the entitlement existing).
       * Typed nullable only so the card renderer can share a code path
       * with the grace branch; in practice `bundled_included` always
       * carries it.
       */
      entitlement: AddonEntitlementView | null;
    }
  | {
      kind: "grace_orphan";
      addon: AddonId;
      /** Present iff the license still shows a seat budget in `entitlements`. */
      entitlement: AddonEntitlementView | null;
      grace: AddonGraceView;
    };

/**
 * Derive the card state.
 *
 * @param addon        The add-on id driving this card.
 * @param entitlement  `bundle.entitlements[addon]`, or undefined. Its
 *                     presence is the "paid plan bundles Channels" signal
 *                     — the webhook writes it only for entitled paid
 *                     plans, so no separate plan/audience lookup is needed.
 * @param grace        `bundle.graceperiods[addon]`, or undefined.
 */
export function computeAddonCardState(
  addon: AddonId,
  entitlement: AddonEntitlementView | undefined,
  grace: AddonGraceView | undefined,
): AddonCardState {
  // Grace orphan wins — a payment_failed grace can coexist with a still-
  // present entitlement (soft-revoke semantics per §11.5.2), so we render
  // the amber banner before the calm "Included" chip.
  if (grace && grace.isOrphanedHere) {
    return {
      kind: "grace_orphan",
      addon,
      entitlement: entitlement ?? null,
      grace,
    };
  }

  // Any paid plan with a Channels entitlement gets the bundled treatment.
  // Channels ships with every paid plan (one auto-granted seat per site),
  // so entitlement-present is the whole condition — there's no manual
  // per-site assignment to reflect anymore.
  if (entitlement) {
    return { kind: "bundled_included", addon, entitlement };
  }

  return { kind: "not_entitled", addon };
}
