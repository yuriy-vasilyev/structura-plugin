/**
 * Build a "come back here" URL that resumes the active campaign-wizard
 * draft on the requested step.
 *
 * Why this exists
 * ---------------
 * The Keyword Bank and Authority Sources upsell teasers send the user
 * off-site (portal billing / marketing pricing). Without an explicit
 * return URL, the customer who completes a Cloud upgrade lands on the
 * portal's generic post-conversion screen, then has to find their way
 * back to wp-admin → Structura → Campaigns → New → Keywords from
 * scratch. The draft auto-resumes from localStorage, but they have to
 * navigate three layers deep to get there.
 *
 * `buildWizardResumeUrl` packages the current wp-admin URL plus a
 * `#/campaigns/new?resume=draft&step=<step>` hash so the portal can
 * surface a "Back to {site}" link that lands the customer directly on
 * the step they left. `CreateCampaignPage` reads `resume=draft` on
 * mount, jumps the wizard to the requested step, then strips the
 * params from the URL so a page refresh doesn't keep re-firing the
 * jump.
 *
 * Spec-equivalent comment: this mirrors the `returnTo` contract used
 * by `client/src/features/account/deepLinks.ts` for add-on assignment
 * deep links. Same shape, different surface.
 */

/**
 * Wizard steps that support the resume-draft URL. Intentionally a
 * subset of `ALL_STEPS` — the user shouldn't deep-link into Summary
 * (that's the final review) or Interview / Strategy (those have no
 * upsell teaser, so there's no off-site round-trip to come back from).
 *
 * If a future step grows an upsell teaser, widen this union AND mirror
 * it in `CreateCampaignPage`'s `RESUMABLE_STEPS` guard.
 */
export type ResumableWizardStep = "keywords" | "authority";

/**
 * Build a URL that resumes the campaign-wizard draft on the requested
 * step, anchored to the current wp-admin install.
 *
 * SSR / non-browser callers get an empty string; this should never
 * be passed to a portal URL builder in that environment, but the
 * guard keeps the helper safe to import in code that's also exercised
 * by Vitest / node.
 *
 * The returned URL preserves the wp-admin's existing query string
 * (e.g. `?page=structura`, which is what wp-admin uses to load the
 * SPA in the first place), and overrides only the URL hash. This
 * matters because the WP install may be at a subdirectory, behind a
 * reverse proxy, or running under a custom admin slug — we can't
 * derive the wp-admin URL from `window.structuraConfig.domain` alone
 * without losing those parts.
 */
export function buildWizardResumeUrl(step: ResumableWizardStep): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  // URL setter accepts the path-segment with or without a leading `#`
  // and prepends one on read. We deliberately reset `url.search` —
  // wp-admin's `page=structura` is enough to load the SPA; per-request
  // query params (e.g. `noheader`, `_wpnonce`) shouldn't ride along
  // through a portal round-trip.
  url.hash = `/campaigns/new?resume=draft&step=${encodeURIComponent(step)}`;
  return url.toString();
}
