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

/**
 * True when a pasted "API key" is actually a web address.
 *
 * Incident 2026-07-18 (portal, ported here for the plugin wizard): a
 * fresh signup pasted a URL into the masked key field on mobile, got
 * the generic "key was rejected" error, and churned. No provider key
 * starts with a URL scheme or "www.", so the key step refuses these
 * up front with a targeted message instead of saving a broken key.
 */
export const looksLikeUrlNotApiKey = (value: string): boolean =>
  /^([a-z][a-z0-9+.-]*:\/\/|www\.)/i.test(value.trim());
