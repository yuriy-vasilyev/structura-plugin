import { __, sprintf } from "@wordpress/i18n";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, PenTool, Settings2, X, Zap } from "lucide-react";
import { Button, cn, Dialog } from "@structura/ui";
import apiFetch from "@wordpress/api-fetch";
import { useQueryClient } from "@tanstack/react-query";

// Advanced Step Components
import { StepObjective } from "./steps/StepObjective";
import { StepTaxonomy } from "./steps/StepTaxonomy";
import { StepArchitecture } from "./steps/StepArchitecture";
import { StepSeoRules } from "./steps/StepSeoRules";
import { StepDeployment } from "./steps/StepDeployment";

// Simple Step Components
import { SimpleStepStrategy } from "./steps/SimpleStepStrategy";
import { SimpleStepRhythm } from "./steps/SimpleStepRhythm";

// Shared (both modes)
import { SimpleStepSummary } from "./steps/SimpleStepSummary";
import { AuthorityDiscovery } from "./steps/AuthorityDiscovery";
import type { AuthorityDiscoveryHandle } from "./steps/AuthorityDiscovery";
import { StepKeywords } from "./steps/StepKeywords";
import type { KeywordDiscoveryHandle } from "./steps/StepKeywords";

// State & Logic
import { CampaignProvider, SchedulerMode, useCampaignForm } from "../context/CampaignContext";
import type { Campaign } from "@/features/campaigns";
import { useCampaignMutations } from "@/features/campaigns/api/useCampaignMutations";
import { useSettingsQuery } from "@/features/settings/api/useSettingsQuery";
import { settingsKeys } from "@/features/settings/api/keys";

type WizardMode = "simple" | "advanced";

interface NewScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  editCampaign?: Campaign;
  mode?: SchedulerMode;
}

const NewScheduleModal = ({
  onClose,
  isOpen,
  editCampaign,
  mode = "campaign",
}: NewScheduleModalProps) => {
  if (!isOpen) return null;

  return (
    <CampaignProvider initialData={editCampaign} mode={mode}>
      <ModalInner onClose={onClose} editCampaign={editCampaign} mode={mode} />
    </CampaignProvider>
  );
};

