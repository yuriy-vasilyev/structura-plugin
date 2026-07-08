import { __ } from "@wordpress/i18n";
import { ArrowRight, Lock, Sparkles } from "lucide-react";
import { Button, cn, Dialog } from "@structura/ui";
import {
  buildMarketingPricingUrl,
  buildPortalSignupUrl,
} from "@/utils/portalLinks";
import { getProviderVisual } from "@/features/campaigns/constants";

// Post-Wave-2 plan slugs: `byok` / `cloud` / `cloud_pro` (see
// `packages/types/src/index.ts` PlanId). Pre-2026-05-10 this map
// keyed off the legacy `pro` / `agency` slugs and silently fell
// through to the raw `byok` / `cloud_pro` strings — surfacing as
// "Requires byok License" / "Upgrade to byok" in the dialog.
const TIER_LABELS: Record<string, string> = {
  none: "Starter",
  free: "Free",
  byok: "Pro",
  cloud: "Cloud",
  cloud_pro: "Agency",
};

const TIER_FEATURES: Record<string, string[]> = {
  free: [
    __("Connect your own API keys", "structura"),
    __("Text generation with any supported provider", "structura"),
    __("Basic SEO optimization rules", "structura"),
  ],
  // Same Wave-2 slug rename — feature list is keyed by the actual
  // plan slug surfaced from the catalog (anthropic.min_tier === "byok").
  byok: [
    __("Everything in Free, plus:", "structura"),
    __("Image generation (featured & body images)", "structura"),
    __("Advanced SEO directives", "structura"),
    __("All content block types", "structura"),
    __("Priority support", "structura"),
  ],
};

// Cap-lock has its own feature list — Free unlocks the second
// provider slot rather than a brand-new tier of features. Kept here
// next to TIER_FEATURES so a future copy refresh sweeps both.
const CAP_LOCK_FEATURES: string[] = [
  __("Connect a second AI provider on this site", "structura"),
  __("Switch between providers per campaign without disconnecting", "structura"),
  __("Keep all your existing settings, personas, and visuals", "structura"),
];

interface ProviderUpgradeDialogProps {
  open: boolean;
  onClose: () => void;
  providerName: string;
  providerId: string;
  description: string;
  capabilities: Array<"text" | "image">;
  minTier: string;
  /**
   * Why the provider is locked. `tier` (default) keeps the historical
   * "Requires <Tier> License" copy. `cap` reframes the dialog around
   * the per-tier provider count cap (Phase 1.8 §1.8.4) — different
   * heading, different feature list, different portal intent.
   */
  lockReason?: "tier" | "cap";
  /**
   * Provider currently connected when a `cap` lock fires. Forwarded
   * to the portal as `from_provider` so the post-signup landing page
   * can mention the swap explicitly.
   */
  fromProviderId?: string;
  /**
   * Current plugin plan slug ("none" / "free" / …). Forwarded to the
   * portal as `plan` so the signup copy can mention the upgrade path
   * ("from Free to BYOK") rather than guessing.
   */
  plan?: string;
}

