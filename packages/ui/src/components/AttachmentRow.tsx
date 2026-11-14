import type { ReactNode, Ref } from "react";
import { Check, Info } from "lucide-react";
import { cn } from "../utils";
import { ProgressBar } from "./ProgressBar";

/**
 * Row density. `comfortable` is the research attachments list; `compact` is
 * the persona voice sources list (handoff persona voice, 4c: `px-3 py-2.5`,
 * a square 36px tile, titles that wrap to two lines on phones).
 */
export type AttachmentRowDensity = "comfortable" | "compact";

export interface AttachmentRowProps {
  /**
   * `busy`: an indeterminate runner sits under the title and `meta` says
   * what is happening. `ready`: `meta` holds the details. `failed`: a red
   * wash, `meta` holds the reason in the error tone, and the controls wrap
   * under the text on narrow rows.
   */
  state: "busy" | "ready" | "failed";
  /** Leading tile: an {@link AttachmentTile} with an extension, a favicon or an icon. */
  tile: ReactNode;
  /** Title line, plain text or a link. Truncates to one line. */
  title: ReactNode;
  /** Native tooltip carrying the full title, for names that truncate. */
  titleTooltip?: string;
  /** Quiet title tone for an item that is listed but not used. */
  muted?: boolean;
  /** Line under the title (see `state`). */
  meta?: ReactNode;
  /** Informational line under the meta, with an info icon. Neutral by design, never a warning. */
  note?: ReactNode;
  /** The row's controls: status disc, retry, remove. */
  actions?: ReactNode;
  /** @defaultValue "comfortable" */
  density?: AttachmentRowDensity;
}

/**
 * One row of an attachment list — the anatomy ResearchAttachments
 * introduced, shared with the persona voice sources panel (handoff persona
 * voice, 4c). Presentational: the caller owns the row's state and passes
 * the tile, the text and the controls.
 */
export function AttachmentRow({
  state,
  tile,
  title,
  titleTooltip,
  muted = false,
  meta,
  note,
  actions,
  density = "comfortable",
}: AttachmentRowProps) {
  const compact = density === "compact";
  const failed = state === "failed";
  return (
    <div
      className={cn(
        "flex items-center",
        compact ? "px-3 py-2.5 max-sm:p-2.5" : "px-3.5 py-3",
        failed
          ? "flex-wrap gap-x-3 gap-y-2 bg-red-50/60 dark:bg-red-500/[.06]"
          : cn("gap-3", compact && "max-sm:gap-2.5"),
      )}
    >
      {tile}
      {/* basis-40 lets a failed row's controls wrap below ~380px instead of
          crushing the reason. */}
      <div className={cn("min-w-0 flex-1", failed && "basis-40")}>
        <p
          className={cn(
            "m-0! truncate text-[13px]",
            muted
              ? "font-medium text-neutral-500 dark:text-neutral-400"
              : "font-semibold text-neutral-800 dark:text-neutral-100",
            // Phones wrap long titles to two lines instead of cutting them. A
            // URL title has no spaces to break at, so it may break anywhere
            // and fill both lines rather than end line one in an ellipsis.
            compact &&
              "max-sm:line-clamp-2 max-sm:whitespace-normal max-sm:[overflow-wrap:anywhere]",
          )}
          title={titleTooltip}
        >
          {title}
        </p>
        {state === "busy" ? (
          <ProgressBar
            className="mt-1.5 h-1 max-w-[240px] bg-neutral-200 dark:bg-white/10"
            fillClassName="bg-brand-500 dark:bg-brand-400"
          />
        ) : null}
        {meta != null ? (
          <p
            className={cn(
              // A host such as "claranovak.substack.com" has no break points;
              // unbroken, it ran under the controls on a 360px row (2026-11-14).
              "m-0! text-[11.5px] [overflow-wrap:anywhere]",
              state === "busy" ? "mt-1" : "mt-0.5",
              failed
                ? "font-medium leading-snug text-red-600 dark:text-red-400"
                : "text-neutral-500 dark:text-neutral-400",
            )}
          >
            {meta}
          </p>
        ) : null}
        {note != null ? (
          <p className="m-0! mt-1 flex items-start gap-1.5 text-[11.5px] leading-snug text-neutral-500 [overflow-wrap:anywhere] dark:text-neutral-400">
            <Info
              size={12}
              className="mt-0.5 shrink-0 text-neutral-400 dark:text-neutral-500"
              aria-hidden="true"
            />
            <span>{note}</span>
          </p>
        ) : null}
      </div>
      {actions == null ? null : failed || compact ? (
        <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>
      ) : (
        actions
      )}
    </div>
  );
}

/**
 * The 36px leading tile of an {@link AttachmentRow}. Children are an
 * extension label, a favicon or a 16px icon; `failed` turns it red.
 */
export function AttachmentTile({
  children,
  failed = false,
  density = "comfortable",
  className,
}: {
  children: ReactNode;
  failed?: boolean;
  density?: AttachmentRowDensity;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center font-mono text-[9px] font-bold uppercase tracking-wide",
        density === "compact" ? "size-9 rounded-[9px] max-sm:size-8" : "h-9 w-10 rounded-lg",
        failed
          ? "bg-red-50 text-red-600 ring-1 ring-inset ring-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20"
          : "bg-neutral-100 text-neutral-500 ring-1 ring-inset ring-neutral-200 dark:bg-white/[.06] dark:text-neutral-400 dark:ring-white/[.08]",
        className,
      )}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

/** Square icon control of an {@link AttachmentRow} (stop, remove); `label` is its accessible name and tooltip. */
export function AttachmentIconButton({
  label,
  onClick,
  danger,
  disabled,
  buttonRef,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** For moving focus to the control after a neighboring row is removed. */
  buttonRef?: Ref<HTMLButtonElement>;
  children: ReactNode;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-neutral-400 transition-colors disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-500",
        danger
          ? "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
          : "hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-white/10 dark:hover:text-neutral-300",
      )}
    >
      {children}
    </button>
  );
}

/** Bordered "Try again" control of a failed {@link AttachmentRow}; `label` names the file it retries. */
export function AttachmentRetryButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    >
      {children}
    </button>
  );
}

/** Emerald check disc of a ready row, with `label` as sr-only text so the state is never color-only. */
export function AttachmentReadyDisc({ label }: { label: string }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
      <Check size={13} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
