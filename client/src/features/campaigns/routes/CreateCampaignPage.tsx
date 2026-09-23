import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { __, sprintf } from "@wordpress/i18n";
import apiFetch from "@wordpress/api-fetch";
import { contentLanguageLabel } from "@structura/i18n-contracts";
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronsRight,
  Compass,
  FolderOpen,
  Globe,
  HelpCircle,
  Image as ImageIcon,
  Key,
  Layout,
  Layers,
  Loader2,
  MessageSquare,
  RefreshCw,
  Rocket,
  Scale,
  Settings2,
  Shield,
  Sparkles,
  Tag,
  Target,
  Trash2,
} from "lucide-react";
import {
  Alert,
  Button,
  Card,
  cn,
  ConfirmDialog,
  InputField,
  SetupRationaleStrip,
  Skeleton,
  Switch,
  TextArea,
  Tooltip,
} from "@structura/ui";
import { PageTitle } from "@/components/Layout/PageTitle";
import { PageDescription } from "@/components/Layout/PageSubtitle";
import { PageContainer } from "@/components/Layout/PageContainer";
import { DefaultPersonaAdvisory } from "@/components/Shared/DefaultPersonaAdvisory";
import { NoPersonasBlocker } from "@/components/Shared/NoPersonasBlocker";
import { usePersonasQuery } from "@/features/personas";
import { PageBuilderCompatCard } from "@/features/campaigns/components/PageBuilderCompatCard";
import { VisualStyleFallbackNotice } from "@/features/campaigns/components/VisualStyleFallbackNotice";
import { CampaignProvider, useCampaignForm } from "@/features/campaigns/context/CampaignContext";
import { useCampaignDraftStore } from "@/features/campaigns/context/draftStore";
import {
  isCampaignLimitReachedError,
  useCampaignMutations,
} from "@/features/campaigns/api/useCampaignMutations";
import {
  useCampaignSetupDraft,
  type CampaignSetupDraft,
} from "@/features/campaigns/api/useCampaignSetupDraft";
import {
  CampaignLanguageField,
  adminUiLocale,
  useSiteContentLanguage,
} from "@/features/campaigns/components/CampaignLanguageField";
import {
  WritingApproachOverride,
  campaignModeShortLabel,
} from "@/features/campaigns/components/WritingApproachOverride";
import { setupRationaleItems } from "@/features/campaigns/labels";
import { StepKeywords, KeywordDiscoveryHandle } from "@/features/campaigns/components/steps/StepKeywords";
import { AuthorityDiscovery, AuthorityDiscoveryHandle } from "@/features/campaigns/components/steps/AuthorityDiscovery";
import { SimpleStepRhythm } from "@/features/campaigns/components/steps/SimpleStepRhythm";
import { TaxonomySection } from "@/features/campaigns/components/TaxonomySection";
import { AIProvider } from "@/features/campaigns/types";
import { ProviderToggle } from "@/features/campaigns/components/ProviderToggle";
import { mirrorModelForTier } from "@/features/campaigns/modelTier";
import { CampaignAiEngineSection } from "@/features/campaigns/components/CampaignAiEngineSection";
import { CoreContentSettings } from "@/features/campaigns/components/CoreContentSettings";
import {
  SeoRuleName,
  SUPPORTED_BLOCK_TYPE,
  useDefaultProviders,
  useLicense,
  usePublicSiteProfile,
  useSeoRules,
} from "@/features/settings";
import { CONTENT_BLOCKS } from "@/features/settings/constants";

// ─── Page wrapper — provides CampaignProvider ────────────────────────────

const CreateCampaignPage = () => {
  return (
    <CampaignProvider mode="campaign">
      <CreateCampaignInner />
    </CampaignProvider>
  );
};

export default CreateCampaignPage;

// ─── Step definitions ────────────────────────────────────────────────────

interface StepDef {
  id: string;
  label: string;
  icon: typeof MessageSquare;
}

// The Interview step is gone (spec `campaign-language-and-smart-setup.md`
// §4.1): the questions it asked are all answerable from the site itself, so
// Setup arrives drafted instead of blank.
const ALL_STEPS: StepDef[] = [
  { id: "setup", label: __("Setup", "structura"), icon: Compass },
  { id: "keywords", label: __("Keywords", "structura"), icon: Key },
  { id: "authority", label: __("Authority", "structura"), icon: Shield },
  { id: "rhythm", label: __("Rhythm", "structura"), icon: CalendarClock },
  { id: "summary", label: __("Summary", "structura"), icon: Layers },
];

// ─── Horizontal stepper ─────────────────────────────────────────────────