const ModalInner = ({
  onClose,
  editCampaign,
  mode,
}: {
  onClose: () => void;
  editCampaign?: Campaign;
  mode: SchedulerMode;
}) => {
  const { data: settings } = useSettingsQuery();
  const queryClient = useQueryClient();

  const [wizardMode, setWizardMode] = useState<WizardMode>(
    settings?.scheduler_simple_mode === false ? "advanced" : "simple"
  );
  const [step, setStep] = useState(1);
  const { formData, updateForm, isValid } = useCampaignForm();
  const { updateCampaign, isUpdating, isCreating, createCampaign, generatePost, isGenerating } =
    useCampaignMutations();

  // Authority discovery ref — lets us read domains before campaign creation
  const discoveryRef = useRef<AuthorityDiscoveryHandle>(null);
  const [authorityDomainCount, setAuthorityDomainCount] = useState(
    editCampaign?.authority?.domains?.length ?? 0
  );

  // Keyword discovery ref — lets us read keywords before campaign creation
  const keywordsRef = useRef<KeywordDiscoveryHandle>(null);
  const [keywordCount, setKeywordCount] = useState(
    editCampaign?.keywords?.bank?.length ?? 0
  );

  const isEditing = !!editCampaign?.id;
  const isSingle = mode === "single";
  const isSimple = wizardMode === "simple";

  /** Check if the campaign has outbound_link_authority enabled. */
  const hasAuthorityRule = () => {
    return formData.intelligence.seoRules?.outbound_link_authority === true;
  };

  const toggleWizardMode = async () => {
    // Snapshot discovery data before switching modes (prevents data loss)
    snapshotKeywords();
    snapshotAuthorityDomains();

    const newMode: WizardMode = isSimple ? "advanced" : "simple";
    setWizardMode(newMode);
    setStep(1);

    await apiFetch({
      path: "/structura/v1/settings",
      method: "POST",
      data: { scheduler_simple_mode: newMode === "simple" },
    });
    queryClient.invalidateQueries({ queryKey: settingsKeys.all });
  };

  // ── Step definitions ───────────────────────────────────────────────────
  // "Sources" step is inserted BEFORE Summary when outbound_link_authority is on.

  interface StepDef {
    label: string;
    isKeywords?: boolean;
    isAuthority?: boolean;
    isRhythm?: boolean;
    isDeployment?: boolean;
    isSummary?: boolean;
  }

  const buildSteps = (base: StepDef[]) => {
    const result: Array<StepDef & { id: number }> = [];

    for (const s of base) {
      // Insert Keywords + Sources steps right before the scheduling step (Rhythm / Deployment)
      // so the flow is: configure content → discover keywords/sources → set schedule → review.
      if ((s.isRhythm || s.isDeployment) && !isSingle) {
        // Keywords step is always shown for campaigns (teaser for free users)
        result.push({ label: __("Keywords", "structura"), isKeywords: true, id: result.length + 1 });
        // Sources step only when outbound_link_authority is enabled
        if (hasAuthorityRule()) {
          result.push({ label: __("Sources", "structura"), isAuthority: true, id: result.length + 1 });
        }
      }
      result.push({ ...s, id: result.length + 1 });
    }

    return result;
  };

  const advancedCampaignSteps = buildSteps([
    { label: __("Intelligence", "structura") },
    { label: __("Architecture", "structura") },
    { label: __("Taxonomy", "structura") },
    { label: __("SEO Rules", "structura") },
    { label: __("Deployment", "structura"), isDeployment: true },
    { label: __("Summary", "structura"), isSummary: true },
  ]);

  const advancedSingleSteps = buildSteps([
    { label: __("Intelligence", "structura") },
    { label: __("Architecture", "structura") },
    { label: __("Taxonomy", "structura") },
    { label: __("SEO Rules", "structura") },
    { label: __("Summary", "structura"), isSummary: true },
  ]);

  const simpleCampaignSteps = buildSteps([
    { label: __("Strategy", "structura") },
    { label: __("Rhythm", "structura"), isRhythm: true },
    { label: __("Summary", "structura"), isSummary: true },
  ]);

  const simpleSingleSteps = buildSteps([
    { label: __("Strategy", "structura") },
    { label: __("Summary", "structura"), isSummary: true },
  ]);

  const steps = isSimple
    ? isSingle
      ? simpleSingleSteps
      : simpleCampaignSteps
    : isSingle
      ? advancedSingleSteps
      : advancedCampaignSteps;

  const currentStep = steps[step - 1];
  const isOnKeywordsStep = currentStep?.isKeywords === true;
  const isOnAuthorityStep = currentStep?.isAuthority === true;
  const isOnSummaryStep = currentStep?.isSummary === true;

  // ── Step body rendering ────────────────────────────────────────────────

  const getStepBody = (s: number) => {
    const stepDef = steps[s - 1];

    // Keywords step — prefer formData (snapshotted) over editCampaign (initial)
    // so that going back & forward in the wizard preserves user edits.
    if (stepDef?.isKeywords) {
      const snapshotted = formData.keywords?.bank;
      const initial = editCampaign?.keywords?.bank;
      return (
        <StepKeywords
          ref={keywordsRef}
          topic={formData.identity.objective}
          campaignName={formData.identity.name}
          language={formData.intelligence.language}
          provider={formData.intelligence.textProvider}
          existingKeywords={snapshotted?.length ? snapshotted : initial}
          onKeywordsChange={setKeywordCount}
        />
      );
    }

    // Authority Sources step — same fallback logic
    if (stepDef?.isAuthority) {
      const snapshotted = formData.authority?.domains;
      const initial = editCampaign?.authority?.domains;
      return (
        <AuthorityDiscovery
          ref={discoveryRef}
          campaignId={isEditing ? editCampaign!.id : undefined}
          topic={formData.identity.objective}
          campaignName={formData.identity.name}
          language={formData.intelligence.language}
          provider={formData.intelligence.textProvider}
          existingDomains={snapshotted?.length ? snapshotted : initial}
          onDomainsChange={setAuthorityDomainCount}
        />
      );
    }

    // Summary step — same component for both simple and advanced
    if (stepDef?.isSummary) {
      return <SimpleStepSummary isSimpleMode={isSimple} />;
    }

    // Rhythm / Deployment — rendered by flag, not position
    if (stepDef?.isRhythm) return <SimpleStepRhythm />;
    if (stepDef?.isDeployment) return <StepDeployment />;

    // Regular steps (position-based for non-flagged steps)
    if (isSimple) {
      if (s === 1) return <SimpleStepStrategy />;
      return null;
    }

    // Advanced mode
    if (s === 1) return <StepObjective />;
    if (s === 2) return <StepArchitecture />;
    if (s === 3) return <StepTaxonomy />;
    if (s === 4) return <StepSeoRules />;
    return null;
  };

  // ── Validation ────────────────────────────────────────────────────────

  const isStepValid = (s: number) => {
    const stepDef = steps[s - 1];
    if (stepDef?.isKeywords) return true; // Always passable (teaser for free)
    if (stepDef?.isAuthority) return true; // Always passable
    if (stepDef?.isSummary) return true;
    if (stepDef?.isRhythm) return isValid(5); // Rhythm validates deployment/schedule fields
    if (stepDef?.isDeployment) return isValid(5);
    if (isSimple) {
      if (s === 1) return isValid(1);
      return true;
    }
    return isValid(s);
  };

  // ── Launch / Save handlers ────────────────────────────────────────────

  /**
   * Snapshot authority domains from the discovery step into formData
   * so they get included in the campaign creation/update payload.
   */
  const snapshotAuthorityDomains = () => {
    if (discoveryRef.current) {
      const domains = discoveryRef.current.getDomains();
      updateForm("authority", {
        domains,
        discoveredAt: domains.length > 0 ? new Date().toISOString() : null,
      });
    }
  };

  /**
   * Snapshot keywords from the keyword discovery step into formData
   * so they get included in the campaign creation/update payload.
   */
  const snapshotKeywords = () => {
    if (keywordsRef.current) {
      const bank = keywordsRef.current.getKeywords();
      updateForm("keywords", {
        bank,
        discoveredAt: bank.length > 0 ? new Date().toISOString() : null,
      });
    }
  };

  /**
   * Called when the user clicks the primary button on the Summary step.
   */
  const handleLaunch = async () => {
    // Snapshot discovery data into form state before creating/updating
    snapshotKeywords();
    snapshotAuthorityDomains();

    if (isSingle) {
      await generatePost({ data: formData });
      onClose();
      return;
    }

    if (isEditing) {
      await updateCampaign({ id: editCampaign!.id, data: formData });
      onClose();
      return;
    }

    // New campaign: create with authority domains included
    await createCampaign({ data: formData });
    onClose();
  };

  /**
   * Moving from Keywords → next step: snapshot keywords into form state.
   */
  const handleNextFromKeywords = () => {
    snapshotKeywords();
    setStep((s) => s + 1);
  };

  /**
   * Moving from Sources → next step: snapshot domains into form state
   * so subsequent steps can reflect them and they're ready for creation.
   */
  const handleNextFromAuthority = () => {
    snapshotAuthorityDomains();
    setStep((s) => s + 1);
  };

  /**
   * Moving backward: snapshot current discovery step data so it's not lost.
   */
  const handlePrevStep = () => {
    if (step <= 1) return;
    // Snapshot whichever discovery step we're currently on
    if (isOnKeywordsStep) snapshotKeywords();
    if (isOnAuthorityStep) snapshotAuthorityDomains();
    setStep((s) => s - 1);
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <Dialog.Root open={true} onClose={onClose} size="xl">
      <Dialog.Content className="overflow-hidden p-0!">
        {/* Header */}
        <Dialog.Header className="relative mb-0! border-b border-neutral-100 px-8 py-6 pr-36 dark:border-neutral-800">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-600 text-white shadow-lg shadow-brand-200 dark:bg-brand-700 dark:shadow-brand-900/50">
              <PenTool size={24} />
            </div>
            <div>
              <Dialog.Title>
                {isSingle
                  ? __("Generate Post", "structura")
                  : isEditing
                    ? __("Modify Roadmap", "structura")
                    : __("Campaign Architect", "structura")}
              </Dialog.Title>

              {/* MOBILE VIEW: Compact Progress (always inline) */}
              <div className="lg:s-hidden mt-1 flex items-center gap-2 text-[10px] font-bold text-brand-600 uppercase dark:text-brand-400">
                <span>{steps[step - 1].label}</span>
                <span className="text-neutral-300">/</span>
                <span className="text-neutral-400">
                  {sprintf(__("Phase %d of %d", "structura"), step, steps.length)}
                </span>
              </div>

              {/* Simple mode: inline stepper (few steps, always fits) */}
              {isSimple && (
                <div className="s-hidden mt-1 items-center gap-2 text-[10px] font-black tracking-widest text-neutral-400 uppercase lg:flex">
                  {steps.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <span
                        className={cn(
                          "transition-colors",
                          step === s.id ? "text-brand-600 dark:text-brand-400" : "opacity-60"
                        )}
                      >
                        {s.label}
                      </span>
                      {i < steps.length - 1 && <ChevronRight size={10} className="opacity-30" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top-right controls: mode toggle + close */}
          <div className="absolute top-5 right-4 flex items-center gap-2">
            <button
              type="button"
              onClick={toggleWizardMode}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[9px] font-black uppercase transition-all",
                isSimple
                  ? "border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-brand-200 hover:text-brand-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-brand-700 dark:hover:text-brand-400"
                  : "border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-400 dark:hover:bg-brand-900"
              )}
              title={
                isSimple
                  ? __("Switch to Advanced mode", "structura")
                  : __("Switch to Simple mode", "structura")
              }
            >
              {isSimple ? (
                <>
                  <Settings2 size={12} />
                  {__("Advanced", "structura")}
                </>
              ) : (
                <>
                  <Zap size={12} />
                  {__("Simple", "structura")}
                </>
              )}
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-md p-2 text-neutral-400 outline-none hover:text-neutral-500 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:hover:text-neutral-300 dark:focus:ring-brand-400 dark:focus:ring-offset-neutral-900"
              onClick={onClose}
            >
              <span className="sr-only">{__("Close scheduler modal", "structura")}</span>
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          {/* Advanced mode: full-width stepper below header row */}
          {!isSimple && (
            <div className="s-hidden mt-5 items-center gap-2 text-[10px] font-black tracking-widest text-neutral-400 uppercase lg:flex">
              {steps.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "whitespace-nowrap transition-colors",
                      step === s.id ? "text-brand-600 dark:text-brand-400" : "opacity-60"
                    )}
                  >
                    {s.label}
                  </span>
                  {i < steps.length - 1 && <ChevronRight size={10} className="shrink-0 opacity-30" />}
                </div>
              ))}
            </div>
          )}
        </Dialog.Header>

        {/* Dynamic Body */}
        <Dialog.Body className="mt-0! max-h-[65vh] overflow-y-auto bg-neutral-50/30 p-8 dark:bg-neutral-900/30">
          {getStepBody(step)}
        </Dialog.Body>

        {/* Footer */}
        <Dialog.Footer className="mt-0! border-t border-neutral-100 bg-white px-8 py-6 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex w-full items-center justify-between">
            {isEditing ? (
              // ── Editing an existing campaign ───────────────────────────
              <>
                <Button variant="secondary" onClick={onClose}>
                  {__("Cancel", "structura")}
                </Button>

                <div className="flex items-center gap-4">
                  <Button
                    variant="secondary"
                    disabled={!isStepValid(step) || step === 1}
                    onClick={handlePrevStep}
                  >
                    <ChevronLeft size={18} className="mr-2" />
                    {__("Prev Phase", "structura")}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!isStepValid(step) || step === steps.length}
                    onClick={() =>
                      isOnKeywordsStep
                        ? handleNextFromKeywords()
                        : isOnAuthorityStep
                          ? handleNextFromAuthority()
                          : step < steps.length
                            ? setStep((s) => s + 1)
                            : undefined
                    }
                  >
                    {__("Next Phase", "structura")}
                    <ChevronRight size={18} className="ml-2" />
                  </Button>
                  <Button
                    disabled={!isStepValid(step)}
                    onClick={handleLaunch}
                    loading={isUpdating || isGenerating}
                  >
                    {__("Save Changes", "structura")}
                  </Button>
                </div>
              </>
            ) : (
              // ── Creating a new campaign ────────────────────────────────
              <>
                <Button variant="secondary" onClick={onClose}>
                  {__("Cancel", "structura")}
                </Button>

                <div className="flex items-center gap-4">
                  <Button
                    variant="secondary"
                    disabled={!isStepValid(step) || step === 1}
                    onClick={handlePrevStep}
                  >
                    <ChevronLeft size={18} className="mr-2" />
                    {__("Prev Phase", "structura")}
                  </Button>
                  <Button
                    disabled={!isStepValid(step)}
                    onClick={() =>
                      isOnSummaryStep
                        ? handleLaunch()
                        : isOnKeywordsStep
                          ? handleNextFromKeywords()
                          : isOnAuthorityStep
                            ? handleNextFromAuthority()
                            : setStep((s) => s + 1)
                    }
                    loading={isUpdating || isCreating || isGenerating}
                  >
                    {isOnSummaryStep
                      ? isSingle
                        ? __("Generate Now", "structura")
                        : __("Initialize Engine", "structura")
                      : __("Next Phase", "structura")}
                    {!isOnSummaryStep && <ChevronRight size={18} className="ml-2" />}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default NewScheduleModal;
