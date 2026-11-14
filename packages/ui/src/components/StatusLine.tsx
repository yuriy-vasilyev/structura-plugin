import { forwardRef, type ReactNode, type Ref } from "react";
import { CircleAlert, CircleCheck, LoaderCircle, RotateCcw, Undo2 } from "lucide-react";
import { cn } from "../utils";

/**
 * A spinner that turns once a second, and once every 2.4 s (four times
 * `--duration-slower`) under reduced motion: slower, not stopped, so the
 * wait still reads as running (handoff persona voice, 4b "Motion").
 */
export const SPINNER_CLASS =
  "animate-spin motion-reduce:[animation-duration:calc(var(--duration-slower)*4)]";

export interface StatusLineAction {
  label: string;
  onClick: () => void;
  /** Leading glyph: `undo` (Undo2) or `retry` (RotateCcw); none for a plain text action. */
  icon?: "undo" | "retry";
  /** For moving focus to the action (Undo after a redraft, Try again after a failure). */
  buttonRef?: Ref<HTMLButtonElement>;
}

export interface StatusLineProps {
  /** `busy`: brand spinner. `done`: emerald check. `error`: red alert, text in the error tone. */
  tone: "busy" | "done" | "error";
  children: ReactNode;
  /** Brand text button after the text (Cancel, Undo, Try again). */
  action?: StatusLineAction;
  /** The line itself takes focus (tabindex -1), e.g. after Undo removes the action. */
  focusable?: boolean;
  className?: string;
}

const ICON = {
  busy: LoaderCircle,
  done: CircleCheck,
  error: CircleAlert,
} as const;

/**
 * One-line status with an optional action (handoff persona voice, 4d):
 * busy, done with Undo, restored, failed with Try again. Untimed: it stays
 * until the state it reports changes.
 */
export const StatusLine = forwardRef<HTMLParagraphElement, StatusLineProps>(
  ({ tone, children, action, focusable = false, className }, ref) => {
    const Icon = ICON[tone];
    return (
      <p
        ref={ref}
        tabIndex={focusable ? -1 : undefined}
        className={cn(
          "m-0! flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12.5px] leading-snug outline-none",
          tone === "error"
            ? "font-medium text-red-600 dark:text-red-400"
            : "text-neutral-600 dark:text-neutral-300",
          className,
        )}
      >
        <Icon
          size={15}
          aria-hidden="true"
          className={cn(
            "shrink-0",
            tone === "busy" && cn(SPINNER_CLASS, "text-brand-600 dark:text-brand-400"),
            tone === "done" && "text-emerald-700 dark:text-emerald-400",
          )}
        />
        <span>{children}</span>
        {action ? (
          <button
            ref={action.buttonRef}
            type="button"
            onClick={action.onClick}
            className="inline-flex cursor-pointer items-center gap-1 rounded text-xs font-bold text-brand-600 underline-offset-3 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:text-brand-400"
          >
            {action.icon === "undo" ? <Undo2 size={13} aria-hidden="true" /> : null}
            {action.icon === "retry" ? <RotateCcw size={13} aria-hidden="true" /> : null}
            {action.label}
          </button>
        ) : null}
      </p>
    );
  },
);
StatusLine.displayName = "StatusLine";
