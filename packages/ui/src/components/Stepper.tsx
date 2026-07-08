import { type FC } from "react";
import { Check, Lock } from "lucide-react";
import { cn } from "../utils";

/**
 * One step in a {@link Stepper}. `label` arrives pre-translated —
 * the design system stays i18n-agnostic.
 */
export interface StepperStep {
  id: string;
  label: string;
  /** Amber "required, incomplete" marker (a small dot beside the step). */
  dot?: boolean;
  /** Render a lock glyph and never make the step clickable (gated steps). */
  locked?: boolean;
}

export interface StepperProps {
  steps: StepperStep[];
  /** Index of the current step; everything before it renders as done. */
  activeIndex: number;
  /**
   * When provided, COMPLETED steps become clickable for jumping back
   * (wizards that commit per step want review-ability; ones that
   * don't simply omit the handler). Active and upcoming steps are
   * never clickable — forward navigation belongs to the step's own
   * Continue gate, not the strip.
   */
  onStepClick?: (id: string, index: number) => void;
  /**
   * `"all"` (default) labels every step; `"active"` shows the label only
   * for the current step and renders the rest as numbered circles — keeps
   * many-step strips on one line and resilient to long (e.g. German)
   * labels without widening the container.
   */
  labelMode?: "all" | "active";
  className?: string;
}

/**
 * `<Stepper>` — the product's ONE wizard step strip (decided
 * 2026-06-12, replacing the per-page variants): numbered circles,
 * emerald check for completed steps, brand-filled ring for the
 * active one, hairline connectors between items.
 */
export const Stepper: FC<StepperProps> = ({
  steps,
  activeIndex,
  onStepClick,
  labelMode = "all",
  className,
}) => (
  <div
    className={cn(
      "mb-6 flex items-center gap-2",
      labelMode === "all" ? "flex-wrap" : "flex-nowrap",
      className
    )}
  >
    {steps.map((step, i) => {
      const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "upcoming";
      const clickable = state === "done" && !!onStepClick && !step.locked;
      const showLabel = labelMode === "all" || state === "active";
      return (
        <div key={step.id} className="flex items-center gap-2">
          <button
            type="button"
            disabled={!clickable}
            onClick={() => clickable && onStepClick(step.id, i)}
            title={labelMode === "active" ? step.label : undefined}
            className={cn(
              "flex items-center gap-2",
              clickable ? "group cursor-pointer" : "cursor-default"
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-all duration-200",
                state === "done" && "bg-emerald-500 text-white",
                state === "active" &&
                  "bg-brand-600 text-white ring-4 ring-brand-500/20 dark:bg-brand-500",
                state === "upcoming" &&
                  "bg-neutral-100 text-neutral-400 dark:bg-neutral-800"
              )}
            >
              {step.locked ? (
                <Lock size={11} />
              ) : state === "done" ? (
                <Check size={12} />
              ) : (
                i + 1
              )}
            </span>
            {showLabel && (
              <span
                className={cn(
                  "text-xs font-bold whitespace-nowrap",
                  state === "active"
                    ? "text-neutral-900 dark:text-white"
                    : "text-neutral-400",
                  clickable && "transition-colors group-hover:text-neutral-700 dark:group-hover:text-neutral-200"
                )}
              >
                {step.label}
              </span>
            )}
            {step.dot && state !== "done" && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                aria-hidden="true"
              />
            )}
          </button>
          {i < steps.length - 1 && (
            <span className="h-px w-5 shrink-0 bg-neutral-200 dark:bg-neutral-700" />
          )}
        </div>
      );
    })}
  </div>
);
