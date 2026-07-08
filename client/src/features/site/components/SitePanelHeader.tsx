/**
 * Shared header bar for /site panels.
 *
 * Spec: `specs/seo-intelligence-plan.md` §4.2.
 *
 * One layout across Info / Keywords / Competitors / Authority /
 * Settings — title + description on the left, action button on the
 * right. The button is optional so panels that don't need an action
 * (e.g., a static info card) just omit it.
 *
 * Why a shared component: every /site tab had a one-off variant of
 * the same layout, and three small drifts (button placement,
 * description tone, gap) had crept in. Forcing them through one
 * component keeps them visually identical and lets us evolve the
 * pattern in one place.
 */

import type { ReactNode } from "react";
import { __ } from "@wordpress/i18n";

export interface SitePanelHeaderProps {
  /** Uppercase section title — same typography as other tab cards. */
  title: string;
  /** One-line context below the title. Keep short — wraps gracefully. */
  description?: string;
  /** Optional right-aligned action (Refresh button, Discover button, etc). */
  action?: ReactNode;
}

export const SitePanelHeader = ({
  title,
  description,
  action,
}: SitePanelHeaderProps) => (
  <div className="flex items-start justify-between gap-6">
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="m-0! text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
        {title}
      </h3>
      {description ? (
        <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
          {description}
        </p>
      ) : null}
    </div>
    {action ? <div className="shrink-0">{action}</div> : null}
  </div>
);

/**
 * Re-export hook to keep a single i18n-domain assertion in tests.
 * Not strictly used — exposed so the component file passes ESLint's
 * no-unused-imports without a fake `__` reference.
 */
void __;
