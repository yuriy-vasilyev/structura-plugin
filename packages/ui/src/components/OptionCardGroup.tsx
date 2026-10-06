import React, { Fragment, useRef } from "react";
import { Check, Lock } from "lucide-react";
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
  /**
   * Decorative 32px tile shown before the label, e.g. a `PlatformMark`.
   * Replaces `icon` when both are set. Hidden from assistive tech: the
   * label names the card.
   */
  media?: React.ReactNode;
  /**
   * This option alone is unavailable: muted, not selectable, skipped by
   * the arrow keys, and marked with a lock where the check would go. Say
   * why in text near the group; the lock is not an explanation.
   */
  disabled?: boolean;
  /**
   * Rendered before this card as a separator inside the group, e.g. a
   * labelled hairline that starts a riskier tier of options.
   */
  divider?: React.ReactNode;
  /**
   * Extra content shown under the card while it is selected, inside the
   * card's frame but outside its radio button, so it may hold its own
   * controls (a confirmation checkbox). Hidden when another option is
   * selected.
   */
  detail?: React.ReactNode;
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
  /**
   * `"card"` (default) stacks icon, label and description in a grid cell.
   * `"row"` lays each option out as a single-column row: media or icon on
   * the left, label and description in the middle, check on the right,
   * 56px minimum height (the narrow-screen layout).
   */
  layout?: "card" | "row";
}

/**
 * OptionCardGroup — a grid of selectable option cards acting as a single
 * radio control (the "campaign mode" pickers across wp-admin and the
 * portal).
 *
 * Anatomy per card: optional left-aligned 16px icon or 32px media tile,
 * bold label, optional muted description, and a check on the selected
 * card (top-right in `"card"` layout, trailing in `"row"`). The check renders whenever the card is selected — selection is
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
  layout = "card",
}: OptionCardGroupProps<V>) {
  const row = layout === "row";
  // Arrow-key navigation must focus the card it just selected; DOM refs
  // beat querySelector here because the next index is already known from
  // the options array.
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !NAVIGATION_KEYS.includes(event.key)) return;
    event.preventDefault();

    // Per-option `disabled` cards are skipped; with none enabled, nothing moves.
    const enabled = options.flatMap((option, index) => (option.disabled ? [] : [index]));
    if (enabled.length === 0) return;

    let nextIndex: number;
    if (event.key === "Home") {
      nextIndex = enabled[0];
    } else if (event.key === "End") {
      nextIndex = enabled[enabled.length - 1];
    } else {
      const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      const position = enabled.indexOf(selectedIndex);
      nextIndex =
        position === -1
          ? enabled[0]
          : enabled[(position + delta + enabled.length) % enabled.length];
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
      className={cn(
        "grid gap-2",
        row ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-4",
        className
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const Icon = option.icon;
        const locked = !!option.disabled;
        // With a visible detail, the selected border and tint move to a
        // frame around card + detail so the two read as one card.
        const framed = selected && option.detail != null;
        const card = (
          <button
            ref={(el) => {
              cardRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled || locked}
            // Roving tabindex. Fallback: with no matching selection, the
            // first card stays tabbable so the group can't become
            // keyboard-unreachable.
            tabIndex={selected || (selectedIndex === -1 && index === 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative flex cursor-pointer rounded-xl border p-3 text-left transition-all duration-fast",
              // Spec: specs/article-delivery-connect-flow.md §10.2 (row layout).
              row ? "min-h-14 flex-row items-center gap-3" : "flex-col items-start gap-1.5",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
              "disabled:cursor-not-allowed disabled:opacity-55",
              framed
                ? "border-transparent"
                : selected
                  ? "border-brand-400 bg-brand-50/60 dark:border-brand-500/50 dark:bg-brand-500/10"
                  : // Dark borders one step lighter than a page card's (design guide
                    // §4 rule 3): the group also sits on neutral-800 dialogs, where
                    // a neutral-800 border vanished.
                    "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
            )}
          >
            {selected && !row && (
              <Check size={14} className="absolute top-2 right-2 text-brand-500" aria-hidden="true" />
            )}
            {option.media != null ? (
              <span
                data-slot="media"
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              >
                {option.media}
              </span>
            ) : (
              Icon && <Icon size={16} className={selected ? "text-brand-500" : "text-neutral-400"} />
            )}
            <span className={cn("flex min-w-0 flex-col gap-0.5", row && "flex-1")}>
              <span className="text-[12.5px] font-bold text-neutral-900 dark:text-white">
                {option.label}
              </span>
              {option.description != null && (
                // 12px neutral-500: the old 10px neutral-400 was 2.54:1
                // (specs/article-delivery-connect-flow.md §7).
                <span className="text-xs leading-snug text-neutral-500 dark:text-neutral-400">
                  {option.description}
                </span>
              )}
            </span>
            {selected && row && (
              <Check size={16} className="shrink-0 text-brand-500" aria-hidden="true" />
            )}
            {locked && (
              <Lock
                data-slot="locked"
                size={row ? 16 : 14}
                className={cn("shrink-0 text-neutral-400", !row && "absolute top-2 right-2")}
                aria-hidden="true"
              />
            )}
          </button>
        );
        return (
          <Fragment key={option.value}>
            {option.divider}
            {framed ? (
              <div
                data-slot="option-frame"
                className="rounded-xl border border-brand-400 bg-brand-50/60 dark:border-brand-500/50 dark:bg-brand-500/10"
              >
                {card}
                <div className="px-3 pb-3 motion-safe:animate-slide-in-bottom">{option.detail}</div>
              </div>
            ) : (
              card
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
