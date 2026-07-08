import { __ } from "@wordpress/i18n";
import type { CampaignMode } from "@/features/campaigns/types";

export interface CampaignModeMeta {
  label: string;
  /** Lucide icon name hint — consumers pick the actual icon component */
  iconHint: string;
  /** Tailwind bg class for the icon wrapper */
  bg: string;
  /** Tailwind text class for the icon */
  text: string;
}

const META: Record<CampaignMode, CampaignModeMeta> = {
  traffic_magnet: {
    label: __("Traffic Magnet", "structura"),
    iconHint: "TrendingUp",
    bg: "bg-brand-50 dark:bg-brand-950/30",
    text: "text-brand-500 dark:text-brand-400",
  },
  quick_wins: {
    label: __("Quick Wins", "structura"),
    iconHint: "Zap",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-500 dark:text-amber-400",
  },
  conversion: {
    label: __("Conversion", "structura"),
    iconHint: "Target",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    text: "text-emerald-500 dark:text-emerald-400",
  },
  authority: {
    label: __("Authority", "structura"),
    iconHint: "Crown",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    text: "text-violet-500 dark:text-violet-400",
  },
};

const FALLBACK: CampaignModeMeta = {
  label: __("Default", "structura"),
  iconHint: "Layers",
  bg: "bg-neutral-100 dark:bg-neutral-800",
  text: "text-neutral-400 dark:text-neutral-500",
};

export const getCampaignModeMeta = (mode?: string): CampaignModeMeta =>
  META[mode as CampaignMode] ?? FALLBACK;
