import { FC, useId } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Currency } from "./CurrencyToggle";

/**
 * One bracket of graduated per-site pricing. `null` prices on a tier render
 * the "contact" CTA in place of a number (used for the custom bracket).
 */
export interface AgencyVolumeTier {
  /** Stable id for React keys and label lookups (e.g. "tier1", "tier4"). */
  id: string;
  /** Pre-resolved bracket label (e.g. "Sites 1–4", "25+ sites"). */
  rangeLabel: string;
  /** Per-site/month prices, billed annually / monthly respectively. */
  usdYearly: number | null;
  usdMonthly: number | null;
  eurYearly: number | null;
  eurMonthly: number | null;
}

export interface AgencyVolumeStripLabels {
  /** Eyebrow above the title, e.g. "Volume pricing". */
  eyebrow: string;
  /** Title, e.g. "Cloud". */
  title: string;
  /** Muted detail after the title, e.g. "30 posts". Absent → title only. */
  titleDetail?: string;
  /**
   * Unit line for the interval being shown, e.g. "Per site / month" or
   * "Per site / month · billed yearly". The caller resolves it per interval.
   */
  unit: string;
  /** CTA in the custom bracket, e.g. "Contact sales". */
  contactCta: string;
  /** Caption beneath the brackets. */
  caption: string;
}

export interface AgencyVolumeStripProps {
  currency: Currency;
  /**
   * Billing interval the strip shows. Yearly brackets are monthly
   * equivalents (yearly total ÷ 12), matching the plan card above.
   */
  interval: "month" | "year";
  tiers: ReadonlyArray<AgencyVolumeTier>;
  labels: AgencyVolumeStripLabels;
  /** Mailto/href used by the custom-bracket "Contact sales" link. */
  contactHref: string;
  /**
   * When set (e.g. `0.6` for the founding offer), each priced bracket shows
   * the struck base rate next to the discounted `base × multiplier` rate in
   * the gold accent. Absent → plain base rates.
   */
  foundingMultiplier?: number;
}

const fmt = (amount: number, currency: Currency): string =>
  currency === "eur" ? `€${amount}` : `$${amount}`;

/** Discounted figure with two decimals only when the value isn't round. */
const fmtDiscount = (amount: number, multiplier: number, currency: Currency): string => {
  const value = Math.round(amount * multiplier * 100) / 100;
  const symbol = currency === "eur" ? "€" : "$";
  const hasCents = Math.round(value * 100) % 100 !== 0;
  return `${symbol}${hasCents ? value.toFixed(2) : Math.round(value)}`;
};

/**
 * Graduated per-site pricing for one Cloud option at one billing interval,
 * rendered beneath the plan cards. The brackets are graduated: each rate
 * applies to the sites inside its bracket, so they are labelled as site
 * ranges rather than as a price every site moves to. The `null`-priced
 * bracket (25+ sites) routes to sales.
 *
 * One horizontal row of brackets on wide screens, two columns on phones, no
 * scrolling (specs/cloud-volume-pricing-design.md "Volume pricing",
 * 2026-10-12). Until then the strip was a two-interval table per plan.
 *
 * Spec: pricing-v2-implementation.md §8.1.
 */
export const AgencyVolumeStrip: FC<AgencyVolumeStripProps> = ({
  currency,
  interval,
  tiers,
  labels,
  contactHref,
  foundingMultiplier,
}) => {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="mx-auto mt-10 w-full max-w-6xl rounded-2xl border border-neutral-200 bg-white p-5 shadow-raised sm:p-6 dark:border-neutral-800 dark:bg-neutral-900 dark:ring-1 dark:ring-white/[0.04]"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          {/* The eyebrow is the heading and the title a paragraph: the www
              house pattern for shared pricing blocks (since 2026-09-26). */}
          <h3
            id={titleId}
            className="text-xs font-bold tracking-widest text-brand-700 uppercase dark:text-brand-300"
          >
            {labels.eyebrow}
          </h3>
          <p className="mt-2 text-lg font-bold tracking-tight text-neutral-900 dark:text-white">
            {labels.title}
            {labels.titleDetail && (
              <span className="font-medium text-neutral-600 dark:text-neutral-300">
                {" · "}
                {labels.titleDetail}
              </span>
            )}
          </p>
        </div>
        <p className="text-xs text-neutral-600 dark:text-neutral-400">{labels.unit}</p>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
        {tiers.map((tier, i) => {
          const amount =
            interval === "year"
              ? currency === "eur"
                ? tier.eurYearly
                : tier.usdYearly
              : currency === "eur"
                ? tier.eurMonthly
                : tier.usdMonthly;
          return (
            <div
              key={tier.id}
              // A rule between brackets on wide screens; on the two-column
              // phone grid only the right-hand column carries one.
              className={
                i === 0
                  ? "flex flex-col gap-2"
                  : i % 2 === 1
                    ? "flex flex-col gap-2 border-l border-neutral-200 pl-4 dark:border-neutral-700"
                    : "flex flex-col gap-2 sm:border-l sm:border-neutral-200 sm:pl-4 sm:dark:border-neutral-700"
              }
            >
              <dt className="text-xs text-neutral-600 dark:text-neutral-400">{tier.rangeLabel}</dt>
              <dd>
                {amount === null ? (
                  <a
                    href={contactHref}
                    className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline sm:min-h-7 dark:text-brand-300"
                  >
                    {labels.contactCta}
                    <ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />
                  </a>
                ) : foundingMultiplier ? (
                  <span className="flex flex-wrap items-baseline gap-x-1.5">
                    <s className="text-sm text-neutral-500 decoration-red-500 decoration-2 dark:text-neutral-400">
                      {fmt(amount, currency)}
                    </s>
                    <span className="text-xl font-bold tabular-nums text-gold-700 dark:text-gold-300">
                      {fmtDiscount(amount, foundingMultiplier, currency)}
                    </span>
                  </span>
                ) : (
                  <span className="text-xl font-bold tabular-nums text-neutral-900 dark:text-white">
                    {fmt(amount, currency)}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      <p className="mt-5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
        {labels.caption}
      </p>
    </section>
  );
};
