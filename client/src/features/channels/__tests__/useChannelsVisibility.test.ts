/**
 * Unit tests for the Channels visibility predicate.
 *
 * The hook combines two gates (plan, entitlement); testing it end-to-end
 * requires wiring a license query provider, which is overkill for a pure
 * access-control decision. Instead we test the split-out
 * `hasChannelsAccess` helper directly — it's the only branching logic
 * the hook contains — and rely on integration-level smoke tests
 * elsewhere to pin the loading short-circuit.
 *
 * Pinned behaviours:
 *   1. Paid plans (byok / cloud / cloud_pro) gate on the
 *      `entitlements.channels` bit. The Stripe webhook writes it for
 *      BOTH agency-bundled plans AND individual add-on purchases, so
 *      one check covers both grids.
 *   2. The previous "agency always granted" carve-out for
 *      `plan === "cloud_pro"` was wrong — `cloud_pro` exists on both
 *      individual and agency grids, and the old behaviour leaked the
 *      Channels nav to individual `cloud_pro` users without the
 *      add-on. The catalog endpoint would then bounce every install as
 *      `blocker: "add_channels"`. We now trust the entitlement bit
 *      uniformly (see hasChannelsAccess.ts for the rationale).
 *   3. Free + unknown/none never see the nav. A Free user with a
 *      stale entitlement record (possible during a downgrade-grace
 *      window before the cron resolves it) is still denied — plan is
 *      the hard ceiling.
 */
import { describe, expect, it } from "vitest";
// Import directly from the pure helper module, not the hook module.
// Pulling `useChannelsVisibility` in would drag in the `useLicense` chain
// (settings barrel → ai-engine → `@structura/types`), which isn't built
// for runtime in the test environment.
import { hasChannelsAccess } from "../hooks/hasChannelsAccess";

describe("hasChannelsAccess — plan × entitlement gate", () => {
  describe("paid plans gate on the entitlement bit", () => {
    it("BYOK with the Channels add-on entitlement is granted", () => {
      expect(hasChannelsAccess("byok", true)).toBe(true);
    });

    it("BYOK without the entitlement is denied", () => {
      expect(hasChannelsAccess("byok", false)).toBe(false);
    });

    it("Cloud with the entitlement is granted", () => {
      expect(hasChannelsAccess("cloud", true)).toBe(true);
    });

    it("Cloud without the entitlement is denied", () => {
      expect(hasChannelsAccess("cloud", false)).toBe(false);
    });

    it("Cloud Pro with the entitlement is granted (both individual + agency grids)", () => {
      // Agency-bundled cloud_pro has the webhook-written entitlement;
      // individual cloud_pro with the add-on SKU has it too — same bit,
      // same decision.
      expect(hasChannelsAccess("cloud_pro", true)).toBe(true);
    });

    it("Cloud Pro without the entitlement is denied (regression: pre-fix this returned true)", () => {
      // Pre-fix bug: `plan === "cloud_pro" → true` unconditionally on
      // the (incorrect) assumption that cloud_pro was always agency.
      // Individual cloud_pro users without the channels add-on now
      // correctly see the nav hidden until they purchase the add-on.
      expect(hasChannelsAccess("cloud_pro", false)).toBe(false);
    });
  });

  describe("plan ceiling — defense in depth", () => {
    it("Free is denied even if an entitlement record leaked in", () => {
      // Stale `entitlements.channels` key during a downgrade-grace
      // window before the cron resolves it must not resurrect access
      // for a Free plan. Plan-level ceiling wins.
      expect(hasChannelsAccess("free", true)).toBe(false);
      expect(hasChannelsAccess("free", false)).toBe(false);
    });

    it("'none' and unknown strings are denied", () => {
      // `useLicense` falls back to the literal "none" when no license
      // data is loaded yet; any other unexpected value is treated the
      // same as no access.
      expect(hasChannelsAccess("none", true)).toBe(false);
      expect(hasChannelsAccess("none", false)).toBe(false);
      expect(hasChannelsAccess("enterprise", true)).toBe(false);
    });
  });
});
