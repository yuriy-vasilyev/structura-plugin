import { __ } from "@wordpress/i18n";
import { Image, Plus, Type } from "lucide-react";
import { Button, cn, RecommendedLabel } from "@structura/ui";
import { providerRecommendationLabel } from "@/features/campaigns/aiGuidance";
import { getProviderVisual } from "@/features/campaigns/constants";

interface AvailableProviderCardProps {
  id: string;
  name: string;
  description: string;
  /** What the provider can do, whatever the plan (owner review 2026-10-06). */
  capabilities: Array<"text" | "image">;
  /** Callback when the user clicks "Connect". */
  onSetUp: () => void;
}

/*
 * 2026-10-06 (specs/open-providers.md): every plan, anonymous included, may
 * connect every provider. The tier lock ("Needs a Pro License" + "Compare
 * plans") and the per-plan count lock ("Get Free License") that this card
 * rendered until then were deleted with that decision.
 */

// Capability labels are wrapped at render-time, not at
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

export const AvailableProviderCard = ({
  id,
  name,
  description,
  capabilities,
  onSetUp,
}: AvailableProviderCardProps) => {
  const recommendation = providerRecommendationLabel(id);

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-2xl border bg-white shadow-sm transition-all",
        "dark:bg-neutral-900",
        "border-neutral-200 hover:border-neutral-300 hover:shadow-md dark:border-neutral-700 dark:hover:border-neutral-600"
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
            <div className="flex flex-wrap items-center gap-2 gap-y-1">
              <h3 className="m-0! truncate text-sm leading-tight font-bold text-neutral-900 dark:text-neutral-100">
                {name}
              </h3>
              {recommendation && <RecommendedLabel label={recommendation} />}
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
                  cfg.classes
                )}
              >
                <Icon size={10} />
                {capabilityLabel(cfg.labelKey)}
              </span>
            );
          })}
        </div>

        {/* CTA */}
        <Button
          variant="secondary"
          size="sm"
          onClick={onSetUp}
          className="mt-auto w-full justify-center"
        >
          <Plus size={14} className="mr-2" strokeWidth={2} />
          {__("Connect", "structura")}
        </Button>
      </div>
    </div>
  );
};
