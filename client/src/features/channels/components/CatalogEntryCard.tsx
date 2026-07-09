/**
 * CatalogEntryCard — one tile in the Store grid.
 *
 * Layout: icon top-left, name + colored category pill beside it, one-paragraph
 * description below, CTA button pinned bottom. Mirrors the Firebase
 * Extensions Hub pattern the user pointed at as a reference.
 *
 * Since the Store grid no longer groups by category section, the category is
 * surfaced as a colored pill on each card — one color per category so users
 * can still eyeball "oh, these three are social" at a glance without the
 * wasted vertical space of one-card sections.
 *
 * CTA is derived from `entitlement.blocker`:
 *   - null              → "Install" (primary)
 *   - "upgrade_plan"    → "Upgrade plan" (secondary, links to public pricing)
 *   - "add_channels"    → "Add Channels" (secondary, links to public pricing)
 *   - "coming_soon"     → disabled "Coming soon" (secondary)
 *
 * Clicking "Install" opens `InstallModal`, which branches on `authType` to
 * render the right form (webhook URL for Slack/Discord today, plus
 * "coming soon" panels for OAuth / API key / zero-config auth types until
 * those flows ship).
 */

import { useState } from "react";
import { __ } from "@wordpress/i18n";
import { Lock, Sparkles } from "lucide-react";
import { Badge, Button, Card, cn } from "@structura/ui";
import type { IntegrationCatalogEntry, IntegrationCategory } from "../types";
import { VIDEO_INTEGRATION_ID } from "../videoChannel";
import { IntegrationIcon } from "./IntegrationIcon";
import { InstallModal } from "./InstallModal";
import { buildMarketingPricingUrl } from "@/utils/portalLinks";

/**
 * One color per category. Tailwind utility strings include both light and
 * dark mode variants so the pills read on either theme. Kept as full
 * utility strings (not template-generated) so Tailwind's JIT picks them up.
 */
const CATEGORY_PILL_CLASSES: Record<IntegrationCategory, string> = {
  notify: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  email: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  social: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  seo: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  ads: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  crm: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200",
  video: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-200",
};

/**
 * Capability chips on the Video card (handoff §1) — the three-word pitch
 * of what the render includes. Keys stay untranslated ids; labels resolve
 * through `__()` at render time so the .pot picks them up.
 */
const VIDEO_CAPABILITY_CHIPS = () => [
  __("AI voiceover", "structura"),
  __("Animated captions", "structura"),
  __("9:16 vertical", "structura"),
];

interface CatalogEntryCardProps {
  entry: IntegrationCatalogEntry;
}

