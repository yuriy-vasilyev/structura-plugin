/**
 * Founding-Customer offer model shared by the marketing pricing page (`www/`)
 * and the portal upgrade page (`web/`).
 *
 * Both surfaces run the same small offer state machine (`founding` →
 * `soldout` → `none`) that decides which promo code is live, how the paid
 * prices are discounted, whether the scarcity counter shows, and whether the
 * founding badges / sticky chip appear at all. Keeping it here means flipping
 * the offer state flips every surface in one edit.
 *
 * Every discounted figure is derived at runtime from the Stripe catalog
 * (`priceTokens()` / `monthlyCardAmount()` × `multiplier`) — NEVER hardcoded —
 * so a Stripe price change flows through automatically and the offer figure
 * can't drift. See {@link discountedAmount}.
 *
 * Spec: marketing/design_handoff_founding_pricing/README.md.
 */

/** The three states a pricing surface can present. */
export type OfferState = "founding" | "soldout" | "none";

/**
 * Static, typed config for one active offer state.
 *
 * `code` is the literal Stripe promo code — it is deliberately NOT translated
 * (FOUNDING / LAUNCH50 stay literal in every locale). Everything a human reads
 * around the code lives in each surface's i18n resources.
 */
export interface OfferConfig {
  /** Literal Stripe promo code — never translated. */
  readonly code: string;
  /**
   * Fraction of the base price the customer actually pays. `0.6` == 40% off
   * (founding, for life); `0.5` == 50% off (launch, first year). Discounted
   * figures are always `base × multiplier` — see {@link discountedAmount}.
   */
  readonly multiplier: number;
  /** Seat cap that backs the scarcity counter, or `null` for an uncapped offer. */
  readonly cap: number | null;
  /** Whether the discount rides the subscription for life (vs first-year only). */
  readonly forLife: boolean;
  /** Key into each surface's i18n resources for this state's copy. */
  readonly i18nKey: "founding" | "soldout";
}

/**
 * The *configured* offer state — the cohort we intend to be selling.
 *
 * This is the starting point, not the final answer: surfaces must run it
 * through {@link resolveOfferState} with the live seat count before rendering,
 * so a capped offer retires itself the moment its seats fill. Set to `"none"`
 * to retire every offer outright.
 *
 * @see resolveOfferState — the auto-advance that makes this safe.
 */
export const OFFER_STATE: OfferState = "founding";

/**
 * Config for each non-`none` state. `none` has no config — {@link activeOffer}
 * returns `null` and every founding surface renders nothing.
 */
export const OFFERS: Record<Exclude<OfferState, "none">, OfferConfig> = {
  founding: {
    code: "FOUNDING",
    multiplier: 0.6, // 40% off
    cap: 25,
    forLife: true,
    i18nKey: "founding",
  },
  // Follow-on cohort once the 25 founding seats are gone.
  soldout: {
    code: "LAUNCH50",
    multiplier: 0.5, // 50% off first year
    cap: null,
    forLife: false,
    i18nKey: "soldout",
  },
};

/**
 * Seats already claimed.
 *
 * This is the fallback / initial value only. The live count is hydrated
 * client-side from the `foundingSeats` cloud endpoint (which reads the Stripe
 * `FOUNDING` promotion code's redemptions) while a capped offer is live. If
 * that fetch fails, the surfaces fall back to this constant — so it should
 * stay the honest pre-revenue baseline (`0`). Stripe still enforces the
 * 25-redemption cap regardless of what the page shows.
 */
export const CLAIMED = 0;

/** Resolve the live offer config, or `null` when the offer is retired. */
export function activeOffer(state: OfferState = OFFER_STATE): OfferConfig | null {
  return state === "none" ? null : OFFERS[state];
}

/**
 * Which state a capped offer falls through to once its seats are gone.
 *
 * Only `founding` is capped, so this is the single real transition:
 * FOUNDING (40% for life, 25 seats) → LAUNCH50 (50% first year, uncapped).
 * `soldout` is uncapped and therefore never advances — it is its own terminal
 * state.
 */
const SUCCESSOR: Record<Exclude<OfferState, "none">, OfferState> = {
  founding: "soldout",
  soldout: "soldout",
};

