import { type ReactNode } from "react";
import { cn } from "../utils";

/** Value emphasis colour. `success` = green, `warn` = amber, `muted` = de-emphasised. */
export type MetricTileTone = "default" | "success" | "warn" | "muted";

export interface MetricTileProps {
  /** Small leading icon shown beside the label (e.g. a 14px lucide icon). */
  icon?: ReactNode;
  /** Uppercase, letter-spaced caption (e.g. "Images", "Links fixed"). */
  label: ReactNode;
  /** The headline value — a number, short string, or a node (e.g. a loader). */
  value: ReactNode;
  /** Optional trailing unit/qualifier rendered small + muted (e.g. "imported"). */
  unit?: ReactNode;
  /** Colour of the value text. */
  tone?: MetricTileTone;
  className?: string;
}

const TONE_CLASS: Record<MetricTileTone, string> = {
  default: "text-neutral-900 dark:text-white",
  success: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  muted: "text-neutral-500 dark:text-neutral-400",
};

/**
 * MetricTile — a compact stat tile (icon + uppercase label over a value + unit).
 *
 * The shared primitive behind the wizard import-progress hero tiles (Images /
 * SEO / Needs a look / Links fixed) so every surface that shows run metrics
 * stays visually identical. Design guide §5.3 (surfaces), §3 (type scale).
 */
export function MetricTile({ icon, label, value, unit, tone = "default", className }: MetricTileProps) {
  return (
    <div className={cn("rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800/50", className)}>
      <div className="flex items-center gap-1.5 text-[10px] font-black tracking-widest text-neutral-400 uppercase">
        {icon}
        {label}
      </div>
      <div className={cn("mt-1 text-sm font-bold", TONE_CLASS[tone])}>
        {value}
        {unit != null && <span className="ml-1 text-xs font-normal text-neutral-400">{unit}</span>}
      </div>
    </div>
  );
}
