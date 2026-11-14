/**
 * Step 3 — SEO intelligence.
 *
 * Single screen with two sub-sections:
 *
 *   3a. Positioning — three textareas. The AI-draft button selects and
 *       reads the site's pages again and drafts the answers, asking first
 *       with the Site → Info card's rule (specs/site-reading.md §11).
 *       Saves to `workspace.positioning`.
 *
 *   3b. Competitors — current saved list + add/remove. Auto-detected
 *       suggestions from `useSiteAnalysisQuery().suggestedCompetitors`
 *       are surfaced inline with one-click adoption; when DFS has no
 *       SERP data (new / un-indexed sites) the AI fallback fills the
 *       row instead — same DFS→AI→manual ladder as Site → Competitors.
 *       Saves to `activation.seoIntel.competitorUrls`.
 *
 * Keywords and authority domains moved to the CAMPAIGN level (they're
 * per-language, so they belong to a campaign, not the site) — the wizard
 * SEO step now owns positioning + competitors only. Competitors stay
 * site-scoped and seed each campaign's Competitors step.
 *
 * AUTO-SUGGEST ON FIRST ENTRY (paid): when every field is still empty,
 * the step opens with a blocking WizardMagicLoader while it drafts
 * positioning from the homepage, then fetches AI competitors (when DFS
 * is empty) — the user lands on a pre-filled screen instead of a blank
 * form. Re-entries with any existing content skip the auto-run entirely.
 *
 * Validity (gates the wizard): all three positioning answers filled.
 * Competitors optional.
 */

