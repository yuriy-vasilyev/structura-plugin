import { ArrowUpRight, CircleAlert, CircleCheck, Undo2, X } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cn } from "../utils";
import { Button } from "./Button";
import { Tooltip } from "./Tooltip";

/**
 * What {@link InlineAdvice} shows: the full notice, the one-line collapsed
 * form after the user hid it, or the confirmation line after they acted.
 */
export type InlineAdviceState = "open" | "collapsed" | "confirmed";

/** The notice's main action, rendered as a small primary `Button`. */
export type InlineAdviceAction = {
  /** Pre-translated button text. Wraps onto more lines, never truncates. */
  label: string;
  /** Called on activation. */
  onClick: () => void;
};

/** The notice's secondary action, rendered as an underlined text button or link. */
export type InlineAdviceSecondaryAction = {
  /** Pre-translated text. */
  label: string;
  /** Called on activation (button, or link click when `href` is also set). */
  onClick?: () => void;
  /** Renders a link instead of a button. */
  href?: string;
  /**
   * Opens `href` in a new tab with `rel="noopener noreferrer"` and ends the
   * text with an `arrow-up-right` icon (e.g. "Upgrade", which must not
   * discard a dirty form).
   */
  external?: boolean;
};

type InlineAdviceBaseProps = {
  /** Which form to render. The caller owns the state; the component never changes it. */
  state: InlineAdviceState;
  /** Bold first sentence, pre-translated (e.g. "Gemini isn't recommended for writing."). */
  lead: string;
  /** The one factual reason, pre-translated, shown after the lead. */
  reason: string;
  /** Main action. Leave it out when the user cannot act and pass `note` instead. */
  primary?: InlineAdviceAction;
  /** Second action, shown after the primary. */
  secondary?: InlineAdviceSecondaryAction;
  /** A sentence shown in place of a primary action (e.g. "Ask a workspace admin to …"). */
  note?: string;
  /** The `confirmed` line (e.g. "Switched to Anthropic with its recommended model."). */
  confirmation?: string;
  /** The `collapsed` line. Defaults to `lead`. */
  collapsedText?: string;
  /**
   * Sentence for screen readers, written into the component's polite live
   * region when it changes. Pass it only on user events (picked a caution
   * option, Switch, Undo, connected); leave it unset on page load so the
   * notice is read in reading order instead.
   */
  announcement?: string;
};

/** Hide (×) control: present only when `onHide` is given, and then it needs its label. */
type InlineAdviceHideProps =
  | {
      /** Called by the × control in the `open` state. Without it there is no × at all. */
      onHide: () => void;
      /** Accessible name and tooltip of the × control (e.g. "Hide this advice for this campaign"). */
      hideLabel: string;
    }
  | { onHide?: undefined; hideLabel?: undefined };

/** Undo control on the `confirmed` line: present only when `onUndo` is given. */
type InlineAdviceUndoProps =
  | {
      /** Called by the Undo text button in the `confirmed` state. */
      onUndo: () => void;
      /** Visible text of the Undo button (e.g. "Undo"). */
      undoLabel: string;
    }
  | { onUndo?: undefined; undoLabel?: undefined };

/** Show control on the `collapsed` line: present only when `onShow` is given. */
type InlineAdviceShowProps =
  | {
      /** Called by the show text button in the `collapsed` state. */
      onShow: () => void;
      /** Visible text of the show button (e.g. "Show advice"). */
      showLabel: string;
    }
  | { onShow?: undefined; showLabel?: undefined };

/** Props for {@link InlineAdvice}. Every string arrives translated. */
export type InlineAdviceProps = InlineAdviceBaseProps &
  InlineAdviceHideProps &
  InlineAdviceUndoProps &
  InlineAdviceShowProps;

/**
 * Imperative focus targets of {@link InlineAdvice}, for the focus moves the
 * caller makes after a state change. Each method may be called in the same
 * handler that changes `state`: if the target is not rendered yet, focus
 * moves to it right after the next render, and the request is dropped if it
 * still does not exist then.
 */
export interface InlineAdviceHandle {
  /** Focuses the first action of the open notice: primary, else secondary, else ×. */
  focusPrimary: () => void;
  /** Focuses Undo on the `confirmed` line. */
  focusUndo: () => void;
  /** Focuses the show button on the `collapsed` line. */
  focusShow: () => void;
}

type FocusTarget = "primary" | "undo" | "show";

/**
 * Delay before an announcement is written into the live region. The region
 * is emptied first, so a region mounted together with its first sentence
 * (advice appearing after a pick) still has a change for screen readers to
 * pick up. Same idea as the handoff prototype's announcer.
 */
const ANNOUNCE_DELAY_MS = 100;

// 2px brand outline, offset 2 (handoff "Focus"); WP admin's `a:focus`
// box-shadow may add its own ring on links, which stays visible too.
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:focus-visible:outline-brand-400";

// Explicit box resets: wp-admin ships no preflight for <button>.
const textButtonBase =
  "m-0 inline-flex cursor-pointer items-center gap-1 rounded-sm border-0 bg-transparent p-0 text-left font-bold";

