import { FC } from "react";
import { __ } from "@wordpress/i18n";
import { AlertTriangle, Check, ChevronDown } from "lucide-react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { cn, Tooltip } from "@structura/ui";
import { AIProvider } from "@/features/campaigns/types";
import { getProviderVisual } from "@/features/campaigns/constants";
import { useDefaultProviders } from "@/features/settings";

interface ProviderPillProps {
  /** Currently active provider. */
  provider: AIProvider;
  /** Called when the user picks a different provider. */
  onProviderChange?: (provider: AIProvider) => void;
  /** Override: force showing the picker even when defaults exist. */
  forceInteractive?: boolean;
  /** Additional class names for the wrapper. */
  className?: string;
}

// Provider visuals — delegates to shared PROVIDER_VISUALS via getProviderVisual()

/**
 * Compact provider dropdown selector.
 *
 * Visibility rules:
 * - Managed-tier (Cloud/Agency) with multiple providers → ALWAYS shown.
 *   The pricing copy promises per-campaign provider switching ("Gemini
 *   Flash by default. Swap to OpenAI or Claude per post"), and the cloud
 *   honors the campaign's textProvider regardless of saved defaults. The
 *   default is the *starting point*, not a lock-in. Pre-2026-04-28 we
 *   hid the pill once explicit defaults were saved, which silently took
 *   away the per-campaign swap users explicitly paid for.
 * - BYOK with multiple providers + no explicit default → shown so users
 *   can pick. With an explicit default, hidden (the saved default is the
 *   user's already-chosen single provider — switching means setting a
 *   new default).
 * - Single provider or none → hidden.
 */
export const ProviderPill: FC<ProviderPillProps> = ({
  provider,
  onProviderChange,
  forceInteractive = false,
  className,
}) => {
  const {
    hasExplicitDefaults,
    hasMultipleProviders,
    availableProviders,
    isProviderIncomplete,
    isCloud,
  } = useDefaultProviders();

  const meta = getProviderVisual(provider);
  const Icon = meta.icon;
  const incomplete = isProviderIncomplete(provider);

  // BYOK only — hide when defaults are set (they're used silently).
  // Managed tiers always see the pill so per-campaign swaps stay one
  // click away.
  if (hasExplicitDefaults && !isCloud && !forceInteractive) return null;

  // Single provider or no providers — nothing to show
  if (!hasMultipleProviders && !forceInteractive) return null;

  const isInteractive = hasMultipleProviders && !!onProviderChange;

  // Non-interactive static pill (fallback)
  if (!isInteractive) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50/50 px-2.5 py-1 text-[10px] font-bold uppercase text-brand-600 dark:border-brand-800 dark:bg-brand-950/30 dark:text-brand-400",
          className
        )}
      >
        <Icon size={10} />
        {meta.label}
      </span>
    );
  }

  return (
    <Listbox
      value={provider}
      onChange={(val) => onProviderChange?.(val as AIProvider)}
    >
      <div className={cn("relative", className)}>
        <ListboxButton
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase transition-all",
            incomplete
              ? "border-amber-300 bg-amber-50/50 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-950/50"
              : "border-brand-200 bg-brand-50/50 text-brand-600 hover:bg-brand-50 dark:border-brand-800 dark:bg-brand-950/30 dark:text-brand-400 dark:hover:bg-brand-950/50"
          )}
        >
          <Icon size={10} />
          {meta.label}
          {incomplete && <AlertTriangle size={9} className="text-amber-500 dark:text-amber-400" />}
          <ChevronDown size={8} className="ml-0.5 opacity-60" />
        </ListboxButton>

        <ListboxOptions
          anchor="bottom end"
          transition
          className="z-50 mt-1 min-w-[160px] overflow-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-xl transition duration-100 ease-in focus:outline-none data-leave:data-closed:opacity-0 dark:border-neutral-700 dark:bg-neutral-900 dark:ring-1 dark:ring-white/[0.04]"
        >
          {availableProviders.map((slug) => {
            const itemMeta = getProviderVisual(slug);
            const ItemIcon = itemMeta.icon;
            const itemIncomplete = isProviderIncomplete(slug);

            const option = (
              <ListboxOption
                key={slug}
                value={slug}
                disabled={itemIncomplete}
                className={cn(
                  "group relative rounded-lg py-2 pr-4 pl-9 transition-colors select-none",
                  itemIncomplete
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer text-neutral-700 data-focus:bg-neutral-100 data-focus:text-neutral-900 dark:text-neutral-300 dark:data-focus:bg-neutral-800 dark:data-focus:text-white"
                )}
              >
                <div className="flex items-center gap-2">
                  <ItemIcon size={12} className={cn("shrink-0", itemIncomplete ? "text-neutral-300 dark:text-neutral-600" : "text-neutral-400 group-data-selected:text-brand-500 dark:group-data-selected:text-brand-400")} />
                  <span className={cn("text-xs font-bold", itemIncomplete ? "text-neutral-400 dark:text-neutral-500" : "group-data-selected:text-brand-600 dark:group-data-selected:text-brand-400")}>
                    {itemMeta.label}
                  </span>
                  {itemIncomplete && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                      <AlertTriangle size={8} />
                      {__("Setup", "structura")}
                    </span>
                  )}
                </div>
                <span className="invisible absolute inset-y-0 left-0 flex items-center pl-2.5 text-brand-500 group-data-selected:visible">
                  <Check size={12} strokeWidth={3} />
                </span>
              </ListboxOption>
            );

            return itemIncomplete ? (
              <Tooltip
                key={slug}
                title={__("Complete model setup in AI Engine settings before using this provider", "structura")}
                position="left"
              >
                {option}
              </Tooltip>
            ) : option;
          })}
        </ListboxOptions>
      </div>
    </Listbox>
  );
};
