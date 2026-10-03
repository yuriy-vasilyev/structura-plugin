import { BadgeCheck } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "../utils";

/** Props for {@link RecommendedLabel}. */
export interface RecommendedLabelProps {
  /** Visible word, already translated (e.g. "Recommended", "Recommended for text"). */
  label: string;
  /**
   * Screen-reader scope for the word, already translated (e.g. "Recommended
   * provider for writing posts"). Rendered as `aria-description` on the chip.
   * When the chip sits inside a control that carries the name (an option, a
   * button, a tile), leave this out and put `aria-description` on that
   * control instead; `Select` does this for you.
   */
  description?: string;
  /** Extra classes for placement (margins, alignment). */
  className?: string;
}

/**
 * Emerald "Recommended" chip: a decorative `badge-check` icon plus the word.
 *
 * Static by design (no hover or focus states) and it keeps its own colours,
 * weight and case inside highlighted or selected options. Colour is never
 * the only cue: the word is always visible. Place it inline after the name
 * it qualifies with an 8px gap in a `flex-wrap` parent; in a truncating
 * row the name gets `min-w-0 truncate` and this chip stays whole
 * (`shrink-0` is built in).
 *
 * Spec: specs/byok-ai-guidance.md §5 (handoff "Components › RecommendedLabel").
 */
export const RecommendedLabel = forwardRef<HTMLSpanElement, RecommendedLabelProps>(
  ({ label, description, className }, ref) => (
    <span
      ref={ref}
      aria-description={description}
      className={cn(
        "border-rec-line bg-rec-soft inline-flex h-[18px] shrink-0 items-center gap-[3px] rounded-full border pr-[7px] pl-1",
        "text-rec-ink text-[11px] leading-none font-semibold tracking-normal whitespace-nowrap normal-case not-italic",
        className
      )}
    >
      <BadgeCheck aria-hidden="true" className="size-3 shrink-0" />
      {label}
    </span>
  )
);
RecommendedLabel.displayName = "RecommendedLabel";