/**
 * The offer state a surface should actually render, given the live seat count.
 *
 * Stripe hard-enforces the founding coupon's `max_redemptions: 25`, so once
 * the cap is reached the FOUNDING code stops working *at checkout* — but
 * nothing was previously telling the pricing surfaces to stop advertising it.
 * A visitor would copy a dead code, land on Stripe, and be rejected at the
 * exact conversion moment (incident: PeerPush paid-promotion review,
 * 2026-08-12). This is the guard: every surface resolves its state through
 * here before rendering, so the offer retires itself with no deploy.
 *
 * Advancing is one hop only — a sold-out capped offer falls through to its
 * {@link SUCCESSOR}, which today is uncapped and therefore terminal.
 *
 * @param configured - The intended cohort, normally {@link OFFER_STATE}.
 * @param claimed - Live redemptions from the `foundingSeats` endpoint.
 * @returns The state to render: `configured` while seats remain, otherwise its successor.
 *
 * @example
 *   resolveOfferState("founding", 24) // "founding" — one seat left
 *   resolveOfferState("founding", 25) // "soldout"  — auto-retired
 */
export function resolveOfferState(
  configured: OfferState = OFFER_STATE,
  claimed: number = CLAIMED,
): OfferState {
  const offer = activeOffer(configured);
  if (!offer) return "none";
  return seatsGone(offer, claimed) ? SUCCESSOR[configured as Exclude<OfferState, "none">] : configured;
}

/**
 * Convenience pairing of {@link resolveOfferState} + {@link activeOffer}: the
 * config a surface should render for a given live seat count.
 */
export function resolvedOffer(
  configured: OfferState = OFFER_STATE,
  claimed: number = CLAIMED,
): OfferConfig | null {
  return activeOffer(resolveOfferState(configured, claimed));
}

/**
 * Minimum real redemptions before the live seat counter renders.
 *
 * A pre-revenue counter reads as "nobody has bought this" (25/25 free), which
 * costs more trust than the scarcity earns. Below this threshold every
 * surface shows a static "limited to N seats" line instead — still true, just
 * without broadcasting the live number. Once real redemptions cross the
 * threshold the counter reveals itself on the next hydration, no deploy
 * needed. The count itself is never inflated: whatever renders is the real
 * Stripe redemption figure.
 */
export const COUNTER_REVEAL_THRESHOLD = 3;

/**
 * Whether a surface should render the live scarcity counter for this offer.
 *
 * `false` for an uncapped offer (there is no counter) and while real
 * redemptions sit below {@link COUNTER_REVEAL_THRESHOLD} — surfaces render
 * their static "limited seats" line in that window instead.
 */
export function showSeatCounter(
  offer: OfferConfig,
  claimed: number = CLAIMED,
): boolean {
  if (offer.cap == null) return false;
  return claimed >= COUNTER_REVEAL_THRESHOLD;
}

/**
 * Seats remaining for a capped offer, or `null` for an uncapped one.
 * Clamped at `0` so an over-redeemed cap never shows a negative count.
 */
export function remainingSeats(
  offer: OfferConfig,
  claimed: number = CLAIMED,
): number | null {
  if (offer.cap == null) return null;
  return Math.max(0, offer.cap - claimed);
}

/** True once a capped offer has no seats left (drives the band's `.gone` state). */
export function seatsGone(offer: OfferConfig, claimed: number = CLAIMED): boolean {
  if (offer.cap == null) return false;
  return offer.cap - claimed <= 0;
}

/**
 * Fraction of the cap that has been claimed, `0..1`, for the progress track.
 * Returns `0` for an uncapped offer (the track isn't shown in that state).
 */
export function claimedFraction(offer: OfferConfig, claimed: number = CLAIMED): number {
  if (!offer.cap) return 0;
  return Math.min(1, Math.max(0, claimed / offer.cap));
}

/**
 * The single source of truth for a discounted figure: `base × multiplier`,
 * rounded to cents. Callers pass a catalog-derived base (never a literal), so
 * this is the only place a founding/launch price is computed.
 *
 * @example
 *   discountedAmount(39, 0.6) // 23.4  (Cloud yearly, 40% off)
 *   discountedAmount(12, 0.6) // 7.2   (BYOK yearly, 40% off)
 */
export function discountedAmount(base: number, multiplier: number): number {
  return Math.round(base * multiplier * 100) / 100;
}

/**
 * Format a whole-unit amount with its currency symbol, showing two decimals
 * only when the value isn't round (so `€23.40` but `€24`). Used for both the
 * struck base and the discounted headline so they read consistently.
 */
export function formatOfferPrice(amount: number, currency: "usd" | "eur"): string {
  const symbol = currency === "usd" ? "$" : "€";
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  return `${symbol}${hasCents ? amount.toFixed(2) : Math.round(amount)}`;
}
