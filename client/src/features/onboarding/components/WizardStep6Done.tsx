/**
 * Step 6 — Confirmation.
 *
 * This is a PURE post-save screen now: the wizard already committed
 * when the user clicked "Finish setup" on the Personas step (step 5),
 * so there's nothing to submit here. It just confirms success and
 * offers the obvious next actions — start a campaign, generate a
 * one-off post, go to the dashboard, or re-run setup. Each action only
 * navigates (`onNavigate`); none of them re-commit.
 *
 * Plan: `/Users/yuriyvasilyev/.claude/plans/valiant-juggling-kazoo.md`.
 */

import { __ } from "@wordpress/i18n";
import { Button, Card } from "@structura/ui";
import {
  ChevronRight,
  Loader2,
  PartyPopper,
  RotateCcw,
  Sparkles,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router";

import type { WizardStepId } from "../api/types";
import { useResetWizardMutation } from "../api/useOnboardingState";
import { useWizardStore } from "../state/wizardStore";

interface WizardStep6DoneProps {
  /** Steps that ended up configured — drives the count line. */
  completedSteps: WizardStepId[];
  /**
   * Clear local draft state and navigate. The batched commit already
   * ran at step 5, so this is navigation-only.
   */
  onNavigate: (destination: string) => void;
  /**
   * Whether this tier can create campaigns. `none` tier can't, so we
   * hide the "Create your first campaign" CTA for them.
   */
  canCreateCampaign?: boolean;
}

export const WizardStep6Done = ({
  completedSteps,
  onNavigate,
  canCreateCampaign = true,
}: WizardStep6DoneProps) => {
  const navigate = useNavigate();
  const resetMutation = useResetWizardMutation();
  const setActiveStep = useWizardStore((s) => s.setActiveStep);
  const resetStore = useWizardStore((s) => s.reset);

  const handleRestart = async () => {
    await resetMutation.mutateAsync();
    // Reset client store so drafts don't fight the fresh server state,
    // then jump back to step 1.
    resetStore();
    setActiveStep(1);
    navigate("/onboarding");
  };

  // 1–5 are the input steps; how many came out configured.
  const inputStepCount = 5;

  return (
    <Card className="flex flex-col gap-10 p-8 sm:p-10">
      <header className="flex flex-col items-center gap-4 text-center">
        {/* Celebration motif — restrained per the design guide (no full
            confetti animation). */}
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg shadow-brand-500/30">
          <PartyPopper size={24} />
        </span>
        <h1 className="m-0! text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-4xl">
          {__("You're all set", "structura")}
        </h1>
        <p className="m-0! max-w-xl text-base text-neutral-600 dark:text-neutral-400">
          {__(
            "Your setup is saved and Structura is ready to start writing. Pick where to begin — you can edit any of these choices later.",
            "structura",
          )}
        </p>
        <span className="text-xs font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          {completedSteps.filter((s) => s <= inputStepCount).length} /{" "}
          {inputStepCount} {__("steps configured", "structura")}
        </span>
      </header>

      <div className="flex flex-col gap-4">
        <div
          className={`grid grid-cols-1 gap-3 ${
            canCreateCampaign ? "sm:grid-cols-2" : ""
          }`}
        >
          {canCreateCampaign ? (
            <button
              type="button"
              onClick={() => onNavigate("/campaigns/new")}
              className="group flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-brand-500 px-5 py-4 text-left text-white shadow-lg shadow-brand-500/30 transition-all hover:bg-brand-600 hover:shadow-brand-500/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                  <Sparkles size={16} />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">
                    {__("Create your first campaign", "structura")}
                  </span>
                  <span className="text-xs text-white/80">
                    {__("Recurring posts on a schedule.", "structura")}
                  </span>
                </span>
              </span>
              <ChevronRight
                size={16}
                className="text-white/70 transition-transform group-hover:translate-x-0.5"
              />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onNavigate("/generate")}
            className="group flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-4 text-left transition-all hover:border-neutral-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100 dark:bg-brand-950/40 dark:text-brand-300 dark:ring-brand-900/40">
                <Zap size={16} />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                  {__("Generate a single post", "structura")}
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {__("One-off, no schedule needed.", "structura")}
                </span>
              </span>
            </span>
            <ChevronRight
              size={16}
              className="text-neutral-400 transition-transform group-hover:translate-x-0.5 dark:text-neutral-500"
            />
          </button>
        </div>

        {/* Quiet "just leave" path. */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => onNavigate("/")}
            className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            {__("Go to the dashboard", "structura")}
          </button>
        </div>
      </div>

      {/* Restart — wipes progress markers (not the saved data) and
          drops the user back at step 1 with their answers intact. */}
      <div className="flex justify-center border-t border-neutral-100 pt-6 dark:border-neutral-800">
        <Button
          variant="transparent"
          size="sm"
          onClick={handleRestart}
          disabled={resetMutation.isPending}
        >
          {resetMutation.isPending ? (
            <Loader2 size={14} className="mr-1.5 animate-spin" />
          ) : (
            <RotateCcw size={14} className="mr-1.5" />
          )}
          {__("Restart setup from step 1", "structura")}
        </Button>
      </div>
    </Card>
  );
};
