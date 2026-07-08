import { cn, Switch } from "@structura/ui";
import { __, sprintf } from "@wordpress/i18n";

interface SelectionCardProps<T> {
  id: T;
  label: string;
  isEnabled: boolean;
  onToggle: (id: T) => void;
  hasProAccess?: boolean;
  hasFreeAccess?: boolean;
  description?: string;
  isPro?: boolean;
  isFree?: boolean;
  isRequired?: boolean;
  /**
   * External disable override, independent of tier-locking — e.g. image
   * generation when the uploads dir isn't writable. Renders the card
   * disabled without implying a license/Pro lock.
   */
  disabled?: boolean;
}

/**
 * SelectionCard — toggleable feature card with tier-locking.
 *
 * Design-guide aligned:
 * - rounded-xl border, design-system transitions
 * - Active state uses brand-* ring glow (not flat indigo)
 * - Inline badges use rounded-full (pill) to match Badge component
 * - Full dark mode support
 */
export const SelectionCard = <T extends string | number>({
  id,
  label,
  description,
  isPro,
  isFree,
  isRequired,
  isEnabled,
  hasProAccess = false,
  hasFreeAccess = false,
  disabled = false,
  onToggle,
}: SelectionCardProps<T>) => {
  const isRegistrationLocked = isFree && !hasFreeAccess;
  const isProLocked = isPro && !hasProAccess;
  const isDisabled = isRegistrationLocked || isProLocked || isRequired || disabled;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-xl border p-4",
        "transition-all duration-normal ease-out",
        // Background
        isDisabled && !isRequired
          ? "bg-neutral-50/50 grayscale-[0.5] dark:bg-neutral-900/50"
          : "bg-white dark:bg-neutral-900",
        // Border — active glow when enabled
        isEnabled && !isDisabled
          ? "border-brand-600/30 shadow-sm ring-1 ring-brand-600/10 dark:border-brand-500/30 dark:ring-brand-500/10"
          : "border-neutral-200 dark:border-neutral-700",
        // Hover — only if not disabled
        !isDisabled && "hover:border-brand-300 hover:shadow-sm dark:hover:border-brand-500/40"
      )}
    >
      <div className="flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs font-bold transition-colors",
              isEnabled && !isDisabled
                ? "text-neutral-900 dark:text-white"
                : "text-neutral-700 dark:text-neutral-300"
            )}
          >
            {label}
          </span>

          {isRequired && (
            <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[8px] font-black tracking-tight text-neutral-500 uppercase dark:bg-neutral-800 dark:text-neutral-400">
              {__("Required", "structura")}
            </span>
          )}

          {isRegistrationLocked && (
            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-black text-emerald-600 uppercase dark:bg-emerald-950/30 dark:text-emerald-400">
              {__("Free License", "structura")}
            </span>
          )}

          {isProLocked && (
            <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[8px] font-black text-brand-600 uppercase dark:bg-brand-950/30 dark:text-brand-400">
              {__("Pro", "structura")}
            </span>
          )}
        </div>

        {description && (
          <p className="m-0! text-[10px]! leading-snug text-neutral-500 dark:text-neutral-400">
            {description}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center">
        <Switch
          label={sprintf(__("Toggle %s", "structura"), label)}
          hiddenLabel
          checked={!!(isEnabled || isRequired)}
          onChange={() => !isDisabled && onToggle(id)}
          disabled={isDisabled}
        />
      </div>
    </div>
  );
};
