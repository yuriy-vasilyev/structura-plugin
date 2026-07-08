import React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "../utils";

export interface CodeBlockProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /**
   * The string the block displays and copies. Rendered verbatim in
   * a monospace face — no escaping or syntax highlighting, on the
   * theory that everything we surface here (license keys, slugs,
   * IDs, REST URLs) is meant to round-trip through clipboard
   * unmodified.
   */
  value: string;
  /**
   * Visual size. `sm` for inline placement next to body copy
   * (default), `md` for stand-alone "here is the thing to copy"
   * placements where the block is the focus.
   */
  size?: "sm" | "md";
  /**
   * Accessible label for the copy button in its idle state.
   * Defaults to `"Copy"` for back-compat with non-localized
   * callers; pass a translated string in production.
   */
  copyLabel?: string;
  /**
   * Accessible label for the copy button in its post-click state,
   * also rendered as the visible feedback when the button is wide
   * enough. Defaults to `"Copied!"`.
   */
  copiedLabel?: string;
  /**
   * How long (ms) to keep the "copied" affordance visible before
   * reverting to idle. Defaults to 2000.
   */
  resetMs?: number;
  /**
   * Truncate long values with an ellipsis instead of wrapping. Off
   * by default since most IDs are short enough to fit; turn on for
   * URLs or anything you'd rather keep one line tall.
   */
  truncate?: boolean;
}

/**
 * `<CodeBlock>` — a monospace value chip with an integrated copy
 * button, themed for both light and dark mode. Use this whenever
 * the UI is asking the user to grab a string and paste it into
 * another surface (license keys in the activation flow, REST
 * endpoints in the docs page, file paths in error toasts).
 *
 * Why a dedicated component instead of letting each call site roll
 * its own `<code>` + clipboard handler:
 *   - Consistency: every key/path/id in the app gets the same
 *     visual weight and the same "copy then 2s feedback" cadence.
 *   - Accessibility: the button has a proper `aria-label`, swaps to
 *     a "copied" label after click, and is keyboard-focusable.
 *   - i18n: the labels are exposed as props instead of hard-coded,
 *     so callers in the WP plugin (`@wordpress/i18n`) and the
 *     marketing portal (i18next) can pass their own strings.
 *
 * Implementation notes:
 *   - `navigator.clipboard.writeText` is the only path. We don't
 *     ship a `document.execCommand("copy")` fallback — every
 *     browser the SPA targets has Clipboard API support.
 *   - The post-copy timer is cleared on unmount so a fast nav
 *     doesn't try to update state on an unmounted component.
 */
export const CodeBlock = React.forwardRef<HTMLDivElement, CodeBlockProps>(
  (
    {
      value,
      size = "sm",
      copyLabel = "Copy",
      copiedLabel = "Copied!",
      resetMs = 2000,
      truncate = false,
      className,
      ...props
    },
    ref,
  ) => {
    const [copied, setCopied] = React.useState(false);
    const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => {
      // Defensive — if the component unmounts during the "copied"
      // window we'd otherwise call setState on an unmounted node.
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }, []);

    const handleCopy = React.useCallback(() => {
      if (!navigator.clipboard) return;
      void navigator.clipboard.writeText(value).then(() => {
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), resetMs);
      });
    }, [value, resetMs]);

    const sizeClasses =
      size === "md"
        ? "px-3 py-2 text-sm gap-2"
        : "px-2 py-1 text-xs gap-1.5";

    // A value with newlines is a code snippet, not a chip: it must keep its
    // line breaks and grow tall. `truncate` is the opposite intent — keep it
    // one line and clip. Both need the block to be width-bounded by its
    // parent (the default `inline-flex` hugs content, so a long URL would
    // overflow the container instead of truncating, and the copy button would
    // float against centered multi-line text).
    const multiline = value.includes("\n");
    const blockLevel = multiline || truncate;

    return (
      <div
        ref={ref}
        className={cn(
          // Layout: monospace value on the left, button on the right.
          "rounded-md font-mono select-all",
          blockLevel ? "flex w-full max-w-full" : "inline-flex",
          // Top-align the copy button against tall snippets; center it for
          // single-line chips.
          multiline ? "items-start" : "items-center",
          // Light mode tones: subtle gray fill, gray-700 text — bright
          // enough to read against white cards but quiet enough not
          // to compete with body copy.
          "bg-gray-100 text-gray-800 ring-1 ring-gray-200",
          // Dark mode: matched against the gray-900 / neutral-900
          // surfaces the rest of the SPA uses for cards.
          "dark:bg-gray-800 dark:text-gray-100 dark:ring-white/10",
          sizeClasses,
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            "min-w-0",
            truncate
              ? "truncate"
              : multiline
                // Preserve newlines, wrap long lines, and break unbreakable
                // tokens (long URLs) so they don't blow out the width.
                ? "whitespace-pre-wrap break-words flex-1"
                : "break-all",
          )}
          // Allow click-to-select on the value itself for users
          // who'd rather highlight than press the button.
          aria-label={value}
        >
          {value}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? copiedLabel : copyLabel}
          aria-live="polite"
          className={cn(
            "inline-flex items-center justify-center rounded-md cursor-pointer shrink-0",
            "text-gray-500 hover:text-gray-900 hover:bg-gray-200/60",
            "dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/10",
            "transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current",
            // Hit target — slightly larger than the icon so the
            // button is comfortable on touch devices.
            size === "md" ? "h-7 w-7" : "h-5 w-5",
          )}
        >
          {copied ? (
            <Check
              className={cn(size === "md" ? "size-4" : "size-3.5", "text-emerald-600 dark:text-emerald-400")}
              strokeWidth={2.5}
            />
          ) : (
            <Copy
              className={size === "md" ? "size-4" : "size-3.5"}
              strokeWidth={2.5}
            />
          )}
        </button>
      </div>
    );
  },
);
CodeBlock.displayName = "CodeBlock";
