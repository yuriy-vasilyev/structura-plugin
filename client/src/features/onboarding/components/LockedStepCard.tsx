/**
 * Locked-preview rendering of a wizard step for free/none-tier users.
 *
 * Plan: `/Users/yuriyvasilyev/.claude/plans/valiant-juggling-kazoo.md`
 * §"Tier gating model".
 *
 * Free/none users see all steps in the wizard, but steps 2–5 are
 * locked previews — visible-but-disabled with an upgrade CTA. This
 * is the wizard's main upsell surface; the goal is to make value-of-
 * upgrade visible without consuming any DFS/LLM spend on free users.
 *
 * Mirrors the existing `LockedPanel` pattern from `/site/keywords`
 * and `/site/authority` but slimmer — those wrap a whole panel with
 * a faded preview behind a fixed overlay; this is the entire step
 * card with a single upgrade message.
 */

import { useEffect } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import { Button, Card } from "@structura/ui";
import { Lock } from "lucide-react";

import type { WizardStepId } from "../api/types";
import { useWizardStore } from "../state/wizardStore";

interface LockedStepCardProps {
  step: WizardStepId;
  title: string;
  /** One-line value statement — what unlocking gets the user. */
  valueStatement: string;
  /** Slightly longer pitch under the value statement. */
  detail: string;
  /** Where the user lands when they click "Upgrade". */
  upgradeHref: string;
}

export const LockedStepCard = ({
  step,
  title,
  valueStatement,
  detail,
  upgradeHref,
}: LockedStepCardProps) => {
  // A locked teaser step is "passable" — mark it valid so free/none
  // users (who can't actually complete it) can still Continue past it
  // and walk the rest of the wizard's upsell teasers instead of dead-
  // ending at the first lock. There's nothing to fill, so it never
  // gates the flow.
  const setStepValid = useWizardStore((s) => s.setStepValid);
  useEffect(() => {
    setStepValid(step, true);
  }, [step, setStepValid]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 text-center">
        <h1 className="m-0! text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          {title}
        </h1>
      </header>

      <Card className="flex flex-col items-center gap-6 p-12">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-950/30">
          <Lock size={18} />
        </span>
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="m-0! text-lg font-medium text-neutral-900 dark:text-neutral-50">
            {valueStatement}
          </p>
          <p className="m-0! max-w-md text-sm text-neutral-600 dark:text-neutral-400">
            {detail}
          </p>
        </div>
        <a href={upgradeHref} target="_blank" rel="noreferrer" className="contents">
          <Button variant="primary" size="md">
            {__("Upgrade to unlock", "structura")}
          </Button>
        </a>
        <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
          {__(
            "Continue past this step for now — you can come back any time.",
            "structura",
          )}
        </p>
      </Card>
    </div>
  );
};
