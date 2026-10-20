import { FC, type ReactNode } from "react";
import { Check, Sparkles } from "lucide-react";
import { Button } from "../components/Button";
import { cn } from "../utils";

/**
 * USD and EUR are priced at parity. The currency choice only flips the symbol
 * and the Stripe price line — there is no FX conversion. VAT is added by
 * Stripe at checkout for EU B2B customers, so the displayed number is always
 * the net price.
 *
 * Spec: pricing-v2-implementation.md §8.1.
 */
export type PlanCardCurrency = "usd" | "eur";

export interface PlanCardLabels {
  /**
   * Suffix shown to the right of the price. The caller picks which key to
   * resolve — typically "per site/mo" for paid plans and "/mo" for free.
   */
  unit: string;
  /** Badge text rendered when `isCurrent` is true (e.g. "CURRENT PLAN"). */
  currentPlan?: string;
  /** Badge text rendered when `recommended` is true (e.g. "MOST POPULAR"). */
  mostPopular?: string;
  /**
   * Badge text rendered when `premium` is true. Caller decides between
   * "PREMIUM", "TOP TIER", or any per-plan variant.
   */
  premiumBadge?: string;
  /**
   * Screen-reader prefix for the struck-through price (e.g. "Monthly billing
   * rate"), because assistive tech does not announce a strike. Absent → the
   * struck figure is read bare.
   */
  strikePrice?: string;
}

export interface PlanCardProps {
  name: string;
  /** Price as a plain number — no formatting. The card prepends the symbol. */
  price: number;
  /**
   * Optional "was" price rendered struck-through immediately before `price`.
   * Used to show the higher monthly-billing rate next to the discounted
   * annual rate when the page is in yearly mode. Only rendered when it is
   * strictly greater than `price`, so callers can pass it unconditionally
   * (e.g. the monthly amount) without guarding against equal/lower values.
   */
  strikePrice?: number;
  /**
   * Preformatted discounted headline (digits only, e.g. `"23.40"`), used when
   * the founding discount carries decimals the integer `price` can't. The card
   * still prepends the currency symbol. Falls back to `price` when unset.
   */
  priceDisplay?: string;
  currency?: PlanCardCurrency;
  description: string;
  features: string[];
  footnote?: string;
  /**
   * Founding-offer treatment. When present, the price block switches to the
   * redesigned strikethrough — a small struck original ABOVE (with a thick
   * angled red slash + a discount pill), the big discounted price BELOW in the
   * premium gold accent — and an optional gold "for life" badge renders at the
   * top. When ABSENT the card renders exactly as before (plain inline strike,
   * no gold), so the app portal — which never passes this prop — stays visually
   * unchanged. Opt-in on purpose: keeps the change backward-compatible.
   */
  founding?: {
    /** Pill text beside the struck original, e.g. "40% off for life". */
    strikeLabel: string;
    /** Gold sparkle badge at the card top, e.g. "40% for life". Omit → no badge. */
    badge?: string;
  };

  /** All i18n-resolved strings live here. Inversion of control — the package
   * stays free of any i18n runtime dependency so it can render in Vite, Next,
   * Remix, or a bare HTML page. */
  labels: PlanCardLabels;

  // Variant flags. At most one of recommended / premium / isCurrent should be
  // true per card; the visual treatment escalates left-to-right.
  recommended?: boolean;
  premium?: boolean;
  isCurrent?: boolean;

