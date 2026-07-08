import { __, sprintf } from "@wordpress/i18n";
import { Card, cn } from "@structura/ui";
import {
  selectOwnActivationUsage,
  useUsageAnalytics,
} from "@/features/dashboard/api/useUsageAnalytics";
import type { CycleUsageView } from "@/features/dashboard/api/useUsageAnalytics";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

/**
 * Dashboard "Cycle usage" widget — per-activation quota model.
 *
 * Reads `cycleUsage` from `getUsageAnalytics` and renders one of three
 * branches off the discriminator:
 *
 *   - `managed` — Cloud / Cloud Pro: THIS SITE's token+image progress
 *     against its per-activation cap. Quotas are per activation (the
 *     generation gate hard-blocks each site independently — there is
 *     no shared workspace token pool), so wp-admin shows only the
 *     current activation; the multi-site rollup with per-site rows
 *     lives in the customer portal, which manages the whole
 *     workspace. The amber rail fires at 80% utilization to flag the
 *     squeeze. (A 2026-06 regression briefly rendered the portal's
 *     workspace-aggregate view here, implying a 2M "pool" that
 *     doesn't exist.)
 *   - `byok`    — BYOK / Free: post + token + image totals, no quota
 *     framing (customer pays the AI provider directly).
 *   - `none`    — license inactive: surface the reason; CTA is handled
 *     by the higher-level connection banner.
 */
export const IntelligenceUsage = () => {
  const { data: usageData, isLoading } = useUsageAnalytics();

  if (isLoading) {
    return (
      <Card className="animate-pulse rounded-lg border-l-4 border-l-gray-200 p-6! shadow-sm dark:border-l-neutral-700 dark:bg-neutral-900">
        <div className="mb-4 h-3 w-24 rounded bg-gray-200 dark:bg-neutral-700" />
        <div className="h-8 w-48 rounded bg-gray-200 dark:bg-neutral-700" />
      </Card>
    );
  }

  if (!usageData?.cycleUsage) {
    return (
      <Card className="rounded-lg border-l-4 border-l-red-500 p-6! shadow-sm dark:bg-neutral-900">
        <p className="m-0! text-sm font-medium text-red-600 dark:text-red-400">
          {__("Unable to load usage data. Please try again later.", "structura")}
        </p>
      </Card>
    );
  }

  const cycle = usageData.cycleUsage;
  if (cycle.kind === "managed") return <ManagedCycleCard cycle={cycle} />;
  if (cycle.kind === "byok") return <ByokCycleCard cycle={cycle} />;
  return <NoneCycleCard reason={cycle.reason} />;
};

/* ------------------------------------------------------------------ */
/*  Branch: managed (Cloud / Cloud Pro)                                */
/* ------------------------------------------------------------------ */

