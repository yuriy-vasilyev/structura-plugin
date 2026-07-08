/**
 * "Add-ons for this site" section of the Account page (spec §11.6).
 *
 * Iterates the full add-on catalog and derives each card's state from
 * the entitlements/graceperiods bundle that `useLicense` exposes. The
 * whole section hides when the license is unlicensed — there's nothing
 * useful to show to anonymous users, and the tier hero already tells
 * them to connect an account first.
 */

import { __ } from "@wordpress/i18n";
import { Package } from "lucide-react";
import { Card } from "@structura/ui";
import type { AddonId } from "@structura/types";
import { computeAddonCardState } from "../addonCardState";
import { getAddonCatalogEntry } from "../addonCatalog";
import type { AddonEntitlementView, AddonGraceView } from "../types";
import { AddonCard } from "./AddonCard";

/**
 * The catalog order is the render order. Keeping it hard-coded so we
 * can freely reorder without refactoring the state machine.
 *
 * `growth` is intentionally omitted: the SKU is spec'd but not shipped
 * (see `functions/src/billing/addons.ts` — `isActiveForWrites: false`),
 * so the card would always render in the `not_entitled` state with an
 * upsell that 404s. Surface it only once the Growth catalog goes live.
 */
const ADDON_IDS: AddonId[] = ["channels"];

export interface AddonsSectionProps {
  entitlements: Partial<Record<AddonId, AddonEntitlementView>>;
  graceperiods: Partial<Record<AddonId, AddonGraceView>>;
  /**
   * The site's domain. We derive this from `window.location.hostname`
   * at the call site rather than reading it here so the component
   * stays pure / SSR-safe / unit-testable.
   */
  domain: string;
  /** Current page URL to thread through the portal returnTo. */
  returnTo?: string;
}

export const AddonsSection = ({
  entitlements,
  graceperiods,
  domain,
  returnTo,
}: AddonsSectionProps) => {
  return (
    <Card className="p-8! shadow-sm">
      <div className="mb-6 flex items-center gap-3">
        <Package className="h-5 w-5 text-gray-400 dark:text-gray-600" />
        <h3 className="m-0! text-sm font-bold tracking-wider text-gray-900 uppercase dark:text-white">
          {__("Add-ons for This Site", "structura")}
        </h3>
      </div>

      <div className="space-y-3">
        {ADDON_IDS.map((addonId) => {
          const state = computeAddonCardState(
            addonId,
            entitlements[addonId],
            graceperiods[addonId],
          );
          return (
            <AddonCard
              key={addonId}
              state={state}
              catalog={getAddonCatalogEntry(addonId)}
              domain={domain}
              returnTo={returnTo}
            />
          );
        })}
      </div>
    </Card>
  );
};
