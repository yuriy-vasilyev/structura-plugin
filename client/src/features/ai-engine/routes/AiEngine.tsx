import { useMemo, useState } from "react";
import { __ } from "@wordpress/i18n";
import { Image, Plug, ShieldCheck, Type, Unplug } from "lucide-react";
import { Badge, PageLoader } from "@structura/ui";
import { PageTitle } from "@/components/Layout/PageTitle";
import { PageDescription } from "@/components/Layout/PageSubtitle";
import { PageContainer } from "@/components/Layout/PageContainer";

// Hooks
import { useAiSettingsQuery } from "@/features/ai-engine";
import { useLicense } from "@/features/settings";
import { isManagedPlan, type PlanId } from "@structura/types";

// Components
import { InstalledProviderCard } from "../components/InstalledProviderCard";
import { AvailableProviderCard } from "../components/AvailableProviderCard";
import { ProviderSetupWizard } from "../components/ProviderSetupWizard";
import { ProviderUpgradeDialog } from "../components/ProviderUpgradeDialog";
import { WorkspaceKeysPicker } from "../components/WorkspaceKeysPicker";

/* ────────────────────────────────────────────────────────────────── */

interface WizardTarget {
  id: string;
  name: string;
  description: string;
  capabilities: Array<"text" | "image">;
  keyUrl: string;
  keyPrefix?: string;
  isConnected: boolean;
  textModel?: string;
  imageModel?: string;
  isDefaultText: boolean;
  isDefaultImage: boolean;
}

/**
 * Phase 1.8 §1.8.4 — strip the `image` capability from a provider's
 * caps array when the calling tier has no image generation. `none`
 * tier users see the AI Engine page with a single configurable
 * provider, but the image-side of the wizard (image model picker +
 * "Default for image" toggle) makes no sense — the cloud rejects
 * image-gen calls for `none` regardless. Filter at the source so
 * the wizard's existing `hasImage` checks naturally hide those
 * fields without a tier-aware branch in every UI primitive.
 */
function capsForTier(
  capabilities: Array<"text" | "image">,
  plan: string,
): Array<"text" | "image"> {
  if (plan !== "none") return capabilities;
  return capabilities.filter((c) => c !== "image");
}

/**
 * AI Engine — Provider Management
 *
 * Two-section layout:
 *  1. "Your Providers"  – connected providers with Default badges
 *  2. "Available"       – providers to add, or tier-locked teasers
 *
 * Clicking "Set Up" / "Manage" opens a multi-step wizard that handles
 * API key, connection test, model selection, AND default provider config.
 */
