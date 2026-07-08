import { FC, useState } from "react";
import { __ } from "@wordpress/i18n";
import { Button, cn } from "@structura/ui";
import { Wand2 } from "lucide-react";

import { useLicense, useDefaultProviders } from "@/features/settings";
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
  const { isPaidLicense } = useLicense();

  const [providerOverride, setProviderOverride] = useState<AIProvider | null>(null);
  const activeProvider = providerOverride ?? defaultTextProvider;

  if (!isPaidLicense) {
    // Free tier doesn't get cloud-powered suggestions; render a
    // disabled hint button so the affordance is still discoverable.
    return (
      <div
        className={cn(
          "flex items-center justify-between rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/40",
          className,
        )}
      >
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {__("Magic suggestions are available on Pro and above.", "structura")}
        </span>
        <span className="rounded-md bg-brand-100 px-1.5 py-0.5 text-[8px] font-black tracking-wider text-brand-600 uppercase dark:bg-brand-950/30 dark:text-brand-400">
          {__("Pro", "structura")}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-100 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-800/20",
        className,
      )}
    >
      {!isLoading ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Button
              size="sm"
              onClick={() => onTrigger(activeProvider)}
              disabled={isLoading}
              className="bg-gradient-to-r from-brand-600 to-purple-600 font-bold shadow-sm shadow-brand-600/15"
            >
              <Wand2 size={14} className="mr-1.5" />
              {ctaLabel}
            </Button>
            {subLabel && (
              <p className="m-0! mt-1.5 text-[10px] text-neutral-400 dark:text-neutral-500">
                {subLabel}
              </p>
            )}
          </div>
          <ProviderPill
            provider={activeProvider}
            onProviderChange={setProviderOverride}
          />
        </div>
      ) : (
        <MagicSuggestProgress isLoading={isLoading} variant="panel" />
      )}
    </div>
  );
};
