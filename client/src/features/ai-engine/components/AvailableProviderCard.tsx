import { __ } from "@wordpress/i18n";
import { Image, Lock, Plus, Type } from "lucide-react";
import { Button, cn } from "@structura/ui";
import { getProviderMeta } from "@/utils/providerMeta";
import { getProviderVisual } from "@/features/campaigns/constants";

/**
 * Why the card is locked. Drives badge copy and the lock-notice
 * styling.
 *
 * - `tier` — provider sits above the user's plan tier (e.g. Anthropic
 *   on a None / Free install). Existing behaviour — clicking opens
 *   `ProviderUpgradeDialog` with the "Requires <Tier> License" copy.
 * - `cap` — provider is available at this tier in principle, but the
 *   user has hit their per-tier provider count cap (Phase 1.8 §1.8.4 —
 *   None tier = 1 provider, Free tier = 2). The unlock path is "Get
 *   Free License" (or the next tier up); copy is reasoned by cap, not
 *   by the provider's own min_tier.
 */
export type ProviderLockReason = "tier" | "cap";

interface AvailableProviderCardProps {
  id: string;
  name: string;
  description: string;
  capabilities: Array<"text" | "image">;
  /** Whether this provider is available at the user's current tier. */
  available: boolean;
  /** Minimum tier required if locked. */
  minTier: string;
  /** Callback when the user clicks "Set Up". */
  onSetUp: () => void;
  /**
   * Why the card is locked. Defaults to `"tier"` for back-compat with
   * existing call sites. `"cap"` flips badge + capability-pill copy
   * to the per-tier-cap framing — see {@link ProviderLockReason}.
   */
  lockReason?: ProviderLockReason;
}

// Capability labels & tier labels are wrapped at render-time, not at
// module-init — `__()` needs @wordpress/i18n's locale data loaded, which
// isn't guaranteed at module scope in tests / SSR / other early callers.
const CAPABILITY_CONFIG = {
  text: {
    labelKey: "text" as const,
    icon: Type,
    classes:
      "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
  },
  image: {
    labelKey: "image" as const,
    icon: Image,
    classes:
      "bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800",
  },
} as const;

const capabilityLabel = (key: "text" | "image"): string =>
  key === "text" ? __("Text", "structura") : __("Image", "structura");

const tierLabel = (tier: string): string => {
  switch (tier) {
    case "none":
      return __("Starter", "structura");
    case "free":
      return __("Free License", "structura");
    case "byok":
      return __("Pro License", "structura");
    case "cloud":
      return __("Cloud License", "structura");
    case "cloud_pro":
      return __("Agency License", "structura");
    default:
      return tier;
  }
};

export const AvailableProviderCard = ({
  id,
  name,
  description,
  capabilities,
  available,
  minTier,
  onSetUp,
  lockReason = "tier",
}: AvailableProviderCardProps) => {
  const isLocked = !available;
  const isCapLock = isLocked && lockReason === "cap";
  const meta = getProviderMeta(id);

  // Cap-lock badge always points to the next paid surface for the
  // upgrade story (Free → BYOK ladder). The provider's own min_tier
  // is irrelevant in this branch — even a `min_tier: none` provider
  // is locked because the user hit the cap, not because the provider
  // requires more. Show the badge as "Free License" since the unlock
  // path from None tier (cap === 1) is the Free signup.
  const badgeTier = isCapLock ? "free" : minTier;

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-2xl border bg-white shadow-sm transition-all",
        "dark:bg-neutral-900",
        isLocked
          ? "border-neutral-200/60 dark:border-neutral-700/60"
          : "border-neutral-200 hover:border-neutral-300 hover:shadow-md dark:border-neutral-700 dark:hover:border-neutral-600"
      )}
    >
      <div className="flex flex-1 flex-col gap-4 p-5">
        {/* Top: icon + info */}
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl",
              "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
            )}
          >
            {(() => {
              const Icon = getProviderVisual(id).icon;
              return <Icon size={22} />;
            })()}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="m-0! truncate text-sm leading-tight font-bold text-neutral-900 dark:text-neutral-100">
                {name}
              </h3>
              {isLocked && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-600 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                  <Lock size={8} />
                  {tierLabel(badgeTier)}
                </span>
              )}
            </div>
            <p className="mt-0.5 mb-0! line-clamp-2 text-[11px] leading-relaxed text-neutral-400 dark:text-neutral-500">
              {description}
            </p>
          </div>
        </div>

        {/* Capability badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {capabilities.map((cap) => {
            const cfg = CAPABILITY_CONFIG[cap];
            if (!cfg) return null;
            const Icon = cfg.icon;
            return (
              <span
                key={cap}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase",
                  isLocked
                    ? "border-neutral-200 bg-neutral-50 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500"
                    : cfg.classes
                )}
              >
                <Icon size={10} />
                {capabilityLabel(cfg.labelKey)}
              </span>
            );
          })}
        </div>

        {/* Cap-lock helper line — explains WHY the card is locked
            even though the provider is technically available at this
            tier. Hidden on tier-locks; the badge above already
            communicates "Requires <Tier> License" there. Not shown
            for unlocked cards either. */}
        {isCapLock && (
          <p className="m-0! text-[11px] leading-relaxed text-neutral-400 dark:text-neutral-500">
            {__(
              "You've connected the maximum number of providers for your plan. Get a Free license to add another.",
              "structura",
            )}
          </p>
        )}

        {/* CTA */}
        <Button
          variant="secondary"
          size="sm"
          onClick={onSetUp}
          className="mt-auto w-full justify-center"
        >
          {isCapLock ? (
            <>
              <Lock size={14} className="mr-2" strokeWidth={2} />
              {__("Get Free License", "structura")}
            </>
          ) : (
            <>
              <Plus size={14} className="mr-2" strokeWidth={2} />
              {__("Connect", "structura")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
