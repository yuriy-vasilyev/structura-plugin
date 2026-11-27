/**
 * The partner program's referral offer: what a referred customer saves and
 * what the partner earns.
 *
 * One source for the www `/partners` page (`www/lib/partner-terms.ts`
 * re-exports it for its copy and worked-example math) and for every email
 * that fills these figures into `productUpdate.partnerText` (the product
 * update digest, the AppSumo onboarding emails). The emails deploy from
 * `functions/`, which cannot import from `www/`; this package is the one that
 * `pnpm sync:contracts` copies into `functions/src`, so the figures live here.
 */
export const PARTNER_TERMS = {
  discountPercent: 10,
  discountMonths: 3,
  commissionPercent: 20,
  commissionMonths: 12,
  refundWindowDays: 30,
} as const;
