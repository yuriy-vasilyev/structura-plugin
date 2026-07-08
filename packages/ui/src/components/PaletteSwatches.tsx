import React, { forwardRef } from "react";
import { cn } from "../utils";

export interface PaletteSwatchesProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** Palette colors, drawn in order (any CSS color, typically hex). */
  colors: string[];
  /** Circle diameter in px. @defaultValue 16 */
  size?: number;
  /** Maximum swatches drawn; extra colors are dropped. @defaultValue 5 */
  max?: number;
  /**
   * Accessible name for the stack (e.g. "Preset palette"). Required —
   * the circles themselves are `aria-hidden`, so without it the stack
   * would be an unnamed image.
   */
  label: string;
}

/**
 * PaletteSwatches — an overlapping stack of palette color circles
 * (video-visuals handoff §1 "Brand palette in captions" row).
 *
 * Each circle carries an inset ring so light swatches stay visible on
 * light surfaces and dark ones on dark. The overlap scales with `size`
 * (6px at the default 16px, matching the boards' `-space-x-1.5`).
 */
export const PaletteSwatches = forwardRef<HTMLDivElement, PaletteSwatchesProps>(
  ({ colors, size = 16, max = 5, label, className, ...props }, ref) => {
    const overlap = Math.round(size * 0.375);
    return (
      <div
        ref={ref}
        role="img"
        aria-label={label}
        className={cn("flex shrink-0 items-center", className)}
        {...props}
      >
        {colors.slice(0, max).map((color, index) => (
          <span
            // Palettes can repeat a color; index keeps keys unique.
            key={`${color}-${index}`}
            aria-hidden="true"
            className="rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/20"
            style={{
              width: size,
              height: size,
              backgroundColor: color,
              marginLeft: index === 0 ? undefined : -overlap,
            }}
          />
        ))}
      </div>
    );
  }
);
PaletteSwatches.displayName = "PaletteSwatches";
