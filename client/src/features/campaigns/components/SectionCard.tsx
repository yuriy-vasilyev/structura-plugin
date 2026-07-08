import { ReactNode } from "react";
import { cn } from "@structura/ui";
import { Check, Lock } from "lucide-react";

interface SectionCardProps {
  /** Unique section identifier for scroll targeting. */
  id: string;
  /** Step number shown in the left gutter. */
  step: number;
  /** Section title. */
  title: string;
  /** Short subtitle. */
  subtitle?: string;
  /** Whether this section's content is visible. */
  isOpen: boolean;
  /** Whether this section has been completed. */
  isComplete?: boolean;
  /** Whether this section is locked (requires previous completion). */
  isLocked?: boolean;
  /** Section content. */
  children: ReactNode;
}

export const SectionCard = ({
  id,
  step,
  title,
  subtitle,
  isOpen,
  isComplete = false,
  isLocked = false,
  children,
}: SectionCardProps) => {
  return (
    <section
      id={id}
      className={cn(
        "rounded-2xl border transition-all duration-300",
        isOpen
          ? "border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          : isComplete
            ? "border-emerald-100 bg-emerald-50/30 dark:border-emerald-900/30 dark:bg-emerald-950/10"
            : "border-neutral-100 bg-neutral-50/50 dark:border-neutral-800/50 dark:bg-neutral-900/30"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-5">
        {/* Step indicator */}
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all",
            isComplete
              ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
              : isOpen
                ? "bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400"
                : isLocked
                  ? "bg-neutral-100 text-neutral-300 dark:bg-neutral-800 dark:text-neutral-600"
                  : "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
          )}
        >
          {isComplete ? (
            <Check size={16} />
          ) : isLocked ? (
            <Lock size={14} />
          ) : (
            step
          )}
        </div>

        {/* Title & subtitle */}
        <div className="min-w-0 flex-1">
          <h2
            className={cn(
              "text-sm font-bold transition-colors",
              isComplete
                ? "text-emerald-700 dark:text-emerald-400"
                : isOpen
                  ? "text-neutral-900 dark:text-white"
                  : isLocked
                    ? "text-neutral-300 dark:text-neutral-600"
                    : "text-neutral-500 dark:text-neutral-400"
            )}
          >
            {title}
          </h2>
          {subtitle && (
            <p
              className={cn(
                "mt-0.5 text-xs",
                isLocked
                  ? "text-neutral-300 dark:text-neutral-700"
                  : "text-neutral-400 dark:text-neutral-500"
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Content — collapsible */}
      {isOpen && (
        <div className="border-t border-neutral-100 px-6 py-6 dark:border-neutral-800">
          {children}
        </div>
      )}
    </section>
  );
};
