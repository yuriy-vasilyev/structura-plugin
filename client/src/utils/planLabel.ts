import { __ } from "@wordpress/i18n";

/**
 * Human-readable plan-badge labels for the wp-admin SPA.
 *
 * Mirrors `web/src/features/billing/utils.ts::formatPlanLabel` so the
 * two surfaces tell the same story. The wp-admin SPA uses the
 * `@wordpress/i18n` toolchain (`__`) rather than `react-i18next`, so
 * we don't share the helper across packages — but the output strings
 * line up cell-for-cell with the portal.
 *
 * Naming history: pre-Wave-2, the WP-admin header rendered `byok →
 * "Pro"` and `cloud_pro → "Agency"` because those were the v1 PlanIds
 * before the rename. After the audience axis split off (Cloud Pro
 * × Individual / Agency), those labels became misleading — every
 * solo Cloud Pro customer got the "Agency" badge. This helper
 * realigns the labels with the modern PlanId names and appends the
 * audience suffix when present.
 */

// `__` calls must take literal arguments so the makepot toolchain can
// scrape them — a `PLAN_NAMES[planId]` lookup would silently leave the
// strings out of the generated `.pot`.
function planName(planId: string): string {
  switch (planId) {
    case "free":
      return __("Free", "structura");
    case "byok":
      return __("BYOK", "structura");
    case "cloud":
      return __("Cloud", "structura");
    case "cloud_pro":
      return __("Cloud Pro", "structura");
    default:
      // Unknown id (e.g. cloud added a new tier the SPA hasn't shipped
      // a case for yet) — surface the raw value rather than masking it
      // with a fallback label that could misrepresent the customer's
      // tier.
      return planId;
  }
}

function audienceLabel(audience: string): string | null {
  switch (audience) {
    case "individual":
      return __("Individual", "structura");
    case "agency":
      return __("Agency", "structura");
    default:
      return null;
  }
}

/**
 * Plan-name only, no audience suffix. Use when the audience is
 * surfaced separately (e.g. its own badge); avoids visual duplication.
 */
export function formatPlanName(planId: string): string {
  return planName(planId);
}

/**
 * Plan name + audience suffix, when both are known. Falls back to
 * name-only when audience is null / unknown — useful while the cloud
 * heartbeat is pending (PHP snapshot doesn't carry audience).
 *
 *   formatPlanLabel("byok", "agency")     → "BYOK Agency"
 *   formatPlanLabel("cloud_pro", "individual") → "Cloud Pro Individual"
 *   formatPlanLabel("byok", null)         → "BYOK"
 *   formatPlanLabel("free", "individual") → "Free"      // Free has no audience axis
 */
export function formatPlanLabel(
  planId: string,
  audience: string | null | undefined,
): string {
  const name = planName(planId);
  if (planId === "free" || !audience) return name;
  const suffix = audienceLabel(audience);
  return suffix ? `${name} ${suffix}` : name;
}
