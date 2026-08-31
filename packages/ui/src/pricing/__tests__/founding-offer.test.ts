import { describe, expect, it } from "vitest";
import {
  COUNTER_REVEAL_THRESHOLD,
  OFFERS,
  remainingSeats,
  resolveOfferState,
  resolvedOffer,
  showSeatCounter,
} from "../founding-offer";

// Guards the 2026-07-30 change: a pre-revenue "25/25 seats free" counter read
// as "nobody buys this", so surfaces hide the live counter behind a static
// "limited seats" line until real redemptions cross the reveal threshold.
describe("showSeatCounter", () => {
  it("hides the counter at the pre-revenue baseline (claimed 0)", () => {
    expect(showSeatCounter(OFFERS.founding, 0)).toBe(false);
  });

  it("stays hidden just below the threshold and reveals exactly at it", () => {
    expect(showSeatCounter(OFFERS.founding, COUNTER_REVEAL_THRESHOLD - 1)).toBe(false);
    expect(showSeatCounter(OFFERS.founding, COUNTER_REVEAL_THRESHOLD)).toBe(true);
  });

  it("stays visible from the threshold through a fully-claimed cap", () => {
    expect(showSeatCounter(OFFERS.founding, OFFERS.founding.cap!)).toBe(true);
  });

  it("is always false for an uncapped offer — there is no counter to show", () => {
    expect(showSeatCounter(OFFERS.soldout, 999)).toBe(false);
  });

  it("never pairs a visible counter with an inflated count — remaining stays cap − claimed", () => {
    // The reveal threshold changes WHEN the counter shows, never WHAT it shows.
    expect(remainingSeats(OFFERS.founding, COUNTER_REVEAL_THRESHOLD)).toBe(
      OFFERS.founding.cap! - COUNTER_REVEAL_THRESHOLD,
    );
  });
});

// Regression: 2026-08-12. `OFFER_STATE` was a hardcoded constant, so a
// fully-claimed founding cohort kept advertising the FOUNDING code and its
// 40%-off prices on both pricing surfaces. Stripe enforces the coupon's
// `max_redemptions: 25`, so the 26th visitor copied a dead code and was
// rejected at Stripe checkout. The offer must now retire itself with no deploy.
describe("resolveOfferState — the sold-out auto-flip", () => {
  const cap = OFFERS.founding.cap!;

  it("keeps the founding cohort live while a single seat remains", () => {
    expect(resolveOfferState("founding", cap - 1)).toBe("founding");
  });

  it("advances to the LAUNCH50 cohort the moment the last seat is claimed", () => {
    expect(resolveOfferState("founding", cap)).toBe("soldout");
  });

  it("stays advanced if the count somehow overshoots the cap", () => {
    expect(resolveOfferState("founding", cap + 5)).toBe("soldout");
  });

  it("never resurrects a retired offer", () => {
    expect(resolveOfferState("none", 0)).toBe("none");
    expect(resolveOfferState("none", cap)).toBe("none");
  });

  it("treats the uncapped successor as terminal — it cannot sell out", () => {
    expect(resolveOfferState("soldout", 10_000)).toBe("soldout");
  });

  it("stops offering the FOUNDING code once the cap is reached", () => {
    // The actual failure the guard exists to prevent: a live, copyable code
    // that Stripe will reject. Assert the code the surfaces render, not just
    // the state name.
    expect(resolvedOffer("founding", cap - 1)!.code).toBe("FOUNDING");
    expect(resolvedOffer("founding", cap)!.code).toBe("LAUNCH50");
  });

  it("drops the for-life claim and the 40% multiplier along with the code", () => {
    // Prices are derived as `base × multiplier`, so a stale multiplier would
    // keep advertising the founding discount even after the code swapped.
    const sold = resolvedOffer("founding", cap)!;
    expect(sold.multiplier).toBe(OFFERS.soldout.multiplier);
    expect(sold.forLife).toBe(false);
    expect(sold.cap).toBeNull();
  });
});