const ManagedCycleCard = ({
  cycle,
}: {
  cycle: Extract<CycleUsageView, { kind: "managed" }>;
}) => {
  // wp-admin is a single-site surface: render THIS activation's quota.
  // Fall back to the workspace aggregate when the row can't be matched
  // (old plugin build without `activation_id`, or a view built without
  // activation docs) — identical numbers on a single-site workspace.
  const own = selectOwnActivationUsage(
    cycle,
    typeof window !== "undefined"
      ? window.structuraConfig?.activation_id
      : undefined,
  );
  const usage = own ?? cycle.workspace;
  const isAtLimit = usage.utilizationPercent >= 100;
  const isNearingLimit = usage.utilizationPercent >= 80 && !isAtLimit;
  const cycleEndsAt = dayjs(cycle.cycleResetsAt);

  return (
    <Card
      className={cn(
        "rounded-lg border-l-4 p-6! shadow-sm transition-all duration-500 dark:bg-neutral-900",
        isAtLimit
          ? "border-l-red-500"
          : isNearingLimit
            ? "border-l-amber-500"
            : "border-l-purple-500",
      )}
    >
      <div className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="m-0! text-[10px] font-bold tracking-widest text-gray-400 uppercase">
              {__("Cycle Usage", "structura")}
            </p>
            <p className="m-0! text-[10px] font-medium text-purple-600/60 lowercase italic">
              {sprintf(
                /* translators: %s = humanized time until cycle reset, e.g. "in 12 days". */
                __("Resets %s", "structura"),
                cycleEndsAt.fromNow(),
              )}
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
              isAtLimit
                ? "bg-red-100 text-red-700"
                : isNearingLimit
                  ? "bg-amber-100 text-amber-700"
                  : "bg-purple-50 text-purple-700",
            )}
          >
            {sprintf(
              /* translators: %d = utilization percent, 0–100. */
              __("%d%% Used", "structura"),
              usage.utilizationPercent,
            )}
          </span>
        </div>

        <h2 className="mt-0! text-3xl font-black tracking-tight text-gray-900 dark:text-white">
          {formatTokens(usage.tokensUsed)}
          <span className="text-sm font-medium text-gray-400">
            {" "}
            /{" "}
            {formatTokens(usage.tokensIncluded)}{" "}
            {__("tokens", "structura")}
          </span>
        </h2>

        <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-neutral-800">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-1000 ease-out",
              isAtLimit
                ? "bg-red-500"
                : isNearingLimit
                  ? "bg-amber-500"
                  : "bg-purple-500",
            )}
            style={{ width: `${Math.min(100, usage.utilizationPercent)}%` }}
          />
        </div>

        {/* Image quota — same per-activation scope as the token bar.
            Lived on the per-site rows before those moved to the
            portal; this site's count belongs on its own card. */}
        <p className="m-0! text-xs text-gray-400">
          {sprintf(
            /* translators: 1: images used, 2: images included */
            __("%1$d / %2$d images this cycle", "structura"),
            usage.imagesUsed,
            usage.imagesIncluded,
          )}
        </p>
      </div>
    </Card>
  );
};

/** Compact tokens label: 1.2M / 850K / 12,500 */
function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "") + "M";
  }
  if (n >= 1_000) {
    return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "") + "K";
  }
  return n.toLocaleString();
}

/* ------------------------------------------------------------------ */
/*  Branch: byok (BYOK / Free)                                          */
/* ------------------------------------------------------------------ */

const ByokCycleCard = ({
  cycle,
}: {
  cycle: Extract<CycleUsageView, { kind: "byok" }>;
}) => {
  return (
    <Card className="rounded-lg border-l-4 border-l-brand-500 p-6! shadow-sm dark:bg-neutral-900">
      <p className="mt-0! mb-1! text-[10px] font-bold tracking-widest text-gray-400 uppercase">
        {__("Cycle Usage", "structura")}
      </p>
      <div className="flex items-baseline gap-2">
        <h2 className="m-0! text-3xl! font-black! text-neutral-900 dark:text-white">
          {cycle.postsUsed.toLocaleString()}
        </h2>
        <span className="text-sm text-gray-400">
          {__("posts this cycle", "structura")}
        </span>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
          {__("BYOK", "structura")}
        </span>
      </div>
      <p className="mt-4! mb-0! font-mono text-xs text-gray-500 dark:text-gray-400">
        {sprintf(
          /* translators: 1: token count, 2: image count. */
          __("%1$s tokens · %2$s images this cycle", "structura"),
          cycle.tokensUsed.toLocaleString(),
          cycle.imagesUsed.toLocaleString(),
        )}
      </p>
    </Card>
  );
};

/* ------------------------------------------------------------------ */
/*  Branch: none (license inactive)                                     */
/* ------------------------------------------------------------------ */

const NoneCycleCard = ({ reason: _reason }: { reason: string }) => {
  // The connection banner higher in the layout already explains
  // the disconnect + offers a CTA. This card just renders a calm
  // empty state so the dashboard layout doesn't shift.
  return (
    <Card className="rounded-lg border-l-4 border-l-gray-300 p-6! shadow-sm dark:border-l-neutral-700 dark:bg-neutral-900">
      <p className="m-0! text-[10px] font-bold tracking-widest text-gray-400 uppercase">
        {__("Cycle Usage", "structura")}
      </p>
      <p className="mt-2! mb-0! text-sm text-gray-500 dark:text-gray-400">
        {__(
          "Connect a license to start tracking your monthly usage.",
          "structura",
        )}
      </p>
    </Card>
  );
};

