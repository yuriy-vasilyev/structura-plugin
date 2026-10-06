import React from "react";
import { Check, CircleAlert, Copy } from "lucide-react";
import { cn } from "../utils";
import { Button } from "./Button";

export interface SecretFieldProps {
  /** The secret, shown in full. The parent drops it when the view closes. */
  value: string;
  /** Visible label; also names the value box for assistive tech. */
  label: string;
  /** Small mono marker on the label row, e.g. "Shown once". */
  badge?: string;
  /** Copy button text in its idle state. */
  copyLabel: string;
  /** Copy button text for `resetMs` after a successful copy. */
  copiedLabel: string;
  /** Polite live-region text after a successful copy. */
  copiedAnnouncement: string;
  /**
   * Shown (assertively) when the clipboard refuses the write. The value is
   * selected at that moment, so the message should name the keyboard
   * shortcut.
   */
  copyFailedMessage: string;
  /** Called once per successful copy, e.g. to lift a close guard. */
  onCopied?: () => void;
  /** How long the copied state holds, in ms. */
  resetMs?: number;
  className?: string;
}

// The div typings know neither attribute; React renders both on any
// element. Password managers otherwise offer to save the secret.
const PASSWORD_MANAGER_OPT_OUT = { autoComplete: "off", "data-1p-ignore": "" } as Record<
  string,
  string
>;

/**
 * `<SecretField>` — a secret that is shown once (an access token, a signing
 * secret) with a copy button.
 *
 * The value is deliberately not masked: it appears once, inside a modal,
 * and a reveal toggle would add a step at the one moment that matters. The
 * value box is a focusable read-only textbox that selects its whole content
 * on focus, so keyboard and pointer users can also copy by hand. When the
 * clipboard refuses (permissions, an insecure context, no API), the value is
 * selected and `copyFailedMessage` is announced instead of failing silently.
 *
 * Takes pre-translated strings, like every component in this package.
 */
export const SecretField = React.forwardRef<HTMLDivElement, SecretFieldProps>(
  (
    {
      value,
      label,
      badge,
      copyLabel,
      copiedLabel,
      copiedAnnouncement,
      copyFailedMessage,
      onCopied,
      resetMs = 2000,
      className,
    },
    ref,
  ) => {
    const [copied, setCopied] = React.useState(false);
    const [failed, setFailed] = React.useState(false);
    const boxRef = React.useRef<HTMLDivElement | null>(null);
    const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const labelId = React.useId();
    const errorId = React.useId();

    React.useEffect(
      () => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      },
      [],
    );

    const selectValue = React.useCallback(() => {
      const box = boxRef.current;
      const selection = typeof window !== "undefined" ? window.getSelection() : null;
      if (box && selection) selection.selectAllChildren(box);
    }, []);

    const handleFailure = React.useCallback(() => {
      setCopied(false);
      setFailed(true);
      boxRef.current?.focus();
      // Focus selects too, but only when focus actually moved.
      selectValue();
    }, [selectValue]);

    const handleCopy = React.useCallback(() => {
      if (!navigator.clipboard?.writeText) {
        handleFailure();
        return;
      }
      navigator.clipboard.writeText(value).then(() => {
        setFailed(false);
        setCopied(true);
        onCopied?.();
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), resetMs);
      }, handleFailure);
    }, [value, resetMs, onCopied, handleFailure]);

    return (
      <div ref={ref} className={className}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <span id={labelId} className="text-[13px] font-bold text-neutral-900 dark:text-white">
            {label}
          </span>
          {badge && (
            <span className="font-mono text-[10px] font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
              {badge}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <div
            ref={boxRef}
            role="textbox"
            aria-readonly="true"
            aria-labelledby={labelId}
            aria-describedby={failed ? errorId : undefined}
            tabIndex={0}
            onFocus={selectValue}
            {...PASSWORD_MANAGER_OPT_OUT}
            className={cn(
              "min-w-0 flex-1 cursor-text rounded-xl border px-3 py-2.5 font-mono text-[13px] leading-5 break-all select-all",
              "text-neutral-800 dark:text-neutral-100",
              // Copied flash: in fast, out over the slower duration.
              "transition-colors ease-in-out",
              copied
                ? "border-emerald-200 bg-emerald-500/12 duration-(--duration-fast) dark:border-emerald-500/30 dark:bg-emerald-400/12"
                : "border-neutral-200 bg-neutral-50 duration-(--duration-slower) dark:border-neutral-700 dark:bg-neutral-900",
              failed && "border-red-300 dark:border-red-500/50",
              "focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.15)] focus-visible:outline-none",
            )}
          >
            {value}
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={handleCopy}
            className="min-h-11 w-full shrink-0 sm:min-h-0 sm:w-auto"
          >
            {copied ? <Check className="text-emerald-600 dark:text-emerald-400" /> : <Copy />}
            {copied ? copiedLabel : copyLabel}
          </Button>
        </div>
        {failed && (
          <p
            id={errorId}
            role="alert"
            className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400"
          >
            <CircleAlert size={13} className="mt-px shrink-0" aria-hidden="true" />
            {copyFailedMessage}
          </p>
        )}
        <span aria-live="polite" className="sr-only">
          {copied ? copiedAnnouncement : ""}
        </span>
      </div>
    );
  },
);
SecretField.displayName = "SecretField";
