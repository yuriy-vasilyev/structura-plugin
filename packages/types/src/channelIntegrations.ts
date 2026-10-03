/** Stable identifier for publishing full articles to an external blog. */
export const WEBHOOK_DELIVER_INTEGRATION_ID = "webhook-deliver";

/**
 * Where a customer built the site that receives Article delivery. Stored on
 * the connection as `setupPlatform` and used to pick the builder prompt.
 * Spec: specs/article-delivery-connect-flow.md §6.4, §6.6.
 */
export const BUILDER_PLATFORMS = ["lovable", "bolt", "v0", "replit", "custom"] as const;

/** One of {@link BUILDER_PLATFORMS}. */
export type BuilderPlatform = (typeof BUILDER_PLATFORMS)[number];
