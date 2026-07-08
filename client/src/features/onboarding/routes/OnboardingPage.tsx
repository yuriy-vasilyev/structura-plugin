/**
 * `/onboarding` — the wizard's full-screen route + orchestrator.
 *
 * Architecture (2026-05-29 rewrite):
 *   - All wizard data lives in the Zustand store (persisted to
 *     localStorage). Steps read/write their draft there and report
 *     `stepValidity`. NOTHING is saved to the server per-step.
 *   - "Finish setup" runs ONE batched save (`useFinishWizard`) that
 *     commits every draft, then marks the wizard complete + leaves.
 *   - The wizard is skippable (Exit anytime → dashboard resume
 *     banner + Settings re-run), but Finish requires every step
 *     valid. Step 2 (AI engine) is the hard gate: you can't reach
 *     3–6 until a working provider is connected. Managed (cloud)
 *     plans run on Structura's master keys, so for them step 2 is
 *     removed from the flow entirely — auto-validated here and
 *     hidden from the step strip.
 *   - Installs with NO KEY BOUND see the license gate before step 1
 *     (`WizardLicenseGate`): paste key → activate → the settings
 *     refetch flips `hasUsableLicense` and the gate swaps for step 1
 *     reactively. Anonymous workspaces can opt past it ("continue
 *     without an account").
 *
 * Navigation is local-only (`activeStep` in the store). The server
 * `onboarding` doc only records started/completed for the dashboard
 * banner — written on mount (lazily) and on finish.
 */

import { useEffect, useRef } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import ReactDOM from "react-dom";
import { useNavigate } from "react-router";

import { isManagedPlan, type PlanId } from "@structura/types";

import { useLicense } from "@/features/settings";

import { WizardShell } from "../components/WizardShell";
import { WizardLicenseGate } from "../components/WizardLicenseGate";
import { DowngradeBanner } from "../components/DowngradeBanner";
import { WizardStep1Identity } from "../components/WizardStep1Identity";
import { WizardStep2AiEngine } from "../components/WizardStep2AiEngine";
import { WizardStep3SeoIntelligence } from "../components/WizardStep3SeoIntelligence";
import { WizardStep4Visuals } from "../components/WizardStep4Visuals";
import { WizardStep5Persona } from "../components/WizardStep5Persona";
import { WizardStep6Done } from "../components/WizardStep6Done";
import { LockedStepCard } from "../components/LockedStepCard";
import {
  useResetWizardMutation,
  useWizardStateQuery,
} from "../api/useOnboardingState";
import { useFinishWizard } from "../api/useFinishWizard";
import type { WizardStepId } from "../api/types";
import { useWizardStore } from "../state/wizardStore";

const TIER_ORDER: ReadonlyArray<string> = [
  "none",
  "free",
  "byok",
  "cloud",
  "cloud_pro",
];

function tierLevel(planId: string | null | undefined): number {
  if (!planId) return -1;
  return TIER_ORDER.indexOf(planId);
}

