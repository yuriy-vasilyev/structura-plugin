import { type FC, type ReactNode, useId } from "react";
import { cn } from "../utils";

/**
 * One segment in a {@link Tabs} strip. `label` arrives pre-translated; an
 * optional `badge` renders a small pill after the label (e.g. an
 * auto-"Detected" marker on the matching platform, or a count).
 */
export interface TabItem {
  id: string;
  label: string;
  badge?: string;
  /**
   * Badge pill tone. `"emphasis"` (default) is the emerald marker pill
   * every pre-existing call-site renders; `"neutral"` is the quiet
   * grey pill for counts and "SOON" markers (post-view handoff,
   * marketing/design_handoff_post_view/README.md "Tab strip").
   */
  badgeTone?: "emphasis" | "neutral";
  /**
   * Optional leading icon (≈14px), rendered decoratively (aria-hidden)
   * before the label.
   */
  icon?: ReactNode;
  /**
   * Coming-soon / unavailable slot: rendered but `aria-disabled`,
   * removed from the tab order (`tabindex="-1"`), not clickable, and
   * skipped by the ←/→/Home/End roving-focus cycle. Keep disabled tabs
   * VISIBLE — the slot sets the architecture expectation.
   */
  disabled?: boolean;
  /**
   * Native tooltip (`title` attribute) — typically the "why" on a
   * disabled tab ("Analytics is coming soon").
   */
  title?: string;
}

export interface TabsProps {
  items: TabItem[];
  /** Currently-selected tab id (controlled). */
  value: string;
  onChange: (id: string) => void;
  /**
   * Density. `"md"` (default) is the page-level strip; `"xs"` is the
   * in-card platform switcher from the platform-captions handoff
   * (marketing/design_handoff_platform_captions/README.md "Switcher") —
   * same anatomy scaled down, with NEUTRAL active text so it reads
   * subordinate to page tabs (whose active chip carries full contrast).
   */
  size?: "md" | "xs";
  /**
   * Spread the track full-width with equal `flex-1` cells — the
   * panel/mobile arrangement of the xs switcher.
   */
  stretch?: boolean;
  /** Accessible label for the tablist. */
  "aria-label"?: string;
  className?: string;
}

/**
 * `<Tabs>` — a segmented control: a recessed track holding tab buttons, the
 * active one raised to a brand-tinted chip with a soft shadow. Hand-rolled
 * (no Headless dependency) so it can host per-tab badges/icons and stays a
 * thin, controlled component. Keyboard: ←/→ (and Home/End) move between
 * enabled tabs, matching the WAI-ARIA tabs pattern; disabled tabs are
 * skipped.
 *
 * Controlled only — the parent owns the selected id, so a wizard can persist
 * it. Renders the tab strip; the panel content is the caller's concern.
 */
export const Tabs: FC<TabsProps> = ({
  items,
  value,
  onChange,
  size = "md",
  stretch = false,
  className,
  ...rest
}) => {
  const baseId = useId();
  const xs = size === "xs";

  const enabled = items.filter((t) => !t.disabled);

  const move = (dir: 1 | -1) => {
    const idx = items.findIndex((t) => t.id === value);
    if (idx < 0) return;
    // Walk in `dir`, wrapping, until an enabled tab is found. Bounded by
    // items.length so an all-disabled strip can't loop forever.
    for (let step = 1; step <= items.length; step++) {
      const next = items[(idx + dir * step + items.length * step) % items.length];
      if (!next.disabled) {
        if (next.id !== value) onChange(next.id);
        return;
      }
    }
  };

  return (
    <div
      role="tablist"
      aria-label={rest["aria-label"]}
      className={cn(
        stretch ? "flex w-full" : "inline-flex max-w-full",
        xs
          ? "gap-0.5 rounded-lg bg-neutral-200/60 p-0.5 dark:bg-white/[.07]"
          : cn(
              "gap-1 overflow-x-auto rounded-xl p-1",
              "bg-neutral-100 dark:bg-neutral-800/60",
              "ring-1 ring-neutral-200/70 dark:ring-white/5",
            ),
        className,
      )}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          move(-1);
        } else if (e.key === "Home") {
          e.preventDefault();
          if (enabled[0]) onChange(enabled[0].id);
        } else if (e.key === "End") {
          e.preventDefault();
          if (enabled.length) onChange(enabled[enabled.length - 1].id);
        }
      }}
    >
      {items.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${baseId}-${tab.id}`}
            title={tab.title}
            aria-selected={active}
            aria-disabled={tab.disabled || undefined}
            tabIndex={active && !tab.disabled ? 0 : -1}
            onClick={tab.disabled ? undefined : () => onChange(tab.id)}
            className={cn(
              stretch ? "flex flex-1 justify-center" : "inline-flex shrink-0",
              "items-center font-bold whitespace-nowrap",
              xs
                ? "gap-1 rounded-md px-2 py-1 text-[11px]"
                : "gap-1.5 rounded-lg px-3 py-1.5 text-xs",
              "transition-all duration-150 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
              tab.disabled
                ? "cursor-not-allowed text-neutral-300 dark:text-neutral-600"
                : active
                  ? cn(
                      "cursor-pointer bg-white shadow-sm dark:bg-neutral-700",
                      // xs: neutral-800/100 — quieter than the page strip's
                      // full-contrast chip (handoff "Switcher" note).
                      xs
                        ? "text-neutral-800 dark:text-neutral-100"
                        : "text-neutral-900 dark:text-white",
                    )
                  : cn(
                      "cursor-pointer text-neutral-500 dark:text-neutral-400",
                      xs
                        ? "hover:text-neutral-700 dark:hover:text-neutral-200"
                        : "hover:text-neutral-800 dark:hover:text-neutral-100",
                    ),
            )}
          >
            {tab.icon && (
              <span
                aria-hidden="true"
                className={cn("shrink-0", xs ? "[&_svg]:size-3" : "[&_svg]:size-3.5")}
              >
                {tab.icon}
              </span>
            )}
            {tab.label}
            {tab.badge && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                  tab.badgeTone === "neutral"
                    ? "bg-neutral-200/80 text-neutral-500 dark:bg-white/10 dark:text-neutral-400"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ) as ReactNode;
      })}
    </div>
  );
};
