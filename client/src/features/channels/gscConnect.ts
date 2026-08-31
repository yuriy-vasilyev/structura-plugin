/**
 * Pure state derivation for the Google Search Console connect flow — the
 * four-state Configure modal that follows the OAuth bounce.
 *
 * The modal's state machine (design handoff:
 * marketing/design_handoff_gsc_connect_flow/README.md, spec:
 * specs/gsc-integration.md §4.1–4.2) is driven entirely by the connection's
 * property-match result, so the derivation lives here as plain functions the
 * modal AND its tests can share without rendering anything:
 *
 *   - property set                                → `auto_matched` (confirm)
 *   - property null, ≥1 usable property           → `picker`
 *   - property null, none usable, list non-empty  → `insufficient_permission`
 *   - property list empty                         → `no_property` (guidance)
 *
 * Mirrors the cloud's `functions/src/gsc/property-match.ts` ranking rules
 * (URL-prefix beats domain, longer = more specific, unverified is unusable)
 * but works from the site HOST only — the wp-admin SPA knows its host via
 * `window.structuraConfig.domain`, not necessarily the scheme/path the
 * cloud matched against.
 */

import type { GoogleSearchConsoleProperty } from "./types";

/**
 * Google's "verified elsewhere, not for you" permission level. Search
 * Analytics rejects it; every other level (including `siteRestrictedUser`)
 * can read the data Structura needs — which is why the picker treats
 * Restricted as fully sufficient and only this level as unusable.
 */
export const GSC_UNVERIFIED_PERMISSION = "siteUnverifiedUser";

/** Google's domain-property prefix (`sc-domain:example.com`). */
export const GSC_DOMAIN_PREFIX = "sc-domain:";

/**
 * The four post-OAuth modal states (handoff Boards 02–05). The transient
 * spinner while a refresh/save call is in flight is a UI concern, not a
 * derived state, so it is deliberately absent here.
 */
export type GscConnectView =
  | "auto_matched"
  | "picker"
  | "no_property"
  | "insufficient_permission";

/**
 * Properties the connection can actually read stats for. The wire list
 * includes `siteUnverifiedUser` entries (that presence is exactly how the
 * insufficient-permission state gets rendered), so pickers must filter
 * through this rather than rendering the raw list.
 */
export function usableGscProperties(
  properties: GoogleSearchConsoleProperty[],
): GoogleSearchConsoleProperty[] {
  return properties.filter(
    (p) => p.permissionLevel !== GSC_UNVERIFIED_PERMISSION,
  );
}

/**
 * Derive which of the four modal states to render from the connection's
 * (or a refresh response's) property-match result.
 *
 * @param property   The active/auto-matched property id, or null when the
 *                   connect flow matched none.
 * @param properties Every property the Google account can see, including
 *                   unverified-permission entries.
 */
export function deriveGscConnectView(
  property: string | null | undefined,
  properties: GoogleSearchConsoleProperty[],
): GscConnectView {
  if (property) return "auto_matched";
  if (usableGscProperties(properties).length > 0) return "picker";
  if (properties.length > 0) return "insufficient_permission";
  return "no_property";
}

/** Property id shape — drives the plain-language type explainer line. */
export function gscPropertyKind(siteUrl: string): "domain" | "prefix" {
  return siteUrl.startsWith(GSC_DOMAIN_PREFIX) ? "domain" : "prefix";
}

/**
 * Permission ranking used as the last-resort pre-selection order (spec
 * §4.2: exact URL-prefix first, else covering domain property, else
 * highest permission). Unknown levels rank at 0 so a new Google string
 * never outranks a known one.
 */
const PERMISSION_RANK: Record<string, number> = {
  siteOwner: 3,
  siteFullUser: 2,
  siteRestrictedUser: 1,
};

/**
 * Result of {@link bestGscPropertyMatch}. `covers` distinguishes "this
 * property actually covers the site host" (→ show the Best match badge)
 * from the highest-permission fallback pre-selection (no badge).
 */
export interface GscBestMatch {
  siteUrl: string;
  covers: boolean;
}

/**
 * Does this property cover the given site host? Host-only version of the
 * cloud's coverage check: a domain property covers the host and every
 * subdomain; a URL-prefix property covers only an exact host match.
 */
function coverageRank(
  host: string,
  property: GoogleSearchConsoleProperty,
): number {
  const raw = property.siteUrl;
  if (raw.startsWith(GSC_DOMAIN_PREFIX)) {
    const domain = raw.slice(GSC_DOMAIN_PREFIX.length).toLowerCase().trim();
    if (!domain) return 0;
    const covers = host === domain || host.endsWith(`.${domain}`);
    // Longer domains (subdomain properties) are more specific.
    return covers ? 1_000_000 + domain.length : 0;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 0;
  }
  if (url.host.toLowerCase() !== host) return 0;
  // URL-prefix properties outrank domain ones (the more deliberate claim);
  // longer paths (subdirectory properties) are more specific. Offset past
  // any plausible domain length, mirroring the cloud matcher.
  return 2_000_000 + url.pathname.length;
}

/**
 * Pick the property the picker should pre-select (and badge as
 * "Best match" when it actually covers the site host).
 *
 * Order per spec §4.2: exact URL-prefix hit → covering domain property →
 * highest permission among the usable list. Unverified-permission entries
 * never win. Returns null when nothing is usable at all.
 */
export function bestGscPropertyMatch(
  siteHost: string,
  properties: GoogleSearchConsoleProperty[],
): GscBestMatch | null {
  const host = siteHost.trim().toLowerCase();
  let best: GscBestMatch | null = null;
  let bestScore = -1;
  for (const property of usableGscProperties(properties)) {
    const coverage = host ? coverageRank(host, property) : 0;
    // Coverage dominates; permission breaks ties within a coverage class.
    const score =
      coverage * 8 + (PERMISSION_RANK[property.permissionLevel] ?? 0);
    if (score > bestScore) {
      bestScore = score;
      best = { siteUrl: property.siteUrl, covers: coverage > 0 };
    }
  }
  return best;
}

/**
 * The property to NAME in the insufficient-permission state (Board 05):
 * the listed property covering the site host when one does — that is the
 * property whose owner the user must ask — else the first listed one.
 * Permission is deliberately ignored here: in this state every entry is
 * unverified, which is the whole problem being explained.
 */
export function gscPropertyToRequest(
  siteHost: string,
  properties: GoogleSearchConsoleProperty[],
): string | null {
  const host = siteHost.trim().toLowerCase();
  if (host) {
    const covering = properties.find((p) => coverageRank(host, p) > 0);
    if (covering) return covering.siteUrl;
  }
  return properties[0]?.siteUrl ?? null;
}