export const OnboardingPage = () => {
  const navigate = useNavigate();
  const {
    isPaidLicense,
    plan: currentPlan,
    hasUsableLicense,
    hasWorkspace,
  } = useLicense();
  // Gated on workspace presence: without an activation bearer the
  // endpoint can only fail (this is what used to toast an error on
  // every fresh keyless install). The license gate below covers that
  // state instead.
  const { data, isLoading } = useWizardStateQuery({
    enabled: hasWorkspace === true,
  });
  const resetMutation = useResetWizardMutation();
  const finishWizard = useFinishWizard();

  const activeStep = useWizardStore((s) => s.activeStep);
  const setActiveStep = useWizardStore((s) => s.setActiveStep);
  const stepValidity = useWizardStore((s) => s.stepValidity);
  const setStepValid = useWizardStore((s) => s.setStepValid);
  const resetStore = useWizardStore((s) => s.reset);
  const licenseGateSkipped = useWizardStore((s) => s.licenseGateSkipped);
  const setLicenseGateSkipped = useWizardStore(
    (s) => s.setLicenseGateSkipped,
  );

  // Managed (cloud) plans run on Structura's master keys — there is no
  // provider to connect, so the AI-engine step (2) is removed from the
  // flow entirely. The step component that normally reports validity
  // never mounts, so it's auto-validated here; any stale navigation
  // onto it (persisted activeStep from a pre-upgrade session, deep
  // link) bounces forward to step 3.
  const isCloud = isManagedPlan(currentPlan as PlanId);
  useEffect(() => {
    if (!isCloud) return;
    setStepValid(2, true);
    if (activeStep === 2) setActiveStep(3);
  }, [isCloud, activeStep, setStepValid, setActiveStep]);

  // Commit happens ONCE, when leaving the last input step (Personas,
  // step 5) — the wizard's real "submit". `finishedRef` makes re-entry
  // (Back → forward, or clicking the step-6 pill) idempotent so we
  // never double-create personas. MUST live above the loading early
  // return below — declaring it after a conditional return changes the
  // hook order between renders (React #310).
  const finishedRef = useRef(false);

  // `?restart=1` testing affordance — wipe progress, reload at step 1.
  const restartFiredRef = useRef(false);
  useEffect(() => {
    if (restartFiredRef.current) return;
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const queryIdx = hash.indexOf("?");
    if (queryIdx === -1) return;
    const params = new URLSearchParams(hash.slice(queryIdx + 1));
    if (params.get("restart") !== "1") return;
    restartFiredRef.current = true;
    void resetMutation
      .mutateAsync()
      .then(() => {
        resetStore();
        setActiveStep(1);
        window.location.hash = "#/onboarding";
      })
      .catch(() => {
        restartFiredRef.current = false;
      });
  }, [resetMutation, resetStore, setActiveStep]);

  // ── License gate ────────────────────────────────────────────────
  // No key bound: the wizard's first screen asks for it (every
  // install today ships with a key — there's no wp.org listing yet).
  // The gate also re-engages after an anonymous "continue without an
  // account" if the workspace bearer is missing (bootstrap failed):
  // without one, nothing cloud-backed can work, so the key — or the
  // portal — is the only way forward. While `hasUsableLicense` is
  // still null (settings in flight) we fall through to the loading
  // screen below rather than flashing the gate.
  if (
    hasUsableLicense === false &&
    (!licenseGateSkipped || hasWorkspace !== true)
  ) {
    return (
      <WizardShell
        activeStep={1}
        completedSteps={[]}
        skippedSteps={[]}
        hideStepStrip
        hideContinue
        onSkip={null}
      >
        <WizardLicenseGate
          canContinueWithoutKey={hasWorkspace === true}
          onContinueWithoutKey={() => setLicenseGateSkipped(true)}
        />
      </WizardShell>
    );
  }

  if (isLoading || !data) {
    return ReactDOM.createPortal(
      <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {__("Loading setup…", "structura")}
        </p>
      </div>,
      document.body,
    );
  }

  const { state } = data;

  // ── Gating ──────────────────────────────────────────────────────
  // A step is REACHABLE when every prior step is valid. Because step 2
  // must be valid to reach 3, this naturally enforces the "AI engine
  // gates 3–6" rule. Step 1 is always reachable.
  const isStepReachable = (step: WizardStepId): boolean => {
    if (step === 1) return true;
    for (let s = 1; s < step; s++) {
      if (!stepValidity[s as WizardStepId]) return false;
    }
    return true;
  };

  // Derived "completed" set for the stepper — valid === complete.
  const completedSteps = (
    [1, 2, 3, 4, 5, 6] as WizardStepId[]
  ).filter((s) => stepValidity[s]);

  // Finish requires steps 1–5 all valid (6 is the summary itself).
  const canFinish = ([1, 2, 3, 4, 5] as WizardStepId[]).every(
    (s) => stepValidity[s],
  );

  const isBusy = finishWizard.isPending;

  const goToConfirmation = async () => {
    // The "Finish setup" button is disabled unless canFinish (see the
    // footer gating), so we never reach here incomplete — no need to
    // jump the user around. Defensive guard only.
    if (!canFinish) return;
    if (!finishedRef.current) {
      await finishWizard.mutateAsync();
      finishedRef.current = true;
    }
    setActiveStep(6);
  };

  const handleContinue = async () => {
    // Step 5 is the last input step — its Continue ("Finish setup")
    // commits everything, then shows the confirmation step.
    if (activeStep === 5) {
      await goToConfirmation();
      return;
    }
    if (activeStep < 5) {
      // Cloud plans have no AI-engine step — hop 1 → 3 directly.
      const next = activeStep + 1;
      setActiveStep((isCloud && next === 2 ? 3 : next) as WizardStepId);
    }
  };

  // Step 6 confirmation actions — the commit already ran, so these just
  // clear the local draft state and navigate where the user chose.
  const handleLeave = (destination: string) => {
    resetStore();
    navigate(destination);
  };

  const handleBack = () => {
    if (activeStep === 1) return;
    // Mirror Continue's hop: cloud plans skip the AI-engine step.
    const prev = activeStep - 1;
    setActiveStep((isCloud && prev === 2 ? 1 : prev) as WizardStepId);
  };

  // Steps 1–4: Continue requires the CURRENT step valid. Step 5 ("Finish
  // setup") + step 6 require ALL steps valid — so Finish is simply
  // disabled while anything's incomplete, rather than enabled-then-
  // jumping somewhere.
  const currentStepValid =
    activeStep >= 5 ? canFinish : stepValidity[activeStep];

  const renderStep = () => {
    // Free / none tier: ONLY the SEO step is locked. Keyword / competitor
    // / authority intelligence is the paid magic — free can't use it. But
    // they CAN (and should) fill in everything else: site info, AI engine,
    // visual prompt, personas. Those steps render their real components;
    // their AI "magic suggest" affordances self-disable on free tier.
    if (!isPaidLicense && activeStep === 3) {
      return (
        <LockedStepCard
          step={3}
          title={__("SEO intelligence", "structura")}
          valueStatement={__("Real keyword data, not guesses.", "structura")}
          detail={__(
            "Paid plans pull live ranking + competitor data and suggest target keywords from what you do.",
            "structura",
          )}
          upgradeHref="https://app.structurawp.com/pricing?intent=unlock_seo"
        />
      );
    }

    switch (activeStep) {
      case 1:
        return <WizardStep1Identity />;
      case 2:
        // Unreachable on cloud (the redirect effect bounces 2 → 3);
        // returning null avoids mounting the provider-connect UI for
        // the one frame before the effect runs.
        return isCloud ? null : <WizardStep2AiEngine />;
      case 3:
        return <WizardStep3SeoIntelligence />;
      case 4:
        return <WizardStep4Visuals />;
      case 5:
        return <WizardStep5Persona />;
      case 6:
        return (
          <WizardStep6Done
            completedSteps={completedSteps}
            onNavigate={handleLeave}
            // `none` tier can't create campaigns — hide that CTA for them.
            canCreateCampaign={(currentPlan ?? "none") !== "none"}
          />
        );
      default:
        return null;
    }
  };

  const isDowngraded =
    !!state.completedAtPlanId &&
    tierLevel(state.completedAtPlanId) >
      tierLevel((currentPlan as string) ?? null);

  return (
    <WizardShell
      activeStep={activeStep}
      completedSteps={completedSteps}
      skippedSteps={[]}
      hiddenSteps={isCloud ? [2] : []}
      reachableSteps={([1, 2, 3, 4, 5, 6] as WizardStepId[]).filter(
        isStepReachable,
      )}
      onBack={activeStep > 1 ? handleBack : undefined}
      onStepClick={(step) => {
        // Jumping to the confirmation step commits first (idempotent),
        // so the summary is never shown before the save ran.
        if (step === 6) {
          void goToConfirmation();
          return;
        }
        if (isStepReachable(step)) setActiveStep(step);
      }}
      // No per-step Skip — every step is required to finish. The
      // wizard as a whole is skippable via Exit (dashboard banner +
      // Settings re-run bring it back).
      onSkip={null}
      onContinue={
        activeStep < 6 && currentStepValid ? handleContinue : null
      }
      // Step 5 (last input step) submits the whole wizard.
      continueLabel={
        activeStep === 5 ? __("Finish setup", "structura") : undefined
      }
      // Explain a blocked Continue so a disabled button doesn't read as
      // "nothing happened".
      continueHint={
        activeStep < 6 && !currentStepValid
          ? activeStep === 5
            ? __("Complete every step to finish", "structura")
            : __("Complete this step to continue", "structura")
          : undefined
      }
      // Step 6 is a pure confirmation — it has its own action CTAs, so
      // hide the footer's forward button there.
      hideContinue={activeStep === 6}
      // Personas renders the full card grid — give it room so the cards
      // aren't squeezed into the form-width container.
      contentClassName={activeStep === 5 ? "max-w-5xl" : undefined}
      isBusy={isBusy}
    >
      {isDowngraded ? (
        <div className="mb-6">
          <DowngradeBanner previousPlanLabel={state.completedAtPlanId ?? undefined} />
        </div>
      ) : null}
      {renderStep()}
    </WizardShell>
  );
};
