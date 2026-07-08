import React, { forwardRef } from "react";
import { Check } from "lucide-react";
import { cn } from "../utils";
import { PresetRadioCardGroup } from "./PresetRadioCard";

/**
 * Caption placement within the 9:16 video frame.
 */
export type CaptionPlacement = "top" | "middle" | "bottom";

/** Fixed option order — matches the boards (Top / Middle / Bottom). */
const PLACEMENTS: CaptionPlacement[] = ["top", "middle", "bottom"];

/**
 * Caption-band offsets inside the schematic frame. 5px insets keep the
 * band clear of the frame's rounding; middle centers via a half-band
 * negative margin (band is 3px tall).
 */
const BAND_POSITION: Record<CaptionPlacement, React.CSSProperties> = {
  top: { top: 5 },
  middle: { top: "50%", marginTop: -1.5 },
  bottom: { bottom: 5 },
};

export interface PlacementRadioProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Currently selected placement. */
  value?: CaptionPlacement;
  /** Invoked with the newly selected placement (click or arrow keys). */
  onValueChange: (value: CaptionPlacement) => void;
  /**
   * Pre-translated labels for the three options. The ui package ships no
   * copy — pass `__("Top", "structura")` etc. from the consuming app.
   */
  labels: Record<CaptionPlacement, React.ReactNode>;
}

/**
 * PlacementRadio — horizontal radio cards for video caption placement
 * (video-visuals handoff §1 "Caption placement").
 *
 * Each option pairs a tiny 9:16 schematic (26×44 neutral frame with a
 * 3px caption band at the option's position, `aria-hidden`) with its
 * translated label and a check when selected. Reuses
 * {@link PresetRadioCardGroup} for the `role="radiogroup"` container and
 * its arrow-key contract (Left/Up · Right/Down move + select, Home/End
 * jump, wrapping) — a standalone component rather than a
 * `PresetRadioCard` variant because the anatomy is horizontal
 * schematic+label, not thumb-over-title.
 *
 * Label the group with `aria-label` / `aria-labelledby`. Cards wrap to
 * one per row below 420px of *container* width (`@container` query), so
 * German labels survive narrow columns.
 */
export const PlacementRadio = forwardRef<HTMLDivElement, PlacementRadioProps>(
  ({ value, onValueChange, labels, className, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("@container", className)}>
        <PresetRadioCardGroup
          value={value}
          onValueChange={(next) => onValueChange(next as CaptionPlacement)}
          className="@max-[420px]:grid-cols-1"
          {...props}
        >
          {PLACEMENTS.map((placement) => {
            const checked = value === placement;
            return (
              <button
                key={placement}
                type="button"
                role="radio"
                aria-checked={checked}
                // Roving tabindex; with no selection yet every card stays
                // tabbable so the group can't become keyboard-unreachable.
                tabIndex={value == null ? 0 : checked ? 0 : -1}
                onClick={() => onValueChange(placement)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all duration-fast ease-out",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
                  "disabled:cursor-not-allowed disabled:opacity-55",
                  checked
                    ? "border-brand-600 bg-brand-50/60 shadow-glow-brand dark:border-brand-400 dark:bg-brand-500/10"
                    : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "relative block h-11 w-[26px] shrink-0 rounded-[4px] border",
                    checked
                      ? "border-brand-400/70 bg-brand-100/50 dark:border-brand-400/60 dark:bg-brand-500/15"
                      : "border-neutral-300 bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800"
                  )}
                >
                  <span
                    className={cn(
                      "absolute inset-x-[4px] h-[3px] rounded-full",
                      checked
                        ? "bg-brand-600 dark:bg-brand-400"
                        : "bg-neutral-400 dark:bg-neutral-500"
                    )}
                    style={BAND_POSITION[placement]}
                  />
                </span>
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-neutral-900 dark:text-neutral-100">
                  <span className="truncate">{labels[placement]}</span>
                  {checked && (
                    <Check
                      className="size-3 shrink-0 text-brand-600 dark:text-brand-400"
                      aria-hidden="true"
                    />
                  )}
                </span>
              </button>
            );
          })}
        </PresetRadioCardGroup>
      </div>
    );
  }
);
PlacementRadio.displayName = "PlacementRadio";
