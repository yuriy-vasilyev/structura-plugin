import React from "react";
import { cn } from "../utils";
import { PLATFORMS, PlatformMark, type Platform } from "./PlatformMark";

/** Props for {@link PlatformChip}. Extra span attributes (e.g. `id`) pass through. */
export interface PlatformChipProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Which builder to show. */
  platform: Platform;
}

/**
 * `<PlatformChip>` — a builder's 16px mark plus its name in a pill. The
 * name is real text, so a field can point at the chip with
 * `aria-describedby` (spec: specs/article-delivery-connect-flow.md §5, §7).
 */
export function PlatformChip({ platform, className, ...props }: PlatformChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        "border-neutral-200 bg-neutral-50 text-neutral-700",
        "dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200",
        className
      )}
      {...props}
    >
      <PlatformMark platform={platform} size={16} />
      {PLATFORMS[platform]}
    </span>
  );
}
