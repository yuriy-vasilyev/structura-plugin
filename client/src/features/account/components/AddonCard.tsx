/**
 * Per-add-on card on the Account page (spec §11.6). Renders one of the
 * view states produced by {@link computeAddonCardState}.
 *
 * Channels is bundled into every paid plan, so the card has no per-site
 * management CTAs — it either confirms inclusion ("Included"), upsells a
 * paid plan when the license isn't entitled, or surfaces the dunning
 * banner during a payment_failed grace window.
 */

import { __, sprintf } from "@wordpress/i18n";
import { AlertTriangle, Lock, Package, SlidersHorizontal } from "lucide-react";
import { Alert, Badge, Button, Card, cn } from "@structura/ui";
import type { AddonCardState } from "../addonCardState";
import type { AddonCatalogEntry } from "../addonCatalog";
import { buildMarketingPricingUrl } from "@/utils/portalLinks";

export interface AddonCardProps {
  state: AddonCardState;
  catalog: AddonCatalogEntry;
  /** The site's domain — threaded into the upsell pricing URL. */
  domain: string;
  /**
   * Retained for call-site compatibility (the Account page still passes
   * the current URL). No longer consumed now that the card has no portal
   * hand-off CTAs, but kept optional so callers don't have to change.
   */
  returnTo?: string;
}

export const AddonCard = ({ state, catalog, domain }: AddonCardProps) => {
  return (
    <Card className="p-6! shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "rounded-lg p-2 ring-1",
              state.kind === "grace_orphan"
                ? "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-950/30 dark:ring-amber-900/50"
                : "bg-brand-50 text-brand-600 ring-brand-100 dark:bg-brand-950/30 dark:ring-brand-900/50",
            )}
            aria-hidden
          >
            {state.kind === "grace_orphan" ? (
              <AlertTriangle className="h-5 w-5" />
            ) : state.kind === "bundled_included" ? (
              <Package className="h-5 w-5" />
            ) : (
              <SlidersHorizontal className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="m-0! text-sm font-bold text-gray-900 dark:text-white">
                {catalog.name}
              </h4>
              {renderStatusBadge(state)}
            </div>
            <p className="m-0! mt-1! text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {catalog.description}
            </p>
            {renderUsageLine(state)}
          </div>
        </div>
        <div className="shrink-0">{renderCta(state, { domain, catalog })}</div>
      </div>
      {renderGraceBanner(state)}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Status badge — mirrors the card's primary state in a chip.
// ---------------------------------------------------------------------------

function renderStatusBadge(state: AddonCardState) {
  switch (state.kind) {
    case "bundled_included":
      // Channels ships with every paid plan — a calm success chip reads
      // "this came with your plan" at a glance, no action implied.
      return (
        <Badge intent="success" variant="solid">
          {__("Included", "structura")}
        </Badge>
      );
    case "grace_orphan":
      return (
        <Badge intent="warning" variant="solid">
          {__("Action required", "structura")}
        </Badge>
      );
    case "not_entitled":
      return (
        <Badge intent="secondary" variant="solid">
          {__("Not included", "structura")}
        </Badge>
      );
  }
}

// ---------------------------------------------------------------------------
// Usage line — "2 / 3 seats used" + "enabled on this site" tagline.
// ---------------------------------------------------------------------------

function renderUsageLine(state: AddonCardState) {
  if (state.kind === "not_entitled") return null;

  // `bundled_included` carries an optional entitlement (the Stripe webhook
  // may not have landed yet on a brand-new paid subscription). When we
  // have it, we still show the usage meter so multi-site customers can see
  // how many of their sites are actively pulling seats. When it's missing
  // we fall back to a short "active on this site" line — no numbers.
  if (state.kind === "bundled_included") {
    if (!state.entitlement) {
      return (
        <p className="m-0! mt-2! text-[11px] font-medium text-gray-500 dark:text-gray-500">
          {__("Active on this site.", "structura")}
        </p>
      );
    }
    const seatsLine = sprintf(
      // translators: %1$d = seats currently in use; %2$d = license seat budget.
      __("%1$d of %2$d seats used.", "structura"),
      state.entitlement.seatsUsed,
      state.entitlement.maxSeats,
    );
    return (
      <p className="m-0! mt-2! text-[11px] font-medium text-gray-500 dark:text-gray-500">
        {seatsLine} {__("Active on this site.", "structura")}
      </p>
    );
  }

  // grace_orphan — surface the seat count when the license still shows a
  // budget, so the dunning banner has context above it.
  const entitlement = state.entitlement;
  if (!entitlement) return null;

  const seatsLine = sprintf(
    // translators: %1$d = seats currently in use; %2$d = license seat budget.
    __("%1$d of %2$d seats used.", "structura"),
    entitlement.seatsUsed,
    entitlement.maxSeats,
  );

  return (
    <p className="m-0! mt-2! text-[11px] font-medium text-gray-500 dark:text-gray-500">
      {seatsLine}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Primary CTA — all variants are anchors to the portal launch URL.
// ---------------------------------------------------------------------------

function renderCta(
  state: AddonCardState,
  ctx: { domain: string; catalog: AddonCatalogEntry },
) {
  switch (state.kind) {
    case "not_entitled":
      return (
        <Button
          variant="secondary"
          size="sm"
          href={buildMarketingPricingUrl({
            intent: "unlock_addon",
            domain: ctx.domain,
            anchor: ctx.catalog.pricingAnchor,
          })}
          target="_blank"
          rel="noreferrer"
        >
          <Lock size={14} className="mr-1.5" />
          {__("Upgrade", "structura")}
        </Button>
      );

    // `bundled_included` (Channels ships with every paid plan) and
    // `grace_orphan` (dunning — the global banner owns the "Resolve in
    // billing" action) render no per-card CTA. The seat is auto-granted;
    // there's no per-site enable / disable / reassign flow anymore.
    case "bundled_included":
    case "grace_orphan":
      return null;
  }
}

// ---------------------------------------------------------------------------
// Grace-period banner — rendered below the card body when orphaned.
// ---------------------------------------------------------------------------

function renderGraceBanner(state: AddonCardState) {
  if (state.kind !== "grace_orphan") return null;
  const { grace } = state;

  const revokeDate = new Date(grace.revokeAt);
  const dateLabel = revokeDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const reasonTitle =
    grace.reason === "payment_failed"
      ? __("Payment issue — seats will be revoked", "structura")
      : __("Plan downgrade — seats will be revoked", "structura");

  const reasonBody =
    grace.reason === "payment_failed"
      ? sprintf(
          // translators: %s = localized revoke date.
          __(
            "We couldn't charge your payment method. Update billing before %s to keep this add-on enabled on this site.",
            "structura",
          ),
          dateLabel,
        )
      : sprintf(
          // translators: %s = localized revoke date.
          __(
            "Your plan change removes Channels from this site on %s. Upgrade to a paid plan in your billing portal to keep it.",
            "structura",
          ),
          dateLabel,
        );

  return (
    <Alert variant="warning" className="mt-4">
      <AlertTriangle />
      <Alert.Title>{reasonTitle}</Alert.Title>
      <Alert.Description>{reasonBody}</Alert.Description>
    </Alert>
  );
}
