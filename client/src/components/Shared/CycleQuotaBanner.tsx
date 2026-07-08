import { FC } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { Alert, Button } from "@structura/ui";
import { ArrowRight, Gauge, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router";
import {
  selectOwnActivationUsage,
  useUsageAnalytics,
} from "@/features/dashboard/api/useUsageAnalytics";

/**
 * Site-wide cycle-usage warning banner — Phase 4.4 of
 * `specs/v2/multi-tenant-and-public-api.md`.
 *
 * Two severity levels for managed-tier (Cloud / Cloud Pro)
 * customers, scoped to THIS SITE's per-activation quota (the
 * generation gate hard-blocks each activation independently —
 * there is no shared workspace pool, and no overage billing):
 *
 *   1. **INFO** — utilization >= 80% AND below quota. Heads-up that
 *      the cycle is almost burned through. The `IntelligenceUsage`
 *      dashboard widget already surfaces this in-card; the banner
 *      repeats it globally so the customer notices even when
 *      they're elsewhere in the SPA.
 *
 *   2. **WARNING** — at quota (`utilizationPercent >= 100` or
 *      `tokensUsed > tokensIncluded`). Generation on this site is
 *      paused until the cycle resets (hard block at the gate —
 *      `licenses/helpers.ts::checkUsageLimits` throws once
 *      `usedTokensThisMonth >= maxTokensPerActivation`).
 *
 * Hidden for BYOK / Free / disconnected — those tiers don't have
 * an AI-cost passthrough so there's nothing to warn about at the
 * cycle level. (Free's hard cap surfaces via the runtime
 * `tier_quota_exceeded` rejection on the failing generation; the
 * dashboard widget shows the BYOK shape with no overage UI.)
 *
 * Pre-2026-05-13 this read off a post/overage-based shape
 * (`overageUnits`, `estimatedOverageUsd`, `postsUsed`) that the
 * 383b8f78b refactor retired in favour of token-based metering.
 * That rewrite bound it to the workspace AGGREGATE, which both
 * implied a pooled quota that doesn't exist and could fire on a
 * site that still had plenty of its own budget (or stay silent on
 * a site that was already blocked) — re-scoped to the calling
 * activation 2026-06-07, alongside the "overage rates" copy fix
 * (caps are hard blocks; nothing is billed past them).
 */
export const CycleQuotaBanner: FC = () => {
  const navigate = useNavigate();
  const { data: usageData, isLoading } = useUsageAnalytics();

  if (isLoading) return null;

  // The hook gates on `isPaidLicense`, so disconnected / Free
  // licenses never even fire it. Be defensive against a race
  // where the response returns before the SPA's license state
  // settles.
  const cycle = usageData?.cycleUsage;
  if (!cycle || cycle.kind !== "managed") return null;

  // This site's quota; the workspace aggregate only as the
  // back-compat fallback (identical on a single-site workspace).
  const usage =
    selectOwnActivationUsage(
      cycle,
      typeof window !== "undefined"
        ? window.structuraConfig?.activation_id
        : undefined,
    ) ?? cycle.workspace;
  const isOverQuota =
    usage.utilizationPercent >= 100 ||
    usage.tokensUsed > usage.tokensIncluded;
  const isApproaching = !isOverQuota && usage.utilizationPercent >= 80;
  if (!isOverQuota && !isApproaching) return null;

  if (isOverQuota) {
    return (
      <div className="mb-6">
        <Alert variant="warning">
          <TrendingUp />
          <Alert.Title>{__("Cycle quota reached", "structura")}</Alert.Title>
          <Alert.Description>
            {sprintf(
              /* translators: 1: tokens used (compact e.g. "1.2M"), 2: tokens included. */
              __(
                "This site has used %1$s of its %2$s included tokens. Generation is paused until the cycle resets — upgrade to keep posting.",
                "structura"
              ),
              formatTokens(usage.tokensUsed),
              formatTokens(usage.tokensIncluded)
            )}
          </Alert.Description>
          <Alert.Action>
            <Button size="sm" variant="secondary" onClick={() => navigate("/")}>
              {__("View usage", "structura")}
              <ArrowRight size={14} />
            </Button>
          </Alert.Action>
        </Alert>
      </div>
    );
  }

  // Approaching (≥80% but under quota).
  return (
    <div className="mb-6">
      <Alert variant="info">
        <Gauge />
        <Alert.Title>{__("Approaching cycle quota", "structura")}</Alert.Title>
        <Alert.Description>
          {sprintf(
            /* translators: 1: utilisation percent, 2: tokens used, 3: tokens included. */
            __(
              "This site has used %1$d%% of its cycle token budget (%2$s of %3$s). Generation pauses once the included amount is used up.",
              "structura"
            ),
            Math.round(usage.utilizationPercent),
            formatTokens(usage.tokensUsed),
            formatTokens(usage.tokensIncluded)
          )}
        </Alert.Description>
        <Alert.Action>
          <Button size="sm" variant="secondary" onClick={() => navigate("/")}>
            {__("View usage", "structura")}
            <ArrowRight size={14} />
          </Button>
        </Alert.Action>
      </Alert>
    </div>
  );
};

/**
 * Compact tokens label — mirrors the formatter on `IntelligenceUsage`.
 * Kept local rather than shared so the dashboard widget's display
 * convention can drift independently if the product decides to.
 */
function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "") + "M";
  }
  if (n >= 1_000) {
    return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "") + "K";
  }
  return n.toLocaleString();
}
