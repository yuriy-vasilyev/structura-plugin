import React, { createContext, forwardRef, useContext } from "react";
import { Check } from "lucide-react";
import { cn } from "../utils";

type PresetRadioCardGroupContextValue = {
  value?: string;
  onValueChange: (value: string) => void;
};

const PresetRadioCardGroupContext = createContext<PresetRadioCardGroupContextValue | null>(null);

const usePresetRadioCardGroupContext = () => {
  const context = useContext(PresetRadioCardGroupContext);
  if (!context) {
    throw new Error("PresetRadioCard must be used within a PresetRadioCardGroup.");
  }
  return context;
};

/** Keys the radiogroup handles for roving selection. */
const NAVIGATION_KEYS = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];

export interface PresetRadioCardGroupProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Currently selected card value. */
  value?: string;
  /** Invoked with the newly selected card's value (click or arrow keys). */
  onValueChange: (value: string) => void;
}

/**
 * PresetRadioCardGroup — `role="radiogroup"` container for
 * {@link PresetRadioCard} thumbnail cards.
 *
 * Implements the standard radiogroup keyboard contract: Left/Up and
 * Right/Down move selection (wrapping), Home/End jump to the edges, and
 * moving both focuses and selects (radios select on focus). Disabled
 * cards are skipped.
 *
 * Defaults to the handoff's 3-up grid (`grid-cols-3 gap-2.5`); override
 * via `className` for other densities. Label it with `aria-label` or
 * `aria-labelledby` — the primitive ships no copy.
 *
 * @remarks
 * Navigation discovers radios from the DOM rather than a registration
 * context, so cards can be wrapped/conditional without extra plumbing.
 */
export const PresetRadioCardGroup = forwardRef<HTMLDivElement, PresetRadioCardGroupProps>(
  ({ value, onValueChange, className, onKeyDown, children, ...props }, ref) => {
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || !NAVIGATION_KEYS.includes(event.key)) return;

      const radios = Array.from(
        event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      ).filter((radio) => !radio.disabled);
      if (radios.length === 0) return;

      const active = (event.target as HTMLElement).closest<HTMLButtonElement>('[role="radio"]');
      const currentIndex = active ? radios.indexOf(active) : -1;

      let nextIndex: number;
      if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = radios.length - 1;
      } else {
        const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
        nextIndex =
          currentIndex === -1 ? 0 : (currentIndex + delta + radios.length) % radios.length;
      }

      event.preventDefault();
      radios[nextIndex].focus();
      // Radios select on focus-by-arrow; `click()` routes through the
      // card's own handler so controlled state stays the single source.
      radios[nextIndex].click();
    };

    return (
      <PresetRadioCardGroupContext.Provider value={{ value, onValueChange }}>
        <div
          ref={ref}
          role="radiogroup"
          className={cn("grid grid-cols-3 gap-2.5", className)}
          onKeyDown={handleKeyDown}
          {...props}
        >
          {children}
        </div>
      </PresetRadioCardGroupContext.Provider>
    );
  }
);
PresetRadioCardGroup.displayName = "PresetRadioCardGroup";

export interface PresetRadioCardProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value" | "name"> {
  /** The value this card represents within the group. */
  value: string;
  /** Card title (12/700). Copy/i18n belongs to the consuming app. */
  name: React.ReactNode;
  /** One-line descriptor under the title (10px). */
  description?: React.ReactNode;
  /** Static thumbnail image for the 9:16 sample area. */
  thumbnailSrc?: string;
  /**
   * Alt text for `thumbnailSrc`. Defaults to `""` (decorative) — the
   * card's `name`/`description` already convey the choice.
   */
  thumbnailAlt?: string;
  /**
   * Render slot for the thumbnail area — takes precedence over
   * `thumbnailSrc` (e.g. a live caption-style sample built from markup).
   */
  thumbnail?: React.ReactNode;
}

/**
 * PresetRadioCard — a thumbnail radio card (visual-style preset picker).
 *
 * Video-channel handoff §2: h-24 rounded-lg thumbnail area, 12/700 name
 * row with a check icon when selected, 10px descriptor. Selected cards
 * get the brand border + tint + soft `shadow-glow-brand` in light mode
 * and `border-brand-400 bg-brand-500/10` in dark.
 *
 * Must be rendered inside a {@link PresetRadioCardGroup}.
 */
export const PresetRadioCard = forwardRef<HTMLButtonElement, PresetRadioCardProps>(
  (
    {
      value,
      name,
      description,
      thumbnailSrc,
      thumbnailAlt = "",
      thumbnail,
      className,
      onClick,
      ...props
    },
    ref
  ) => {
    const group = usePresetRadioCardGroupContext();
    const checked = group.value === value;
    // Roving tabindex. Fallback: with no selection yet, every card is
    // tabbable so the group can't become keyboard-unreachable.
    const tabIndex = group.value == null ? 0 : checked ? 0 : -1;

    return (
      <button
        ref={ref}
        type="button"
        role="radio"
        aria-checked={checked}
        tabIndex={tabIndex}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) group.onValueChange(value);
        }}
        className={cn(
          "group rounded-xl border p-2 text-left transition-all duration-fast ease-out",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
          "disabled:cursor-not-allowed disabled:opacity-55",
          checked
            ? "border-brand-600 bg-brand-50/60 shadow-glow-brand dark:border-brand-400 dark:bg-brand-500/10"
            : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600",
          className
        )}
        {...props}
      >
        <span className="block h-24 w-full overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
          {thumbnail ??
            (thumbnailSrc ? (
              <img src={thumbnailSrc} alt={thumbnailAlt} className="h-full w-full object-cover" />
            ) : null)}
        </span>
        <span className="mt-2 flex items-center justify-between gap-1">
          <span className="truncate text-xs font-bold text-neutral-900 dark:text-neutral-100">
            {name}
          </span>
          {checked && (
            <Check
              className="size-[13px] shrink-0 text-brand-600 dark:text-brand-400"
              aria-hidden="true"
            />
          )}
        </span>
        {description != null && (
          <span className="mt-0.5 block text-[10px] leading-snug text-neutral-500 dark:text-neutral-400">
            {description}
          </span>
        )}
      </button>
    );
  }
);
PresetRadioCard.displayName = "PresetRadioCard";