/** Accent text button used on the collapsed and confirmed lines. */
const accentTextButton = cn(
  textButtonBase,
  "text-xs text-brand-600 hover:underline dark:text-brand-400 [&_svg]:size-[13px] [&_svg]:shrink-0",
  focusRing
);

/**
 * Amber inline advice notice with a polite announcer and caller-driven focus.
 *
 * Generic: it knows nothing about providers. The AI guidance uses it for
 * "Gemini isn't recommended for writing", and other advice (persona
 * guardrails) reuses it with its own strings.
 *
 * States:
 * - `open`: icon, bold `lead` plus `reason`, optional `note`, then an
 *   actions row (`primary` as a small primary button, `secondary` as an
 *   underlined text button or link) and the × when `onHide` is given. The
 *   actions row becomes a column under a 480px container width, the
 *   primary goes full width, and on touch it is at least 44px tall.
 * - `collapsed`: one quiet line, `collapsedText` (default `lead`) plus the
 *   show button.
 * - `confirmed`: `confirmation` plus the Undo button.
 *
 * Accessibility contract (other surfaces rely on it):
 * - The component always renders one visually hidden `role="status"`
 *   `aria-live="polite"` element, outside the notice. It contains only the
 *   `announcement` string, written each time that prop changes, and is
 *   empty otherwise. The notice itself is not a live region, so the caller
 *   decides what is spoken and when.
 * - The component never moves focus on its own, including on mount. The
 *   caller moves it through the ref ({@link InlineAdviceHandle}): to Undo
 *   after a switch, to the show button after hide, to the first action
 *   after show.
 * - DOM and tab order inside the open notice: lead and reason, (note),
 *   primary, secondary, ×. The × has `hideLabel` as its accessible name and
 *   tooltip. Icons are decorative.
 * - Appear and state swaps animate (rows 0fr to 1fr, opacity) and are
 *   instant under `prefers-reduced-motion`.
 *
 * @example
 * ```tsx
 * const adviceRef = useRef<InlineAdviceHandle>(null);
 *
 * <InlineAdvice
 *   ref={adviceRef}
 *   state={switched ? "confirmed" : hidden ? "collapsed" : "open"}
 *   lead={t("aiAdvice.lead")}
 *   reason={t("aiAdvice.reason")}
 *   primary={{
 *     label: t("aiAdvice.switchTo", { provider: "Anthropic" }),
 *     onClick: () => { switchProvider("anthropic"); adviceRef.current?.focusUndo(); },
 *   }}
 *   secondary={{ label: t("aiAdvice.upgradeFree"), href: plansUrl, external: true }}
 *   onHide={() => { hide(); adviceRef.current?.focusShow(); }}
 *   hideLabel={t("aiAdvice.hide")}
 *   collapsedText={t("aiAdvice.collapsed")}
 *   onShow={() => { show(); adviceRef.current?.focusPrimary(); }}
 *   showLabel={t("aiAdvice.show")}
 *   confirmation={t("aiAdvice.switched", { provider: "Anthropic" })}
 *   onUndo={undoSwitch}
 *   undoLabel={t("aiAdvice.undo")}
 *   announcement={lastAnnouncement}
 * />
 * ```
 *
 * Spec: specs/byok-ai-guidance.md §5 (handoff "Components › ProviderAdvice",
 * "Announcements and focus").
 */
