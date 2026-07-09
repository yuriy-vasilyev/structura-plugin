import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { __, sprintf } from "@wordpress/i18n";
import apiFetch from "@wordpress/api-fetch";
import {
  ArrowLeft,
  Bot,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronsRight,
  ClipboardList,
  FolderOpen,
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
  Trash2,
} from "lucide-react";
import { Button, Card, cn, InputField, Switch, TextArea, Tooltip } from "@structura/ui";
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
import { GuidedInterview } from "@/features/campaigns/components/interview/GuidedInterview";
import { StepKeywords, KeywordDiscoveryHandle } from "@/features/campaigns/components/steps/StepKeywords";
import { AuthorityDiscovery, AuthorityDiscoveryHandle } from "@/features/campaigns/components/steps/AuthorityDiscovery";
import { SimpleStepRhythm } from "@/features/campaigns/components/steps/SimpleStepRhythm";
import { TaxonomySection } from "@/features/campaigns/components/TaxonomySection";
import { SelectionCard } from "@/components/Shared/SelectionCard";
import { AIProvider, CampaignMode } from "@/features/campaigns/types";
import { ProviderToggle } from "@/features/campaigns/components/ProviderToggle";
import { CampaignAiEngineSection } from "@/features/campaigns/components/CampaignAiEngineSection";
import { CoreContentSettings } from "@/features/campaigns/components/CoreContentSettings";
import { SeoRuleName, SUPPORTED_BLOCK_TYPE, useDefaultProviders, useLicense, useSeoRules } from "@/features/settings";
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

// ─── Campaign mode selector ──────────────────────────────────────────────

const CAMPAIGN_MODES: Array<{
  value: CampaignMode;
  label: string;
  description: string;
}> = [
  {
    value: "traffic_magnet",
    label: __("Traffic Magnet", "structura"),
    description: __("Maximize organic traffic with high-volume topics", "structura"),
  },
  {
    value: "quick_wins",
    label: __("Quick Wins", "structura"),
    description: __("Target low-competition keywords for fast rankings", "structura"),
  },
  {
    value: "conversion",
    label: __("Conversion", "structura"),
    description: __("Content designed to convert readers to customers", "structura"),
  },
  {
    value: "authority",
    label: __("Authority", "structura"),
    description: __("Build topical authority with comprehensive coverage", "structura"),
  },
];

// ─── Step definitions ────────────────────────────────────────────────────

interface StepDef {
  id: string;
  label: string;
  icon: typeof MessageSquare;
}

const ALL_STEPS: StepDef[] = [
  { id: "interview", label: __("Interview", "structura"), icon: MessageSquare },
  { id: "strategy", label: __("Strategy", "structura"), icon: ClipboardList },
  { id: "keywords", label: __("Keywords", "structura"), icon: Key },
  { id: "authority", label: __("Authority", "structura"), icon: Shield },
  { id: "rhythm", label: __("Rhythm", "structura"), icon: CalendarClock },
  { id: "summary", label: __("Summary", "structura"), icon: Layers },
];

// ─── Horizontal stepper ─────────────────────────────────────────────────

