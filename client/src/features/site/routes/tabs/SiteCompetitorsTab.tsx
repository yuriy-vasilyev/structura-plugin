/**
 * `/site/competitors` — workspace competitors (suggested + confirmed).
 *
 * Spec: `specs/seo-intelligence-plan.md` §4.2, §5.2.
 *
 * Two-section flow:
 *
 *   1. **Suggested** — auto-discovered via DataForSEO Labs
 *      `competitors_domain` on your own site. Strongest SERP overlap
 *      first. One click to "Add" promotes a suggestion into your
 *      confirmed list; the underlying workspace settings update flows
 *      into every campaign.
 *
 *   2. **Confirmed** — the list your campaigns actually use. Sourced
 *      from `workspace.settings.seoIntel.competitorUrls`. Manual
 *      add/remove always available below.
 *
 * Free tier sees the locked preview.
 */

import { useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { Button, Card, DiscoverableChipList, PageLoader } from "@structura/ui";
import { Loader2, Save } from "lucide-react";
import { useLicense } from "@/features/settings";
import {
  useSuggestWizardCompetitorsMutation,
  useWizardPositioningQuery,
  type SuggestedCompetitor,
} from "@/features/onboarding";
import { SitePageLayout } from "../SitePageLayout";
import { LockedPanel } from "../../components/LockedPanel";
import { SitePanelHeader } from "../../components/SitePanelHeader";
import { AiGuessNotice } from "../../components/AiGuessNotice";
import { useDraftList } from "../../hooks/useDraftList";
import {
  useAnalyzeSiteMutation,
  useSiteAnalysisQuery,
  useUpdateSiteSeoSettingsMutation,
} from "../../api/useSiteAnalysis";

function hostOf(raw: string): string {
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(
      /^www\./,
      "",
    );
  } catch {
    return raw.replace(/^www\./, "");
  }
}

const COMPETITOR_URLS_MAX = 25;

function normaliseInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const candidate = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    return new URL(candidate).toString();
  } catch {
    return null;
  }
}

function suggestionToConfirmedUrl(domain: string): string {
  // Suggestions come back as bare hostnames; the confirmed list stores
  // full URLs (matches the manual-add path's normalisation).
  try {
    return new URL(`https://${domain}`).toString();
  } catch {
    return `https://${domain}/`;
  }
}

const CompetitorsPreview = () => (
  <Card className="flex flex-col gap-4 p-6">
    <h3 className="m-0! text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
      {__("Competitor map", "structura")}
    </h3>
    <p className="m-0! text-sm text-neutral-500 dark:text-neutral-400">
      {__(
        "Tell us who you compete with and we'll surface the keywords they rank for that you don't — straight into your next campaign's keyword bank.",
        "structura",
      )}
    </p>
    <ul className="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
      <li className="flex items-center justify-between gap-4 border-b border-neutral-100 pb-2 dark:border-neutral-800">
        <span>{__("competitor-a.example", "structura")}</span>
        <span className="text-xs text-neutral-400">
          {__("Example", "structura")}
        </span>
      </li>
      <li className="flex items-center justify-between gap-4 pb-2">
        <span>{__("competitor-b.example", "structura")}</span>
        <span className="text-xs text-neutral-400">
          {__("Example", "structura")}
        </span>
      </li>
    </ul>
  </Card>
);