export const InlineAdvice = forwardRef<InlineAdviceHandle, InlineAdviceProps>((props, ref) => {
  const {
    state,
    lead,
    reason,
    primary,
    secondary,
    note,
    confirmation,
    collapsedText,
    announcement,
    onHide,
    hideLabel,
    onUndo,
    undoLabel,
    onShow,
    showLabel,
  } = props;

  const primaryRef = useRef<HTMLElement>(null);
  const secondaryLinkRef = useRef<HTMLAnchorElement>(null);
  const secondaryButtonRef = useRef<HTMLButtonElement>(null);
  const hideRef = useRef<HTMLButtonElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const showRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);

  const targetFor = (target: FocusTarget): HTMLElement | null => {
    if (target === "undo") return undoRef.current;
    if (target === "show") return showRef.current;
    return (
      primaryRef.current ??
      secondaryLinkRef.current ??
      secondaryButtonRef.current ??
      hideRef.current
    );
  };

  const requestFocus = (target: FocusTarget) => {
    const element = targetFor(target);
    if (element) {
      pendingFocus.current = null;
      element.focus();
    } else {
      pendingFocus.current = target;
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      focusPrimary: () => requestFocus("primary"),
      focusUndo: () => requestFocus("undo"),
      focusShow: () => requestFocus("show"),
    }),
    // The methods read only refs, so the first render's handle stays correct.
    []
  );

  // Resolve a focus request made before its target existed (the caller
  // changed `state` and asked for focus in the same handler). One try only.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    targetFor(target)?.focus();
  });

  const [spoken, setSpoken] = useState("");
  useEffect(() => {
    setSpoken("");
    if (!announcement) return;
    const timer = setTimeout(() => setSpoken(announcement), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [announcement]);

  const hasActions = Boolean(primary || secondary);

  const secondaryContent = secondary && (
    <>
      {secondary.label}
      {secondary.external && <ArrowUpRight aria-hidden="true" />}
    </>
  );
  const secondaryClass = cn(
    textButtonBase,
    "text-[12.5px] text-adv-ink underline decoration-1 underline-offset-[3px] hover:decoration-2",
    "[&_svg]:size-[13px] [&_svg]:shrink-0 @max-[30rem]/advice:self-start",
    focusRing
  );

  return (
    <div className="@container/advice">
      {/* Appear: rows 0fr → 1fr via @starting-style; instant with reduced motion. */}
      <div className="grid grid-rows-[1fr] transition-[grid-template-rows] duration-(--duration-normal) ease-out motion-reduce:transition-none starting:grid-rows-[0fr]">
        {/* Clips while the row grows; the 4px padding keeps focus outlines visible. */}
        <div className="-m-1 min-h-0 overflow-hidden p-1">
          {/* Keyed by state so every swap fades the new content in. */}
          <div
            key={state}
            data-state={state}
            className="opacity-100 transition-opacity duration-(--duration-fast) ease-out motion-reduce:transition-none starting:opacity-0"
          >
            {state === "open" && (
              <div
                className={cn(
                  "border-adv-line bg-adv-bg text-adv-ink relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 rounded-xl border py-3 pl-3.5 text-[13px] leading-normal text-pretty",
                  "@max-[30rem]/advice:pl-3",
                  onHide ? "pr-11 @max-[30rem]/advice:pr-10" : "pr-3.5"
                )}
              >
                <CircleAlert aria-hidden="true" className="text-adv-icon mt-0.5 size-4 shrink-0" />
                <div className="col-start-2">
                  <strong className="font-bold">{lead}</strong> {reason}
                </div>
                {note && <div className="col-start-2 mt-2 text-[12.5px]">{note}</div>}
                {hasActions && (
                  <div className="col-start-2 mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 @max-[30rem]/advice:flex-col @max-[30rem]/advice:items-stretch">
                    {primary && (
                      <Button
                        ref={primaryRef}
                        type="button"
                        size="sm"
                        variant="primary"
                        onClick={primary.onClick}
                        className="min-h-[30px] text-center text-wrap @max-[30rem]/advice:w-full @max-[30rem]/advice:pointer-coarse:min-h-11"
                      >
                        {primary.label}
                      </Button>
                    )}
                    {secondary &&
                      (secondary.href ? (
                        <a
                          ref={secondaryLinkRef}
                          href={secondary.href}
                          onClick={secondary.onClick}
                          className={secondaryClass}
                          // wp-admin's unlayered `a`, `a:hover` and `a:visited` colours beat any
                          // layered utility; an inline token keeps the link amber there too.
                          style={{ color: "var(--color-adv-ink)" }}
                          {...(secondary.external
                            ? { target: "_blank", rel: "noopener noreferrer" }
                            : {})}
                        >
                          {secondaryContent}
                        </a>
                      ) : (
                        <button
                          ref={secondaryButtonRef}
                          type="button"
                          onClick={secondary.onClick}
                          className={secondaryClass}
                        >
                          {secondaryContent}
                        </button>
                      ))}
                  </div>
                )}
                {onHide && (
                  <Tooltip title={hideLabel} position="top">
                    <button
                      ref={hideRef}
                      type="button"
                      aria-label={hideLabel}
                      onClick={onHide}
                      className={cn(
                        "text-adv-ink absolute top-2 right-2 m-0 inline-flex size-7 cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent p-0 opacity-65",
                        "hover:bg-adv-ink/9 transition-opacity duration-(--duration-fast) ease-out hover:opacity-100 focus-visible:opacity-100",
                        focusRing
                      )}
                    >
                      <X aria-hidden="true" className="size-3.5" />
                    </button>
                  </Tooltip>
                )}
              </div>
            )}

            {state === "collapsed" && (
              <div className="text-adv-quiet flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-[1.45]">
                <CircleAlert aria-hidden="true" className="size-[13px] shrink-0" />
                <span>{collapsedText ?? lead}</span>
                {onShow && (
                  <button ref={showRef} type="button" onClick={onShow} className={accentTextButton}>
                    {showLabel}
                  </button>
                )}
              </div>
            )}

            {state === "confirmed" && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] leading-[1.45] text-neutral-600 dark:text-neutral-300">
                <CircleCheck
                  aria-hidden="true"
                  className="size-[15px] shrink-0 text-emerald-700 dark:text-emerald-400"
                />
                <span>{confirmation}</span>
                {onUndo && (
                  <button ref={undoRef} type="button" onClick={onUndo} className={accentTextButton}>
                    <Undo2 aria-hidden="true" />
                    {undoLabel}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {spoken}
      </div>
    </div>
  );
});
InlineAdvice.displayName = "InlineAdvice";
