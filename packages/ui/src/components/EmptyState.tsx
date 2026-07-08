import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../utils";

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Visual at the top — a Lucide icon element, the logo mark, or any node.
   * Rendered inside a tinted rounded tile when present.
   */
  icon?: ReactNode;
  /** One-line headline ("No campaigns yet"). */
  title: string;
  /** Optional 1–2 line supporting copy. */
  description?: ReactNode;
  /** Optional CTA(s) — typically a `<Button>`. */
  action?: ReactNode;
}

/**
 * EmptyState — the shared placeholder for lists/tables with no data
 * (design-guide §5.15). Anatomy: icon/illustration → heading → description →
 * CTA, centered in a dashed-bordered panel.
 *
 * Consolidates the per-feature empty states that were hand-rolled across the
 * wp-admin SPA and the portal. Surface-neutral: dark-mode-first, design tokens
 * only, no `!`-important margin resets (margin-free, flex-`gap` layout), and no
 * internal strings — all copy comes from props so each consumer translates it.
 */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon, title, description, action, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-neutral-200 px-6 py-12 text-center dark:border-neutral-800",
          className
        )}
        {...props}
      >
        {icon ? (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
            {icon}
          </div>
        ) : null}
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            {title}
          </span>
          {description ? (
            <span className="max-w-sm text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
              {description}
            </span>
          ) : null}
        </div>
        {action ? <div className="mt-1">{action}</div> : null}
      </div>
    );
  }
);
EmptyState.displayName = "EmptyState";