const CompetitorsEditor = () => {
  const query = useSiteAnalysisQuery();
  const analyze = useAnalyzeSiteMutation();
  const update = useUpdateSiteSeoSettingsMutation();
  const [error, setError] = useState<string | null>(null);

  const serverUrls = query.data?.seoIntelSettings?.competitorUrls ?? [];
  const suggestions = query.data?.suggestedCompetitors ?? [];
  const ranAnalysis = (query.data?.capturedAt ?? null) !== null;

  // Local draft — adopt/add/remove stay client-side until Save.
  const {
    value: confirmedUrls,
    dirty,
    add: addToDraft,
    addMany,
    remove,
  } = useDraftList(serverUrls);
  const atCap = confirmedUrls.length >= COMPETITOR_URLS_MAX;
  const remaining = COMPETITOR_URLS_MAX - confirmedUrls.length;

  const save = () => update.mutate({ competitorUrls: confirmedUrls });

  // Filter suggestions to ones the user hasn't already adopted —
  // matching by hostname is the cleanest comparison.
  const adoptedHosts = new Set(
    confirmedUrls
      .map((u) => {
        try {
          return new URL(u).hostname;
        } catch {
          return u;
        }
      })
      .map((h) => h.replace(/^www\./, "")),
  );
  const availableSuggestions = suggestions.filter(
    (s) => !adoptedHosts.has(s.domain.replace(/^www\./, "")),
  );

  // ── AI fallback ──────────────────────────────────────────────────
  // DataForSEO only returns SERP-overlap competitors once a site ranks,
  // so new/un-indexed domains get nothing. When an analysis ran but
  // surfaced zero SERP competitors, fall back to AI-guessed peers — and
  // label them as guesses (Structura sells real data; be honest when we
  // substitute).
  const positioningQuery = useWizardPositioningQuery();
  const suggestAi = useSuggestWizardCompetitorsMutation();
  const [aiSuggestions, setAiSuggestions] = useState<SuggestedCompetitor[]>([]);

  const runAiSuggest = async () => {
    const p = positioningQuery.data?.positioning;
    try {
      const res = await suggestAi.mutateAsync({
        positioning: p
          ? { what: p.what, who: p.who, problem: p.problem }
          : undefined,
        excludeDomains: confirmedUrls.map(hostOf),
      });
      setAiSuggestions(res.suggestions);
    } catch {
      // Best-effort; the manual add field is the fallback to the fallback.
    }
  };

  // The AI fallback is NOT auto-run on mount — the settings page should be
  // passive. It fires only after a user-initiated re-discover (see
  // `onDiscover` below) when the fresh DFS pass surfaced no SERP competitors.

  const availableAiSuggestions = aiSuggestions.filter(
    (s) => !adoptedHosts.has(hostOf(s.domain)),
  );
  // Show the AI block only when DFS gave us nothing to show.
  const showAi =
    availableSuggestions.length === 0 && availableAiSuggestions.length > 0;

  const addAllAi = () =>
    addMany(
      availableAiSuggestions
        .slice(0, remaining)
        .map((s) => suggestionToConfirmedUrl(s.domain)),
    );

  const capMessage = sprintf(
    __("Maximum of %d competitor URLs reached.", "structura"),
    COMPETITOR_URLS_MAX,
  );

  const addAllSuggestions = () => {
    addMany(
      availableSuggestions
        .slice(0, remaining)
        .map((s) => suggestionToConfirmedUrl(s.domain)),
    );
  };

  // One suggested list, sourced from DFS SERP overlap when available, else the
  // AI fallback. DFS chips carry the shared-keyword `count`; AI chips carry the
  // rationale `tooltip`. `value` is the confirmed-list URL we'll store.
  const suggestedItems = availableSuggestions.length > 0
    ? availableSuggestions.map((s) => ({
        value: suggestionToConfirmedUrl(s.domain),
        label: hostOf(s.domain),
        count: s.intersections,
      }))
    : showAi
    ? availableAiSuggestions.map((s) => ({
        value: suggestionToConfirmedUrl(s.domain),
        label: hostOf(s.domain),
        tooltip: s.rationale || undefined,
      }))
    : [];

  const onAddSuggested = (value: string) => {
    if (atCap) {
      setError(capMessage);
      return;
    }
    addToDraft(value);
  };

  // Manual add: validate, surface errors via `addManualError`, return false to
  // keep the user's text on failure.
  const onAddManual = (raw: string): boolean => {
    const normalised = normaliseInput(raw);
    if (!normalised) {
      setError(__("Enter a valid URL or domain.", "structura"));
      return false;
    }
    if (confirmedUrls.includes(normalised)) {
      setError(__("That URL is already in the list.", "structura"));
      return false;
    }
    if (atCap) {
      setError(capMessage);
      return false;
    }
    addToDraft(normalised);
    setError(null);
    return true;
  };

  // Contextual notice shown in the suggested area when there are no chips:
  // AI-guess banner, the "asking AI…" pending state, or the amber no-SERP note.
  const suggestedNotice = showAi ? (
    <AiGuessNotice
      message={__(
        "We couldn't find SERP-measured competitors for your domain yet (common for new or low-traffic sites), so these are AI suggestions based on what you do. Re-discover once your site is indexed to swap in measured data.",
        "structura",
      )}
    />
  ) : ranAnalysis && availableSuggestions.length === 0 && suggestAi.isPending ? (
    <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
      <Loader2 size={14} className="animate-spin" />
      {__("No SERP data yet — asking AI for likely competitors…", "structura")}
    </div>
  ) : ranAnalysis &&
    availableSuggestions.length === 0 &&
    availableAiSuggestions.length === 0 &&
    !suggestAi.isPending ? (
    <p className="m-0! text-xs text-amber-700 dark:text-amber-300">
      {__(
        "Analysis ran, but no SERP competitors were found for this domain yet. Common for new sites with limited ranking footprint. Re-discover after you've published more content.",
        "structura",
      )}
    </p>
  ) : undefined;

  // The site-state query hydrates BOTH the confirmed list and the
  // suggestions. Rendering the live editor with empty data while it's
  // in flight flashed "No competitors confirmed yet" + a bare Discover
  // button for a few seconds on every mount — reading as data loss
  // before the real chips popped in.
  if (query.isLoading) {
    return (
      <Card className="flex flex-col gap-6 p-6">
        <PageLoader label={__("Loading competitors…", "structura")} size="md" />
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-6 p-6">
      <SitePanelHeader
        title={__("Your competitors", "structura")}
        description={__(
          "Used at every campaign creation to mine gap-keyword opportunities — terms they rank for that you don't.",
          "structura",
        )}
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={save}
            disabled={!dirty || update.isPending}
          >
            {update.isPending ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Save size={14} className="mr-1.5" />
            )}
            {__("Save", "structura")}
          </Button>
        }
      />

      <DiscoverableChipList
        kind="domain"
        labels={{
          remove: (l) => sprintf(__("Remove %s", "structura"), l),
          addAll: __("Add all", "structura"),
          add: __("Add", "structura"),
        }}
        ariaLabel={__("Competitor URLs", "structura")}
        added={confirmedUrls.map((url) => ({ value: url, label: hostOf(url) }))}
        suggested={suggestedItems}
        onAdd={onAddSuggested}
        onRemove={remove}
        onAddAll={
          suggestedItems.length > 0
            ? availableSuggestions.length > 0
              ? addAllSuggestions
              : addAllAi
            : undefined
        }
        onDiscover={() =>
          analyze.mutate(undefined, {
            // Manual re-discover only: run the fresh DFS pass, and fall back
            // to AI-guessed peers when DFS surfaced no SERP competitors.
            onSuccess: (data) => {
              const dfsHits = (data?.suggestedCompetitors ?? []).filter(
                (s) => !adoptedHosts.has(s.domain.replace(/^www\./, "")),
              );
              if (dfsHits.length === 0) void runAiSuggest();
            },
          })
        }
        discoverLabel={
          analyze.isPending
            ? __("Analyzing…", "structura")
            : ranAnalysis
            ? __("Re-discover", "structura")
            : __("Discover", "structura")
        }
        discovering={analyze.isPending}
        discoverPrimary={!ranAnalysis}
        suggestedLabel={__("Auto-detected from your site", "structura")}
        suggestedNotice={suggestedNotice}
        emptyText={__(
          "No competitors confirmed yet. Adopt a suggestion above, or add one manually below.",
          "structura",
        )}
        inputPlaceholder={__(
          "competitor.com or https://competitor.com/blog",
          "structura",
        )}
        onAddManual={onAddManual}
        addManualError={error}
        disabled={atCap}
      />
    </Card>
  );
};

export const SiteCompetitorsTab = () => {
  const { isPaidLicense } = useLicense();

  if (!isPaidLicense) {
    return (
      <SitePageLayout>
        <LockedPanel
          valueStatement={__(
            "Find the keywords your competitors rank for — that you don't.",
            "structura",
          )}
          detail={__(
            "Add competitor URLs and Structura surfaces the gap-keyword opportunities they're winning, ready for your next campaign.",
            "structura",
          )}
          intent="unlock_keyword_bank"
        >
          <CompetitorsPreview />
        </LockedPanel>
      </SitePageLayout>
    );
  }

  return (
    <SitePageLayout>
      <CompetitorsEditor />
    </SitePageLayout>
  );
};