const HorizontalStepper = ({
  steps,
  activeStep,
  completedSteps,
  skippedSteps,
  onStepClick,
}: {
  steps: StepDef[];
  activeStep: string;
  completedSteps: Set<string>;
  skippedSteps: Set<string>;
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
          const isReachable = i <= activeIdx || isComplete || isSkipped;
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
  const hasDraft = useCampaignDraftStore((s) => s.lastUpdatedAt !== null);

  const completedSteps = useMemo(() => new Set(completedStepsArr), [completedStepsArr]);
  const skippedSteps = useMemo(() => new Set(skippedStepsArr), [skippedStepsArr]);

  // Discovery phase tracking — intentionally NOT persisted. These reflect
  // a transient in-flight discovery call; resuming a draft should land
  // on the saved step but let the user re-trigger discovery themselves.
  const [keywordsPhase, setKeywordsPhase] = useState<string>("idle");
  const [authorityPhase, setAuthorityPhase] = useState<string>("idle");

  // Interview topics → explicit keyword-discovery seeds. Transient (like the
  // phase trackers above): the objective persists in the draft and is the
  // fallback seed source, so a resumed draft simply re-derives seeds from it.
  const [interviewTopics, setInterviewTopics] = useState<string[]>([]);

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

  // ── Skip interview handler ────────────────────────────────────────────

  const handleSkipInterview = useCallback(() => {
    markSkipped("interview");
    goToStep("strategy");
  }, [markSkipped, goToStep]);

  // ── Interview completion handler ──────────────────────────────────────

  const handleInterviewComplete = useCallback(
    (result: {
      name: string;
      objective: string;
      campaignMode?: CampaignMode;
      topics?: string[];
    }) => {
      updateForm("identity", {
        name: result.name,
        objective: result.objective,
        ...(result.campaignMode ? { campaignMode: result.campaignMode } : {}),
      });
      setInterviewTopics(result.topics ?? []);
      // Clear any prior skipped/completed flag on interview, then mark complete.
      clearStepFlag("interview");
      markComplete("interview");
      goToStep("strategy");
    },
    [updateForm, clearStepFlag, markComplete, goToStep]
  );

  // ── Strategy confirmation handler ─────────────────────────────────────

  const confirmStrategy = () => {
    markComplete("strategy");
    goToStep("keywords");
  };

  // ── Launch campaign handler ───────────────────────────────────────────

  const handleLaunch = async () => {
    if (keywordsRef.current) {
      const bank = keywordsRef.current.getKeywords();
      updateForm("keywords", {
        bank,
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
        onStepClick={goToStep}
      />

      {/* ── Active step content ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-sm sm:p-8 dark:border-neutral-800 dark:bg-neutral-900">
        {/* ── Interview ────────────────────────────────────────────── */}
        {activeStep === "interview" && (
          <div className="space-y-6">
            <GuidedInterview onComplete={handleInterviewComplete} />
            <div className="border-t border-neutral-100 pt-4 dark:border-neutral-800">
              <button
                type="button"
                onClick={handleSkipInterview}
                className="cursor-pointer text-xs font-medium text-neutral-400 transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
              >
                <ChevronsRight size={14} className="mr-1 inline-block" />
                {__("Skip interview — I'll fill in the details myself", "structura")}
              </button>
            </div>
          </div>
        )}

        {/* ── Strategy ─────────────────────────────────────────────── */}
        {activeStep === "strategy" && (
          <StrategySection
            onConfirm={confirmStrategy}
            onRestart={() => {
              clearStepFlag("interview");
              clearStepFlag("strategy");
              goToStep("interview");
            }}
          />
        )}

        {/* ── Keywords ─────────────────────────────────────────────── */}
        {activeStep === "keywords" && (
          <div className="space-y-6">
            <StepKeywords
              ref={keywordsRef}
              topic={formData.identity.objective}
              topicSeeds={interviewTopics}
              campaignName={formData.identity.name}
              language={formData.intelligence.language}
              provider={formData.intelligence.textProvider}
              existingKeywords={formData.keywords?.bank?.length ? formData.keywords.bank : undefined}
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

// ─── Strategy Review Section ─────────────────────────────────────────────

const StrategySection = ({
  onConfirm,
  onRestart,
}: {
  onConfirm: () => void;
  onRestart: () => void;
}) => {
  const { formData, updateForm } = useCampaignForm();
  const { availableProviders, availableImageProviders, isFullyConfigured, isCloud } = useDefaultProviders();

  return (
    <div className="space-y-5">
      {/* AI-generated badge */}
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-50 to-purple-50 px-3 py-1 text-[10px] font-bold text-brand-700 dark:from-brand-950/40 dark:to-purple-950/40 dark:text-brand-300">
          <Sparkles size={10} />
          {__("AI-Generated Strategy", "structura")}
        </span>
        <button
          type="button"
          onClick={onRestart}
          className="cursor-pointer text-[10px] font-medium text-neutral-400 underline-offset-2 hover:text-brand-600 hover:underline dark:text-neutral-500 dark:hover:text-brand-400"
        >
          {__("Restart interview", "structura")}
        </button>
      </div>

      {/* Campaign name */}
      <InputField
        label={__("Campaign Name", "structura")}
        value={formData.identity.name}
        onChange={(e) => updateForm("identity", { name: e.target.value })}
        placeholder={__("e.g. Winter 2026 SEO Push", "structura")}
      />

      {/* Campaign objective */}
      <TextArea
        label={__("Campaign Objective", "structura")}
        value={formData.identity.objective}
        onChange={(e) => updateForm("identity", { objective: e.target.value })}
        rows={6}
        placeholder={__("Your campaign strategy…", "structura")}
      />

      {/* Campaign mode */}
      <div>
        <label className="mb-2 block text-[10px] font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
          {__("Campaign Mode", "structura")}
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CAMPAIGN_MODES.map((mode) => {
            const isSelected = formData.identity.campaignMode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                onClick={() => updateForm("identity", { campaignMode: mode.value })}
                className={cn(
                  "cursor-pointer rounded-xl border px-3 py-3 text-left transition-all",
                  isSelected
                    ? "border-brand-300 bg-brand-50 shadow-sm dark:border-brand-700 dark:bg-brand-950/40"
                    : "border-neutral-200 bg-white hover:border-brand-200 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-brand-800"
                )}
              >
                <span
                  className={cn(
                    "block text-xs font-bold",
                    isSelected
                      ? "text-brand-700 dark:text-brand-300"
                      : "text-neutral-700 dark:text-neutral-300"
                  )}
                >
                  {mode.label}
                </span>
                <span className="mt-0.5 block text-[10px] text-neutral-400 dark:text-neutral-500">
                  {mode.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Provider + model override — visible inline when not fully configured */}
      {!isFullyConfigured && availableProviders.length > 0 && (
        <Card className="overflow-hidden border-neutral-200 p-0!">
          <ProviderToggle
            textProvider={formData.intelligence.textProvider}
            imageProvider={formData.intelligence.imageProvider}
            onTextProviderChange={(p: AIProvider) =>
              updateForm("intelligence", { textProvider: p, textModel: "" })
            }
            onImageProviderChange={(p: AIProvider) =>
              updateForm("intelligence", { imageProvider: p, imageModel: "" })
            }
            availableTextProviders={availableProviders}
            availableImageProviders={availableImageProviders}
            showModelSelectors={!isCloud}
            textModel={formData.intelligence.textModel}
            imageModel={formData.intelligence.imageModel}
            onTextModelChange={(val: string) => updateForm("intelligence", { textModel: val })}
            onImageModelChange={(val: string) => updateForm("intelligence", { imageModel: val })}
          />
        </Card>
      )}

      {/* Core content settings — pulled out of Advanced so the knobs authors
          reach for on every campaign aren't one click away. */}
      <CoreContentSettings />

      {/* Advanced Settings */}
      <AdvancedSettings />

      {/* Confirm */}
      <div className="flex justify-end border-t border-neutral-100 pt-5 dark:border-neutral-800">
        <Button
          onClick={onConfirm}
          disabled={
            formData.identity.name.length < 3 ||
            formData.identity.objective.length < 20
          }
        >
          {__("Looks good — continue", "structura")}
        </Button>
      </div>
    </div>
  );
};

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

  const modeLabel = CAMPAIGN_MODES.find((m) => m.value === formData.identity.campaignMode)?.label ?? "—";

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
          <span className="text-sm font-bold text-neutral-900 dark:text-white">{modeLabel}</span>
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
