import React, { useRef } from "react";
import { Check } from "lucide-react";
import { cn } from "../utils";

/** Keys the radiogroup handles for roving selection. */
const NAVIGATION_KEYS = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];

/**
 * One selectable card in an {@link OptionCardGroup}.
 *
 * Copy/i18n belongs to the consuming app — pass already-translated
 * strings; the ui package ships no copy.
 */
export interface OptionCardOption<V extends string = string> {
  /** The value this card represents within the group. */
  value: V;
  /** Card label (bold, always shown). */
  label: string;
  /** Optional muted one-liner under the label. */
  description?: string;
  /** Lucide icon component (or any 16px-capable component). */
  icon?: React.ComponentType<{ size?: number | string; className?: string }>;
}

/**
 * Props for {@link OptionCardGroup}.
 */
export interface OptionCardGroupProps<V extends string = string> {
  /** Cards to render, in order. */
  options: ReadonlyArray<OptionCardOption<V>>;
  /** Currently selected value. */
  value: V;
  /** Invoked with the newly selected value (click or arrow keys). */
  onChange: (value: V) => void;
  /** Accessible name for the radiogroup (the visible section heading's text). */
  ariaLabel: string;
  /** Grid columns — default "grid-cols-2 sm:grid-cols-4" to match all current sites. */
  className?: string;
  /** Disables every card and the group's keyboard navigation. */
  disabled?: boolean;
}

/**
 * OptionCardGroup — a grid of selectable option cards acting as a single
 * radio control (the "campaign mode" pickers across wp-admin and the
 * portal).
 *
 * Anatomy per card: optional left-aligned 16px icon, bold label,
 * optional muted description, and a top-right check on the selected
 * card. The check renders whenever the card is selected — selection is
 * never conveyed by color alone.
 *
 * Keyboard contract (standard radiogroup): Right/Down and Left/Up move
 * selection (wrapping), Home/End jump to the edges, and moving both
 * selects (calls `onChange`) and focuses the new card — radios select on
 * focus. Roving tabindex keeps exactly one card in the tab order.
 *
 * @remarks
 * `value` may transiently match no option (e.g. a form field that is
 * unset until an earlier step fills it). The group then renders fully
 * unselected but keeps its first card tabbable so it can't become
 * keyboard-unreachable.
 */
export function OptionCardGroup<V extends string = string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  disabled,
}: OptionCardGroupProps<V>) {
  // Arrow-key navigation must focus the card it just selected; DOM refs
  // beat querySelector here because the next index is already known from
  // the options array.
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !NAVIGATION_KEYS.includes(event.key)) return;
    event.preventDefault();

    let nextIndex: number;
    if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = options.length - 1;
    } else {
      const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      nextIndex =
        selectedIndex === -1 ? 0 : (selectedIndex + delta + options.length) % options.length;
    }

    const next = options[nextIndex];
    if (!next) return;
    if (next.value !== value) onChange(next.value);
    cardRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", className)}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            ref={(el) => {
              cardRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            // Roving tabindex. Fallback: with no matching selection, the
            // first card stays tabbable so the group can't become
            // keyboard-unreachable.
            tabIndex={selected || (selectedIndex === -1 && index === 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative flex cursor-pointer flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all duration-fast",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
              "disabled:cursor-not-allowed disabled:opacity-55",
              selected
                ? "border-brand-400 bg-brand-50/60 dark:border-brand-500/50 dark:bg-brand-500/10"
                : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700"
            )}
          >
            {selected && (
              <Check size={14} className="absolute top-2 right-2 text-brand-500" aria-hidden="true" />
            )}
            {Icon && <Icon size={16} className={selected ? "text-brand-500" : "text-neutral-400"} />}
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[12.5px] font-bold text-neutral-900 dark:text-white">
                {option.label}
              </span>
              {option.description != null && (
                <span className="text-[10px] leading-snug text-neutral-400 dark:text-neutral-500">
                  {option.description}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
