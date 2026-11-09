import { forwardRef, type ReactNode } from "react";
import { Check, Plus } from "lucide-react";
import { cn } from "../utils";

/** Props for {@link ToggleChip}. */
export interface ToggleChipProps {
  /** Whether the chip is on. Controlled: the parent owns it. */
  pressed: boolean;
  /** Called with the state a click asks for (`!pressed`). */
  onPressedChange: (next: boolean) => void;
  /** The phrase on the chip. Names the button unless `aria-label` is given. */
  children: ReactNode;
  /** Dims the chip and ignores clicks. */
  disabled?: boolean;
  /** Extra classes for the chip. */
  className?: string;
  /** Accessible name when the visible phrase needs context ("Add “Soft window light” to Technique"). */
  "aria-label"?: string;
}

/**
 * ToggleChip: a pill toggle button (`aria-pressed`) for adding a phrase to a
 * field, as in the visual-signature builder's chip rows.
 *
 * Off is DiscoverableChipList's dashed suggestion chip with a trailing plus;
 * on is solid brand tint with a trailing check, so the state never rests on
 * colour alone. 28px tall, 32px below the `sm` breakpoint for touch.
 *
 * Spec: specs/visual-signatures.md §8; visual-signatures handoff §3.5 "Chip",
 * §6 dark.
 */
export const ToggleChip = forwardRef<HTMLButtonElement, ToggleChipProps>(
  ({ pressed, onPressedChange, children, disabled, className, "aria-label": ariaLabel }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={pressed}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex min-h-7 cursor-pointer items-center gap-[5px] rounded-full border px-[11px] py-[3px] text-xs leading-[1.3] max-sm:min-h-8",
        "duration-fast transition-colors ease-out",
        "focus-visible:ring-brand-500 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900",
        "disabled:cursor-not-allowed disabled:opacity-50",
        pressed
          ? "border-brand-200 bg-brand-50 text-brand-800 enabled:hover:border-brand-400 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-200 border-solid"
          : "enabled:hover:border-brand-400 enabled:hover:text-brand-700 dark:enabled:hover:text-brand-200 border-dashed border-neutral-300 bg-white text-neutral-700 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-300",
        className
      )}
    >
      {children}
      {pressed ? (
        <Check size={12} strokeWidth={2.5} aria-hidden="true" className="shrink-0" />
      ) : (
        <Plus
          size={12}
          aria-hidden="true"
          className="shrink-0 text-neutral-500 dark:text-neutral-400"
        />
      )}
    </button>
  )
);
ToggleChip.displayName = "ToggleChip";
