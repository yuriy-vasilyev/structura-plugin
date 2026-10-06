import React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "../utils";
import { Button } from "./Button";
import { CodeBlock } from "./CodeBlock";
import { Tabs } from "./Tabs";

/** One labelled value in a fields-mode variant (a URL, a header). */
export interface SnippetField {
  label: string;
  value: string;
}

/**
 * One way to set something up, shown as a tab. Give it `code` (a command or
 * a file to paste) or `fields` (values a tool asks for one at a time).
 */
export interface SnippetVariant {
  id: string;
  /** Tab label. */
  label: string;
  /** One line above the snippet: where to paste it. May hold inline markup. */
  hint?: React.ReactNode;
  /** The snippet, copied exactly as given. */
  code?: string;
  /** Fields mode: each value renders as its own copyable chip. */
  fields?: SnippetField[];
  /** Live-region text after this variant is copied; falls back to `copiedLabel`. */
  copiedAnnouncement?: string;
}

export interface SnippetBlockProps {
  variants: SnippetVariant[];
  /** Selected variant id (controlled). */
  value: string;
  onChange: (id: string) => void;
  /** Substrings tinted wherever they appear in `code` (e.g. a secret). Display only. */
  highlight?: string[];
  /**
   * `true` (default) wraps long lines, since copying is the job. `false`
   * keeps line breaks exactly and scrolls sideways in a focusable region.
   */
  wrap?: boolean;
  /** Copy button text in its idle state. */
  copyLabel: string;
  /** Copy button text after a successful copy. */
  copiedLabel: string;
  /** Called with the variant id after the clipboard accepted a copy. */
  onCopied?: (variantId: string) => void;
  /** Spread the tabs full-width (narrow screens). */
  stretchTabs?: boolean;
  /** Accessible name for the tab list. */
  "aria-label"?: string;
  className?: string;
}

/** Split `code` into plain and highlighted runs, in order. */
function highlightRuns(code: string, highlight: string[]): Array<{ text: string; mark: boolean }> {
  const needles = highlight.filter((h) => h.length > 0);
  if (needles.length === 0) return [{ text: code, mark: false }];
  const runs: Array<{ text: string; mark: boolean }> = [];
  let rest = code;
  while (rest.length > 0) {
    let at = -1;
    let hit = "";
    for (const needle of needles) {
      const i = rest.indexOf(needle);
      if (i !== -1 && (at === -1 || i < at)) {
        at = i;
        hit = needle;
      }
    }
    if (at === -1) {
      runs.push({ text: rest, mark: false });
      break;
    }
    if (at > 0) runs.push({ text: rest.slice(0, at), mark: false });
    runs.push({ text: hit, mark: true });
    rest = rest.slice(at + hit.length);
  }
  return runs;
}

/**
 * `<SnippetBlock>` — setup recipes in variant tabs: a terminal command, a
 * config file, or separate fields, each with a hint and a copy button.
 * Extends the {@link CodeBlock} panel recipe.
 *
 * Highlighting is presentation only: the copy button always writes the
 * variant's `code` string, never the rendered markup. Fields mode renders
 * one {@link CodeBlock} chip per value. Takes pre-translated strings.
 */
export const SnippetBlock: React.FC<SnippetBlockProps> = ({
  variants,
  value,
  onChange,
  highlight = [],
  wrap = true,
  copyLabel,
  copiedLabel,
  onCopied,
  stretchTabs = false,
  className,
  ...rest
}) => {
  const baseId = React.useId();
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = variants.find((v) => v.id === value) ?? variants[0];
  const panelId = `${baseId}-panel`;

  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const markCopied = React.useCallback(
    (variantId: string) => {
      setCopiedId(variantId);
      onCopied?.(variantId);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopiedId(null), 2000);
    },
    [onCopied],
  );

  const copyCode = (variant: SnippetVariant) => {
    if (variant.code == null || !navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(variant.code).then(
      () => markCopied(variant.id),
      () => undefined,
    );
  };

  if (!active) return null;
  const copied = copiedId === active.id;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900",
        className,
      )}
    >
      <div className="border-b border-neutral-200 p-2 dark:border-neutral-700">
        <Tabs
          size="xs"
          stretch={stretchTabs}
          aria-label={rest["aria-label"]}
          value={active.id}
          onChange={onChange}
          items={variants.map((v) => ({ id: v.id, label: v.label, controls: panelId }))}
        />
      </div>
      <div id={panelId} role="tabpanel" aria-label={active.label}>
        {active.fields ? (
          <div className="flex flex-col gap-3 p-3">
            {active.hint != null && (
              <p className="m-0 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                {active.hint}
              </p>
            )}
            {active.fields.map((field) => (
              <div key={field.label} className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
                  {field.label}
                </span>
                <CodeBlock
                  value={field.value}
                  size="md"
                  copyLabel={copyLabel}
                  copiedLabel={active.copiedAnnouncement ?? copiedLabel}
                  onCopied={() => markCopied(active.id)}
                  className="bg-white dark:bg-neutral-800"
                />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 px-3 pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              {active.hint != null ? (
                <p className="m-0 min-w-0 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                  {active.hint}
                </p>
              ) : (
                <span />
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => copyCode(active)}
                className="min-h-11 w-full shrink-0 sm:min-h-0 sm:w-auto"
              >
                {copied ? <Check className="text-emerald-600 dark:text-emerald-400" /> : <Copy />}
                {copied ? copiedLabel : copyLabel}
              </Button>
            </div>
            <div
              role={wrap ? undefined : "region"}
              aria-label={wrap ? undefined : active.label}
              tabIndex={wrap ? undefined : 0}
              className={cn(
                !wrap && "overflow-x-auto",
                "focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none focus-visible:ring-inset",
              )}
            >
              <pre
                className={cn(
                  "m-0 px-3 pt-2.5 pb-3 font-mono text-xs leading-[1.65] text-neutral-800 dark:text-neutral-100",
                  wrap ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "w-max min-w-full whitespace-pre",
                )}
              >
                {highlightRuns(active.code ?? "", highlight).map((run, i) =>
                  run.mark ? (
                    <span
                      key={i}
                      data-highlight=""
                      className="font-semibold text-brand-700 dark:text-brand-300"
                    >
                      {run.text}
                    </span>
                  ) : (
                    <React.Fragment key={i}>{run.text}</React.Fragment>
                  ),
                )}
              </pre>
            </div>
          </>
        )}
      </div>
      {/* Field chips announce through their own button; this covers code. */}
      <span data-slot="snippet-live" aria-live="polite" className="sr-only">
        {copied && !active.fields ? (active.copiedAnnouncement ?? copiedLabel) : ""}
      </span>
    </div>
  );
};
SnippetBlock.displayName = "SnippetBlock";
