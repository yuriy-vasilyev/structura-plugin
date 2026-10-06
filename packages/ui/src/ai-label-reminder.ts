import { isEuContentLanguage } from "@structura/i18n-contracts";

/** What the campaign-form AI-label reminder decides on. */
export interface AiLabelReminderInput {
  /** The form asks for a featured image or body images. */
  imagesEnabled: boolean;
  /** The workspace presets have loaded; until then nothing is known. */
  presetsLoaded: boolean;
  /** The site's bound visual preset, or `null` when none is bound. */
  preset: { medium?: string | null; aiLabel?: boolean } | null | undefined;
  /** The campaign's content language; `"default"` or empty follows the site. */
  language: string | null | undefined;
  /** The site's own language, in any locale shape. */
  siteLanguage: string | null | undefined;
}

/**
 * Whether to show the campaign-form reminder that photo-style images may
 * need the EU AI label (specs/ai-image-label.md §7). True when images are
 * on, the medium is photography (absent medium or no bound preset count as
 * photography, the house style), the content language is an EU language,
 * and the bound preset's `aiLabel` is not on.
 */
export function shouldShowAiLabelReminder(input: AiLabelReminderInput): boolean {
  if (!input.imagesEnabled || !input.presetsLoaded) return false;
  const medium = input.preset?.medium ?? "photography";
  if (medium !== "photography") return false;
  if (input.preset?.aiLabel === true) return false;
  const language =
    !input.language || input.language === "default" ? input.siteLanguage : input.language;
  return isEuContentLanguage(language);
}
