import { FC, useState } from "react";
import { __ } from "@wordpress/i18n";
import { Button, cn } from "@structura/ui";
import { Wand2 } from "lucide-react";

import { useDefaultProviders } from "@/features/settings";
import { AIProvider } from "@/features/campaigns/types";
import { ProviderPill } from "./ProviderPill";
import { MagicSuggestProgress } from "./MagicSuggestProgress";

/**
 * Compact "magic suggest" trigger — replaces the legacy
 * `SuggestStrategySection` repeater for campaign / topic_chips contexts
 * where the cloud now auto-detects everything it needs.
 *
 * The pre-2026-04-28 design forced users to paste reference URLs
 * (homepage, features pages, design docs) into a repeater field before
 * we'd run the suggestion. The plugin now emits `homepage_url` and
 * auto-detected `landing_urls[]` from the primary nav menu, and the
 * cloud Jina-scrapes them — there's nothing left for the user to type
 * in for these flows.
 *
 * Visual mode keeps the repeater (`SuggestStrategySection`) because the
 * logo + brand-guidelines URLs genuinely can't be auto-detected when WP
 * `custom_logo` isn't set. This component is the campaign equivalent.
 */
interface MagicSuggestButtonProps {
  /** True while the cloud call is in flight — drives the staged progress display. */
  isLoading: boolean;
  /**
   * Invoked when the user triggers the suggestion. Caller passes the
   * selected provider into its own `useMagicSuggest()` call.
   */
  onTrigger: (provider: AIProvider) => void;
  /** Button copy — varies by surface ("Suggest Strategy", "Generate Persona"…). */
  ctaLabel: string;
  /**
   * Optional sub-label shown next to the icon — sets expectations
   * about *what* will be generated. Kept short (<60 chars) so the
   * button stays scannable.
   */
  subLabel?: string;
  className?: string;
}

export const MagicSuggestButton: FC<MagicSuggestButtonProps> = ({
  isLoading,
  onTrigger,
  ctaLabel,
  subLabel,
  className,
}) => {
  const { defaultTextProvider } = useDefaultProviders();

  const [providerOverride, setProviderOverride] = useState<AIProvider | null>(null);
  const activeProvider = providerOverride ?? defaultTextProvider;

  // Every plan since 2026-10-06 (specs/open-providers.md §8); until then
  // none/free saw a disabled "available on Pro and above" hint here.
  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-100 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-800/20",
        className
      )}
    >
      {!isLoading ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Button
              size="sm"
              onClick={() => onTrigger(activeProvider)}
              disabled={isLoading}
              className="from-brand-600 shadow-brand-600/15 bg-gradient-to-r to-purple-600 font-bold shadow-sm"
            >
              <Wand2 size={14} className="mr-1.5" />
              {ctaLabel}
            </Button>
            {subLabel && (
              <p className="mt-1.5! mb-0! text-[10px] text-neutral-400 dark:text-neutral-500">
                {subLabel}
              </p>
            )}
          </div>
          <ProviderPill provider={activeProvider} onProviderChange={setProviderOverride} />
        </div>
      ) : (
        <MagicSuggestProgress isLoading={isLoading} variant="panel" />
      )}
    </div>
  );
};
