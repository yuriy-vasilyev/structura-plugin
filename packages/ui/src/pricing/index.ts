/**
 * Pricing composites — presentational building blocks for the pricing page.
 * Imported by both the marketing site (`www/`) and the authenticated app
 * portal (`web/`). These components intentionally have zero i18n or data-
 * fetching dependencies so they can be composed with whatever runtime the
 * host app uses.
 *
 * Spec: specs/marketing-site-migration.md §5;
 *       specs/pricing-v2-implementation.md §8.1.
 */
export * from "./PlanCard";
export * from "./CurrencyToggle";
export * from "./AgencyVolumeStrip";
export * from "./ComparisonMatrix";
export * from "./JustThePluginSection";
export * from "./ContactBand";
