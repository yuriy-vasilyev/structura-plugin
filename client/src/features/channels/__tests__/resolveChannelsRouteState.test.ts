/**
 * Unit tests for the `/channels/*` route-guard decision.
 *
 * This pins the regression where a deep link to `#/channels/connections`
 * (e.g. the portal's `returnTo` hand-off after an add-on purchase) always
 * bounced to the dashboard. Root cause: the guard only waited on the fast
 * PHP settings query (`licenseLoading`), but `channelsVisible` reads
 * entitlements that arrive only on the slower cloud heartbeat. In the
 * window between the two, `channelsVisible` was a false negative and the
 * `/channels/*` → `/` redirect fired + `replace`d away the URL before the
 * heartbeat could confirm the entitlement.
 *
 * The fix splits loading into two signals (`licenseLoading`,
 * `entitlementsLoading`) and holds the route tree empty ("pending") until
 * BOTH clear. We test the pure decision helper directly rather than
 * standing up the full App + router + query providers — the only branching
 * logic lives here.
 */
import { describe, expect, it } from "vitest";
import { resolveChannelsRouteState } from "../hooks/resolveChannelsRouteState";

describe("resolveChannelsRouteState — route-guard tri-state", () => {
  describe("pending while either loading signal is open", () => {
    it("is pending while the PHP settings query is loading", () => {
      // `channelsVisible` is meaningless here — it returns false during
      // loading. We must NOT read it as "not entitled."
      expect(resolveChannelsRouteState(true, false, false)).toBe("pending");
      expect(resolveChannelsRouteState(true, true, false)).toBe("pending");
    });

    it("is pending while the cloud heartbeat is still in flight (the bug)", () => {
      // The exact regression window: settings loaded (licenseLoading
      // false) but entitlements not yet landed. Pre-fix this short-
      // circuited straight to "redirect" and lost the URL. It must hold.
      expect(resolveChannelsRouteState(false, true, false)).toBe("pending");
    });

    it("stays pending even if a stale-true channelsVisible leaks in during load", () => {
      // Defensive: we never trust the visibility verdict until both
      // signals clear, regardless of what it currently reads.
      expect(resolveChannelsRouteState(true, false, true)).toBe("pending");
    });
  });

  describe("once both signals clear, defer to the visibility verdict", () => {
    it("mounts the real routes when entitled", () => {
      expect(resolveChannelsRouteState(false, false, true)).toBe("mounted");
    });

    it("redirects to the dashboard when entitlement is confirmed absent", () => {
      // Only NOW is the redirect correct — the heartbeat has confirmed
      // the user isn't entitled (Free / unknown plan, or paid without the
      // add-on). Bouncing `/channels/*` → `/` here is the intended guard.
      expect(resolveChannelsRouteState(false, false, false)).toBe("redirect");
    });
  });
});
