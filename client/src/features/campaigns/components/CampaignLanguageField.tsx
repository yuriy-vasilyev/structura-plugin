/**
 * CampaignLanguageField — the campaign **Language** control for every
 * wp-admin surface that owns one (Setup step, Edit, single-post generate).
 *
 * Wraps the shared `<ContentLanguagePicker>` with the three things only the
 * plugin knows:
 *
 *   - the `"default"` sentinel. A campaign saved before the picker existed
 *     stores `"default"` meaning "whatever WordPress writes in". It renders
 *     as the site's language and KEEPS the sentinel until the user picks
 *     something — the cloud resolves it, so rewriting it here would turn a
 *     follow-the-site campaign into a pinned one behind the user's back.
 *   - the site's own language, read from the WP site profile.
 *   - the wp-admin locale, so `Intl.DisplayNames` labels match the admin UI.
 */
import { __ } from "@wordpress/i18n";
import { Globe, Languages } from "lucide-react";
import { useMemo } from "react";
import { ContentLanguagePicker, cn } from "@structura/ui";

import { usePublicSiteProfile } from "@/features/settings";
import { contentLanguagePickerLabels } from "@/features/campaigns/labels";
import { toCampaignLanguageCode } from "@/features/campaigns/helpers";

/** The admin locale the SPA runs in — `Intl` wants BCP-47, WP writes `de_AT`. */
export const adminUiLocale = (): string => {
  const raw =
    typeof document !== "undefined" ? document.documentElement.lang : "";
  return raw ? raw.replace(/_/g, "-") : "en";
};

/**
 * The site's own content language, or `null` when WordPress reports none.
 * Exported so the Setup step can seed a new campaign with it.
 */
export const useSiteContentLanguage = (): string | null => {
  const { data: profile } = usePublicSiteProfile();
  return useMemo(() => toCampaignLanguageCode(profile?.language), [profile?.language]);
};

export interface CampaignLanguageFieldProps {
  /** Form value — a picker code, a catalogue code, or the `"default"` sentinel. */
  value: string;
  onChange: (code: string) => void;
  /** Other languages the site publishes in; pinned above the supported group. */
  additionalLanguages?: string[];
  /** Show the "From your site" pill when the value matches the site language. */
  showSitePill?: boolean;
  /** Overline above the control. Pass `null` for a bare picker. */
  label?: string | null;
  /** Sentence under the control. */
  helper?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export const CampaignLanguageField = ({
  value,
  onChange,
  additionalLanguages,
  showSitePill = false,
  label = __("Language", "structura"),
  helper,
  disabled = false,
  id = "campaign-language",
  className,
}: CampaignLanguageFieldProps) => {
  const siteLanguage = useSiteContentLanguage();
  const labels = useMemo(() => contentLanguagePickerLabels(), []);
  const uiLocale = adminUiLocale();

  // Two values the picker cannot render as-is. The `"default"` sentinel has
  // no code of its own, so it shows what the cloud would resolve it to (and
  // English before the profile loads, rather than an empty trigger). A
  // campaign stored with a full WP locale from the old dropdown (`de_DE`,
  // `fr_FR`) collapses to its picker option; the stored value is untouched
  // either way until the user picks something.
  const resolved =
    value === "default"
      ? (siteLanguage ?? "en")
      : (toCampaignLanguageCode(value) ?? value);
  const isSiteLanguage = !!siteLanguage && resolved === siteLanguage;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label !== null && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="flex items-center gap-1.5 text-[10px] font-black tracking-widest text-neutral-400 uppercase">
            <Languages size={12} className="text-brand-500" />
            {label}
          </span>
          {showSitePill && isSiteLanguage && (
            <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              <Globe size={12} aria-hidden="true" />
              {__("From your site", "structura")}
            </span>
          )}
        </div>
      )}

      <ContentLanguagePicker
        id={id}
        value={resolved}
        onChange={onChange}
        uiLocale={uiLocale}
        additionalLanguages={additionalLanguages}
        disabled={disabled}
        labels={labels}
      />

      {helper && (
        <p className="m-0! text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
          {helper}
        </p>
      )}
    </div>
  );
};
