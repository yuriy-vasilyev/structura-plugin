import {
  CalendarClock,
  Globe,
  Info,
  Layers,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import React from "react";
import { cn } from "../utils";
import { Skeleton } from "./Skeleton";

/**
 * SetupRationaleStrip — the "WHY THESE SETTINGS" block on the campaign
 * Setup step (handoff `design_handoff_campaign_setup_step`, "Rationale
 * strip"). Explains, in plain sentences, why Structura prefilled the
 * language, approach and rhythm it did.
 *
 * Icons are named, not passed as nodes, so the consumer maps a rationale
 * code (`language_from_site` → `globe`) without importing lucide itself and
 * the strip stays on one icon set. Sentences arrive pre-translated: this
 * package has no i18n runtime.
 */

export type SetupRationaleIcon =
  | "globe"
  | "layers"
  | "trending-up"
  | "calendar-clock"
  | "info"
  | "target"
  | "refresh-cw";

export interface SetupRationaleItem {
  icon: SetupRationaleIcon;
  /** One sentence, pre-translated. Never a method, endpoint or vendor name. */
  text: string;
  /** Stable key (the rationale code); falls back to the list index. */
  key?: string;
}

export interface SetupRationaleStripProps {
  /** Overline heading and the section's accessible name ("WHY THESE SETTINGS"). */
  title: string;
  items: SetupRationaleItem[];
  /** Optional closing line (paid tiers: "Structura decided these from your site…"). */
  footer?: string;
  /** Prefill in flight — three skeleton lines replace the list, never a blank box. */
  loading?: boolean;
  /** Lines shown, in order. The handoff caps the strip at five. */
  maxItems?: number;
  className?: string;
}

const ICONS: Record<SetupRationaleIcon, LucideIcon> = {
  globe: Globe,
  layers: Layers,
  "trending-up": TrendingUp,
  "calendar-clock": CalendarClock,
  info: Info,
  target: Target,
  "refresh-cw": RefreshCw,
};

export const SetupRationaleStrip: React.FC<SetupRationaleStripProps> = ({
  title,
  items,
  footer,
  loading = false,
  maxItems = 5,
  className,
}) => {
  const shown = items.slice(0, Math.max(0, maxItems));

  return (
    <section
      aria-label={title}
      aria-busy={loading || undefined}
      className={cn(
        "rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950/40",
        className
      )}
    >
      <div className="mb-3 flex items-center gap-1.5">
        <Sparkles className="size-3.5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
        <span className="text-[10px] font-black tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
          {title}
        </span>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2.5" data-testid="setup-rationale-skeleton">
          <Skeleton className="h-3.5 w-11/12 rounded-lg" />
          <Skeleton className="h-3.5 w-4/5 rounded-lg" />
          <Skeleton className="h-3.5 w-2/3 rounded-lg" />
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {shown.map((item, index) => {
            const Icon = ICONS[item.icon] ?? Info;
            return (
              <li key={item.key ?? index} className="flex items-start gap-2.5">
                <Icon
                  className="mt-0.5 size-4 shrink-0 text-neutral-400 dark:text-neutral-500"
                  aria-hidden="true"
                />
                <span className="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">
                  {item.text}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {footer && !loading && (
        <p className="mt-3 border-t border-neutral-200 pt-3 text-[11px] leading-snug text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          {footer}
        </p>
      )}
    </section>
  );
};
