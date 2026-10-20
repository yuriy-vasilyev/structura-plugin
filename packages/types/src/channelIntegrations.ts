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

/**
 * Platforms the site guess on `/connect` can name from a live site.
 * `DETECTED_BUILDERS` identify themselves only on their own hosts
 * (`*.lovable.app`, `*.bolt.host`, `*.replit.app`); `CLOSED_PLATFORMS`
 * always identify themselves and cannot receive Article delivery, so the
 * flow stops before a site is created. Spec:
 * specs/connect-platform-picker-brief.md §4.2, §13.
 */
export const DETECTED_BUILDERS = ["lovable", "bolt", "replit"] as const;

/** One of {@link DETECTED_BUILDERS}. */
export type DetectedBuilder = (typeof DETECTED_BUILDERS)[number];

/** Hosted platforms Structura cannot publish to yet; see {@link DETECTED_BUILDERS}. */
export const CLOSED_PLATFORMS = ["webflow", "shopify", "wix", "squarespace", "framer"] as const;

/** One of {@link CLOSED_PLATFORMS}. */
export type ClosedPlatform = (typeof CLOSED_PLATFORMS)[number];

/** Request body of the `detectSitePlatform` callable. */
export interface DetectSitePlatformRequest {
  workspaceId: string;
  /** The public site URL the user typed; validated and guarded server-side. */
  url: string;
}

/**
 * What `detectSitePlatform` learned about a site. `host` is the bare host
 * (lowercase, no `www.`) of the URL that was checked. `nextjs` covers v0 and
 * hand-written Next.js alike because both use the same receiver route.
 * `looksLikeApp` is true when an SPA bundle (Vite `/assets/index-*.js`)
 * was seen without any platform marker, so the picker can suggest
 * "Your own code".
 */
export type DetectSitePlatformResult =
  | { result: "builder"; platform: DetectedBuilder; host: string }
  | { result: "nextjs"; host: string }
  | {
      result: "wordpress";
      host: string;
      /**
       * The Structura plugin is already installed: the public REST index at
       * `/wp-json/` lists the `structura/v1` namespace. Absent when the
       * index could not be read. Spec: specs/portal-site-onboarding.md §4.1.
       */
      pluginInstalled?: boolean;
    }
  | { result: "blocked"; platform: ClosedPlatform; host: string }
  | { result: "unknown"; host: string; looksLikeApp: boolean }
  | { result: "unreachable"; host: string };

/**
 * Where a site runs, as chosen on the setup wizard's Site info step. Decides
 * how articles reach the site: WordPress through the plugin, the AI builders
 * and `backend` through a signed receiver (push), the frameworks and
 * `framework` through the Content API (pull). Spec:
 * specs/portal-site-onboarding.md §3, §6.
 */
export const SITE_PLATFORMS = [
  "wordpress",
  "lovable",
  "bolt",
  "v0",
  "replit",
  "nextjs",
  "astro",
  "nuxt",
  "sveltekit",
  "framework",
  "backend",
] as const;

/** One of {@link SITE_PLATFORMS}. */
export type SitePlatform = (typeof SITE_PLATFORMS)[number];

/** Platforms that receive articles through the signed receiver. */
export const PUSH_PLATFORMS = ["lovable", "bolt", "v0", "replit", "backend"] as const satisfies readonly SitePlatform[];

/** Platforms that fetch published posts from the Content API. */
export const PULL_PLATFORMS = ["nextjs", "astro", "nuxt", "sveltekit", "framework"] as const satisfies readonly SitePlatform[];

/** Returns the receiver prompt variant for a push platform, or null for the others. */
export function receiverPlatformFor(platform: SitePlatform): BuilderPlatform | null {
  if (platform === "backend") return "custom";
  return (PUSH_PLATFORMS as readonly string[]).includes(platform) ? (platform as BuilderPlatform) : null;
}

/** Returns the site platform a pre-2026-10-19 `builderPlatform` value maps to. */
export function sitePlatformFromBuilder(builder: BuilderPlatform): SitePlatform {
  return builder === "custom" ? "backend" : builder;
}
