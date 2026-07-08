/**
 * Free-tier locked-state overlay for paid surfaces.
 *
 * Spec: `specs/seo-intelligence-plan.md` §3.1.
 *
 * Renders a faint preview of what the surface would look like, an
 * overlay with a lock icon + one-line value statement, and a single
 * upgrade CTA that deep-links into the customer portal's checkout for
 * the cheapest qualifying tier.
 *
 * Free / None tier callers wrap their tab content with this; paid-tier
 * callers render the same content unwrapped. The preview content is
 * intentionally generic (the children prop) so any tab can supply its
 * own "what this would look like" mockup without baking design into
 * this component.
 *
 * Lives in `features/site` rather than `@structura/ui` while the
 * shape stabilises across other paid surfaces. Promote to the design
 * system once a second feature wants the same pattern (CLAUDE.md §5).
 */

import { type ReactNode } from "react";
import { __ } from "@wordpress/i18n";
import { Card, cn } from "@structura/ui";
import { ExternalLink, Lock } from "lucide-react";
import { buildPortalSignupUrl, type PortalIntent } from "@/utils/portalLinks";
import { useLicense } from "@/features/settings";

export interface LockedPanelProps {
  /**
   * Headline value statement shown over the overlay. One short line —
   * "Find keywords your site already ranks for." not a paragraph.
   * Spec §3.1.
   */
  valueStatement: string;
  /**
   * Optional second line — explains *what* the user unlocks, in the
   * paid tier's voice. Kept brief; one sentence max.
   */
  detail?: string;
  /**
   * Portal intent the upgrade CTA carries. Defaults to
   * `unlock_keyword_bank` — the closest match for the new SEO
   * intelligence surfaces. Authority tab overrides with
   * `unlock_authority` since the portal already has copy for that
   * flavour of upgrade.
   */
  intent?: PortalIntent;
  /**
   * Optional CTA label override. Defaults to a localised "Unlock with
   * a paid plan".
   */
  ctaLabel?: string;
  /**
   * Preview children. Rendered behind the overlay, faded down so the
   * user gets a glimpse of what the unlocked surface looks like without
   * being able to interact. Always sample / placeholder data — never
   * real values from the user's workspace.
   */
  children: ReactNode;
}

/**
 * Wrap a tab's content with the free-tier lock overlay. The children
 * stay in the layout flow (so the panel's height matches the unlocked
 * version) but become non-interactive and pointer-blocked.
 */
export const LockedPanel = ({
  valueStatement,
  detail,
  intent = "unlock_keyword_bank",
  ctaLabel,
  children,
}: LockedPanelProps) => {
  const { plan } = useLicense();
  const domain = typeof window !== "undefined" ? window.location.hostname : undefined;
  // Same deep-link builder used by the account dropdown's Upgrade CTA
  // so the portal lands on the matching checkout intent. The plan we
  // pass through is the *current* plan, not the target — the portal
  // already infers the upsell from `intent`.
  const upgradeHref = buildPortalSignupUrl({
    intent,
    domain,
    plan: plan || "none",
  });

  const label = ctaLabel ?? __("Unlock this feature", "structura");

  return (
    // CSS grid stacking — both children land in the same single cell
    // (col-start-1 / row-start-1) so the wrapper sizes itself to
    // whichever child is taller. This avoids the previous failure mode
    // where `absolute inset-0` made the overlay overflow visually when
    // the preview happened to be shorter than the overlay card (e.g.,
    // the Authority tab where the preview is a 2-stat dl while the
    // overlay carries an icon + heading + 2 lines + button).
    <div className="relative grid">
      {/* Children are decorative — drop them out of the a11y tree and
          disable pointer + keyboard interaction so screen readers and
          keyboard users don't get a confusing "preview" of buttons
          they can't actually press. */}
      <div
        aria-hidden="true"
        className="col-start-1 row-start-1 pointer-events-none opacity-30 select-none [filter:saturate(0.5)]"
      >
        {children}
      </div>

      {/* Overlay — stacked over the preview via the same grid cell.
          Carries the actual a11y semantics (heading + CTA). */}
      <div
        className={cn(
          "col-start-1 row-start-1 flex items-center justify-center",
          // Inset padding so the lock card has breathing room and never
          // sits flush against the panel edges (it previously did on
          // every locked tab — Keywords/Competitors/Settings).
          "p-6 sm:p-10",
          // Subtle backdrop so the value statement reads cleanly against
          // whatever the preview happens to be.
          "bg-gradient-to-b from-white/20 to-white/80 backdrop-blur-[2px]",
          "dark:from-neutral-900/20 dark:to-neutral-900/80",
        )}
      >
        <Card className="max-w-md p-6 text-center shadow-lg">
          <div className="mb-3 inline-flex items-center justify-center rounded-full bg-brand-50 p-3 dark:bg-brand-900/30">
            <Lock className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          </div>
          <h3 className="m-0! mb-2! text-base font-semibold text-neutral-900 dark:text-neutral-100">
            {valueStatement}
          </h3>
          {detail ? (
            <p className="m-0! mb-4! text-sm text-neutral-600 dark:text-neutral-400">{detail}</p>
          ) : null}
          <a
            href={upgradeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white! hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            {label}
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </Card>
      </div>
    </div>
  );
};
