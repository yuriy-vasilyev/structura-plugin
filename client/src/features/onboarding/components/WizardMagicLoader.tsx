/**
 * Full-step "magic in progress" loader for the wizard's AI-assisted
 * steps (Visuals, Personas, positioning draft).
 *
 * One canonical loader so every auto-generation moment in the wizard
 * looks the same — a centered hero icon, a cycling description line,
 * and a horizontal pipeline of stages (done → active → pending). This
 * mirrors the campaign-creation keyword/authority discovery loader
 * (`features/campaigns/components/steps/StepKeywords.tsx`
 * `KeywordDiscoveryLoader`) so the two flows feel like one product.
 *
 * Stage copy is deliberately vague — it conveys motion, not mechanism
 * (same principle as `MagicSuggestProgress`): competitors watching the
 * UI shouldn't be able to reverse-engineer the scrape→reason pipeline.
 *
 * The loader self-paces: it advances one stage at a time on a timer
 * and parks on the last stage until the caller unmounts it (i.e. when
 * the real call resolves). It never loops — staying on the final stage
 * reads as honest for a long call; a looping bar reads as fake.
 */

import { useEffect, useState } from "@wordpress/element";
import type { FC } from "react";
import { Check, Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@structura/ui";

interface WizardMagicLoaderProps {
  /** Hero glyph — the step's subject (image, persona, …). */
  icon: LucideIcon;
  /** Headline above the stage line, e.g. "Designing your visual style". */
  title: string;
  /** Stage descriptions, surfaced one at a time. 3–4 reads best. */
  stages: string[];
  /** ms each stage holds before advancing. */
  cadenceMs?: number;
}

export const WizardMagicLoader: FC<WizardMagicLoaderProps> = ({
  icon: Icon,
  title,
  stages,
  cadenceMs = 1600,
}) => {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setIdx((i) => Math.min(i + 1, stages.length - 1)),
      cadenceMs,
    );
    return () => clearInterval(t);
  }, [stages.length, cadenceMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      // gap-* on the flex column drives the vertical rhythm. We can't
      // rely on margin utilities here: the headings carry `m-0!` to
      // beat wp-admin's global element margins, and that `!important`
      // also nukes any `mb-*` we'd add — which is exactly why the
      // elements rendered flush together. gap isn't margin, so it wins.
      className="flex flex-col items-center justify-center gap-7 py-16"
    >
      {/* Hero icon cluster — gradient tile + pulsing accent dot. */}
      <div className="relative">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-purple-50 shadow-lg shadow-brand-100/50 dark:from-brand-950/50 dark:to-purple-950/50 dark:shadow-brand-900/20">
          <Icon className="h-7 w-7 text-brand-600 dark:text-brand-400" />
        </div>
        <div className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-brand-400 shadow-lg shadow-brand-400/50" />
      </div>

      <div className="flex flex-col items-center gap-2">
        <h2 className="m-0! text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          {title}
        </h2>
        <p className="m-0! text-sm font-medium text-neutral-600 dark:text-neutral-300">
          {stages[idx]}
        </p>
      </div>

      {/* Horizontal stage pipeline. */}
      <div className="flex w-full max-w-md items-center justify-center">
        {stages.map((stage, i) => {
          const isDone = i < idx;
          const isActive = i === idx;
          return (
            <div key={stage} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-500",
                    isDone &&
                      "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
                    isActive &&
                      "bg-brand-100 text-brand-600 shadow-md shadow-brand-200/50 dark:bg-brand-950 dark:text-brand-400 dark:shadow-brand-900/30",
                    !isDone &&
                      !isActive &&
                      "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-600",
                  )}
                >
                  {isDone ? (
                    <Check size={14} />
                  ) : isActive ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
              </div>
              {i < stages.length - 1 ? (
                <span
                  className={cn(
                    "mx-2 h-px w-8 transition-colors duration-500 sm:w-12",
                    i < idx
                      ? "bg-emerald-300 dark:bg-emerald-800"
                      : "bg-neutral-200 dark:bg-neutral-800",
                  )}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};
