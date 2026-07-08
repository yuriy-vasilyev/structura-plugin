import { useId, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "../utils";

export interface CollapsibleProps {
  /** Section title shown in the header. */
  title: ReactNode;
  /** Optional one-line summary shown on the right when collapsed (e.g. "GPT-5 · 4 rules"). */
  summary?: ReactNode;
  /** Optional small dot/indicator on the right (e.g. a validity marker). */
  indicator?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Collapsible — a titled disclosure section for progressive disclosure
 * (campaign Strategy advanced groups, settings panels). Header toggles an
 * expandable body; collapsed shows an optional summary so the value stays
 * scannable without expanding.
 *
 * Surface-neutral: dark-mode-first, design tokens only, no `!`-margin resets,
 * no internal strings. The body is unmounted when collapsed (not just hidden)
 * so its focusable controls leave the tab order — the accessible default.
 * `aria-expanded` + `aria-controls` wire the header to the panel.
 */
export function Collapsible({
  title,
  summary,
  indicator,
  defaultOpen = false,
  children,
  className,
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200 dark:border-neutral-800",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left"
      >
        <ChevronRight
          size={15}
          aria-hidden="true"
          className={cn(
            "shrink-0 text-neutral-400 transition-transform duration-fast ease-out",
            open && "rotate-90"
          )}
        />
        <span className="text-[13px] font-bold text-neutral-900 dark:text-white">
          {title}
        </span>
        <span className="ml-auto flex items-center gap-2.5 pl-3">
          {summary != null && !open ? (
            <span className="truncate text-[11px] text-neutral-400">{summary}</span>
          ) : null}
          {indicator}
        </span>
      </button>
      {open ? (
        <div
          id={panelId}
          className="border-t border-neutral-100 px-4 py-4 dark:border-neutral-800"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
