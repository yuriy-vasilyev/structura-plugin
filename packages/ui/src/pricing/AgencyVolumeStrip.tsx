import { FC } from "react";
import type { Currency } from "./CurrencyToggle";

/**
 * One bracket of Agency volume pricing. `null` prices on a tier render the
 * "contact" CTA in place of a number (used for the custom-bracket).
 */
export interface AgencyVolumeTier {
  /** Stable id for React keys and label lookups (e.g. "tier1", "tier4"). */
  id: string;
  /** Pre-resolved label for the "Sites" column (e.g. "1–4 sites"). */
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
  /** Section title, e.g. "Per-site rate drops as your portfolio grows". */
  title: string;
  /** Column headers. */
  colSites: string;
  colYearly: string;
  colMonthly: string;
  /** Suffix after each price, e.g. "per site/mo". */
  perSiteSlashMonth: string;
  /** CTA in the custom bracket, e.g. "Contact sales". */
  contactCta: string;
  /** Caption beneath the table. */
  caption: string;
}

export interface AgencyVolumeStripProps {
  currency: Currency;
  tiers: ReadonlyArray<AgencyVolumeTier>;
  labels: AgencyVolumeStripLabels;
  /** Mailto/href used by the custom-bracket "Contact sales" link. */
  contactHref: string;
  /**
   * When set (e.g. `0.6` for the founding offer), each priced row shows the
   * struck base rate next to the discounted `base × multiplier` rate in the
   * gold accent. Absent → plain base rates, so the app portal — which never
   * passes this — renders unchanged.
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
 * Volume-pricing breakdown rendered beneath the Agency tier card. The first
 * bracket matches the headline price on the card; the lower brackets show
 * the per-site discount as the portfolio grows. The `null`-priced bracket
 * (custom) routes to sales because we don't expose per-seat pricing publicly
 * for very large agencies.
 *
 * Spec: pricing-v2-implementation.md §8.1.
 */
export const AgencyVolumeStrip: FC<AgencyVolumeStripProps> = ({
  currency,
  tiers,
  labels,
  contactHref,
  foundingMultiplier,
}) => (
  <section
    aria-labelledby="agency-volume-title"
    className="mx-auto mt-16 w-full max-w-5xl rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:ring-1 dark:ring-white/[0.04]"
  >
    <h3
      id="agency-volume-title"
      className="mb-2 text-sm font-bold tracking-widest text-brand-600 uppercase dark:text-brand-400"
    >
      {labels.eyebrow}
    </h3>
    <h4 className="mb-6 text-2xl font-bold text-neutral-900 dark:text-white">
      {labels.title}
    </h4>

    {/* Mobile (< sm): each tier is a card with the bracket label on top
        and Yearly/Monthly stacked as definition pairs. The 3-column
        table version crams "1 – 4 sites" into two lines on a 390-430px
        viewport and the "Contact sales for custom pricing" CTA wraps
        awkwardly — the card layout fixes both. */}
    <div className="flex flex-col gap-3 sm:hidden">
      {tiers.map((tier) => {
        const yearly = currency === "eur" ? tier.eurYearly : tier.usdYearly;
        const monthly = currency === "eur" ? tier.eurMonthly : tier.usdMonthly;
        const isCustomBracket = yearly === null;

        return (
          <div
            key={tier.id}
            className="flex flex-col gap-3 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800/60"
          >
            <p className="text-sm font-bold text-neutral-900 dark:text-white">
              {tier.rangeLabel}
            </p>
            {isCustomBracket ? (
              <a
                href={contactHref}
                className="self-start text-sm font-bold text-brand-600 hover:underline dark:text-brand-400"
              >
                {labels.contactCta}
              </a>
            ) : (
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs font-bold tracking-wider text-neutral-500 uppercase">
                    {labels.colYearly}
                  </dt>
                  <dd className="text-right text-neutral-700 dark:text-neutral-200">
                    {foundingMultiplier ? (
                      <>
                        <span className="mr-1.5 text-neutral-400 line-through decoration-red-500 decoration-2">
                          {fmt(yearly!, currency)}
                        </span>
                        <span className="font-bold text-gold-700 dark:text-gold-300">
                          {fmtDiscount(yearly!, foundingMultiplier, currency)}
                        </span>
                      </>
                    ) : (
                      <span className="font-bold">{fmt(yearly!, currency)}</span>
                    )}{" "}
                    <span className="text-neutral-500">
                      {labels.perSiteSlashMonth}
                    </span>
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs font-bold tracking-wider text-neutral-500 uppercase">
                    {labels.colMonthly}
                  </dt>
                  <dd className="text-right text-neutral-500">
                    {foundingMultiplier ? (
                      <>
                        <span className="mr-1.5 line-through decoration-red-500 decoration-2">
                          {fmt(monthly!, currency)}
                        </span>
                        <span className="font-bold text-gold-700 dark:text-gold-300">
                          {fmtDiscount(monthly!, foundingMultiplier, currency)}
                        </span>
                      </>
                    ) : (
                      fmt(monthly!, currency)
                    )}{" "}
                    {labels.perSiteSlashMonth}
                  </dd>
                </div>
              </dl>
            )}
          </div>
        );
      })}
    </div>

    {/* Desktop (sm+): the original 3-column table. Hidden on mobile in
        favour of the stacked cards above. */}
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs font-bold tracking-wider text-neutral-500 uppercase dark:border-neutral-800">
            <th className="py-3 pr-4">{labels.colSites}</th>
            <th className="py-3 pr-4">{labels.colYearly}</th>
            <th className="py-3">{labels.colMonthly}</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier) => {
            const yearly = currency === "eur" ? tier.eurYearly : tier.usdYearly;
            const monthly = currency === "eur" ? tier.eurMonthly : tier.usdMonthly;
            const isCustomBracket = yearly === null;

            return (
              <tr
                key={tier.id}
                className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60"
              >
                <td className="py-4 pr-4 font-bold text-neutral-900 dark:text-white">
                  {tier.rangeLabel}
                </td>
                <td className="py-4 pr-4 text-neutral-700 dark:text-neutral-200">
                  {isCustomBracket ? (
                    <a
                      href={contactHref}
                      className="font-bold text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {labels.contactCta}
                    </a>
                  ) : (
                    <span>
                      {foundingMultiplier ? (
                        <>
                          <span className="mr-1.5 text-neutral-400 line-through decoration-red-500 decoration-2">
                            {fmt(yearly!, currency)}
                          </span>
                          <span className="font-bold text-gold-700 dark:text-gold-300">
                            {fmtDiscount(yearly!, foundingMultiplier, currency)}
                          </span>
                        </>
                      ) : (
                        <span className="font-bold">{fmt(yearly!, currency)}</span>
                      )}
                      <span className="text-neutral-500"> {labels.perSiteSlashMonth}</span>
                    </span>
                  )}
                </td>
                <td className="py-4 text-neutral-500">
                  {isCustomBracket ? null : foundingMultiplier ? (
                    <span>
                      <span className="mr-1.5 line-through decoration-red-500 decoration-2">
                        {fmt(monthly!, currency)}
                      </span>
                      <span className="font-bold text-gold-700 dark:text-gold-300">
                        {fmtDiscount(monthly!, foundingMultiplier, currency)}
                      </span>{" "}
                      {labels.perSiteSlashMonth}
                    </span>
                  ) : (
                    `${fmt(monthly!, currency)} ${labels.perSiteSlashMonth}`
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    <p className="mt-6 text-xs leading-relaxed text-neutral-500">{labels.caption}</p>
  </section>
);