// Exported for unit testing — reachability is what decides whether a user
// who steps back can get forward again (2026-09-22).
export const HorizontalStepper = ({
  steps,
  activeStep,
  completedSteps,
  skippedSteps,
  visitedSteps,
  onStepClick,
}: {
  steps: StepDef[];
  activeStep: string;
  completedSteps: Set<string>;
  skippedSteps: Set<string>;
  /** Steps the user has been on, complete or not — see the page's state. */
  visitedSteps: Set<string>;
  onStepClick: (step: string) => void;
}) => {
  return (
    <nav className="py-2">
      <div className="flex items-start">
        {steps.map((step, i) => {
          const isActive = activeStep === step.id;
          const isComplete = completedSteps.has(step.id);
          const isSkipped = skippedSteps.has(step.id);
          const activeIdx = steps.findIndex((s) => s.id === activeStep);
          const isReachable =
            i <= activeIdx || isComplete || isSkipped || visitedSteps.has(step.id);
          const Icon = step.icon;

          return (
            <div key={step.id} className="flex flex-1 items-start">
              {/* Step circle + label */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => isReachable && onStepClick(step.id)}
                  disabled={!isReachable}
                  className={cn(
                    "group flex flex-col items-center gap-2 disabled:cursor-not-allowed",
                    isReachable && "cursor-pointer"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full transition-all",
                      isComplete
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
                        : isSkipped
                          ? "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
                          : isActive
                            ? "bg-brand-600 text-white shadow-md shadow-brand-600/25 ring-4 ring-brand-100 dark:bg-brand-500 dark:ring-brand-950/40"
                            : isReachable
                              ? "bg-neutral-200 text-neutral-500 group-hover:bg-brand-100 group-hover:text-brand-600 dark:bg-neutral-700 dark:text-neutral-400 dark:group-hover:bg-brand-900/50 dark:group-hover:text-brand-400"
                              : "bg-neutral-200 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
                    )}
                  >
                    {isComplete ? (
                      <Check size={18} strokeWidth={2.5} />
                    ) : isSkipped ? (
                      <ChevronsRight size={16} className="opacity-50" />
                    ) : (
                      <Icon size={16} />
                    )}
                  </div>
                  <span
                    className={cn(
                      "max-w-[80px] text-center text-[11px] font-bold leading-tight tracking-wide",
                      isComplete
                        ? "text-emerald-600 dark:text-emerald-400"
                        : isSkipped
                          ? "text-neutral-400 dark:text-neutral-500"
                          : isActive
                            ? "text-brand-700 dark:text-brand-300"
                            : isReachable
                              ? "text-neutral-500 dark:text-neutral-400"
                              : "text-neutral-400 dark:text-neutral-500"
                    )}
                  >
                    {isSkipped ? __("Skipped", "structura") : step.label}
                  </span>
                </button>
              </div>

              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className="mt-5 flex flex-1 items-center px-2">
                  <div
                    className={cn(
                      "h-0.5 w-full rounded-full transition-colors",
                      completedSteps.has(step.id) || skippedSteps.has(step.id)
                        ? isSkipped
                          ? "bg-neutral-300 dark:bg-neutral-600"
                          : "bg-emerald-300 dark:bg-emerald-700"
                        : "bg-neutral-200 dark:bg-neutral-700"
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
};

// ─── Inner component (consumes CampaignProvider) ─────────────────────────

const CreateCampaignInner = () => {
  const navigate = useNavigate();
  const { formData, updateForm, isValid } = useCampaignForm();
  const { createCampaign, isCreating } = useCampaignMutations();
  const { isPaidLicense } = useLicense();

  const hasAuthorityRule = formData.intelligence.seoRules?.outbound_link_authority === true;

  const keywordsRef = useRef<KeywordDiscoveryHandle>(null);
  const authorityRef = useRef<AuthorityDiscoveryHandle>(null);
  // Active step + completion state come from the persisted draft store so
  // navigating away mid-flow and returning resumes where the user left off.
  const activeStep = useCampaignDraftStore((s) => s.activeStep);
  const completedStepsArr = useCampaignDraftStore((s) => s.completedSteps);
  const skippedStepsArr = useCampaignDraftStore((s) => s.skippedSteps);
  const setActiveStep = useCampaignDraftStore((s) => s.setActiveStep);
  const markComplete = useCampaignDraftStore((s) => s.markComplete);
  const markSkipped = useCampaignDraftStore((s) => s.markSkipped);
  const clearStepFlag = useCampaignDraftStore((s) => s.clearStepFlag);
  const discardDraft = useCampaignDraftStore((s) => s.discardDraft);
  // The store's own updater, for the one write that must NOT mark the draft
  // as the user's work — see the language seed below.
  const updateFormStore = useCampaignDraftStore((s) => s.updateForm);
  const hasDraft = useCampaignDraftStore((s) => s.lastUpdatedAt !== null);

  const completedSteps = useMemo(() => new Set(completedStepsArr), [completedStepsArr]);
  const skippedSteps = useMemo(() => new Set(skippedStepsArr), [skippedStepsArr]);

  // Discovery phase tracking — intentionally NOT persisted. These reflect
  // a transient in-flight discovery call; resuming a draft should land
  // on the saved step but let the user re-trigger discovery themselves.
  const [keywordsPhase, setKeywordsPhase] = useState<string>("idle");
  const [authorityPhase, setAuthorityPhase] = useState<string>("idle");

  // Setup-draft topics → explicit keyword-discovery seeds (the slot the
  // retired Interview step's chips filled). Transient, like the phase
  // trackers above: the objective persists in the draft and is the fallback
  // seed source, so a resumed draft simply re-derives seeds from it.
  const [draftTopics, setDraftTopics] = useState<string[]>([]);

  // Steps the user has actually been on. The completed/skipped flags only
  // land when a step is left FORWARD, so the step someone was standing on
  // when they clicked back up the strip became unreachable — they had to
  // walk the whole flow again to return to it (2026-09-22).
  const [visitedSteps, setVisitedSteps] = useState<Set<string>>(
    () => new Set([activeStep])
  );

  // Build the steps list dynamically.
  //
  // Authority step shows when:
  //   - paid users have the `outbound_link_authority` SEO rule enabled
  //     (`hasAuthorityRule`) — Free defaults to off via `NO_SEO_RULES`
  //     in `helpers.ts`, so paid users see it whenever they've opted in;
  //   - non-paid users always — the step renders its locked teaser
  //     inside (`AuthorityDiscovery` checks `isPaidLicense`), mirroring
  //     the Keywords step's tier-gating UX so free users can see what
  //     they're missing and skip past with one click.
  const steps = ALL_STEPS.filter(
    (s) => s.id !== "authority" || hasAuthorityRule || !isPaidLicense
  );

  // ── Resume-draft URL handling ─────────────────────────────────────────
  //
  // Companion to `buildWizardResumeUrl` (see
  // `client/src/features/campaigns/utils/wizardReturnUrl.ts`). When the
  // user comes back from the portal or marketing pricing page via a
  // returnTo link, the URL looks like:
  //
  //   #/campaigns/new?resume=draft&step=keywords
  //
  // We honor `step` only when:
  //   - a draft actually exists (otherwise we'd jump into a wizard
  //     that's about to discard whatever the user types because no
  //     prior identity / objective was filled in), AND
  //   - the requested step is one of the resumable steps wired by
  //     `ResumableWizardStep` (defensive — narrows the implicit
  //     contract with the URL helper).
  //
  // After applying the jump we strip `resume` and `step` from the URL
  // so a refresh doesn't keep re-firing the jump (and so the user
  // can navigate around without the URL claiming they're still mid-
  // resume). Replace-state — not push — keeps the back button sane.
  const [searchParams, setSearchParams] = useSearchParams();
  const resumeApplied = useRef(false);
  useEffect(() => {
    if (resumeApplied.current) return;
    const resume = searchParams.get("resume");
    const requestedStep = searchParams.get("step");
    if (resume !== "draft" || !requestedStep) return;
    // Resume only makes sense when there's actually a draft to resume.
    if (!hasDraft) return;
    const stepExists = steps.some((s) => s.id === requestedStep);
    if (!stepExists) return;
    resumeApplied.current = true;
    setActiveStep(requestedStep);
    const next = new URLSearchParams(searchParams);
    next.delete("resume");
    next.delete("step");
    setSearchParams(next, { replace: true });
  }, [searchParams, hasDraft, steps, setActiveStep, setSearchParams]);

  const goToStep = useCallback(
    (step: string) => {
      setActiveStep(step);
      setVisitedSteps((visited) =>
        visited.has(step) ? visited : new Set(visited).add(step)
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [setActiveStep]
  );

  const nextStep = useCallback(
    (currentStepId: string) => {
      const idx = steps.findIndex((s) => s.id === currentStepId);
      if (idx < steps.length - 1) {
        goToStep(steps[idx + 1].id);
      }
    },
    [steps, goToStep]
  );

  // ── Setup draft (spec §4.4) ───────────────────────────────────────────
  //
  // Two stages: a deterministic draft everyone gets the instant the step
  // mounts, then an AI refinement that replaces the same fields in place.
  // The refinement is paid-only and never automatic — it burns a model call
  // to rewrite prose the user may already be editing, so it waits for Magic
  // suggest (owner decision 2026-09-23).

  const { isLoading: loadingProfile } = usePublicSiteProfile();
  const siteLanguage = useSiteContentLanguage();
  const language = formData.intelligence.language;

  // A new campaign starts in the site's own language. Seeded BEFORE the draft
  // call so the cloud drafts in the right language on the first pass instead
  // of drafting in English and being asked again.
  //
  // Two details this effect has to survive. It writes UNTOUCHED, because
  // opening the wizard is not a draft anybody asked to resume. And it keys on
  // the whole `formData` object, not on the language string: the
  // license-defaults bootstrap in CampaignProvider replaces the entire form
  // right after this (child) effect runs, so the seeded value is reverted
  // before it is ever rendered — watching the string alone would see no
  // change and never retry.
  const [languageSeeded, setLanguageSeeded] = useState(false);
  useEffect(() => {
    if (languageSeeded || loadingProfile) return;
    const current = useCampaignDraftStore.getState().formData.intelligence.language;
    // Nothing to seed (WordPress reports no language) — leave the sentinel
    // and let the cloud resolve it.
    if (current !== "default" || !siteLanguage) {
      setLanguageSeeded(true);
      return;
    }
    updateFormStore("intelligence", { language: siteLanguage }, { markTouched: false });
  }, [languageSeeded, loadingProfile, formData, siteLanguage, updateFormStore]);

  // Latched, not `activeStep === "setup"`: flipping this back and forth would
  // re-fire the draft every time the user walks back up the strip and clobber
  // what they wrote.
  const [setupEntered, setSetupEntered] = useState(activeStep === "setup");
  useEffect(() => {
    if (activeStep === "setup") setSetupEntered(true);
  }, [activeStep]);

  // What the last accepted draft wrote, so a field the user has since edited
  // survives the AI pass landing on top of it.
  const draftedRef = useRef<{ name: string; objective: string } | null>(null);
  // Set when the user confirms a language change: they asked for a redraft,
  // so it replaces their edits (the ConfirmDialog says so).
  const forceDraftRef = useRef(false);

  const applyDraft = useCallback(
    (draft: CampaignSetupDraft) => {
      // Read the live store, not the render closure: the draft lands
      // asynchronously, long after this callback was created.
      const identity = useCampaignDraftStore.getState().formData.identity;
      const previous = draftedRef.current;
      // An `ai` draft only ever arrives because the user pressed Magic
      // suggest and — if they had edits — confirmed losing them, so it is
      // always a replacement. Deriving it from the stage rather than a flag
      // set at click time means a failed run can't leave the flag armed for
      // some later, unrelated draft.
      const force = forceDraftRef.current || draft.stage === "ai";
      forceDraftRef.current = false;
      draftedRef.current = { name: draft.name, objective: draft.objective };

      const keepName = !force && identity.name.length > 0 && identity.name !== previous?.name;
      const keepObjective =
        !force && identity.objective.length > 0 && identity.objective !== previous?.objective;

      updateForm("identity", {
        ...(keepName ? {} : { name: draft.name }),
        ...(keepObjective ? {} : { objective: draft.objective }),
        // An explicit override in Advanced outranks the inference for good.
        ...(identity.campaignModeSource === "user"
          ? {}
          : { campaignMode: draft.campaignMode, campaignModeSource: "inferred" as const }),
        setupRationale: draft.rationale,
      });
      setDraftTopics(draft.topics);
    },
    [updateForm]
  );

  const {
    draft,
    isDrafting,
    isRefining,
    error: draftError,
    refineError,
    redraft,
    refine,
  } = useCampaignSetupDraft({
    language,
    enabled: languageSeeded && setupEntered,
    onDraft: applyDraft,
  });

  const changeLanguage = useCallback(
    (code: string) => {
      forceDraftRef.current = true;
      updateForm("intelligence", { language: code });
    },
    [updateForm]
  );


  // ── Setup confirmation handler ────────────────────────────────────────

  const confirmSetup = () => {
    markComplete("setup");
    goToStep("keywords");
  };

  // ── Launch campaign handler ───────────────────────────────────────────

  const handleLaunch = async () => {
    if (keywordsRef.current) {
      const bank = keywordsRef.current.getKeywords();
      updateForm("keywords", {
        bank,
        discoveryMeta: keywordsRef.current.getDiscoveryMeta(),
        discoveredAt: bank.length > 0 ? new Date().toISOString() : null,
      });
    }
    if (authorityRef.current) {
      const domains = authorityRef.current.getDomains();
      updateForm("authority", {
        domains,
        discoveredAt: domains.length > 0 ? new Date().toISOString() : null,
      });
    }

    await new Promise((r) => setTimeout(r, 50));

    try {
      await createCampaign({ data: formData });
      // Successful launch — clear the draft so the next visit to
      // /campaigns/new starts fresh and the resume banner stops
      // offering this completed campaign.
      discardDraft();
      navigate("/campaigns");
    } catch (error) {
      // Most failures (transient cloud errors, validation) just surface
      // the mutation's toast and leave the user on the summary to retry.
      //
      // The cap-reached case is different: hitting the per-tier campaign
      // limit from inside the create wizard means a campaign already
      // exists for this license (commonly the very one this flow just
      // created — a slow/perceived-failed first submit that the cloud
      // actually committed, after which a second "Launch" hits the now-
      // reached cap). Leaving the wizard open strands the user on a
      // summary they can never submit. Close the flow to the list — same
      // as a success — so they land where their campaign is visible. The
      // mutation's sticky "Campaign limit reached" toast still explains
      // why, and survives the navigation.
      if (isCampaignLimitReachedError(error)) {
        discardDraft();
        navigate("/campaigns");
      }
    }
  };

  const handleDiscardDraft = useCallback(() => {
    discardDraft();
    navigate("/campaigns");
  }, [discardDraft, navigate]);

  // Discovery state helpers
  const isKeywordsRunning = keywordsPhase !== "idle" && keywordsPhase !== "complete";
  const isKeywordsComplete = keywordsPhase === "complete";
  const isAuthorityRunning = authorityPhase !== "idle" && authorityPhase !== "complete";
  const isAuthorityComplete = authorityPhase === "complete";

  return (
    <PageContainer variant="narrow" className="space-y-8 pb-16">
      {/* Page header */}
      <header className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate("/campaigns")}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-400 transition-colors hover:border-neutral-300 hover:text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:border-neutral-600 dark:hover:text-neutral-300"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <PageTitle>{__("New Campaign", "structura")}</PageTitle>
          <PageDescription>{__("Configure and launch your content strategy", "structura")}</PageDescription>
        </div>
      </header>

      {/* Persona notices — mutually exclusive by persona count. The
          blocker renders at 0 (Launch is also disabled in
          SummarySection); the advisory at exactly 1; both hide at 2+. */}
      <NoPersonasBlocker />
      <DefaultPersonaAdvisory />

      {/* Page-builder compatibility heads-up — renders only when
          Builder_Detector has reported a known builder. Silent on
          sites without one. Spec: specs/page-builder-compat.md §4.2. */}
      <PageBuilderCompatCard />

      {/* Horizontal stepper */}
      <HorizontalStepper
        steps={steps}
        activeStep={activeStep}
        completedSteps={completedSteps}
        skippedSteps={skippedSteps}
        visitedSteps={visitedSteps}
        onStepClick={goToStep}
      />

      {/* ── Active step content ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-sm sm:p-8 dark:border-neutral-800 dark:bg-neutral-900">
        {/* ── Setup ────────────────────────────────────────────────── */}
        {activeStep === "setup" && (
          <SetupSection
            draft={draft}
            isDrafting={isDrafting}
            isRefining={isRefining}
            error={draftError}
            refineError={refineError}
            onRetry={redraft}
            onRefine={refine}
            onLanguageChange={changeLanguage}
            onConfirm={confirmSetup}
          />
        )}

        {/* ── Keywords ─────────────────────────────────────────────── */}
        {activeStep === "keywords" && (
          <div className="space-y-6">
            <StepKeywords
              ref={keywordsRef}
              topic={formData.identity.objective}
              topicSeeds={draftTopics}
              campaignName={formData.identity.name}
              language={formData.intelligence.language}
              provider={formData.intelligence.textProvider}
              existingKeywords={formData.keywords?.bank?.length ? formData.keywords.bank : undefined}
              existingDiscoveryMeta={formData.keywords?.discoveryMeta}
              onKeywordsChange={() => {}}
              onPhaseChange={setKeywordsPhase}
              onSkipToNextStep={() => {
                markSkipped("keywords");
                nextStep("keywords");
              }}
            />
            {/* Action bar — only show after discovery completes */}
            {isKeywordsComplete && (
              <div className="flex items-center justify-end gap-3 border-t border-neutral-100 pt-5 dark:border-neutral-800">
                <Button
                  variant="transparent"
                  size="sm"
                  onClick={() => setKeywordsPhase("idle")}
                >
                  <RefreshCw size={14} className="mr-1.5" />
                  {__("Re-discover", "structura")}
                </Button>
                <Button
                  onClick={() => {
                    if (keywordsRef.current) {
                      const bank = keywordsRef.current.getKeywords();
                      updateForm("keywords", {
                        bank,
                        discoveryMeta: keywordsRef.current.getDiscoveryMeta(),
                        discoveredAt: bank.length > 0 ? new Date().toISOString() : null,
                      });
                    }
                    markComplete("keywords");
                    nextStep("keywords");
                  }}
                >
                  {__("Looks good — continue", "structura")}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Authority ────────────────────────────────────────────── */}
        {activeStep === "authority" && (
          <div className="space-y-6">
            <AuthorityDiscovery
              ref={authorityRef}
              topic={formData.identity.objective}
              campaignName={formData.identity.name}
              language={formData.intelligence.language}
              provider={formData.intelligence.textProvider}
              existingDomains={formData.authority?.domains?.length ? formData.authority.domains : undefined}
              onDomainsChange={() => {}}
              onPhaseChange={setAuthorityPhase}
              onSkipToNextStep={() => {
                markSkipped("authority");
                nextStep("authority");
              }}
            />
            {isAuthorityComplete && (
              <div className="flex items-center justify-end gap-3 border-t border-neutral-100 pt-5 dark:border-neutral-800">
                <Button
                  variant="transparent"
                  size="sm"
                  onClick={() => setAuthorityPhase("idle")}
                >
                  <RefreshCw size={14} className="mr-1.5" />
                  {__("Re-discover", "structura")}
                </Button>
                <Button
                  onClick={() => {
                    if (authorityRef.current) {
                      const domains = authorityRef.current.getDomains();
                      updateForm("authority", {
                        domains,
                        discoveredAt: domains.length > 0 ? new Date().toISOString() : null,
                      });
                    }
                    markComplete("authority");
                    nextStep("authority");
                  }}
                >
                  {__("Looks good — continue", "structura")}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Rhythm ───────────────────────────────────────────────── */}
        {activeStep === "rhythm" && (
          <div className="space-y-6">
            <SimpleStepRhythm />
            <div className="flex justify-end border-t border-neutral-100 pt-5 dark:border-neutral-800">
              <Button
                onClick={() => {
                  markComplete("rhythm");
                  nextStep("rhythm");
                }}
              >
                {__("Continue", "structura")}
              </Button>
            </div>
          </div>
        )}

        {/* ── Summary ──────────────────────────────────────────────── */}
        {activeStep === "summary" && (
          <SummarySection
            formData={formData}
            hasAuthorityRule={hasAuthorityRule}
            onLaunch={handleLaunch}
            isCreating={isCreating}
            isValid={isValid}
          />
        )}
      </div>

      {/* Footer actions — your draft is auto-saved as you type, so leaving
          via "Return" will restore where you left off next time. "Discard"
          is the explicit way to start over. */}
      <div className="flex flex-col items-center justify-center gap-3 text-xs sm:flex-row sm:gap-6">
        <button
          type="button"
          onClick={() => navigate("/campaigns")}
          className="cursor-pointer text-neutral-400 underline-offset-2 transition-colors hover:text-neutral-600 hover:underline dark:text-neutral-500 dark:hover:text-neutral-300"
        >
          {hasDraft
            ? __("Return to Campaigns (draft auto-saved)", "structura")
            : __("Cancel and return to Campaigns", "structura")}
        </button>
        {hasDraft && (
          <button
            type="button"
            onClick={handleDiscardDraft}
            className="inline-flex cursor-pointer items-center gap-1 text-rose-500 underline-offset-2 transition-colors hover:text-rose-600 hover:underline dark:text-rose-400 dark:hover:text-rose-300"
          >
            <Trash2 size={12} />
            {__("Discard draft and start over", "structura")}
          </button>
        )}
      </div>
    </PageContainer>
  );
};

// ─── Compact toggle row — label + tooltip + tier badge + switch ──────────

const CompactToggle = ({
  label,
  description,
  isEnabled,
  onToggle,
  isDisabled,
  badge,
}: {
  label: string;
  description?: string;
  isEnabled: boolean;
  onToggle: () => void;
  isDisabled?: boolean;
  badge?: React.ReactNode;
}) => (
  <div
    className={cn(
      "flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors",
      isDisabled ? "opacity-50" : "hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
    )}
  >
    <div className="flex min-w-0 items-center gap-1.5">
      <span
        className={cn(
          "truncate text-xs font-medium",
          isEnabled && !isDisabled
            ? "text-neutral-900 dark:text-white"
            : "text-neutral-600 dark:text-neutral-400"
        )}
      >
        {label}
      </span>
      {description && (
        <Tooltip title={description} position="top">
          <span className="shrink-0 cursor-help text-neutral-300 dark:text-neutral-600">
            <HelpCircle size={12} />
          </span>
        </Tooltip>
      )}
      {badge}
    </div>
    <Switch
      label={label}
      hiddenLabel
      checked={isEnabled}
      onChange={() => !isDisabled && onToggle()}
      disabled={isDisabled}
    />
  </div>
);

// ─── Collapsible settings group ─────────────────────────────────────────

const SettingsGroup = ({
  icon,
  label,
  count,
  children,
  defaultOpen = false,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors duration-200",
        open
          ? "border-brand-200 bg-brand-50/30 shadow-sm dark:border-brand-900/40 dark:bg-brand-950/20"
          : "border-neutral-200/70 hover:border-neutral-300 hover:shadow-sm dark:border-neutral-800 dark:hover:border-neutral-700"
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between px-3 py-2.5 transition-colors",
          open
            ? "rounded-t-lg"
            : "rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
        )}
      >
        <span className="flex items-center gap-2">
          {icon}
          <span
            className={cn(
              "text-[10px] font-black tracking-widest uppercase transition-colors",
              open
                ? "text-brand-600 dark:text-brand-400"
                : "text-neutral-500 dark:text-neutral-400"
            )}
          >
            {label}
          </span>
          {typeof count === "number" && (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums transition-colors",
                open
                  ? "bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400"
                  : "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
              )}
            >
              {count}
            </span>
          )}
        </span>
        <ChevronDown
          size={12}
          className={cn(
            "transition-transform duration-200",
            open
              ? "rotate-180 text-brand-500 dark:text-brand-400"
              : "text-neutral-400"
          )}
        />
      </button>
      {open && <div className="px-1 pb-2 pt-1">{children}</div>}
    </div>
  );
};

// ─── Tier badge pills ───────────────────────────────────────────────────

const ProBadge = () => (
  <span className="shrink-0 rounded-full bg-brand-50 px-1.5 py-0.5 text-[8px] font-black text-brand-600 uppercase dark:bg-brand-950/30 dark:text-brand-400">
    {__("Pro", "structura")}
  </span>
);
const FreeBadge = () => (
  <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-black text-emerald-600 uppercase dark:bg-emerald-950/30 dark:text-emerald-400">
    {__("Free", "structura")}
  </span>
);
const RequiredBadge = () => (
  <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[8px] font-black text-neutral-500 uppercase dark:bg-neutral-800 dark:text-neutral-400">
    {__("Required", "structura")}
  </span>
);

// ─── Advanced Settings (collapsible inside Strategy) ────────────────────

const AdvancedSettings = () => {
  const { formData, updateForm } = useCampaignForm();
  const { isPaidLicense, isLicensed } = useLicense();
  // Disable image generation when the uploads dir isn't writable —
  // images would silently never save. Same probe as the cross-wp-admin
  // banner (Image_Uploads_Unwritable_Notice); false on older plugins.
  const uploadsUnwritable = !!window.structuraConfig?.uploads_unwritable;
  const { availableProviders, availableImageProviders, isCloud, isFullyConfigured } = useDefaultProviders();
  const { rules, isLoading: loadingSeoRules } = useSeoRules();

  const [open, setOpen] = useState(false);

  const { intelligence, structure, taxonomy } = formData;

  // Taxonomy state (fetched lazily)
  const [availableCats, setAvailableCats] = useState<any[]>([]);
  const [availableTags, setAvailableTags] = useState<any[]>([]);
  const [loadingTax, setLoadingTax] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (availableCats.length > 0 || availableTags.length > 0 || loadingTax) return;

    const run = async () => {
      setLoadingTax(true);
      try {
        const [cats, tg] = await Promise.all([
          apiFetch<any[]>({ path: "/wp/v2/categories?per_page=100" }),
          apiFetch<any[]>({ path: "/wp/v2/tags?per_page=100" }),
        ]);
        setAvailableCats(cats);
        setAvailableTags(tg);
      } catch {
        /* taxonomy is optional */
      } finally {
        setLoadingTax(false);
      }
    };
    run();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggles
  const toggleBlock = (blockName: SUPPORTED_BLOCK_TYPE) => {
    const cur = structure.enabledBlocks || [];
    const next = cur.includes(blockName) ? cur.filter((b) => b !== blockName) : [...cur, blockName];
    updateForm("structure", { enabledBlocks: next as SUPPORTED_BLOCK_TYPE[] });
  };

  const toggleRule = (name: SeoRuleName) => {
    updateForm("intelligence", {
      seoRules: { ...intelligence.seoRules, [name]: !intelligence.seoRules[name as SeoRuleName] },
    });
  };

  // Count helpers
  const seoRuleCount = rules ? Object.keys(rules).length : 0;
  const blockCount = CONTENT_BLOCKS.length;
  const enabledSeoCount = rules
    ? Object.keys(rules).filter((k) => intelligence.seoRules[k as SeoRuleName]).length
    : 0;
  const enabledBlockCount = structure.enabledBlocks.length;

  return (
    <div className="rounded-xl border border-neutral-200/60 dark:border-neutral-700/60">
      {/* Top-level toggle */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between px-4 py-3 transition-colors",
          open
            ? "rounded-t-xl border-b border-neutral-100 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-800/30"
            : "rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-800/30"
        )}
      >
        <span className="flex items-center gap-2 text-xs font-bold text-neutral-600 dark:text-neutral-300">
          <Settings2 size={14} className="text-neutral-400 dark:text-neutral-500" />
          {__("Advanced Settings", "structura")}
        </span>
        <ChevronDown
          size={14}
          className={cn("text-neutral-400 transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {/* Body */}
      {open && (
        <div className="space-y-4 p-4">
          {/* Language/Post Length/Persona/Post Status moved out of Advanced —
              see CoreContentSettings rendered just above this component. */}

          {/* ── Writing approach ─────────────────────────────────── */}
          <SettingsGroup
            icon={<Target size={13} className="text-brand-500" />}
            label={__("Writing approach", "structura")}
          >
            <WritingApproachOverride />
          </SettingsGroup>

          {/* ── AI Engine — only in Advanced when fully configured.
              Compact layout: pre-generation toggle + provider/model/
              fallback dropdowns for text and image. */}
          {isFullyConfigured && availableProviders.length > 0 && (
            <SettingsGroup
              icon={<Bot size={13} className="text-brand-500" />}
              label={__("AI Engine", "structura")}
            >
              <div className="px-2 py-2">
                <CampaignAiEngineSection
                  availableTextProviders={availableProviders as AIProvider[]}
                  availableImageProviders={availableImageProviders as AIProvider[]}
                />
              </div>
            </SettingsGroup>
          )}

          {/* ── General Improvements ─────────────────────────────── */}
          <SettingsGroup
            icon={<Rocket size={13} className="text-rose-500" />}
            label={__("Improvements", "structura")}
          >
            <CompactToggle
              label={__("Replace long AI-like dashes", "structura")}
              description={__("Normalize AI dashes (like—this) to standard format (like - this).", "structura")}
              isEnabled={intelligence.replaceLongDashes}
              onToggle={() => updateForm("intelligence", { replaceLongDashes: !intelligence.replaceLongDashes })}
            />
            <CompactToggle
              label={__("Disable emojis", "structura")}
              description={__("Remove emojis from AI-generated content for a cleaner output.", "structura")}
              isEnabled={intelligence.disableEmojis}
              onToggle={() => updateForm("intelligence", { disableEmojis: !intelligence.disableEmojis })}
            />
          </SettingsGroup>

          {/* ── Images ───────────────────────────────────────────── */}
          <SettingsGroup
            icon={<ImageIcon size={13} className="text-emerald-500" />}
            label={__("Images", "structura")}
          >
            <CompactToggle
              label={__("Generate featured image", "structura")}
              description={__("Create a relevant featured image for each post.", "structura")}
              isEnabled={structure.featuredImage}
              onToggle={() => updateForm("structure", { featuredImage: !structure.featuredImage })}
              isDisabled={!isLicensed || uploadsUnwritable}
              badge={!isLicensed ? <FreeBadge /> : undefined}
            />
            <CompactToggle
              label={__("Body image generation", "structura")}
              description={__("Identify spots and generate images in the post body.", "structura")}
              isEnabled={structure.bodyImages}
              onToggle={() => updateForm("structure", { bodyImages: !structure.bodyImages })}
              isDisabled={!isPaidLicense || uploadsUnwritable}
              badge={!isPaidLicense ? <ProBadge /> : undefined}
            />
            {uploadsUnwritable && (
              <p className="m-0! text-[11px] leading-snug text-amber-600 dark:text-amber-500">
                {__(
                  "Image generation is unavailable because WordPress can't write to your uploads folder. Posts will still publish without images.",
                  "structura"
                )}{" "}
                <a
                  href="https://docs.structurawp.com/troubleshooting/images-not-generating"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-amber-700 dark:hover:text-amber-400"
                >
                  {__("How to fix this", "structura")}
                </a>
              </p>
            )}
            {/* Non-blocking heads-up when images are on but no visual
                style is bound — the cloud falls back to a generic look
                (2026-07-09). */}
            <VisualStyleFallbackNotice
              imagesEnabled={structure.featuredImage || structure.bodyImages}
            />
          </SettingsGroup>

          {/* ── Content Blocks ───────────────────────────────────── */}
          <SettingsGroup
            icon={<Layout size={13} className="text-purple-500" />}
            label={__("Content Blocks", "structura")}
            count={enabledBlockCount}
          >
            {CONTENT_BLOCKS.map((block) => {
              const isProLocked = block.isPro && !isPaidLicense;
              const isFreeLocked = block.name === "core/heading" && !isLicensed;
              return (
                <CompactToggle
                  key={block.name}
                  label={block.label}
                  description={block.description}
                  isEnabled={block.isRequired || structure.enabledBlocks.includes(block.name as SUPPORTED_BLOCK_TYPE)}
                  onToggle={() => toggleBlock(block.name as SUPPORTED_BLOCK_TYPE)}
                  isDisabled={block.isRequired || isProLocked || isFreeLocked}
                  badge={
                    block.isRequired ? <RequiredBadge /> :
                    isProLocked ? <ProBadge /> :
                    isFreeLocked ? <FreeBadge /> :
                    undefined
                  }
                />
              );
            })}
          </SettingsGroup>

          {/* ── SEO Rules ────────────────────────────────────────── */}
          <SettingsGroup
            icon={<Sparkles size={13} className="text-amber-500" />}
            label={__("SEO Directives", "structura")}
            count={enabledSeoCount}
          >
            {loadingSeoRules ? (
              <div className="flex h-8 items-center justify-center">
                <Loader2 className="size-3 animate-spin text-neutral-400" />
              </div>
            ) : rules ? (
              Object.entries(rules).map(([name, rule]) => {
                const isProLocked = ["byok", "cloud"].includes(rule.plan) && !isPaidLicense;
                const isFreeLocked = rule.plan === "free" && !isLicensed;
                return (
                  <CompactToggle
                    key={name}
                    label={rule.label}
                    description={rule.description}
                    isEnabled={intelligence.seoRules[name as SeoRuleName]}
                    onToggle={() => toggleRule(name as SeoRuleName)}
                    isDisabled={isProLocked || isFreeLocked}
                    badge={
                      isProLocked ? <ProBadge /> :
                      isFreeLocked ? <FreeBadge /> :
                      undefined
                    }
                  />
                );
              })
            ) : null}
          </SettingsGroup>

          {/* ── Taxonomy ─────────────────────────────────────────── */}
          <SettingsGroup
            icon={<FolderOpen size={13} className="text-brand-500" />}
            label={__("Taxonomy", "structura")}
          >
            {loadingTax ? (
              <div className="flex h-8 items-center justify-center">
                <Loader2 className="size-3 animate-spin text-neutral-400" />
              </div>
            ) : (
              <div className="space-y-3 px-2 py-2">
                <TaxonomySection
                  title={__("Categories", "structura")}
                  icon={<FolderOpen size={14} />}
                  mode={taxonomy.categories.mode}
                  setMode={(val) =>
                    updateForm("taxonomy", { categories: { ...taxonomy.categories, mode: val } })
                  }
                  items={availableCats}
                  selected={taxonomy.categories.list}
                  setSelected={(val) =>
                    updateForm("taxonomy", { categories: { ...taxonomy.categories, list: val } })
                  }
                />
                <TaxonomySection
                  title={__("Tags", "structura")}
                  icon={<Tag size={14} />}
                  mode={taxonomy.tags.mode}
                  setMode={(val) =>
                    updateForm("taxonomy", { tags: { ...taxonomy.tags, mode: val } })
                  }
                  items={availableTags}
                  selected={taxonomy.tags.list}
                  setSelected={(val) =>
                    updateForm("taxonomy", { tags: { ...taxonomy.tags, list: val } })
                  }
                />
              </div>
            )}
          </SettingsGroup>

          {/* ── Disclosure (always visible, small) ────────────────── */}
          <div className="flex items-center justify-between rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <Scale size={13} className="text-emerald-500" />
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                {__("AI Transparency Signal", "structura")}
              </span>
              <Tooltip
                title={__("Append a disclosure notice to AI-generated content for transparency.", "structura")}
                position="top"
              >
                <span className="cursor-help text-neutral-300 dark:text-neutral-600">
                  <HelpCircle size={12} />
                </span>
              </Tooltip>
            </div>
            <Switch
              label={__("Disclosure", "structura")}
              hiddenLabel
              checked={structure.disclosure.enabled}
              onChange={(checked) =>
                updateForm("structure", { disclosure: { ...structure.disclosure, enabled: checked } })
              }
            />
          </div>
          {structure.disclosure.enabled && (
            <div className="px-3">
              <TextArea
                label={__("Disclosure Notice", "structura")}
                value={structure.disclosure.text}
                onChange={(e) =>
                  updateForm("structure", { disclosure: { ...structure.disclosure, text: e.target.value } })
                }
                rows={2}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Overlap notice ──────────────────────────────────────────────────────

/**
 * One amber line when another campaign is already running on this site in
 * the same language. Informational on purpose: the wizard proceeds either
 * way (spec §4.1), it just makes sure nobody discovers the clash after two
 * campaigns have been writing the same posts for a week.
 */
const OverlapNotice = ({
  sibling,
  onDismiss,
}: {
  sibling: CampaignSetupDraft["siblingCampaigns"][number];
  onDismiss: () => void;
}) => {
  // wp-admin serves the SPA from admin.php?page=…; keep the query string so
  // the new tab lands on the plugin rather than the dashboard.
  const viewUrl = `${window.location.href.split("#")[0]}#/campaigns/${sibling.campaignId}/edit`;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/30">
      <Layers size={16} className="shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <span className="text-[13px] leading-relaxed text-amber-900 dark:text-amber-100">
        {sprintf(
          /* translators: 1: another campaign's name. 2: a language name. */
          __("“%1$s” is already running in %2$s.", "structura"),
          sibling.name,
          contentLanguageLabel(sibling.language, adminUiLocale())
        )}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="cursor-pointer text-xs font-bold text-amber-900 underline underline-offset-2 dark:text-amber-100"
      >
        {__("Continue anyway", "structura")}
      </button>
      <a
        href={viewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-amber-900 dark:text-amber-100"
      >
        {__("View", "structura")}
        <ArrowUpRight size={12} aria-hidden="true" />
      </a>
    </div>
  );
};

// ─── Setup Section ───────────────────────────────────────────────────────

/**
 * Step 1 — Setup. The old Strategy step with the language lifted to the top
 * and the fields arriving drafted instead of blank (spec §4.1). The writing
 * approach is no longer asked for here; it lives in Advanced as an override
 * over the inferred value.
 */
const SetupSection = ({
  draft,
  isDrafting,
  isRefining,
  error,
  refineError,
  onRetry,
  onRefine,
  onLanguageChange,
  onConfirm,
}: {
  draft: CampaignSetupDraft | null;
  isDrafting: boolean;
  isRefining: boolean;
  error: string | null;
  refineError: string | null;
  onRetry: () => void;
  onRefine: () => void;
  onLanguageChange: (code: string) => void;
  onConfirm: () => void;
}) => {
  const { formData, updateForm } = useCampaignForm();
  const { isPaidLicense } = useLicense();
  const { availableProviders, availableImageProviders, isFullyConfigured, isCloud } =
    useDefaultProviders();

  const { name, objective } = formData.identity;
  const language = formData.intelligence.language;

  // Session-only: dismissing the notice changes no value, it just stops the
  // wizard repeating something the user has already read.
  const [overlapDismissed, setOverlapDismissed] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);
  const [confirmRefine, setConfirmRefine] = useState(false);

  const sibling = draft?.siblingCampaigns?.[0] ?? null;

  // A field still holding exactly what the draft wrote is one the user hasn't
  // touched — nothing of theirs is at stake when it gets rewritten.
  const nameIsDrafted = !!draft && name === draft.name;
  const objectiveIsDrafted = !!draft && objective === draft.objective;
  const hasOwnEdits =
    (name.length > 0 && !nameIsDrafted) || (objective.length > 0 && !objectiveIsDrafted);

  const rationaleItems = useMemo(
    () => setupRationaleItems(formData.identity.setupRationale, adminUiLocale()),
    [formData.identity.setupRationale]
  );

  const requestLanguage = (code: string) => {
    if (code === language) return;
    // Redrafting replaces the objective, so the user gets asked first when
    // there is work of theirs to lose.
    if (hasOwnEdits) {
      setPendingLanguage(code);
      return;
    }
    onLanguageChange(code);
  };

  const requestRefine = () => {
    if (hasOwnEdits) {
      setConfirmRefine(true);
      return;
    }
    onRefine();
  };

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-600 dark:text-brand-300">
            <Compass size={18} />
          </span>
          <div>
            <h3 className="m-0! text-sm font-bold text-neutral-900 dark:text-white">
              {__("Setup", "structura")}
            </h3>
            <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
              {__("Language, objective and voice for this campaign", "structura")}
            </p>
          </div>
        </div>
        {/* Paid only — and no upsell on free: the deterministic draft is a
            complete answer, so a locked button here would frame it as the
            broken half of a feature (owner decision 2026-09-23). */}
        {isPaidLicense && (
          <Button
            size="sm"
            variant="secondary"
            onClick={requestRefine}
            loading={isRefining}
            disabled={isDrafting}
          >
            <Sparkles size={14} />
            {__("Magic suggest", "structura")}
          </Button>
        )}
      </div>

      {/* A failed draft must never be a dead end — the form below stays
          fully usable, the user just fills it in themselves. */}
      {error && (
        <Alert variant="error">
          <Alert.Description>
            {__(
              "Couldn't draft this campaign — fill it in yourself or try again.",
              "structura"
            )}
          </Alert.Description>
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={onRetry}>
              <RefreshCw size={14} className="mr-1.5" />
              {__("Try again", "structura")}
            </Button>
          </div>
        </Alert>
      )}

      {/* Magic suggest failed or the cloud declined it. Whatever was in the
          fields is still there — this only explains why it didn't change. */}
      {!error && refineError && (
        <Alert variant="error">
          <Alert.Description>
            {__("Couldn't refine this campaign — try again", "structura")}
          </Alert.Description>
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={requestRefine} disabled={isRefining}>
              <RefreshCw size={14} className="mr-1.5" />
              {__("Try again", "structura")}
            </Button>
          </div>
        </Alert>
      )}

      {/* Language — the decision every other field is drafted against */}
      <CampaignLanguageField
        value={language}
        onChange={requestLanguage}
        additionalLanguages={draft?.language?.additionalLanguages}
        showSitePill
        helper={__(
          "Everything this campaign writes — topics, titles, posts — is in this language.",
          "structura"
        )}
      />

      {sibling && !overlapDismissed && (
        <OverlapNotice sibling={sibling} onDismiss={() => setOverlapDismissed(true)} />
      )}

      {/* Campaign name. Magic suggest rewrites both fields outright — the
          user either had no edits or confirmed losing them — so the skeleton
          is unconditional while it runs. */}
      {isRefining ? (
        <div className="space-y-1.5" data-testid="setup-name-skeleton">
          <span className="block text-[10px] font-black tracking-widest text-neutral-400 uppercase">
            {__("Campaign Name", "structura")}
          </span>
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      ) : (
        <InputField
          label={__("Campaign Name", "structura")}
          value={name}
          onChange={(e) => updateForm("identity", { name: e.target.value })}
          placeholder={__("e.g. Winter 2026 SEO Push", "structura")}
        />
      )}

      {/* Objective */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="text-[10px] font-black tracking-widest text-neutral-400 uppercase">
            {__("Campaign Objective", "structura")}
          </span>
          {draft && <DraftedPill stage={draft.stage} />}
        </div>
        {isRefining ? (
          <Skeleton className="h-28 w-full rounded-xl" data-testid="setup-objective-skeleton" />
        ) : (
          <TextArea
            label={__("Campaign Objective", "structura")}
            hiddenLabel
            value={objective}
            onChange={(e) => updateForm("identity", { objective: e.target.value })}
            rows={4}
            placeholder={__("What should this campaign achieve, and for whom?", "structura")}
          />
        )}
        <p className="m-0! text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
          {__("Two or three sentences. Structura writes every post against this.", "structura")}
        </p>
      </div>

      {/* Provider + model override — visible inline when not fully configured */}
      {!isFullyConfigured && availableProviders.length > 0 && (
        <Card className="overflow-hidden border-neutral-200 p-0!">
          <ProviderToggle
            textProvider={formData.intelligence.textProvider}
            imageProvider={formData.intelligence.imageProvider}
            onTextProviderChange={(p: AIProvider) =>
              updateForm("intelligence", {
                textProvider: p,
                textModel:
                  mirrorModelForTier(p, "text", formData.intelligence.textTier ?? "mid") ?? "",
              })
            }
            onImageProviderChange={(p: AIProvider) =>
              updateForm("intelligence", {
                imageProvider: p,
                imageModel:
                  mirrorModelForTier(p, "image", formData.intelligence.imageTier ?? "mid") ?? "",
              })
            }
            availableTextProviders={availableProviders}
            availableImageProviders={availableImageProviders}
            showTierSelectors={!isCloud}
            textTier={formData.intelligence.textTier ?? "mid"}
            imageTier={formData.intelligence.imageTier ?? "mid"}
            onTextTierChange={(t) =>
              updateForm("intelligence", {
                textTier: t,
                textModel:
                  mirrorModelForTier(formData.intelligence.textProvider, "text", t) ?? "",
              })
            }
            onImageTierChange={(t) =>
              updateForm("intelligence", {
                imageTier: t,
                imageModel:
                  mirrorModelForTier(formData.intelligence.imageProvider, "image", t) ?? "",
              })
            }
          />
        </Card>
      )}

      {/* Persona / post length / post status — the language field above owns
          the language, so it is hidden here. */}
      <CoreContentSettings showLanguage={false} />

      <SetupRationaleStrip
        title={__("Why these settings", "structura")}
        items={rationaleItems}
        loading={isDrafting || isRefining}
        footer={
          isPaidLicense
            ? __(
                "Structura decided these from your site. Change anything — nothing here is locked.",
                "structura"
              )
            : undefined
        }
      />

      {/* Advanced Settings */}
      <AdvancedSettings />

      {/* Confirm */}
      <div className="flex justify-end border-t border-neutral-100 pt-5 dark:border-neutral-800">
        <Button
          onClick={onConfirm}
          disabled={name.length < 3 || objective.length < 20}
        >
          {__("Continue to Keywords", "structura")}
        </Button>
      </div>

      <ConfirmDialog
        isOpen={pendingLanguage !== null}
        onClose={() => setPendingLanguage(null)}
        onConfirm={() => {
          const next = pendingLanguage;
          setPendingLanguage(null);
          if (next) onLanguageChange(next);
        }}
        title={__("Redraft this campaign?", "structura")}
        description={__(
          "Switching the language drafts the campaign again. Your edits to the name and objective will be replaced.",
          "structura"
        )}
        confirmButtonProps={{ label: __("Redraft", "structura") }}
        cancelButtonProps={{ label: __("Keep what I wrote", "structura") }}
      />

      <ConfirmDialog
        isOpen={confirmRefine}
        onClose={() => setConfirmRefine(false)}
        onConfirm={() => {
          setConfirmRefine(false);
          onRefine();
        }}
        title={__("Replace your edits?", "structura")}
        description={__(
          "Magic suggest will rewrite the name and objective. Your edits will be replaced.",
          "structura"
        )}
        confirmButtonProps={{ label: __("Replace", "structura") }}
        cancelButtonProps={{ label: __("Keep mine", "structura") }}
      />
    </div>
  );
};

/**
 * Where the drafted fields came from. Purple is the product's AI colour, so
 * it is reserved for the refined pass; the deterministic draft is honest
 * about being assembled from the site, not written by a model.
 */
const DraftedPill = ({ stage }: { stage: CampaignSetupDraft["stage"] }) =>
  stage === "ai" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-950/50 dark:text-purple-300">
      <Sparkles size={12} aria-hidden="true" />
      {__("Drafted for you", "structura")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
      <Globe size={12} aria-hidden="true" />
      {__("Drafted from your site", "structura")}
    </span>
  );

// ─── Summary Section ────────────────────────────────────────────────────

const SummarySection = ({
  formData,
  hasAuthorityRule,
  onLaunch,
  isCreating,
  isValid,
}: {
  formData: any;
  hasAuthorityRule: boolean;
  onLaunch: () => void;
  isCreating: boolean;
  isValid: (step: number) => boolean;
}) => {
  const keywordCount = formData.keywords?.bank?.length ?? 0;
  const domainCount = formData.authority?.domains?.length ?? 0;

  // Persona hard-block (2026-05-25). A campaign always resolves an author
  // from the workspace's persona pool, so launching with zero personas
  // would degrade every post to a generic voice. The cloud `postCampaign`
  // refuses this state with `personas_required`; we disable Launch here
  // (and surface `NoPersonasBlocker` at the top of the page) so the user
  // never hits that rejection. Hidden while loading so the button doesn't
  // flicker disabled→enabled on first paint.
  const { data: personas = [], isLoading: loadingPersonas } = usePersonasQuery();
  const hasNoPersonas = !loadingPersonas && personas.length === 0;

  const modeLabel = campaignModeShortLabel(formData.identity.campaignMode);
  const modeQualifier =
    formData.identity.campaignModeSource === "user"
      ? __("your choice", "structura")
      : __("inferred", "structura");

  const rationaleItems = setupRationaleItems(
    formData.identity.setupRationale,
    adminUiLocale()
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-1 text-lg font-bold text-neutral-900 dark:text-white">
          {__("Campaign Summary", "structura")}
        </h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {__("Review your campaign details before launching", "structura")}
        </p>
      </div>

      {/* The Setup step's reasons, repeated above the configuration so the
          user reads WHY before WHAT (design handoff, Summary step). */}
      {rationaleItems.length > 0 && (
        <SetupRationaleStrip
          title={__("Why these settings", "structura")}
          items={rationaleItems}
        />
      )}

      {/* Campaign overview grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-neutral-100 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-800/30">
          <span className="mb-1 block text-[10px] font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
            {__("Campaign", "structura")}
          </span>
          <span className="text-sm font-bold text-neutral-900 dark:text-white">
            {formData.identity.name || "—"}
          </span>
        </div>

        <div className="rounded-xl border border-neutral-100 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-800/30">
          <span className="mb-1 block text-[10px] font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
            {__("Mode", "structura")}
          </span>
          <span className="text-sm font-bold text-neutral-900 dark:text-white">
            {modeLabel}{" "}
            <span className="font-mono text-[11px] font-normal text-neutral-400">
              {modeQualifier}
            </span>
          </span>
        </div>

        <div className="rounded-xl border border-neutral-100 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-800/30">
          <span className="mb-1 block text-[10px] font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
            {__("Language", "structura")}
          </span>
          {/* The stored code, not a resolved display name — what the campaign
              doc will carry is what the user should see here. */}
          <span className="text-sm font-bold text-neutral-900 dark:text-white">
            {contentLanguageLabel(formData.intelligence.language, adminUiLocale())}{" "}
            <span className="font-mono text-[11px] font-normal text-neutral-400">
              {formData.intelligence.language}
            </span>
          </span>
        </div>

        <div className="rounded-xl border border-neutral-100 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-800/30">
          <span className="mb-1 block text-[10px] font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
            {__("Keywords", "structura")}
          </span>
          <span className="text-sm font-bold text-neutral-900 dark:text-white">
            {keywordCount > 0
              ? sprintf(__("%d discovered", "structura"), keywordCount)
              : __("None", "structura")}
          </span>
        </div>

        {hasAuthorityRule && (
          <div className="rounded-xl border border-neutral-100 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-800/30">
            <span className="mb-1 block text-[10px] font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
              {__("Authority Sources", "structura")}
            </span>
            <span className="text-sm font-bold text-neutral-900 dark:text-white">
              {domainCount > 0
                ? sprintf(__("%d domains", "structura"), domainCount)
                : __("None", "structura")}
            </span>
          </div>
        )}
      </div>

      {/* Objective preview */}
      <div className="rounded-xl border border-neutral-100 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-800/30">
        <span className="mb-2 block text-[10px] font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
          {__("Objective", "structura")}
        </span>
        <p className="line-clamp-4 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          {formData.identity.objective || "—"}
        </p>
      </div>

      {/* Launch bar */}
      <div className="flex items-center justify-between rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50/50 to-purple-50/50 px-6 py-5 dark:border-brand-800 dark:from-brand-950/20 dark:to-purple-950/20">
        <div className="flex flex-col gap-0.5">
          <p className="m-0! text-sm font-bold text-neutral-900 dark:text-white">
            {__("Ready to launch?", "structura")}
          </p>
          <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
            {__("Your campaign will start generating content based on the schedule", "structura")}
          </p>
        </div>
        <Button
          onClick={onLaunch}
          loading={isCreating}
          disabled={!isValid(1) || !isValid(5) || hasNoPersonas}
          className="bg-gradient-to-r from-brand-600 to-purple-600 font-bold shadow-lg shadow-brand-600/20"
        >
          <Rocket size={16} className="mr-2" />
          {__("Launch Campaign", "structura")}
        </Button>
      </div>
    </div>
  );
};
