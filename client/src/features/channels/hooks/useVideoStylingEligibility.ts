/**
 * Plan gate for the visual preset's Video-styling surfaces (Visuals page
 * section + onboarding-wizard row) — video-visuals handoff §1/§4.
 *
 * Single source of truth is the cloud-computed entitlement on the Video
 * channel's catalog entry (`channelsListCatalog`), exactly the check the
 * Channels Store card and the `?configure=` deep-link gate already use —
 * the client never re-derives plan math itself.
 *
 * Three-way result rather than a boolean because the two ineligible
 * shapes render differently:
 *
 *   - `"eligible"` — the caller's plan includes the Video channel
 *     (`entitlement.canInstall`). Render the full section.
 *   - `"locked"`   — the cloud says the plan/add-on is missing
 *     (`blocker: "upgrade_plan" | "add_channels"`). Render the compact
 *     `SectionGateTeaser`; the gated fields are neither rendered nor
 *     fetched.
 *   - `"unknown"`  — catalog still loading, degraded, entry absent (an
 *     older cloud), or the channel is flagged `coming_soon`. Render
 *     NOTHING: no teaser flash for paying customers while the query is
 *     in flight, no premium editor leak on a degraded response, and no
 *     upsell for a channel that can't be bought yet.
 */

import { VIDEO_INTEGRATION_ID } from "../videoChannel";
import { useChannelCatalogQuery } from "../api/useChannelCatalogQuery";

export type VideoStylingEligibility = "eligible" | "locked" | "unknown";

export function useVideoStylingEligibility(): VideoStylingEligibility {
  const { data: catalog } = useChannelCatalogQuery();
  const entry = catalog?.entries.find((e) => e.id === VIDEO_INTEGRATION_ID);
  if (!entry) return "unknown";
  if (entry.entitlement.canInstall) return "eligible";
  if (
    entry.entitlement.blocker === "upgrade_plan" ||
    entry.entitlement.blocker === "add_channels"
  ) {
    return "locked";
  }
  // "coming_soon" (or a blocker value this build doesn't know yet).
  return "unknown";
}
