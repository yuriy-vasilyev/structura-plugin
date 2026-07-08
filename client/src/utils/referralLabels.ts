/**
 * Builds the `ReferralLinksEditor` label bundle for the wp-admin SPA, so every
 * surface that renders the editor (campaign architecture step, site SEO tab,
 * onboarding SEO step) shares one translated vocabulary instead of repeating
 * the ~27-key object. Strings go through `__()` with the `structura` text
 * domain; both site + campaign bindings use the same bundle.
 */
import { __, sprintf } from "@wordpress/i18n";

import type { ReferralLinksEditorLabels } from "@structura/ui";

export function buildReferralLabels(): ReferralLinksEditorLabels {
  return {
    sectionTitle: __("Referral links", "structura"),
    optionalTag: __("optional", "structura"),
    siteHelper: __(
      "Your tracking links, woven into posts where they fit. Links added here seed every new campaign on this site.",
      "structura",
    ),
    campaignHelper: __(
      "Your tracking links, woven into posts where they fit. Seeded from Site SEO — edits apply to this campaign only; site defaults stay unchanged.",
      "structura",
    ),
    labelLabel: __("Label", "structura"),
    labelPlaceholder: __("Product or brand name", "structura"),
    urlLabel: __("Destination URL", "structura"),
    urlPlaceholder: __("https://…", "structura"),
    keywordsLabel: __("Relevance keywords", "structura"),
    keywordsOptionalTag: __("optional", "structura"),
    keywordsPlaceholder: __(
      "Topics where this link belongs — press Enter to add",
      "structura",
    ),
    keywordsAddAria: __("Add a relevance keyword", "structura"),
    anchorToggle: __("Exact anchor text", "structura"),
    anchorToggleQualifier: __("— only if your program requires it", "structura"),
    anchorLabel: __("Exact anchor text", "structura"),
    anchorPlaceholder: __("e.g. TrailPass Pro app", "structura"),
    anchorHint: __(
      "Used verbatim wherever this link appears. Leave empty and Structura writes a natural anchor for each post.",
      "structura",
    ),
    anchorClear: __("Clear", "structura"),
    addLink: __("Add referral link", "structura"),
    emptyText: __(
      "No referral links yet — add one to have Structura mention it in relevant posts.",
      "structura",
    ),
    ftcBefore: __(
      "Referral links are usually affiliate relationships. Review the ",
      "structura",
    ),
    ftcLink: __("affiliate disclosure setting", "structura"),
    ftcAfter: __(
      " for this content — Structura won't switch it on for you.",
      "structura",
    ),
    /* translators: %s is the referral link's label. */
    removeRow: (label: string) => sprintf(__("Remove %s", "structura"), label),
    /* translators: %s is a relevance keyword. */
    removeKeyword: (keyword: string) => sprintf(__("Remove %s", "structura"), keyword),
    errorLabelRequired: __(
      "Label is required — it seeds the anchor text.",
      "structura",
    ),
    errorUrlInvalid: __(
      "Enter a full URL, including https://. Tracking parameters are kept as-is.",
      "structura",
    ),
  };
}
