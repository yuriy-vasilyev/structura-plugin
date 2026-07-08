/**
 * Full-screen wizard chrome — sticky top header with progress + a
 * step indicator strip, content slot in the middle, sticky footer
 * with Back / Skip / Continue.
 *
 * The chrome is deliberately minimal. The "futuristic" feel the
 * wizard targets comes from the STEP CONTENT — generous whitespace,
 * a single hero question per screen, live-streaming AI suggestions
 * later in W-C. The shell stays out of the way.
 *
 * Plan: `/Users/yuriyvasilyev/.claude/plans/valiant-juggling-kazoo.md`.
 */

import { __ } from "@wordpress/i18n";
import { useEffect } from "@wordpress/element";
import type { ReactNode } from "react";
import ReactDOM from "react-dom";
import { Button, Logo } from "@structura/ui";
import { Check, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { Link } from "react-router";

import type { WizardStepId } from "../api/types";
import { markOnboardingDismissed } from "../utils/onboardingDismissal";

/**
 * The wizard renders through a React portal to `document.body` so its
 * full-screen overlay covers the entire viewport — including the
 * wp-admin top bar and left navigation menu, which sit OUTSIDE the
 * SPA root and would otherwise show through above/beside the
 * `fixed inset-0 z-50` overlay.
 *
 * Two side-effects need handling along with the portal:
 *
 *   1. **Body scroll lock** — while the wizard is open, the page
 *      behind it shouldn't scroll. We pin `overflow: hidden` on the
 *      body and restore on unmount.
 *
 *   2. **Dark-mode propagation** — Tailwind's dark variant in this
 *      project is `@custom-variant dark (&:where(.dark, .dark *))`,
 *      so dark utilities only activate when an ancestor carries the
 *      `.dark` class. The SPA root has it (per the wp-admin user
 *      color-scheme detection); body usually doesn't. While the
 *      wizard is mounted we mirror the SPA root's class state onto
 *      `document.body` so the portaled subtree inherits it, then
 *      remove it on unmount so we don't pollute the rest of
 *      wp-admin.
 */
const useFullScreenLockBody = () => {
  useEffect(() => {
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    // Marker class so the global stylesheet can elevate HeadlessUI's
    // shared `#headlessui-portal-root` above the wizard overlay — see
    // style.css. Without it, dialogs/dropdowns opened inside the wizard
    // render behind it (the portal root sits at z-auto in body flow).
    body.classList.add("structura-wizard-open");

    // Mirror the SPA root's dark-class onto body for the portal.
    const spaRoot = document.querySelector(
      ".structura-app-wrapper",
    ) as HTMLElement | null;
    const isDark = !!spaRoot?.closest(".dark");
    if (isDark) body.classList.add("dark");

    return () => {
      body.style.overflow = previousOverflow;
      body.classList.remove("structura-wizard-open");
      if (isDark) body.classList.remove("dark");
    };
  }, []);
};

interface StepDescriptor {
  id: WizardStepId;
  label: string;
}

/** Canonical step labels — kept here so the progress strip and the
 *  "all set" summary stay in lockstep. */
export function getStepDescriptors(): StepDescriptor[] {
  return [
    { id: 1, label: __("Site info", "structura") },
    { id: 2, label: __("AI engine", "structura") },
    { id: 3, label: __("SEO intelligence", "structura") },
    { id: 4, label: __("Visuals", "structura") },
    { id: 5, label: __("Personas", "structura") },
    { id: 6, label: __("Done", "structura") },
  ];
}

interface WizardShellProps {
  activeStep: WizardStepId;
  completedSteps: WizardStepId[];
  skippedSteps: WizardStepId[];
  /**
   * Steps removed from the flow entirely — not rendered in the strip
   * at all (unlike `skippedSteps`, which stay visible as dashed
   * pills). Visible steps renumber contiguously so the user never
   * sees a gap. Used for plan-irrelevant steps, e.g. the AI-engine
   * step on managed (cloud) plans where there's no provider to
   * connect.
   */
  hiddenSteps?: WizardStepId[];
  /**
   * Hide the step strip + mobile progress bar entirely. Used by the
   * pre-step license gate, which lives BEFORE the flow — showing six
   * unreachable pills behind a "connect your account" screen would
   * read as "you're already six steps behind".
   */
  hideStepStrip?: boolean;
  /** Called when user clicks the back chevron in the footer. */
  onBack?: () => void;
  /** Called when user clicks Skip — null hides the link entirely. */
  onSkip?: (() => void) | null;
  /** Called when user clicks Continue — null disables the button. */
  onContinue?: (() => void) | null;
  /**
   * Called when the user clicks a step pill in the breadcrumb.
   * When omitted the pills render as static indicators.
   */
  onStepClick?: (step: WizardStepId) => void;
  /**
   * Steps the user is allowed to jump to. A step is reachable only
   * when every prior step is valid (so step 2's AI-engine gate
   * naturally locks 3–6). Pills outside this set render disabled.
   * When omitted, all steps are treated as reachable.
   */
  reachableSteps?: WizardStepId[];
  /** Override the Continue label (e.g. "Get started" on step 6). */
  continueLabel?: string;
  /**
   * Shown beside a DISABLED Continue button to explain why the user
   * can't proceed (the current step is incomplete). Omitted when
   * Continue is enabled.
   */
  continueHint?: string;
  /**
   * Hide the footer's primary button entirely. The final step drives
   * completion through its own in-content CTAs (Create campaign /
   * Generate post / Close), so a competing footer button would be
   * confusing — the caller hides it there.
   */
  hideContinue?: boolean;
  /**
   * Tailwind max-width class for the content container (default
   * `max-w-3xl`). Card-grid steps (Personas) pass a wider one.
   */
  contentClassName?: string;
  /**
   * Toggled when the wizard is mid-save / mid-test so we can disable
   * footer buttons + show a spinner. Caller's call which states this
   * covers — the shell doesn't care.
   */
  isBusy?: boolean;
  children: ReactNode;
}

export const WizardShell = ({
  activeStep,
  completedSteps,
  skippedSteps,
  hiddenSteps,
  hideStepStrip,
  onBack,
  onSkip,
  onContinue,
  onStepClick,
  reachableSteps,
  continueLabel,
  continueHint,
  hideContinue,
  contentClassName,
  isBusy,
  children,
}: WizardShellProps) => {
  const steps = getStepDescriptors().filter(
    (s) => !hiddenSteps?.includes(s.id),
  );
  // Visible position of the active step — drives the mobile progress
  // bar so a hidden step doesn't leave a dead segment in the track.
  const activeIdx = Math.max(
    0,
    steps.findIndex((s) => s.id === activeStep),
  );
  useFullScreenLockBody();

  // Portal target is `document.body`. We render the entire overlay
  // here so wp-admin chrome (top bar + left nav) sits BEHIND the
  // wizard background, not beside it. Without the portal, the SPA's
  // own container chrome surrounds the overlay and the wp-admin
  // chrome bleeds through.
  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[100000] flex flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* Header — full wordmark on the left, "Setup wizard" label
          centered, exit affordance on the right. 3-column grid keeps
          the center label optically centered regardless of left/right
          column widths. The step strip below uses the same grid so
          its center matches the label. */}
      <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-neutral-200 bg-white px-6 py-4 dark:border-neutral-800 dark:bg-neutral-900">
        {/* Full wordmark — `view="full"` renders the STRUCTURA mark
            + wordmark. Variant pair via Tailwind dark toggle: indigo
            `dark` on light surfaces, white-ink `mono` on the dark
            header (per design-guide §2.2). Rendering both with
            `dark:hidden` / `hidden dark:block` keeps the swap
            synchronous with the wizard's theme switch — no JS-side
            dark detection needed. */}
        {/* Full logo (icon + STRUCTURA wordmark). LogoFull's root is
            `flex` for its horizontal row — so the light/dark variant
            swap classes MUST live on wrapper spans, NOT on <Logo>
            itself: putting `block`/`hidden` on the Logo clobbers its
            internal `flex` (both are `display` utilities) and the
            icon stacks on top of the wordmark. */}
        <div className="flex items-center justify-self-start">
          <span className="contents dark:hidden">
            <Logo view="full" variant="dark" />
          </span>
          <span className="hidden dark:contents">
            <Logo view="full" variant="mono" />
          </span>
        </div>

        {/* Centered title — visually anchors the whole header. */}
        <span className="justify-self-center text-sm font-semibold text-neutral-900 dark:text-neutral-50">
          {__("Setup wizard", "structura")}
        </span>

        {/* Exit pushed to the right column. wp-admin's global
            `a { color: #2271b1 }` rule wins over plain Tailwind
            utilities, so the link rendered indigo instead of the
            neutral chrome we wanted — important modifier overrides.
            Exiting records a per-site dismissal so the per-site
            onboarding auto-redirect doesn't re-yank the user back on
            the next page load (the resume tile stays as the way in). */}
        <Link
          to="/"
          onClick={markOnboardingDismissed}
          className="flex items-center gap-1 justify-self-end text-xs text-neutral-500! hover:text-neutral-700! dark:text-neutral-400! dark:hover:text-neutral-200!"
          aria-label={__("Exit setup wizard", "structura")}
        >
          <X size={14} />
          <span>{__("Exit", "structura")}</span>
        </Link>
      </header>

      {/* Step strip — always visible regardless of viewport width.
          The previous `hidden md:flex` paired with the wizard's
          portal lifecycle was hiding the strip in some build
          configurations; the compact mobile progress bar below now
          coexists with the full strip, which on narrow viewports
          will just wrap onto extra rows rather than disappear. */}
      {hideStepStrip ? null : (
      <div className="flex shrink-0 items-center justify-center gap-2 border-b border-neutral-200 bg-white px-6 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <ol className="flex items-center justify-center gap-2">
          {steps.map((s, idx) => {
            const isActive = s.id === activeStep;
            const isDone = completedSteps.includes(s.id);
            const isSkipped = skippedSteps.includes(s.id);
            // Display number = visible position, NOT the canonical step
            // id — when a step is hidden (e.g. AI engine on managed
            // plans) the remaining steps renumber contiguously instead
            // of showing a gap.
            const displayNumber = idx + 1;
            // Pills are clickable only when the parent supplied
            // `onStepClick` AND the step is reachable (every prior
            // step valid). Unreachable steps render disabled — this
            // is what stops the user from clicking ahead to (or
            // finishing with) uncompleted steps.
            const isReachable =
              !reachableSteps || reachableSteps.includes(s.id);
            const clickable = !!onStepClick && isReachable;
            const PillTag = clickable ? "button" : "div";
            return (
              <li key={s.id} className="flex items-center gap-2">
                <PillTag
                  type={clickable ? "button" : undefined}
                  onClick={clickable ? () => onStepClick!(s.id) : undefined}
                  disabled={clickable ? isBusy : undefined}
                  className={[
                    "flex items-center gap-2 rounded-full px-1.5 py-0.5 transition-colors",
                    clickable
                      ? "cursor-pointer hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:hover:bg-neutral-800"
                      : onStepClick
                      ? "cursor-not-allowed opacity-50"
                      : "",
                  ].join(" ")}
                  aria-current={isActive ? "step" : undefined}
                  aria-label={
                    clickable
                      ? `${__("Go to step", "structura")} ${displayNumber}: ${s.label}`
                      : `${__("Step", "structura")} ${displayNumber}: ${s.label}`
                  }
                >
                  <span
                    className={[
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                      isActive
                        ? "bg-brand-500 text-white"
                        : isDone
                        ? "bg-emerald-500 text-white"
                        : isSkipped
                        ? "border border-dashed border-neutral-300 text-neutral-400 dark:border-neutral-700"
                        : "border border-neutral-200 text-neutral-400 dark:border-neutral-800",
                    ].join(" ")}
                  >
                    {isDone ? <Check size={12} /> : displayNumber}
                  </span>
                  <span
                    className={[
                      "text-xs",
                      isActive
                        ? "font-medium text-neutral-900 dark:text-neutral-100"
                        : "text-neutral-500 dark:text-neutral-400",
                    ].join(" ")}
                  >
                    {s.label}
                  </span>
                </PillTag>
                {idx < steps.length - 1 ? (
                  <span className="mx-1 h-px w-6 bg-neutral-200 dark:bg-neutral-800" />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
      )}

      {/* Compact progress bar — visible on mobile where the step
          strip collapses. Always shows the % so users have a sense
          of how far they have to go. */}
      {hideStepStrip ? null : (
      <div className="h-1 shrink-0 bg-neutral-200 md:hidden dark:bg-neutral-800">
        <div
          className="h-full bg-brand-500 transition-all duration-300"
          style={{
            width: `${Math.round((activeIdx / (steps.length - 1)) * 100)}%`,
          }}
        />
      </div>
      )}

      {/* Content slot — scrollable, centered, generous whitespace per
          the design guide. Default max-w-3xl suits the form-style steps;
          steps with a card GRID (e.g. Personas) pass a wider class so
          the cards aren't squeezed. */}
      <main className="flex-1 overflow-y-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className={`mx-auto ${contentClassName ?? "max-w-3xl"}`}>
          {children}
        </div>
      </main>

      {/* Footer — Back chevron, Skip link, Continue button. */}
      <footer className="flex shrink-0 items-center justify-between border-t border-neutral-200 bg-white px-6 py-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          {onBack ? (
            <Button
              variant="transparent"
              size="sm"
              onClick={onBack}
              disabled={isBusy}
            >
              <ChevronLeft size={14} className="mr-1" />
              {__("Back", "structura")}
            </Button>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>

        <div className="flex items-center gap-6">
          {onSkip ? (
            <button
              type="button"
              onClick={onSkip}
              disabled={isBusy}
              className="text-xs text-neutral-500 hover:text-neutral-700 disabled:opacity-50 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              {__("Skip for now", "structura")}
            </button>
          ) : null}
          {/* When Continue is blocked because the current step isn't
              complete, say so — a bare disabled button reads as "nothing
              happened" rather than "you can't proceed yet." */}
          {!hideContinue && !onContinue && !isBusy && continueHint ? (
            <span className="hidden text-xs text-neutral-400 sm:inline dark:text-neutral-500">
              {continueHint}
            </span>
          ) : null}
          {!hideContinue ? (
            <Button
              variant="primary"
              size="sm"
              onClick={onContinue ?? undefined}
              disabled={!onContinue || isBusy}
            >
              {isBusy ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : null}
              {continueLabel ?? __("Continue", "structura")}
              {!isBusy ? <ChevronRight size={14} className="ml-1" /> : null}
            </Button>
          ) : null}
        </div>
      </footer>
    </div>,
    document.body,
  );
};
