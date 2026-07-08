import React, { forwardRef } from "react";
import { Lock } from "lucide-react";
import { cn } from "../utils";
import { Badge } from "./Badge";

export interface SectionGateTeaserProps
  // `title` (the section name node) shadows the HTML tooltip attribute
  // on purpose — a native tooltip has no place on this row anyway.
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Section name, 14/700 (e.g. "Video styling"). Pre-translated. */
  title: React.ReactNode;
  /**
   * Plan badge next to the title. A bare string is wrapped in
   * `<Badge intent="premium">` (the gate vocabulary's default); pass a
   * node for any other intent.
   */
  badge?: React.ReactNode;
  /** One-line value prop under the title. Pre-translated. */
  line?: React.ReactNode;
  /**
   * Right-aligned call to action — the consumer passes its own link or
   * button (e.g. secondary "Upgrade plan" with `arrow-up-right`), so
   * navigation and gating URLs stay out of the ui package.
   */
  cta?: React.ReactNode;
  /** Replaces the default lock glyph inside the neutral tile. */
  icon?: React.ReactNode;
}

/**
 * SectionGateTeaser — a compact locked-section row for plan-gated
 * sections (video-visuals handoff §1 "Locked teaser").
 *
 * Anatomy: neutral lock tile (36px, rounded-xl) · title 14/700 + plan
 * badge · one-line neutral-500 value prop · CTA right. A single row
 * that wraps gracefully when the container is narrow (the CTA drops to
 * its own line).
 *
 * Generic on purpose: while it ships with the visual preset's Video
 * section, it is the standard replacement body for *any* section a plan
 * doesn't include — gated fields should be neither rendered nor fetched
 * behind it.
 */
export const SectionGateTeaser = forwardRef<HTMLDivElement, SectionGateTeaserProps>(
  ({ title, badge, line, cta, icon, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50/70 px-4 py-3.5",
          "dark:border-neutral-700 dark:bg-neutral-800/40",
          className
        )}
        {...props}
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-400 dark:bg-white/[.06] dark:text-neutral-500">
          {icon ?? <Lock className="size-4" aria-hidden="true" />}
        </div>
        {/* basis-48 makes wrapping graceful: below ~12rem of remaining row
            space the CTA drops to its own line instead of crushing the copy. */}
        <div className="min-w-0 flex-1 basis-48">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">{title}</p>
            {badge != null &&
              (typeof badge === "string" ? <Badge intent="premium">{badge}</Badge> : badge)}
          </div>
          {line != null && (
            <p className="mt-0.5 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
              {line}
            </p>
          )}
        </div>
        {cta != null && <div className="flex shrink-0 items-center">{cta}</div>}
      </div>
    );
  }
);
SectionGateTeaser.displayName = "SectionGateTeaser";
