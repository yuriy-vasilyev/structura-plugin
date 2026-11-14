import { Check, LoaderCircle } from "lucide-react";
import { cn } from "../utils";
import { SPINNER_CLASS } from "./StatusLine";

/** One step of a {@link DraftSteps} list. `label` arrives translated. */
export interface DraftStep {
  /** `done` once its call returned, `active` while it runs, `next` before it starts. */
  state: "done" | "active" | "next";
  label: string;
  /** Plain-text lines under the label, e.g. the titles a lookup found. */
  detail?: string[];
}

/** Visually hidden prefixes that say each step's state in words. */
export interface DraftStepsLabels {
  srDone: string;
  srActive: string;
  srNext: string;
}

export interface DraftStepsProps {
  steps: DraftStep[];
  labels: DraftStepsLabels;
  className?: string;
}

/**
 * DraftSteps — the controlled steps mode of the wizard's magic loader
 * (handoff persona voice, 4b). A vertical list of real steps, each tied to
 * one call: a step is done only when its call returned, and its label is
 * then the result. Discs share the `Stepper` contrast floors; the state is
 * also in a hidden prefix, so color is never the only cue.
 */
export function DraftSteps({ steps, labels, className }: DraftStepsProps) {
  const prefix = { done: labels.srDone, active: labels.srActive, next: labels.srNext };
  return (
    <ol className={cn("m-0 flex w-full max-w-[448px] list-none flex-col p-0", className)}>
      {steps.map((step, i) => (
        <li
          key={i}
          className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0"
        >
          {i < steps.length - 1 ? (
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-7 bottom-1 left-[11.5px] w-px transition-colors duration-normal",
                step.state === "done"
                  ? "bg-emerald-300 dark:bg-emerald-800"
                  : "bg-neutral-200 dark:bg-neutral-800",
              )}
            />
          ) : null}
          <span
            aria-hidden="true"
            className={cn(
              "flex size-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors duration-normal",
              step.state === "done" && "bg-emerald-600 text-white",
              step.state === "active" && "bg-brand-600 text-white ring-4 ring-brand-500/20",
              step.state === "next" &&
                "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300",
            )}
          >
            {step.state === "done" ? (
              <Check size={13} strokeWidth={3} />
            ) : step.state === "active" ? (
              <LoaderCircle size={13} strokeWidth={2.5} className={SPINNER_CLASS} />
            ) : (
              i + 1
            )}
          </span>
          <span
            className={cn(
              "pt-[3px] text-[13.5px] leading-[1.4]",
              step.state === "active" && "font-semibold text-neutral-900 dark:text-white",
              step.state === "done" && "font-semibold text-neutral-600 dark:text-neutral-300",
              step.state === "next" && "font-medium text-neutral-500 dark:text-neutral-400",
            )}
          >
            <span className="sr-only">{prefix[step.state]} </span>
            {step.label}
          </span>
          {step.detail && step.detail.length > 0 ? (
            <ul className="col-start-2 m-0 mt-1.5 flex list-none flex-col gap-[3px] p-0 motion-safe:animate-fade-in motion-safe:[animation-duration:var(--duration-fast)]">
              {step.detail.map((line, j) => (
                <li
                  key={j}
                  className="flex gap-2 text-[12.5px] leading-[1.45] text-neutral-500 dark:text-neutral-400"
                >
                  <span
                    aria-hidden="true"
                    className="mt-[7px] size-1 shrink-0 rounded-full bg-neutral-400 dark:bg-neutral-500"
                  />
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
