/**
 * Tests for the pure state-machine that maps `{entitlement, grace}` pairs
 * to one of the three Account-page card states (spec §11.6).
 *
 * Channels is bundled into every paid plan (one auto-granted seat per
 * site), so the machine collapsed from the old six-state
 * enable/disable/reassign funnel to three: `bundled_included` (entitled),
 * `not_entitled` (Free / disconnected), and `grace_orphan` (dunning).
 *
 * This module has no I/O, so the test surface walks every branch. Priority
 * ordering matters — a payment_failed grace can fire while an entitlement
 * is still recorded (soft-revoke), and we verify the grace banner wins.
 */

import { describe, expect, it } from "vitest";
import { computeAddonCardState } from "../addonCardState";
import type { AddonEntitlementView, AddonGraceView } from "../types";

function entitlement(overrides: Partial<AddonEntitlementView> = {}): AddonEntitlementView {
  return {
    maxSeats: 3,
    seatsUsed: 1,
    assignedHere: false,
    assignedAt: null,
    ...overrides,
  };
}

function grace(overrides: Partial<AddonGraceView> = {}): AddonGraceView {
  return {
    reason: "downgrade_orphaned",
    detectedAt: "2026-04-01T00:00:00.000Z",
    revokeAt: "2026-04-22T00:00:00.000Z",
    remindersSent: 0,
    isOrphanedHere: true,
    orphanedDomains: ["foo.example.com"],
    ...overrides,
  };
}

describe("computeAddonCardState", () => {
  it("returns not_entitled when no entitlement and no grace", () => {
    const state = computeAddonCardState("channels", undefined, undefined);
    expect(state).toEqual({ kind: "not_entitled", addon: "channels" });
  });

  it("returns bundled_included whenever the license carries the entitlement", () => {
    // The Stripe webhook only writes `entitlements.channels` for paid
    // plans, so entitlement-present is the whole "bundled" signal — there's
    // no per-site seat to claim anymore.
    const ent = entitlement({ seatsUsed: 1, maxSeats: 3, assignedHere: false });
    const state = computeAddonCardState("channels", ent, undefined);
    expect(state.kind).toBe("bundled_included");
    expect(state.kind === "bundled_included" && state.entitlement).toBe(ent);
  });

  it("stays bundled_included even when this site's seat isn't marked assigned yet", () => {
    // `assignedHere` is irrelevant now — the card no longer distinguishes
    // an assigned vs available seat. Any entitled paid plan reads "Included".
    const ent = entitlement({
      seatsUsed: 3,
      maxSeats: 3,
      assignedHere: false,
    });
    const state = computeAddonCardState("channels", ent, undefined);
    expect(state.kind).toBe("bundled_included");
  });

  it("returns grace_orphan when the site is in orphanedDomains, even if entitlement is still present", () => {
    // soft-revoke semantics: payment_failed grace leaves the entitlement in
    // place until day 21; the card must still show the banner.
    const ent = entitlement({ assignedHere: true, assignedAt: "2026-03-10T00:00:00.000Z" });
    const g = grace({ reason: "payment_failed", isOrphanedHere: true });
    const state = computeAddonCardState("channels", ent, g);
    expect(state.kind).toBe("grace_orphan");
    expect(state.kind === "grace_orphan" && state.grace.reason).toBe("payment_failed");
    expect(state.kind === "grace_orphan" && state.entitlement).toBe(ent);
  });

  it("returns grace_orphan with entitlement=null when license lost the budget entirely", () => {
    // downgrade_orphaned: entitlements[addon] may be gone (the webhook
    // cleared it on plan change) while the grace record still exists.
    const g = grace({ reason: "downgrade_orphaned", isOrphanedHere: true });
    const state = computeAddonCardState("channels", undefined, g);
    expect(state.kind).toBe("grace_orphan");
    expect(state.kind === "grace_orphan" && state.entitlement).toBeNull();
  });

  it("does NOT treat a grace open on other sites as grace_orphan here", () => {
    // The grace is for the license as a whole, but this domain isn't the
    // orphaned one — we fall through to the normal bundled_included state.
    const ent = entitlement({ assignedHere: true, assignedAt: "2026-03-10T00:00:00.000Z" });
    const g = grace({
      isOrphanedHere: false,
      orphanedDomains: ["other.example.com"],
    });
    const state = computeAddonCardState("channels", ent, g);
    expect(state.kind).toBe("bundled_included");
  });

  it("threads the add-on id through unchanged", () => {
    expect(computeAddonCardState("growth", undefined, undefined).addon).toBe("growth");
    expect(
      computeAddonCardState("channels", entitlement({ assignedHere: true }), undefined).addon,
    ).toBe("channels");
  });
});
