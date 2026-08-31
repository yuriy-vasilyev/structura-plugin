/**
 * wp-admin translations for the shared `KeywordBankList` / `KeywordRow`
 * (`@structura/ui` carries English defaults only — every surface supplies
 * its own strings so nothing ships English-only, CLAUDE.md §6). Portal
 * twin: `web/src/features/sites/components/campaign/keywordBankLabels.ts`.
 *
 * `__()` / `_n()` calls stay literal so `pnpm --filter client makepot`
 * extracts them.
 */
import { __, _n, sprintf } from "@wordpress/i18n";
import type { KeywordBankListLabels, KeywordRowLabels } from "@structura/ui";

import type { KeywordDiscoveryMeta } from "@/features/campaigns/types";

export function keywordBankLabels(): KeywordBankListLabels {
  return {
    listAria: __("Keyword bank, in publish order", "structura"),
    pillarsAria: __("Pillar keywords", "structura"),
    publishOrder: __("Publish order · best winnable volume first", "structura"),
    orderEstimated: __("order estimated", "structura"),
    showAll: (count) =>
      /* translators: %d: total number of keywords in the bank. */
      sprintf(__("Show all %d keywords", "structura"), count),
    showTop: (count) =>
      /* translators: %d: number of rows shown while collapsed (15). */
      sprintf(__("Show top %d only", "structura"), count),
    hiddenCaption: (hidden, pillars) => {
      const more = sprintf(
        /* translators: %d: keywords hidden below the fold. */
        _n("%d more", "%d more", hidden, "structura"),
        hidden
      );
      if (pillars <= 0) return more;
      const last = sprintf(
        /* translators: %d: number of pillar keywords (above the KD ceiling). */
        _n("%d pillar publishes last", "%d pillars publish last", pillars, "structura"),
        pillars
      );
      /* translators: 1: "N more", 2: "N pillars publish last". */
      return sprintf(__("%1$s · %2$s", "structura"), more, last);
    },
    pillarsTitle: __("Pillars", "structura"),
    pillarsBody: __(
      "Long-term targets above your difficulty ceiling — published after the winnable ones.",
      "structura"
    ),
    variantsLine: (count) =>
      sprintf(
        /* translators: %d: total long-tail variants across the bank. */
        _n(
          "%d long-tail variant ready — each post gets its own keyphrase, so seeds can safely repeat.",
          "%d long-tail variants ready — each post gets its own keyphrase, so seeds can safely repeat.",
          count,
          "structura"
        ),
        count
      ),
    movedToTop: __("Moved to position 1", "structura"),
  };
}

export function keywordRowLabels(): KeywordRowLabels {
  return {
    remove: (keyword) =>
      /* translators: %s: the keyword. */
      sprintf(__("Remove %s", "structura"), keyword),
    moveToTop: (keyword) =>
      /* translators: %s: the keyword. */
      sprintf(__("Move %s to the top of the publish order", "structura"), keyword),
    provenance: {
      related_search: __("Search-suggested — from live related-search data", "structura"),
      people_also_ask: __(
        "People also ask — a question searchers pair with this topic",
        "structura"
      ),
      competitor_gap: __("Competitor gap — they rank for it, you don't yet", "structura"),
      already_ranking: __("Already ranking — your site has a foothold here", "structura"),
      ai_generated: __(
        "AI-generated — no live search data; numbers are estimates",
        "structura"
      ),
      manual: __("Added manually", "structura"),
    },
    variants: (count) =>
      sprintf(
        /* translators: %d: long-tail variants for this keyword. */
        _n(
          "%d long-tail variant ready as a per-post keyphrase",
          "%d long-tail variants ready as per-post keyphrases",
          count,
          "structura"
        ),
        count
      ),
    kd: (kd, state, ceiling) => {
      switch (state) {
        case "pillar":
          /* translators: 1: keyword difficulty, 2: the site's KD ceiling. */
          return sprintf(
            __("Difficulty %1$d — pillar (above your KD ≤ %2$d ceiling)", "structura"),
            kd,
            ceiling ?? 0
          );
        case "stretch":
          /* translators: 1: keyword difficulty, 2: the site's KD ceiling. */
          return sprintf(
            __("Difficulty %1$d — stretch (near your KD ≤ %2$d ceiling)", "structura"),
            kd,
            ceiling ?? 0
          );
        default:
          /* translators: %d: keyword difficulty. */
          return sprintf(__("Difficulty %d — winnable for this site", "structura"), kd);
      }
    },
    volume: (formatted) =>
      /* translators: %s: compact monthly search volume, e.g. 2.9K. */
      sprintf(__("%s monthly searches", "structura"), formatted),
    intent: {
      informational: __("DIY", "structura"),
      commercial: __("Research", "structura"),
    },
    bucket: {
      high: __("High", "structura"),
      medium: __("Medium", "structura"),
      low: __("Low", "structura"),
    },
    bucketEstimated: __("Estimated volume bucket — no live search data", "structura"),
    pending: __("Looking up search data…", "structura"),
  };
}

const MODE_LABELS: Record<KeywordDiscoveryMeta["resolvedMode"], string> = {
  winnable: __("Quick wins", "structura"),
  balanced: __("Balanced", "structura"),
  authority: __("Authority", "structura"),
};

/**
 * Caption for the list's right slot: "Balanced · KD ≤ 65", or
 * "Authority · no KD cap". `null` without a resolved mode (hand-curated /
 * pre-slice bank) — the slot then stays empty rather than claiming a mode.
 */
export function keywordModeCaption(meta: KeywordDiscoveryMeta | null | undefined): {
  caption: string | null;
  tooltip: string;
} {
  if (!meta?.resolvedMode) return { caption: null, tooltip: "" };
  const mode = MODE_LABELS[meta.resolvedMode];
  return {
    caption:
      meta.kdCeiling == null
        ? /* translators: %s: difficulty mode label. */
          sprintf(__("%s · no KD cap", "structura"), mode)
        : /* translators: 1: difficulty mode label, 2: KD ceiling. */
          sprintf(__("%1$s · KD ≤ %2$d", "structura"), mode, meta.kdCeiling),
    tooltip: __(
      "Difficulty mode resolved from this site's organic footprint. Keywords above the ceiling become pillars, published last.",
      "structura"
    ),
  };
}