export const AiEngine = () => {
  const { data: settings, isLoading } = useAiSettingsQuery();
  const { plan, providerCountCap } = useLicense();

  const isCloud = isManagedPlan(plan as PlanId);
  // Phase 1.8 §1.8.4 — convenience flag for "single provider" UX:
  // hide default-for-text/image toggles in the wizard, hide
  // duplicate "default" badges on the installed card, hide the
  // "add another provider" affordances on the available list once
  // installed.length === cap.
  const isSingleProviderTier = providerCountCap === 1;

  const providers = settings?.providers;
  const catalog = settings?.catalog;
  const defaults = settings?.defaults;

  /* ── Wizard state ─────────────────────────────────────────────── */
  const [wizardTarget, setWizardTarget] = useState<WizardTarget | null>(null);

  /* ── Upgrade teaser state (for tier-locked providers) ────────── */
  const [upgradeTarget, setUpgradeTarget] = useState<{
    id: string;
    name: string;
    description: string;
    capabilities: Array<"text" | "image">;
    minTier: string;
    /**
     * Phase 1.8 §1.8.4 — when the user hit the per-tier provider count
     * cap (rather than the provider's own min_tier), the upgrade
     * dialog reframes its copy around "connect more providers" and
     * sends the customer to the portal with `intent=connect_more_providers`.
     */
    lockReason: "tier" | "cap";
    /**
     * Provider currently connected when a `cap` lock fires. Surfaced
     * to the portal so the post-signup landing page can mention the
     * swap scenario explicitly ("you came here trying to connect
     * OpenAI alongside Gemini").
     */
    fromProviderId?: string;
  } | null>(null);

  /* ── Derived lists ────────────────────────────────────────────── */
  const { installed, available } = useMemo(() => {
    if (!catalog || !providers) return { installed: [] as string[], available: [] as string[] };

    const inst: string[] = [];
    const avail: string[] = [];

    for (const id of Object.keys(catalog)) {
      if (providers[id]?.connected) {
        inst.push(id);
      } else {
        avail.push(id);
      }
    }

    return { installed: inst, available: avail };
  }, [catalog, providers]);

  const connectedTextCount = useMemo(() => {
    if (!providers) return 0;
    return Object.values(providers).filter(
      (p) => p.connected && p.capabilities.includes("text")
    ).length;
  }, [providers]);

  const connectedImageCount = useMemo(() => {
    if (!providers) return 0;
    return Object.values(providers).filter(
      (p) => p.connected && p.capabilities.includes("image")
    ).length;
  }, [providers]);

  if (isLoading || !settings || !catalog || !providers || !defaults) {
    return <PageLoader label={__("Syncing AI Vault…", "structura")} size="lg" padding="lg" />;
  }

  // Pre-emptive cap locking — mirrors WizardStep2AiEngine (Yurii wp.org
  // testing 2026-07-08). Keying the cap lock off `installed.length >=
  // cap` made a `none` tier (cap 1) show BOTH OpenAI and Gemini as
  // freely connectable until the first connect consumed the slot. Lock
  // the extras up front instead: the first `slotsLeft` tier-eligible,
  // not-yet-connected providers (catalog order) stay connectable; the
  // rest read as cap-locked "Free License" from the start.
  const slotsLeft = Math.max(0, providerCountCap - installed.length);
  const capLockedIds = new Set<string>();
  {
    let slot = 0;
    for (const id of available) {
      if (!providers[id]) continue; // not offered at this tier at all
      if (slot >= slotsLeft) capLockedIds.add(id);
      slot++;
    }
  }

  /* ── Wizard helpers ───────────────────────────────────────────── */
  const openWizard = (id: string, reconfigure = false) => {
    const meta = catalog[id];
    const status = providers[id];
    if (!meta) return;

    setWizardTarget({
      id,
      name: meta.name,
      description: meta.description,
      // Phase 1.8 — strip image cap on `none` tier so the wizard's
      // image-model picker + "Default for image" toggle don't render.
      capabilities: capsForTier(meta.capabilities, plan),
      keyUrl: meta.key_url,
      keyPrefix: meta.key_prefix,
      isConnected: reconfigure && !!status?.connected,
      textModel: status?.text_model,
      imageModel: status?.image_model,
      isDefaultText: defaults.text_provider === id,
      isDefaultImage: defaults.image_provider === id,
    });
  };

  /* ────────────────────────────────────────────────────────────── */

  return (
    <PageContainer variant="narrow" className="space-y-10">
      {/* ── Header ───────────────────────────────────────────────── */}
      <header className="flex items-center justify-between">
        <div>
          <PageTitle>{__("AI Engine", "structura")}</PageTitle>
          <PageDescription>{__("Provider Management", "structura")}</PageDescription>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            <Badge
              variant="outline"
              intent={connectedTextCount > 0 ? "success" : "secondary"}
              className="gap-1 py-1"
            >
              <Type size={12} />
              <span>
                {connectedTextCount} {__("Text", "structura")}
              </span>
            </Badge>
            <Badge
              variant="outline"
              intent={connectedImageCount > 0 ? "success" : "secondary"}
              className="gap-1 py-1"
            >
              <Image size={12} />
              <span>
                {connectedImageCount} {__("Image", "structura")}
              </span>
            </Badge>
          </div>
          {!isCloud && (
            <Badge variant="solid" intent="success" className="py-1">
              <ShieldCheck className="mr-2 size-4" />
              <span>{__("AES-256-CBC Encrypted", "structura")}</span>
            </Badge>
          )}
        </div>
      </header>

      <div className="space-y-10">
        {/* ── Section: Your Providers ────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Plug size={14} className="text-emerald-500" />
            <h2 className="m-0! text-[11px] font-black tracking-widest text-neutral-500 uppercase">
              {__("Your Providers", "structura")}
            </h2>
          </div>

          {installed.length > 0 ? (
            <div className="space-y-3">
              {installed.map((id) => {
                const meta = catalog[id];
                const status = providers[id];
                if (!meta || !status) return null;

                // Provider is incomplete if connected but missing required models
                const needsText = status.capabilities.includes("text") && !status.text_model;
                const needsImage = status.capabilities.includes("image") && !status.image_model;
                const isIncomplete = needsText || needsImage;

                return (
                  <InstalledProviderCard
                    key={id}
                    id={id}
                    name={meta.name}
                    description={meta.description}
                    capabilities={capsForTier(meta.capabilities, plan)}
                    maskedKey={status.masked_key}
                    isCloud={isCloud}
                    isDefaultText={defaults.text_provider === id}
                    isDefaultImage={defaults.image_provider === id}
                    incomplete={isIncomplete}
                    onManage={() => openWizard(id, true)}
                    hideDefaultBadges={isSingleProviderTier}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-200 py-12 dark:border-neutral-700">
              <Unplug size={28} className="text-neutral-300 dark:text-neutral-600" />
              <div className="text-center">
                <p className="m-0! text-sm font-medium text-neutral-500 dark:text-neutral-400">
                  {__("No providers connected yet", "structura")}
                </p>
                <p className="m-0! mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                  {__(
                    "Set up a provider below to start generating content with AI.",
                    "structura"
                  )}
                </p>
              </div>
            </div>
          )}
        </section>

        {/* ── Section: Available Providers ───────────────────────── */}
        {available.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Plug size={14} className="text-neutral-400" />
              <h2 className="m-0! text-[11px] font-black tracking-widest text-neutral-500 uppercase">
                {__("Available Providers", "structura")}
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {available.map((id) => {
                const meta = catalog[id];
                if (!meta) return null;

                // If the provider is in `providers` (tier-filtered), it's available.
                // If it's only in `catalog` (all providers), it's locked for this tier.
                const isAvailableForTier = !!providers[id];

                // Phase 1.8 §1.8.4 — available-for-tier cards beyond the
                // tier's provider allowance flip to a cap-locked
                // presentation rather than disappearing. Reason: a hidden
                // card leaves the user wondering why "OpenAI" is gone
                // after they connected Gemini; a visible-but-locked card
                // with a "Get Free License" CTA gives them the swap-or-
                // upgrade story explicitly. `capLockedIds` locks the
                // extras up front (see the computation above) rather than
                // only after the cap is physically consumed.
                const isCapLocked =
                  isAvailableForTier && capLockedIds.has(id);

                // The user-visible "available" flag flips to false on
                // either path so the card renders in the locked
                // presentation; `lockReason` distinguishes "you can't
                // pick this on your tier" (existing dialog copy) from
                // "you've used all your provider slots, upgrade to
                // get more" (cap-aware portal handoff).
                const cardAvailable = isAvailableForTier && !isCapLocked;

                return (
                  <AvailableProviderCard
                    key={id}
                    id={id}
                    name={meta.name}
                    description={meta.description}
                    capabilities={capsForTier(meta.capabilities, plan)}
                    available={cardAvailable}
                    minTier={meta.min_tier}
                    lockReason={isCapLocked ? "cap" : "tier"}
                    onSetUp={() => {
                      if (cardAvailable) {
                        openWizard(id);
                        return;
                      }
                      // Surface the cap-locked story through the same
                      // upgrade dialog that handles tier-locks; the
                      // dialog branches on `lockReason` for the copy
                      // and CTA target.
                      setUpgradeTarget({
                        id,
                        name: meta.name,
                        description: meta.description,
                        capabilities: meta.capabilities,
                        minTier: meta.min_tier,
                        lockReason: isCapLocked ? "cap" : "tier",
                        fromProviderId: isCapLocked ? installed[0] : undefined,
                      });
                    }}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* ── Workspace keys picker — bind a sibling-site key here ──
            Rendered AFTER "Available Providers" so the page flow reads:
              1. Your Providers       (what's already connected here)
              2. Available Providers  (what you could connect)
              3. Use a key from this workspace  (shortcut: reuse a key
                                                 already saved on a
                                                 sibling site instead
                                                 of typing it again)
            Pre-fix this section sat between (1) and (2), which pushed
            the "Available Providers" grid below the fold on workspaces
            with many sibling keys. */}
        <WorkspaceKeysPicker
          providerLabels={
            catalog
              ? Object.fromEntries(
                  Object.entries(catalog).map(([id, meta]) => [id, meta.name]),
                )
              : undefined
          }
        />

        {/* ── Model catalog fallback notice ─────────────────────── */}
        {settings.models_fallback && (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
            <p className="m-0! text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              {__(
                "Model catalog is currently using bundled defaults — the remote catalog couldn't be reached. Models will refresh automatically when you connect or reconnect a provider.",
                "structura"
              )}
            </p>
          </div>
        )}

        {/* ── No text provider warning ───────────────────────────── */}
        {!settings.has_text && !isCloud && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800/40 dark:bg-amber-950/20">
            <p className="m-0! text-[11px] leading-relaxed font-bold text-amber-700 dark:text-amber-400">
              {__(
                "Connect at least one text provider to start generating content. Image providers are optional — without one, image generation will be disabled.",
                "structura"
              )}
            </p>
          </div>
        )}
      </div>

      {/* ── Setup Wizard Modal ───────────────────────────────────── */}
      {wizardTarget && (
        <ProviderSetupWizard
          open={!!wizardTarget}
          onClose={() => setWizardTarget(null)}
          providerId={wizardTarget.id}
          providerName={wizardTarget.name}
          description={wizardTarget.description}
          capabilities={wizardTarget.capabilities}
          keyUrl={wizardTarget.keyUrl}
          keyPrefix={wizardTarget.keyPrefix}
          isConnected={wizardTarget.isConnected}
          currentTextModel={wizardTarget.textModel}
          currentImageModel={wizardTarget.imageModel}
          isDefaultText={wizardTarget.isDefaultText}
          isDefaultImage={wizardTarget.isDefaultImage}
          providerCountCap={providerCountCap}
        />
      )}

      {/* ── Upgrade Teaser Modal (tier-locked providers) ──────────── */}
      {upgradeTarget && (
        <ProviderUpgradeDialog
          open={!!upgradeTarget}
          onClose={() => setUpgradeTarget(null)}
          providerId={upgradeTarget.id}
          providerName={upgradeTarget.name}
          description={upgradeTarget.description}
          capabilities={upgradeTarget.capabilities}
          minTier={upgradeTarget.minTier}
          lockReason={upgradeTarget.lockReason}
          fromProviderId={upgradeTarget.fromProviderId}
          plan={plan}
        />
      )}
    </PageContainer>
  );
};
