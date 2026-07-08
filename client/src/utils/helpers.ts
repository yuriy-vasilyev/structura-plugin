import { BadgeProps } from "@structura/ui";
import { Campaign } from "@/features/campaigns/types";

export const getBadgeIntentByCampaignStatus = (
  status: Campaign["status"]
): BadgeProps["intent"] => {
  switch (status) {
    case "active":
      return "success";
    case "completed":
      return "premium";
    default:
      return "default";
  }
};

// `getBadgeIntentByLogLevel` was deleted in Phase 3b alongside the
// retired System Logs page (spec/v2/notification-center.md §8.1).
// The Notices page renders severity via NoticeSeverity → Badge intent
// directly inside the surface, no shared helper required.

/**
 * Decode HTML entities in a string for display. WordPress stores some
 * settings entity-encoded — a blog name like "Messer für …" comes back as
 * "Messer f&uuml;r …", and React renders that verbatim. Decode once for
 * display via a detached textarea (admin SPA is browser-only), which
 * natively handles named + numeric entities. No-op when there's nothing to
 * decode or `document` is unavailable.
 */
export function decodeEntities(input: string): string {
  if (!input || input.indexOf("&") === -1 || typeof document === "undefined") {
    return input;
  }
  const el = document.createElement("textarea");
  el.innerHTML = input;
  return el.value;
}