export const CatalogEntryCard = ({ entry }: CatalogEntryCardProps) => {
  const { entitlement } = entry;
  const [installOpen, setInstallOpen] = useState(false);
  const isVideo = entry.id === VIDEO_INTEGRATION_ID;

  // ---- Tier badge (top-right overlay) --------------------------------------
  const tierBadge = renderTierBadge(entry);

  // ---- CTA ------------------------------------------------------------------
  const cta = renderCta(entry, () => setInstallOpen(true));

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <IntegrationIcon
            integrationId={entry.id}
            iconUrl={entry.iconUrl}
            sizeClassName="size-10"
          />
          <div className="min-w-0">
            <h4 className="m-0! text-sm leading-tight font-bold text-neutral-900 dark:text-neutral-100">
              {entry.name}
            </h4>
            <span
              className={cn(
                "mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                CATEGORY_PILL_CLASSES[entry.category]
              )}
            >
              {categoryLabel(entry.category)}
            </span>
          </div>
        </div>
        {tierBadge}
      </div>

      <p className="m-0! line-clamp-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
        {entry.description}
      </p>

      {/* Capability chips — video-only pitch line (handoff §1). Rendered on
          every entitlement state so blocked users still see what they'd
          unlock. */}
      {isVideo && (
        <div className="flex flex-wrap gap-1.5">
          {VIDEO_CAPABILITY_CHIPS().map((label) => (
            <Badge key={label} size="sm">
              {label}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        {/* Gating hint (small, on the left) — makes the reason explicit even
            when the CTA label is "Install". Hidden when `requiredAddon` is
            null AND plan is `free` since there's nothing to surface. */}
        <GatingHint entry={entry} />
        {cta}
      </div>

      {entitlement.canInstall && (
        <InstallModal
          entry={entry}
          open={installOpen}
          onClose={() => setInstallOpen(false)}
        />
      )}
    </>
  );

  if (isVideo) {
    // Premium treatment (handoff §1): the entire upgrade is a 1px
    // brand→fuchsia hairline ring around the standard card plus a faint
    // top glow behind the header — same geometry, spacing, and CTA logic
    // as every other tile, so the grid stays calm.
    return (
      <div
        data-testid="video-premium-ring"
        className={cn(
          "rounded-2xl bg-linear-135 from-brand-400 via-brand-600 via-45% to-fuchsia-600 p-px shadow-sm",
          !entitlement.canInstall && "opacity-95"
        )}
      >
        <div className="relative flex h-full flex-col gap-4 overflow-hidden rounded-[15px] bg-white p-5 dark:bg-neutral-900">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-10 left-1/2 h-16 w-3/4 -translate-x-1/2 rounded-full bg-brand-500/15 blur-2xl dark:bg-brand-400/15"
          />
          {body}
        </div>
      </div>
    );
  }

  return (
    <Card className={cn("flex flex-col gap-4 p-5", !entitlement.canInstall && "opacity-95")}>
      {body}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Sub-renderers — extracted to keep the top-level card readable.
// ---------------------------------------------------------------------------

function renderTierBadge(entry: IntegrationCatalogEntry) {
  if (entry.comingSoon) {
    return (
      <Badge intent="secondary" variant="solid">
        {__("Coming soon", "structura")}
      </Badge>
    );
  }
  if (entry.gating.requiredAddon === "channels") {
    return (
      <Badge intent="indigo" variant="solid">
        {__("Channels", "structura")}
      </Badge>
    );
  }
  if (entry.gating.requiredPlan !== "free") {
    return (
      <Badge intent="premium" variant="solid">
        {__("Pro", "structura")}
      </Badge>
    );
  }
  return (
    <Badge intent="success" variant="solid">
      {__("Free", "structura")}
    </Badge>
  );
}

function renderCta(entry: IntegrationCatalogEntry, openInstall: () => void) {
  const { entitlement } = entry;

  if (entitlement.canInstall) {
    return (
      <Button variant="primary" size="sm" onClick={openInstall}>
        {__("Install", "structura")}
      </Button>
    );
  }

  if (entitlement.blocker === "coming_soon") {
    return (
      <Button variant="secondary" size="sm" disabled>
        <Sparkles size={14} className="mr-1.5" />
        {__("Coming soon", "structura")}
      </Button>
    );
  }

  const domain =
    typeof window !== "undefined" ? window.location.hostname : undefined;

  if (entitlement.blocker === "add_channels") {
    // Points at the public pricing page with `intent=unlock_channels`
    // so the marketing site can scroll to the Channels add-on section
    // and the analytics layer can attribute conversions back to this
    // surface specifically (vs. a generic upgrade banner).
    return (
      <Button
        variant="secondary"
        size="sm"
        href={buildMarketingPricingUrl({
          intent: "unlock_channels",
          domain,
        })}
        target="_blank"
        rel="noreferrer"
      >
        <Lock size={14} className="mr-1.5" />
        {__("Add Channels", "structura")}
      </Button>
    );
  }

  // upgrade_plan — generic plan upgrade. Same conversion destination as
  // every other "needs more" prompt across the app (CampaignsPage,
  // GeneratePostPage, ProviderUpgradeDialog). Intent kept as
  // `general_upgrade` rather than `unlock_channels` because the blocker
  // is the plan tier itself, not the add-on entitlement.
  return (
    <Button
      variant="secondary"
      size="sm"
      href={buildMarketingPricingUrl({
        intent: "general_upgrade",
        domain,
      })}
      target="_blank"
      rel="noreferrer"
    >
      <Lock size={14} className="mr-1.5" />
      {__("Upgrade plan", "structura")}
    </Button>
  );
}

function GatingHint({ entry }: { entry: IntegrationCatalogEntry }) {
  const { entitlement, gating } = entry;
  const isVideo = entry.id === VIDEO_INTEGRATION_ID;

  if (entitlement.canInstall) {
    // Video is the one entry whose install has a metered allowance —
    // surface it beside the Install CTA so the plan's value is explicit
    // before the click (handoff §1 "entitled" state).
    if (isVideo) {
      return (
        <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
          {__("Includes 40 videos/mo", "structura")}
        </span>
      );
    }
    return null;
  }
  if (entitlement.blocker === "coming_soon") return null;

  let label: string;
  if (entitlement.blocker === "upgrade_plan") {
    if (isVideo) {
      // Name the exact tier rather than the generic "higher plan" — the
      // handoff pairs the Pro badge with a concrete "Requires Cloud Pro".
      label = __("Requires Cloud Pro", "structura");
    } else {
      label =
        gating.requiredPlan === "byok"
          ? __("Requires Pro plan", "structura")
          : __("Requires higher plan", "structura");
    }
  } else {
    label = __("Requires Channels add-on", "structura");
  }
  return <span className="text-[11px] text-neutral-500 dark:text-neutral-400">{label}</span>;
}

function categoryLabel(c: IntegrationCatalogEntry["category"]): string {
  switch (c) {
    case "notify":
      return __("Notifications", "structura");
    case "email":
      return __("Email", "structura");
    case "social":
      return __("Social", "structura");
    case "seo":
      return __("SEO", "structura");
    case "ads":
      return __("Ads", "structura");
    case "crm":
      return __("CRM", "structura");
    case "video":
      return __("Video", "structura");
  }
}