  ctaLabel: string;
  /**
   * Renders the CTA as an `<a href>`. Use this from marketing surfaces where
   * "Get started" routes the visitor to the app portal or a checkout URL.
   * Mutually exclusive with `onCtaClick`.
   */
  ctaHref?: string;
  ctaTarget?: string;
  ctaRel?: string;
  /**
   * Renders the CTA as a `<button>`. Use this from authenticated surfaces
   * where the click triggers Stripe Checkout or an in-app navigation.
   * Mutually exclusive with `ctaHref`.
   */
  onCtaClick?: () => void;
  /**
   * Fired on CTA click IN ADDITION to `ctaHref` navigation. The founding flow
   * uses it to copy the promo code to the clipboard before the visitor lands
   * on Stripe checkout. No-op when unset; distinct from `onCtaClick`, which
   * renders the CTA as a `<button>` instead of a link.
   */
  ctaOnClickCapture?: () => void;
  ctaLoading?: boolean;
  ctaDisabled?: boolean;
  /**
   * Optional note rendered directly beneath the CTA button — used by the
   * marketing site for the "Use code FOUNDING at checkout" reminder. Absent →
   * nothing renders, so existing callers are unaffected.
   */
  ctaNote?: ReactNode;
  /**
   * Where the CTA (and its `ctaNote`) sit relative to the feature list.
   *   • `"bottom"` (default) — features first, CTA pinned to the card foot.
   *     The app portal relies on this, so it stays the default.
   *   • `"top"` — price → CTA → note → features, per the founding-offer
   *     handoff (§3). The marketing grid passes this.
   */
  ctaPlacement?: "top" | "bottom";
  /**
   * CTA button variant. Defaults to `primary` (or `secondary` when the plan is
   * the user's current one). Pass `secondary` for a subtle/ghost CTA — used on
   * the Free card so it recedes behind the paid CTAs.
   */
  ctaVariant?: "primary" | "secondary";
  /**
   * Arbitrary `data-*` attributes forwarded onto the CTA element. Used by
   * the marketing site to attach `data-ph-event` / `data-ph-plan` / …
   * for PostHog click-delegation tracking (see
   * `www/components/analytics/PostHogProvider.tsx`). Keys are passed
   * verbatim — pass them already in `data-foo` form.
   */
  ctaDataAttributes?: Record<string, string>;
  /**
   * Small uppercase category above the name (e.g. "Managed AI"). Absent →
   * nothing renders.
   */
  eyebrow?: string;
  /** Pill on the eyebrow row, right-aligned (e.g. "AI included"). */
  tag?: string;
  /**
   * Rendered between the description and the price. The Cloud card passes its
   * posts-per-site volume selector here so the input sits directly above
   * the number it changes (specs/cloud-volume-pricing-design.md, 2026-10-12).
   * The caller owns the slot's height, so a grid can reserve the same region
   * in every card and keep the price and CTA rows aligned. Absent → nothing
   * renders.
   */
  beforePrice?: ReactNode;
  /**
   * Rendered directly under the price line. Used for billing detail such as
   * the annual total and the yearly saving.
   */
  priceNote?: ReactNode;
  /** Heading above `allowances` (e.g. "Included per site, every month"). */
  allowancesLabel?: string;
  /**
   * Structured per-period allowances (posts, images, videos) rendered as a
   * row of large numbers above the feature list. Absent → nothing renders.
   */
  allowances?: ReadonlyArray<{ value: string; label: string }>;
  /** Heading above the feature list (e.g. "The full publishing engine"). */
  featuresLabel?: string;
}

/**
 * Pricing tier card. Pure presentational — no hooks, no fetches, no i18n
 * dependency. Used by both the marketing site (`www/`) and the authenticated
 * app portal (`web/`); each app composes the card with its own data + i18n.
 *
 * Reading order since the Cloud volume design (2026-10-12,
 * specs/cloud-volume-pricing-design.md): eyebrow → name → description →
 * `beforePrice` → price → `priceNote` → CTA (`top` placement) → allowances →
 * features → footnote. Cards never lift or scale on hover: they are static
 * surfaces, and a scaled card broke the equal-column grid.
 *
 * Spec: pricing-v2-implementation.md §8.1.
 */
