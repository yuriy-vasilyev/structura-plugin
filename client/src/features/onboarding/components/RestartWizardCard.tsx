/**
 * "Restart setup wizard" entry point, surfaced on Site → Settings.
 *
 * Re-running the wizard wipes only its PROGRESS markers (currentStep /
 * completedSteps / completedAt) — the underlying saved settings (AI
 * provider, positioning, keywords, personas, visual preset) are kept,
 * so this is safe to offer as a one-click action without a confirm.
 * The user lands back at step 1 with their prior answers intact.
 *
 * Self-contained (owns its reset + navigation) so consuming surfaces
 * don't have to reach into onboarding internals — same pattern as
 * `OnboardingResumeTile`.
 */

import { __ } from "@wordpress/i18n";
import { Button, Card } from "@structura/ui";
import { Loader2, RotateCcw, Wand2 } from "lucide-react";
import { useNavigate } from "react-router";

import { useResetWizardMutation } from "../api/useOnboardingState";
import { useWizardStore } from "../state/wizardStore";

export const RestartWizardCard = () => {
  const navigate = useNavigate();
  const resetMutation = useResetWizardMutation();
  const resetStore = useWizardStore((s) => s.reset);
  const setActiveStep = useWizardStore((s) => s.setActiveStep);

  const handleRestart = async () => {
    try {
      await resetMutation.mutateAsync();
    } catch {
      // Even if the server progress reset fails, restarting the local
      // wizard is still useful — fall through and re-open it.
    }
    resetStore();
    setActiveStep(1);
    navigate("/onboarding");
  };

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="m-0! flex! items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
            <Wand2 size={14} className="text-brand-500" />
            {__("Setup wizard", "structura")}
          </h3>
          <p className="m-0! text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            {__(
              "Walk through guided setup again — site info, AI engine, SEO, visuals, and personas. Your saved settings are kept; you'll just step through them from the start.",
              "structura",
            )}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRestart}
          disabled={resetMutation.isPending}
        >
          {resetMutation.isPending ? (
            <Loader2 size={14} className="mr-1.5 animate-spin" />
          ) : (
            <RotateCcw size={14} className="mr-1.5" />
          )}
          {__("Restart setup wizard", "structura")}
        </Button>
      </div>
    </Card>
  );
};