import { useEffect, useMemo, useRef, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import {
  Badge,
  Button,
  Card,
  DiscoverableChipList,
  ReferralLinksEditor,
  useToast,
  type DiscoverableChipItem,
} from "@structura/ui";
import { Loader2, Search, Sparkles, Users } from "lucide-react";

import { useSiteAnalysisQuery } from "@/features/site/api/useSiteAnalysis";
import { useLicense } from "@/features/settings";
import { buildReferralLabels } from "@/utils/referralLabels";
import { buildChipListLabels } from "@/utils/chipListLabels";

import {
  useSuggestWizardPositioningMutation,
  useWizardAiCompetitorsQuery,
  useWizardPositioningQuery,
  type PositioningPageRead,
} from "../api/useWizardSeo";
import { useWizardStore, type SeoStepDraft } from "../state/wizardStore";
import { redraftNeedsConfirm, type PositioningText } from "../utils/positioningRedraft";
import { PositioningPagesRead } from "./PositioningPagesRead";
import { PositioningTextArea } from "./PositioningTextArea";
import { RedraftConfirmDialog } from "./RedraftConfirmDialog";
import { WizardMagicLoader } from "./WizardMagicLoader";

type PositioningDraft = PositioningText;

const EMPTY_POSITIONING: PositioningDraft = { what: "", who: "", problem: "" };

export const WizardStep3SeoIntelligence = () => {
  const { data: siteAnalysis } = useSiteAnalysisQuery();
  // Saved workspace positioning — the source of truth for a returning /
  // re-onboarding user. seoIntelSettings carries competitors but NOT
  // positioning, so without this the wizard only ever seeded a fresh AI
  // draft and a paid customer who'd already answered saw blank fields
  // (wp.org QA, 2026-09-03).
  const { data: savedPositioning } = useWizardPositioningQuery();
  const suggestedCompetitors = siteAnalysis?.suggestedCompetitors ?? [];
  const { successToast, errorToast } = useToast();
  const { isPaidLicense } = useLicense();

  const step3 = useWizardStore((s) => s.drafts.step3);
  const setStep3Draft = useWizardStore((s) => s.setStep3Draft);
  const setStepValid = useWizardStore((s) => s.setStepValid);
  const prewarmedPositioning = useWizardStore((s) => s.prewarmedPositioning);

  // The store draft is the source of truth. Seed it once from any
  // server-saved settings (returning user who saved before) so the
  // wizard reflects prior work; thereafter the draft owns everything.
  // `loadedPositioningRef` keeps what the step opened with and who wrote it:
  // an AI draft replaces an unchanged AI draft without asking
  // (specs/site-reading.md §11).
  const seededRef = useRef(false);
  const loadedPositioningRef = useRef<
    (PositioningDraft & { source: SeoStepDraft["positioningSource"] }) | null
  >(null);
  useEffect(() => {
    if (seededRef.current) return;
    if (step3) {
      seededRef.current = true;
      loadedPositioningRef.current = { ...step3.positioning, source: step3.positioningSource };
      return;
    }
    // Wait for the saved-positioning read before seeding, so a returning
    // user hydrates their real answers instead of racing in a blank/AI
    // draft. `undefined` = still loading; `{ positioning: null }` = none
    // saved (fine to seed from the prewarmed draft).
    if (savedPositioning === undefined) return;
    seededRef.current = true;
    // Priority: saved workspace positioning → prewarmed AI draft → empty.
    const saved = savedPositioning.positioning;
    const hasSaved = !!(saved && (saved.what || saved.who || saved.problem));
    const positioning = hasSaved
      ? { what: saved!.what ?? "", who: saved!.who ?? "", problem: saved!.problem ?? "" }
      : prewarmedPositioning ?? EMPTY_POSITIONING;
    // The saved source, not "user": every saved positioning used to come back
    // as the operator's own, so a draft asked even over an untouched saved AI
    // draft and Finish wrote it back as "user" (2026-11-13).
    const savedSource =
      saved?.source === "ai_draft" || saved?.source === "edited" ? saved.source : "user";
    const positioningSource: SeoStepDraft["positioningSource"] = hasSaved
      ? savedSource
      : prewarmedPositioning
        ? "ai_draft"
        : "user";
    loadedPositioningRef.current = { ...positioning, source: positioningSource };
    setStep3Draft({
      positioning,
      positioningSource,
      competitorUrls: siteAnalysis?.seoIntelSettings?.competitorUrls ?? [],
      referralLinks: siteAnalysis?.seoIntelSettings?.referralLinks ?? [],
    });
  }, [step3, siteAnalysis, setStep3Draft, prewarmedPositioning, savedPositioning]);

  // Convenience accessors with safe fallbacks.
  const positioning = step3?.positioning ?? EMPTY_POSITIONING;
  const positioningSource = step3?.positioningSource ?? "user";
  const savedCompetitors = step3?.competitorUrls ?? [];
  const savedReferralLinks = step3?.referralLinks ?? [];

  const patch = (p: Partial<NonNullable<typeof step3>>) =>
    setStep3Draft({
      positioning,
      positioningSource,
      competitorUrls: savedCompetitors,
      referralLinks: savedReferralLinks,
      ...p,
    });

  /* ─── Validity ────────────────────────────────────────────────── */
  useEffect(() => {
    const positioningComplete =
      positioning.what.trim().length > 0 &&
      positioning.who.trim().length > 0 &&
      positioning.problem.trim().length > 0;
    setStepValid(3, positioningComplete);
  }, [positioning, setStepValid]);

  /* ─── 3a. Positioning ─────────────────────────────────────────── */
  const suggestPositioning = useSuggestWizardPositioningMutation();
  const setPositioning = (next: PositioningDraft) =>
    patch({ positioning: next, positioningSource: positioningSource === "ai_draft" ? "edited" : positioningSource });
  // The pages the last AI draft in this visit read (specs/site-reading.md §5a).
  const [pagesRead, setPagesRead] = useState<PositioningPageRead[]>([]);
  // The last AI draft in this visit, automatic or from the button.
  const sessionDraftRef = useRef<PositioningDraft | null>(null);
  const [confirmRedraft, setConfirmRedraft] = useState(false);

  // The button selects and reads the site's pages again (`reselectPages`),
  // as the Site → Info card does (specs/site-reading.md §11).
  const runAiDraft = async () => {
    try {
      const res = await suggestPositioning.mutateAsync({ reselectPages: true });
      if (res.suggestion) {
        const drafted: PositioningDraft = {
          what: res.suggestion.what,
          who: res.suggestion.who,
          problem: res.suggestion.problem,
        };
        sessionDraftRef.current = drafted;
        if (res.pages) setPagesRead(res.pages);
        patch({ positioning: drafted, positioningSource: "ai_draft" });
        successToast(__("Drafted from your site's pages. Edit anything below.", "structura"));
        return;
      }
      // No suggestion came back. Tell the user why and what to do.
      errorToast(
        res.reason === "missing_domain"
          ? __(
              "We couldn't find a public homepage to read. Add your website URL on the Site info step, or just fill the answers in yourself.",
              "structura",
            )
          : __(
              "AI couldn't draft this right now. Try again in a moment, or fill the answers in yourself.",
              "structura",
            ),
      );
    } catch {
      errorToast(
        __(
          "Something went wrong drafting from your homepage. Please try again.",
          "structura",
        ),
      );
    }
  };

  const handleAiDraftPositioning = () => {
    if (redraftNeedsConfirm(positioning, loadedPositioningRef.current, sessionDraftRef.current)) {
      setConfirmRedraft(true);
      return;
    }
    void runAiDraft();
  };

  /* ─── 3b. Competitors (instant, local) ────────────────────────── */
  // One `patch` per batch so a pasted "a.com, b.com" lands in a single write.
  const addCompetitors = (raw: string[]) => {
    const trimmed = raw.map((r) => r.trim()).filter(Boolean);
    if (trimmed.length === 0) return;
    patch({
      competitorUrls: Array.from(new Set([...savedCompetitors, ...trimmed])),
    });
  };
  const addCompetitor = (raw: string) => addCompetitors([raw]);

  const removeCompetitor = (url: string) =>
    patch({ competitorUrls: savedCompetitors.filter((c) => c !== url) });

  const suggestedNotAdopted = useMemo(() => {
    const savedHosts = new Set(
      savedCompetitors.map((c) => hostnameOf(c)).filter(Boolean) as string[],
    );
    return suggestedCompetitors.filter(
      (s) => !savedHosts.has(s.domain.replace(/^www\./, "")),
    );
  }, [savedCompetitors, suggestedCompetitors]);

  // Suggested-competitor chips carry the SERP-overlap count (`intersections`)
  // as the dimmed inline count. `value` is the URL we'll store; `label` the host.
  const competitorSuggested: DiscoverableChipItem[] = useMemo(
    () =>
      suggestedNotAdopted.slice(0, 6).map((s) => ({
        value: `https://${s.domain}`,
        label: s.domain,
        count: s.intersections,
      })),
    [suggestedNotAdopted],
  );

  /* ─── Auto-add DFS-measured competitors (high confidence) ─────── */
  // SERP-overlap peers from DataForSEO are MEASURED data — prefill them so
  // the user only trims, matching the magic-loader "added by default" UX.
  // AI-guessed fallbacks (below) stay suggestions: a fresh, un-indexed site
  // gets no measured peers, so we never force speculative competitors on it.
  const dfsAutoAddedRef = useRef(false);
  useEffect(() => {
    if (dfsAutoAddedRef.current) return;
    if (!step3 || !isPaidLicense) return;
    if (savedCompetitors.length > 0) return; // hydrated / user already has some
    if (suggestedNotAdopted.length === 0) return; // wait for DFS; none measured
    dfsAutoAddedRef.current = true;
    patch({
      competitorUrls: suggestedNotAdopted
        .slice(0, 6)
        .map((s) => `https://${s.domain}`),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step3, isPaidLicense, savedCompetitors.length, suggestedNotAdopted]);

  /* ─── 3b'. AI competitor fallback ─────────────────────────────── */
  // DFS SERP-overlap only has data once a site ranks; new domains get
  // nothing. Mirror the Site → Competitors ladder: when DFS is empty and
  // positioning carries signals, ask the AI for likely peers and label
  // them with their rationale.
  //
  // Cached query, NOT a mount-scoped mutation. The pre-2026-07-16 shape
  // (one-shot ref + useState + mutateAsync) re-fired the AI call and
  // dropped its results on EVERY remount of this step, so any churn
  // that remounted the wizard turned the row into a permanent
  // "Looking for likely competitors…" loop. The query's session cache
  // makes remounts free; `enabled` carries the same gates the one-shot
  // effect enforced (paid, DFS empty, positioning complete — firing on
  // the first keystroke of `what` would burn the call on a fragment).
  const positioningComplete =
    positioning.what.trim().length > 0 &&
    positioning.who.trim().length > 0 &&
    positioning.problem.trim().length > 0;
  const aiCompetitorsQuery = useWizardAiCompetitorsQuery({
    positioning: {
      what: positioning.what,
      who: positioning.who,
      problem: positioning.problem,
    },
    excludeDomains: savedCompetitors
      .map((c) => hostnameOf(c))
      .filter(Boolean) as string[],
    enabled:
      isPaidLicense &&
      suggestedCompetitors.length === 0 &&
      positioningComplete,
  });
  const aiCompetitors = aiCompetitorsQuery.data?.suggestions ?? [];

  const aiCompetitorsNotAdopted = useMemo(() => {
    const savedHosts = new Set(
      savedCompetitors.map((c) => hostnameOf(c)).filter(Boolean) as string[],
    );
    return aiCompetitors.filter(
      (s) => !savedHosts.has(s.domain.replace(/^www\./, "")),
    );
  }, [savedCompetitors, aiCompetitors]);

  /* ─── Auto-suggest orchestrator (paid, empty first entry) ─────── */
  // One blocking pass that turns the blank form into a pre-filled one:
  // positioning drafts first (everything else feeds off it), then AI
  // competitors fetch when DFS has no data.
  const [autoSuggesting, setAutoSuggesting] = useState(false);
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current) return;
    if (!step3) return; // wait for the seed effect
    if (!isPaidLicense) return;
    // Gate the positioning auto-draft on POSITIONING being blank only —
    // independent of competitors (DFS-measured ones auto-add separately
    // below), so a competitor auto-add can never suppress the positioning
    // draft. Positioning present = a returning/hydrated user → don't redraft.
    const positioningBlank =
      !positioning.what.trim() &&
      !positioning.who.trim() &&
      !positioning.problem.trim();
    if (!positioningBlank) {
      autoRanRef.current = true;
      return;
    }
    autoRanRef.current = true;
    setAutoSuggesting(true);
    void (async () => {
      try {
        let res = await suggestPositioning.mutateAsync();
        // A fresh (re-)onboard can race the homepage scrape / the activation's
        // publicUrl settling: the auto pass comes back empty even though a
        // manual draft seconds later succeeds (Yurii report 2026-06-23 — the
        // loader ran, then the form was blank). Retry once before giving up.
        if (!res.suggestion) {
          await new Promise((r) => setTimeout(r, 2000));
          res = await suggestPositioning.mutateAsync();
        }
        const p = res.suggestion;
        if (!p) return; // still no homepage to read — reveal the manual form
        const next: PositioningDraft = {
          what: p.what,
          who: p.who,
          problem: p.problem,
        };
        if (res.pages) setPagesRead(res.pages);
        // This visit's draft: the button replaces it without asking until
        // it is edited.
        sessionDraftRef.current = next;
        patch({ positioning: next, positioningSource: "ai_draft" });
        // Competitors are NOT awaited here: patching the positioning
        // flips the cached query's `enabled` gate and it fetches on its
        // own, showing the row-level spinner. Holding the full-screen
        // loader for it doubled the blocking time and re-crashed into
        // the remount-refire loop this component used to have.
      } catch {
        // Reveal the manual form; the per-section buttons remain.
      } finally {
        setAutoSuggesting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step3, isPaidLicense]);

  const AUTO_STAGES = useMemo(
    () => [
      __("Reading your homepage…", "structura"),
      __("Drafting your positioning…", "structura"),
      __("Scouting competitors…", "structura"),
    ],
    [],
  );

  // One suggested-competitor row: DFS SERP-overlap chips when measured
  // data exists, else the AI fallback's rationale-tooltip chips.
  const competitorChips: DiscoverableChipItem[] =
    competitorSuggested.length > 0
      ? competitorSuggested
      : aiCompetitorsNotAdopted.slice(0, 6).map((s) => ({
          value: `https://${s.domain}`,
          label: s.domain,
          tooltip: s.rationale || undefined,
        }));

  const addAllCompetitorChips = () =>
    patch({
      competitorUrls: Array.from(
        new Set([...savedCompetitors, ...competitorChips.map((c) => c.value)]),
      ),
    });

  /* ─── Render ──────────────────────────────────────────────────── */
  if (autoSuggesting) {
    return (
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-3 text-center">
          <h1 className="m-0! text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {__("Tell us about your business", "structura")}
          </h1>
        </header>
        <Card className="p-8">
          <WizardMagicLoader
            icon={Search}
            title={__("Researching your business", "structura")}
            stages={AUTO_STAGES}
            cadenceMs={2400}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 text-center">
        <h1 className="m-0! text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          {__("Tell us about your business", "structura")}
        </h1>
        <p className="m-0! text-base text-neutral-600 dark:text-neutral-400">
          {__(
            "Three quick questions and a couple of competitors. We'll do the heavy lifting from there — each campaign discovers its own keywords and sources.",
            "structura",
          )}
        </p>
      </header>

      {/* 3a. POSITIONING */}
      <Card className="flex flex-col gap-5 p-8">
        <SectionHeader
          number={1}
          label={__("About your business", "structura")}
          action={
            <Button
              variant="transparent"
              size="sm"
              onClick={handleAiDraftPositioning}
              disabled={suggestPositioning.isPending}
            >
              {suggestPositioning.isPending ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <Sparkles size={14} className="mr-1.5" />
              )}
              {__("AI draft", "structura")}
            </Button>
          }
        />

        <PositioningTextArea
          label={__("In one sentence, what does your business do?", "structura")}
          value={positioning.what}
          onChange={(e) =>
            setPositioning({ ...positioning, what: e.target.value })
          }
          rows={2}
          placeholder={__(
            "We help remote design teams ship Figma faster…",
            "structura",
          )}
        />
        <PositioningTextArea
          label={__("Who's your typical customer?", "structura")}
          value={positioning.who}
          onChange={(e) =>
            setPositioning({ ...positioning, who: e.target.value })
          }
          rows={2}
          placeholder={__(
            "Senior designers at 20–200-person companies…",
            "structura",
          )}
        />
        <PositioningTextArea
          label={__("What problem do you solve for them?", "structura")}
          value={positioning.problem}
          onChange={(e) =>
            setPositioning({ ...positioning, problem: e.target.value })
          }
          rows={2}
          placeholder={__(
            "Async handoff between designers and engineers breaks down…",
            "structura",
          )}
        />
        <PositioningPagesRead pages={pagesRead} drafted />

        {positioningSource === "ai_draft" ? (
          <p className="m-0! flex! items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <Badge intent="info">{__("AI draft", "structura")}</Badge>
            <span>
              {__(
                "Edit anything that doesn't feel right — your changes overwrite the draft.",
                "structura",
              )}
            </span>
          </p>
        ) : null}

        <RedraftConfirmDialog
          isOpen={confirmRedraft}
          onClose={() => setConfirmRedraft(false)}
          onConfirm={() => {
            setConfirmRedraft(false);
            void runAiDraft();
          }}
        />
      </Card>

      {/* 3b. COMPETITORS */}
      <Card className="flex flex-col gap-5 p-8">
        <SectionHeader
          number={2}
          icon={<Users size={14} className="text-brand-500" />}
          label={__("Sites you compete with", "structura")}
        />

        <DiscoverableChipList
          kind="domain"
          labels={buildChipListLabels()}
          ariaLabel={__("Competitors", "structura")}
          added={savedCompetitors.map((url) => ({
            value: url,
            label: hostnameOf(url) || url,
          }))}
          suggested={competitorChips}
          onAdd={addCompetitor}
          onRemove={removeCompetitor}
          onAddAll={competitorChips.length > 0 ? addAllCompetitorChips : undefined}
          onDiscover={() => {
            // Bypasses staleTime and re-reads the CURRENT positioning +
            // exclude list (query options refresh every render).
            void aiCompetitorsQuery.refetch();
          }}
          discoverLabel={__("Suggest competitors", "structura")}
          discovering={aiCompetitorsQuery.isFetching}
          suggestedLabel={
            competitorSuggested.length > 0
              ? __("Auto-detected from your site", "structura")
              : __("AI-suggested — tap to add", "structura")
          }
          suggestedNotice={
            aiCompetitorsQuery.isFetching && competitorChips.length === 0 ? (
              <span className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <Loader2 size={12} className="animate-spin" />
                {__("Looking for likely competitors…", "structura")}
              </span>
            ) : undefined
          }
          inputPlaceholder="https://example.com"
          onAddManual={(values) => {
            addCompetitors(values);
          }}
        />
      </Card>

      {/* Defensive self-gate: this whole step is already swapped for a
          LockedStepCard on free tiers (OnboardingPage), so free users never
          reach here — but referral links are paid-only, so the editor locks
          itself too in case it's ever rendered outside that upstream lock. */}
      <ReferralLinksEditor
        binding="site"
        value={savedReferralLinks}
        onChange={(referralLinks) => patch({ referralLinks })}
        labels={buildReferralLabels()}
        disabled={!isPaidLicense}
      />
    </div>
  );
};

/* ─── Small bits ──────────────────────────────────────────────── */

const SectionHeader = ({
  number,
  label,
  icon,
  action,
}: {
  number: number;
  label: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <div className="flex items-center justify-between gap-4 border-b border-neutral-100 pb-3 dark:border-neutral-800">
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-950/30 dark:text-brand-300">
        {number}
      </span>
      <h3 className="m-0! flex! items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
        {icon}
        {label}
      </h3>
    </div>
    {action}
  </div>
);

function hostnameOf(raw: string): string | null {
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