export const PlanCard: FC<PlanCardProps> = ({
  name,
  price,
  strikePrice,
  priceDisplay,
  currency = "usd",
  description,
  features,
  footnote,
  founding,
  labels,
  recommended,
  premium,
  isCurrent,
  ctaLabel,
  ctaHref,
  ctaTarget,
  ctaRel,
  onCtaClick,
  ctaOnClickCapture,
  ctaLoading,
  ctaDisabled,
  ctaNote,
  ctaPlacement = "bottom",
  ctaVariant,
  ctaDataAttributes,
  eyebrow,
  tag,
  beforePrice,
  priceNote,
  allowancesLabel,
  allowances,
  featuresLabel,
}) => {
  const currencySymbol = currency === "eur" ? "€" : "$";
  const showCurrentBadge = Boolean(isCurrent && labels.currentPlan);
  const showPopularBadge = Boolean(recommended && !isCurrent && labels.mostPopular);
  const showStrikePrice = typeof strikePrice === "number" && strikePrice > price;
  const showPremiumBadge = Boolean(premium && !isCurrent && labels.premiumBadge);
  // Founding treatment is opt-in: only when the caller passes `founding`.
  const showFoundingStrike = Boolean(founding && showStrikePrice);
  const showFoundingBadge = Boolean(founding?.badge && !isCurrent);
  const priceText = priceDisplay ?? String(price);
  // `top` placement (marketing grid) keeps its badges in the eyebrow row;
  // `bottom` (app portal) pops them over the top border as before.
  const inFlowBadges = ctaPlacement === "top" && !showCurrentBadge;
  const showTopRow = Boolean(
    eyebrow ||
      tag ||
      (inFlowBadges && (showPopularBadge || showFoundingBadge || showPremiumBadge)) ||
      // The marketing grid reserves the row so names line up across cards.
      ctaPlacement === "top"
  );

  // The premium tier CTA uses the brand's muted premium-gold gradient (the
  // `gold-*` token, NOT stock amber). Opt-in through `premium`; the Cloud card
  // stopped using it when Cloud Pro was retired (2026-10-12). `!` overrides
  // keep the gradient from being stripped by Button's own variant classes.
  const premiumCtaCls =
    "!bg-gradient-to-r !from-gold-400 !to-gold-500 !text-gold-950 hover:!text-gold-950 shadow-lg shadow-gold-500/20 hover:!from-gold-300 hover:!to-gold-400 hover:shadow-gold-500/30 focus-visible:!ring-gold-400 dark:shadow-gold-500/30";
  const ctaCls = cn("min-h-12 w-full", premium && !isCurrent && premiumCtaCls);

  const ctaButton = ctaHref ? (
    <Button
      href={ctaHref}
      target={ctaTarget}
      rel={ctaRel}
      onClick={ctaOnClickCapture}
      variant={isCurrent ? "secondary" : (ctaVariant ?? "primary")}
      className={ctaCls}
      aria-disabled={ctaDisabled || isCurrent}
      {...ctaDataAttributes}
    >
      {ctaLabel}
    </Button>
  ) : (
    <Button
      onClick={onCtaClick}
      loading={ctaLoading}
      disabled={ctaDisabled || isCurrent || (!onCtaClick && !ctaHref)}
      variant={isCurrent ? "secondary" : (ctaVariant ?? "primary")}
      className={ctaCls}
      {...ctaDataAttributes}
    >
      {ctaLabel}
    </Button>
  );

  const muted = premium ? "text-neutral-300" : "text-neutral-600 dark:text-neutral-300";
  const subtle = premium ? "text-neutral-400" : "text-neutral-600 dark:text-neutral-400";
  const strong = premium ? "text-white" : "text-neutral-900 dark:text-white";

  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col rounded-2xl border p-5 transition-colors duration-fast ease-out motion-reduce:transition-none sm:p-6",
        premium
          ? // Dark premium treatment — inverted in light mode, accent glow
            // in dark mode. Matches specs/design-guide.md "dark card" pattern.
            "dark:border-brand-500/40 dark:ring-brand-500/10 dark:shadow-brand-500/40 border-neutral-900 bg-neutral-950 text-neutral-100 shadow-xl ring-1 ring-neutral-900/20 dark:bg-neutral-950 dark:shadow-[0_0_60px_-20px] dark:ring-2"
          : recommended
            ? "border-brand-300 shadow-floating dark:border-brand-500/50 bg-white dark:bg-neutral-900 dark:ring-1 dark:ring-white/[0.04]"
            : "shadow-raised border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 dark:ring-1 dark:ring-white/[0.04]"
      )}
    >
      {showCurrentBadge && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-600 px-3 py-1 font-mono text-[10px] font-bold tracking-wider text-white uppercase">
          {labels.currentPlan}
        </div>
      )}

      {!inFlowBadges && showPopularBadge && (
        <div className="bg-brand-600 absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-1 font-mono text-[10px] font-bold tracking-wider text-white uppercase">
          {labels.mostPopular}
        </div>
      )}
      {!inFlowBadges && showPremiumBadge && (
        <div className="from-gold-400 to-gold-500 text-gold-950 absolute top-0 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-gradient-to-r px-3 py-1 font-mono text-[10px] font-bold tracking-wider uppercase">
          <Sparkles className="size-3" strokeWidth={3} />
          {labels.premiumBadge}
        </div>
      )}

      {showTopRow && (
        <div className="mb-4 flex min-h-6 flex-wrap items-center justify-between gap-2">
          {eyebrow ? (
            <span className={cn("text-xs font-bold tracking-widest uppercase", subtle)}>
              {eyebrow}
            </span>
          ) : (
            <span aria-hidden="true" />
          )}
          <span className="flex flex-wrap items-center gap-2">
            {tag && (
              <span className="bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300 rounded-full px-2 py-1 text-xs font-semibold">
                {tag}
              </span>
            )}
            {inFlowBadges && showPopularBadge && (
              <span className="bg-brand-600 inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider text-white uppercase">
                {labels.mostPopular}
              </span>
            )}
            {inFlowBadges && showFoundingBadge && (
              <span className="bg-gold-300 text-gold-950 inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider uppercase">
                <Sparkles className="size-3" strokeWidth={3} />
                {founding!.badge}
              </span>
            )}
            {inFlowBadges && showPremiumBadge && (
              <span className="from-gold-400 to-gold-500 text-gold-950 inline-flex items-center gap-1 rounded-full bg-gradient-to-r px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider uppercase">
                <Sparkles className="size-3" strokeWidth={3} />
                {labels.premiumBadge}
              </span>
            )}
          </span>
        </div>
      )}

      <h3 className={cn("text-2xl font-bold tracking-tight", strong)}>{name}</h3>
      {/* Two lines reserved so a one-line description does not pull its
          card's price above its neighbours'. */}
      <p className={cn("mt-3 min-h-[2lh] text-sm leading-relaxed", muted)}>{description}</p>

      {beforePrice && <div className="mt-6">{beforePrice}</div>}

      {showFoundingStrike ? (
        // Founding treatment: struck original small ABOVE with a thick angled
        // red slash + a discount pill, big discounted price BELOW in gold.
        <div className="mt-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="relative inline-block text-lg font-semibold text-neutral-400 dark:text-neutral-500">
              {currencySymbol}
              {strikePrice}
              {/* Thick (-9°) coloured slash — deliberately louder than a
                  default line-through. */}
              <span
                aria-hidden="true"
                className="absolute inset-x-[-3px] top-1/2 h-[3px] -translate-y-1/2 -rotate-[9deg] rounded-full bg-red-500 dark:bg-red-400"
              />
            </span>
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-red-500 uppercase dark:text-red-400">
              {founding!.strikeLabel}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-gold-600 dark:text-gold-300 text-4xl font-extrabold tracking-tight tabular-nums">
              {currencySymbol}
              {priceText}
            </span>
            <span className="text-xs text-neutral-600 dark:text-neutral-300">{labels.unit}</span>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex min-h-11 flex-wrap items-baseline gap-x-2 gap-y-1">
          {showStrikePrice && (
            <span
              className={cn(
                "text-xl font-medium tabular-nums",
                premium ? "text-neutral-500" : "text-neutral-500 dark:text-neutral-400"
              )}
            >
              {labels.strikePrice && <span className="sr-only">{labels.strikePrice} </span>}
              <s>
                {currencySymbol}
                {strikePrice}
              </s>
            </span>
          )}
          <span className={cn("text-4xl font-bold tracking-tight tabular-nums", strong)}>
            {currencySymbol}
            {priceText}
          </span>
          <span className={cn("text-xs", muted)}>{labels.unit}</span>
        </div>
      )}
      {priceNote && (
        // Two lines reserved so toggling monthly / yearly never moves the CTA.
        <div className={cn("mt-2 min-h-10 text-xs leading-relaxed", subtle)}>{priceNote}</div>
      )}

      {/* Order is placement-aware (§3): `top` renders CTA → note → features so
          the marketing grid leads with the action; `bottom` (default, app
          portal) keeps features first with the CTA pinned to the card foot.
          Check icons stay emerald on founding cards, gold on premium, brand
          otherwise — never following the founding gold accent. */}
      {ctaPlacement === "top" && (
        <div className="mt-5 flex flex-col">
          {ctaButton}
          {ctaNote}
        </div>
      )}

      {allowances && allowances.length > 0 && (
        <div className="mt-6 border-y border-neutral-200 py-4 dark:border-neutral-700">
          {allowancesLabel && <p className={cn("mb-3 text-xs", subtle)}>{allowancesLabel}</p>}
          <dl
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${allowances.length}, minmax(0, 1fr))` }}
          >
            {allowances.map((a) => (
              // Number above its label visually; the label stays first in
              // the DOM so it reads as "posts: 100".
              <div key={a.label} className="flex flex-col-reverse gap-1">
                <dt className={cn("text-xs", muted)}>{a.label}</dt>
                <dd className={cn("text-xl font-bold tabular-nums", strong)}>{a.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {featuresLabel && (
        <p className={cn("mt-6 text-sm font-semibold leading-relaxed", strong)}>{featuresLabel}</p>
      )}

      <ul
        className={cn(
          "flex flex-1 flex-col gap-3",
          featuresLabel ? "mt-4" : "mt-5"
        )}
      >
        {features.map((feature, i) => (
          <li key={i} className={cn("flex items-start gap-3 text-sm leading-relaxed", muted)}>
            <Check
              aria-hidden="true"
              className={cn(
                "mt-1 size-4 shrink-0",
                founding
                  ? "text-emerald-500"
                  : premium
                    ? "text-gold-400"
                    : "text-brand-600 dark:text-brand-400"
              )}
              strokeWidth={3}
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {footnote && <p className={cn("mt-6 text-xs leading-relaxed", subtle)}>{footnote}</p>}

      {ctaPlacement === "bottom" && (
        <div className="mt-6 flex flex-col">
          {ctaButton}
          {ctaNote}
        </div>
      )}
    </div>
  );
};
