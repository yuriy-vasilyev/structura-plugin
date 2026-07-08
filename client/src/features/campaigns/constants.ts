import dayjs from "@/libs/dayjs";
import { __ } from "@wordpress/i18n";
import { Bot } from "lucide-react";
import { CampaignFormData } from "@/features/campaigns/types";
import { SeoOptimizationRules } from "@/features/settings";
import { CONTENT_BLOCKS } from "@/features/settings/constants";
import {
  OpenAILogo,
  GeminiLogo,
  ClaudeLogo,
} from "@/features/campaigns/components/ProviderLogos";

// ─── Provider visual config ──────────────────────────────────────────────────
// Single source of truth for brand logos, labels, and icon colors.
//
// To update a provider's logo:
//   1. Edit the SVG paths in `components/ProviderLogos.tsx`
//   2. (or) swap the `icon` below for a new component
//
// The `icon` field accepts any React component with a `size` + `className` prop,
// so both Lucide icons and our custom SVG logos work interchangeably.

export interface ProviderVisual {
  /** Display name shown in the UI */
  label: string;
  /** Icon component — accepts { size, className } (Lucide-compatible) */
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  /** Tailwind text-color class applied to the icon */
  color: string;
  /** Tailwind border class for card accents (active state) */
  border: string;
  /** Tailwind ring/glow class for card hover (active state) */
  glow: string;
}

export const PROVIDER_VISUALS: Record<string, ProviderVisual> = {
  openai: {
    label: "OpenAI",
    icon: OpenAILogo,
    color: "text-neutral-700 dark:text-neutral-300",
    border: "border-neutral-300 dark:border-neutral-600",
    glow: "hover:border-neutral-400 hover:shadow-neutral-200/40 dark:hover:border-neutral-500 dark:hover:shadow-neutral-800/40",
  },
  gemini: {
    label: "Gemini",
    icon: GeminiLogo,
    color: "text-blue-500",
    border: "border-blue-200 dark:border-blue-800/50",
    glow: "hover:border-blue-300 hover:shadow-blue-200/30 dark:hover:border-blue-700 dark:hover:shadow-blue-900/30",
  },
  anthropic: {
    label: "Claude",
    icon: ClaudeLogo,
    color: "text-amber-600",
    border: "border-amber-200 dark:border-amber-800/50",
    glow: "hover:border-amber-300 hover:shadow-amber-200/30 dark:hover:border-amber-700 dark:hover:shadow-amber-900/30",
  },
};

/** Safe accessor — returns a neutral fallback for unknown providers. */
export const getProviderVisual = (id: string): ProviderVisual =>
  PROVIDER_VISUALS[id] ?? {
    label: id,
    icon: Bot,
    color: "text-neutral-400",
    border: "border-neutral-200 dark:border-neutral-800",
    glow: "hover:border-neutral-300 hover:shadow-md dark:hover:border-neutral-700",
  };

/**
 * Default user-toggleable SEO rules for new campaigns.
 *
 * Only the "shape-changing" rules appear here — readability, keyphrase, SERP,
 * and meta rules are now always-on server-side per license tier (see
 * `ALWAYS_ON_RULES_BY_TIER` in `functions/src/ai/instruction-builder.ts`).
 *
 * We default FAQ, Action Steps, and statistics to `true` because they're the
 * main "SEO-featured" additions that justify the plugin — a post without any
 * of them looks thin next to competitors. Number-in-title and link rules
 * default to `true` too; sites that don't want them can flip the toggles.
 */
export const DEFAULT_SEO_RULES: SeoOptimizationRules = {
  include_faq_section: true,
  include_action_steps: true,
  include_statistics: true,
  number_in_title: true,
  internal_link_optimization: true,
  outbound_link_authority: true,
  eeat_signals: true,
  entity_coverage: true,
};

export const DEFAULT_CAMPAIGN_FORM_DATA: CampaignFormData = {
  identity: {
    name: "",
    objective: "",
    campaignMode: "traffic_magnet",
  },
  intelligence: {
    textProvider: "gemini",
    imageProvider: "gemini",
    textModel: "",
    imageModel: "",
    // Fallback providers default to null ("off") — silently opting users
    // in would be surprising and costs money on transient failures; the UI
    // surfaces the choice explicitly in Advanced Settings → AI Engine.
    fallbackTextProvider: null,
    fallbackImageProvider: null,
    personaId: "random",
    language: "default",
    postLength: 2700,
    replaceLongDashes: true,
    disableEmojis: true,
    seoRules: DEFAULT_SEO_RULES,
  },
  structure: {
    enabledBlocks: CONTENT_BLOCKS.filter((block) => block.isRequired).map((block) => block.name),
    featuredImage: false,
    bodyImages: false,
    disclosure: {
      enabled: false,
      // Localized default — new campaigns created by a non-English user see
      // their admin language here. Persisted on the campaign doc as soon as
      // the wizard saves, so existing campaigns keep whatever the user wrote
      // / the prior default was; only fresh campaigns pick up the current
      // locale's wording.
      text: __("This content was assisted by AI.", "structura"),
    },
    // "pending" so freshly created campaigns require a human review pass
    // before anything goes live (changed 2026-06-07 from the historical
    // "publish" default). Only affects new campaigns — existing campaigns
    // keep their persisted value, and pre-postStatus campaigns still fall
    // back to "publish" everywhere (`?? "publish"` reads stay untouched).
    postStatus: "pending",
  },
  taxonomy: {
    categories: { mode: "auto", list: [] },
    tags: { mode: "auto", list: [] },
  },
  schedule: {
    cron: "0 9 * * 2,4", // Every Tuesday and Thursday at 9:00 AM
    endCondition: {
      type: "infinite",
      value: dayjs().add(1, "month").format("YYYY-MM-DD"),
    },
    // Phase 1.6 — fresh campaigns default to ON. BYOK users can opt
    // out via the toggle in the Schedule step; managed tiers always
    // run with this on (no toggle, just an info banner explaining
    // the behavior). The cloud's onCampaignCreated trigger seeds an
    // initial stock batch as soon as the doc lands.
    pregenerationEnabled: true,
  },
};
