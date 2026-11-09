/**
 * Graduated per-site pricing, the way Stripe bills it.
 *
 * Cloud prices use `tiers_mode: "graduated"` (functions/src/billing/catalog/apply.ts):
 * each per-site rate applies only to the sites inside its bracket. The portal's
 * change editor and the marketing worked examples both quote these figures, so
 * the split lives here once (2026-11, /partners handoff §4).
 */

/** A catalog price cell: a flat unit amount, optionally with graduated tiers. Amounts in minor units. */
export interface GraduatedPriceCell {
  readonly unitAmount: number;
  readonly tiers?: ReadonlyArray<{ readonly upTo: number | "inf"; readonly unitAmount: number }>;
}

/** One bracket of a graduated price. Amounts are in the smallest currency unit. */
export interface GraduatedBracket {
  /** First and last site the bracket's rate covers, counting from 1. */
  start: number;
  end: number;
  count: number;
  unitAmount: number;
  total: number;
}

/** Returns the brackets `quantity` sites fall into, one flat bracket when the cell has no tiers. */
export function graduatedBrackets(cell: GraduatedPriceCell, quantity: number): GraduatedBracket[] {
  const brackets: GraduatedBracket[] = [];
  const tiers = cell.tiers?.length ? cell.tiers : [{ upTo: "inf" as const, unitAmount: cell.unitAmount }];
  let covered = 0;
  for (const tier of tiers) {
    if (covered >= quantity) break;
    const end = tier.upTo === "inf" ? quantity : Math.min(tier.upTo, quantity);
    const count = end - covered;
    if (count > 0) {
      brackets.push({ start: covered + 1, end, count, unitAmount: tier.unitAmount, total: count * tier.unitAmount });
    }
    covered = end;
  }
  return brackets;
}

/** Returns the recurring charge for `quantity` sites before tax and discounts, in minor units. */
export function graduatedTotal(cell: GraduatedPriceCell, quantity: number): number {
  return graduatedBrackets(cell, quantity).reduce((sum, bracket) => sum + bracket.total, 0);
}