export const ProviderUpgradeDialog = ({
  open,
  onClose,
  providerName,
  providerId,
  description,
  capabilities,
  minTier,
  lockReason = "tier",
  fromProviderId,
  plan,
}: ProviderUpgradeDialogProps) => {
  // Use the same provider-icon source-of-truth as `AvailableProviderCard`
  // / `InstalledProviderCard` / the wizard intro, so this dialog shows
  // the Claude / Gemini / OpenAI logo instead of a colored-letter chip
  // ("A" for Anthropic, etc.). One brand asset per provider keeps the
  // upgrade story visually continuous with the cards the user just
  // clicked.
  const providerVisual = getProviderVisual(providerId);
  const ProviderIcon = providerVisual.icon;
  const isCapLock = lockReason === "cap";
  // Cap-lock always points to the Free tier as the unlock path —
  // None tier (cap === 1) → Free (cap === 2). Tier-lock keeps the
  // provider's actual `min_tier` so Anthropic still surfaces "Pro
  // License".
  const targetTier = isCapLock ? "free" : minTier;
  const tierLabel = TIER_LABELS[targetTier] ?? targetTier;
  const features = isCapLock
    ? CAP_LOCK_FEATURES
    : TIER_FEATURES[minTier] ?? TIER_FEATURES.free;

  // Domain stays browser-side; we never ship the activation id or
  // license key over a portal URL — the portal authenticates from
  // session, not from the link.
  const domain =
    typeof window !== "undefined" ? window.location.hostname : undefined;

  // Portal handoff URL with intent + context. The portal reads
  // `intent` to branch on signup-page copy; `domain`, `plan`, and
  // `provider` / `from_provider` further specialize the messaging.
  const portalUrl = isCapLock
    ? buildPortalSignupUrl({
        intent: "connect_more_providers",
        domain,
        plan,
        providerId,
        fromProviderId,
      })
    : buildPortalSignupUrl({
        intent: "unlock_provider",
        domain,
        plan,
        providerId,
      });

  return (
    <Dialog.Root open={open} onClose={onClose} size="md">
      <Dialog.Content>
        <div className="space-y-6 text-center">
          {/* Provider icon — neutral chip + brand-colored glyph,
              same treatment used on the AI Engine page cards and
              the wizard intro. */}
          <div
            className={cn(
              "mx-auto flex size-16 items-center justify-center rounded-2xl shadow-sm",
              "bg-neutral-100 dark:bg-neutral-800",
              providerVisual.color,
            )}
          >
            <ProviderIcon size={32} />
          </div>

          {/* Title */}
          <div>
            <h2 className="m-0! text-xl font-bold text-neutral-900 dark:text-white">
              {providerName}
            </h2>
            <p className="m-0! mx-auto mt-2 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
              {description}
            </p>
          </div>

          {/* Lock notice */}
          <div className="mx-auto max-w-sm rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800/40 dark:bg-amber-950/20">
            <div className="mb-3 flex items-center justify-center gap-2">
              <Lock size={14} className="text-amber-500" />
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                {isCapLock
                  ? __("One provider per Starter site", "structura")
                  : `${__("Requires", "structura")} ${tierLabel} ${__("License", "structura")}`}
              </span>
            </div>
            <p className="m-0! text-[11px] leading-relaxed text-amber-600 dark:text-amber-400/80">
              {isCapLock
                ? __(
                    "Get a Free license to connect a second provider alongside the one you already have. Your existing setup stays in place.",
                    "structura",
                  )
                : __(
                    "Upgrade your license to connect this provider and unlock its full capabilities for your content campaigns.",
                    "structura",
                  )}
            </p>
          </div>

          {/* Feature list */}
          <div className="mx-auto max-w-sm text-left">
            <span className="mb-2 block text-[10px] font-black tracking-widest text-neutral-400 uppercase">
              {tierLabel} {__("includes", "structura")}
            </span>
            <ul className="m-0! list-none space-y-2 p-0!">
              {features.map((feature, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs text-neutral-600 dark:text-neutral-400"
                >
                  <Sparkles size={12} className="text-brand-500 mt-0.5 shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <Dialog.Footer>
          <div className="flex w-full items-center justify-between">
            <Button variant="secondary" onClick={onClose}>
              {__("Maybe later", "structura")}
            </Button>
            <div className="flex items-center gap-2">
              {targetTier === "free" ? (
                <Button asChild>
                  <a
                    href={portalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-white!"
                  >
                    {__("Get Free License", "structura")}
                    <ArrowRight size={14} className="ml-1.5" strokeWidth={2.5} />
                  </a>
                </Button>
              ) : (
                <Button asChild>
                  <a
                    href={buildMarketingPricingUrl({
                      intent: "unlock_provider",
                      domain,
                      plan,
                      // Suggest the tier that unlocks the requested provider.
                      // `targetTier` mirrors the catalog's `min_tier` so the
                      // marketing page can scroll-highlight the right card.
                      suggest:
                        targetTier === "byok" || targetTier === "cloud" || targetTier === "cloud_pro"
                          ? targetTier
                          : undefined,
                    })}
                    target="_blank"
                    rel="noreferrer"
                    className="text-white!"
                  >
                    {__("Upgrade to", "structura")} {tierLabel}
                    <ArrowRight size={14} className="ml-1.5" strokeWidth={2.5} />
                  </a>
                </Button>
              )}
            </div>
          </div>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};
