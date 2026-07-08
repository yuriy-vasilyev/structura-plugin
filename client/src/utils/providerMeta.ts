import { __ } from "@wordpress/i18n";
import type { AIProvider } from "@/features/campaigns/types";

export interface ProviderMeta {
  label: string;
  /** Tailwind classes for the icon wrapper background */
  bg: string;
  /** Tailwind classes for text/icon color */
  text: string;
}

const META: Record<AIProvider, ProviderMeta> = {
  openai: {
    label: "OpenAI",
    bg: "bg-neutral-900 dark:bg-neutral-100",
    text: "text-white dark:text-neutral-900",
  },
  gemini: {
    label: "Gemini",
    bg: "bg-blue-600 dark:bg-blue-500",
    text: "text-white",
  },
  anthropic: {
    label: "Claude",
    bg: "bg-amber-700 dark:bg-amber-600",
    text: "text-white",
  },
};

const FALLBACK: ProviderMeta = {
  label: __("AI", "structura"),
  bg: "bg-neutral-200 dark:bg-neutral-700",
  text: "text-neutral-500 dark:text-neutral-400",
};

export const getProviderMeta = (provider: string): ProviderMeta =>
  META[provider as AIProvider] ?? FALLBACK;
