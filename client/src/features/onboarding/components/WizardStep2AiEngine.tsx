/**
 * Step 2 — AI engine.
 *
 * Rewritten 2026-05-29 to REUSE the real AI Engine page components
 * (`InstalledProviderCard`, `AvailableProviderCard`, `WorkspaceKeysPicker`,
 * `ProviderSetupWizard`) rather than a bespoke wizard-only layout.
 * The user pointed out — correctly — that we already have a polished
 * provider-management surface with a connect flow, model selection,
 * and cross-site key reuse; the wizard should embed it, not rebuild
 * a worse copy.
 *
 * This step is the HARD GATE: steps 3–6 stay locked until at least
 * one working provider is connected (managed tiers are always ready;
 * BYOK needs a connected text key). We report that as
 * `stepValidity[2]` to the store, which the OnboardingPage stepper +
 * Continue button gate on.
 *
 * Provider connection writes a CREDENTIAL to the workspace
 * immediately (via the reused ProviderSetupWizard's own mutations) —
 * that's the one mid-wizard server write the deferred-save model
 * allows, because a key is a credential the later AI-draft steps
 * need live, not deferrable wizard state.
 */

import { useEffect, useMemo, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import { Badge, PageLoader } from "@structura/ui";
import { Plug, Unplug } from "lucide-react";

import { useAiSettingsQuery } from "@/features/ai-engine";
import { useLicense } from "@/features/settings";
import { isManagedPlan, type PlanId } from "@structura/types";
import { InstalledProviderCard } from "@/features/ai-engine/components/InstalledProviderCard";
import { AvailableProviderCard } from "@/features/ai-engine/components/AvailableProviderCard";
import { ProviderSetupWizard } from "@/features/ai-engine/components/ProviderSetupWizard";
import { ProviderUpgradeDialog } from "@/features/ai-engine/components/ProviderUpgradeDialog";
import { WorkspaceKeysPicker } from "@/features/ai-engine/components/WorkspaceKeysPicker";

import { useWizardStore } from "../state/wizardStore";

/** Strip image cap on `none` tier — mirrors the AI Engine page. */
function capsForTier(
  capabilities: Array<"text" | "image">,
  plan: string,
): Array<"text" | "image"> {
  if (plan !== "none") return capabilities;
  return capabilities.filter((c) => c !== "image");
}

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

export const WizardStep2AiEngine = () => {
  const { data: settings, isLoading } = useAiSettingsQuery();
  const { plan, providerCountCap } = useLicense();
  const setStepValid = useWizardStore((s) => s.setStepValid);
  const setStep2Draft = useWizardStore((s) => s.setStep2Draft);

  const isCloud = isManagedPlan(plan as PlanId);
  const isSingleProviderTier = providerCountCap === 1;

  const providers = settings?.providers;
  const catalog = settings?.catalog;
  const defaults = settings?.defaults;

  const [wizardTarget, setWizardTarget] = useState<WizardTarget | null>(null);
  const [upgradeTarget, setUpgradeTarget] = useState<{
    id: string;
    name: string;
    description: string;
    capabilities: Array<"text" | "image">;
    minTier: string;
    lockReason: "tier" | "cap";
    fromProviderId?: string;
  } | null>(null);

  const { installed, available } = useMemo(() => {
    if (!catalog || !providers) {
      return { installed: [] as string[], available: [] as string[] };
    }
    const inst: string[] = [];
    const avail: string[] = [];
    for (const id of Object.keys(catalog)) {
      if (providers[id]?.connected) inst.push(id);
      else avail.push(id);
    }
    return { installed: inst, available: avail };
  }, [catalog, providers]);

  // The gate: at least one working text provider. Managed tiers run
  // on master keys so they're always ready; BYOK needs a connected
  // text-capable provider.
  const hasWorkingProvider = useMemo(() => {
    if (isCloud) return true;
    if (!providers) return false;
    return Object.values(providers).some(
      (p) => p.connected && p.capabilities.includes("text"),
    );
  }, [isCloud, providers]);

  // Report validity + mirror the resolved defaults into the draft for
  // the final batched save.
  useEffect(() => {
    setStepValid(2, hasWorkingProvider);
    if (hasWorkingProvider && defaults) {
      setStep2Draft({
        textProvider: defaults.text_provider || undefined,
        textModel: providers?.[defaults.text_provider]?.text_model,
        imageProvider: defaults.image_provider || undefined,
        imageModel: providers?.[defaults.image_provider]?.image_model,
      });
    }
  }, [hasWorkingProvider, defaults, providers, setStepValid, setStep2Draft]);

  if (isLoading || !settings || !catalog || !providers || !defaults) {
    return (
      <div className="py-16">
        <PageLoader label={__("Syncing AI providers…", "structura")} size="md" />
      </div>
    );
  }

  const openWizard = (id: string, reconfigure = false) => {
    const meta = catalog[id];
    const status = providers[id];
    if (!meta) return;
    setWizardTarget({
      id,
      name: meta.name,
      description: meta.description,
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

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 text-center">
        <h1 className="m-0! text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          {__("Connect your AI engine", "structura")}
        </h1>
        <p className="m-0! text-base text-neutral-600 dark:text-neutral-400">
          {isCloud
            ? __(
                "Your plan runs on Structura's managed AI. Pick the models you'd like as defaults — you can swap per post later.",
                "structura",
              )
            : __(
                "Connect at least one provider so the rest of setup can use AI. Pick a model and we'll handle the provider.",
                "structura",
              )}
        </p>
      </header>

      {/* Your Providers */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Plug size={14} className="text-emerald-500" />
          <h2 className="m-0! flex! items-center text-[11px] font-black uppercase tracking-widest text-neutral-500">
            {__("Your providers", "structura")}
          </h2>
        </div>
        {installed.length > 0 ? (
          <div className="flex flex-col gap-3">
            {installed.map((id) => {
              const meta = catalog[id];
              const status = providers[id];
              if (!meta || !status) return null;
              const needsText =
                status.capabilities.includes("text") && !status.text_model;
              const needsImage =
                status.capabilities.includes("image") && !status.image_model;
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
                  incomplete={needsText || needsImage}
                  onManage={() => openWizard(id, true)}
                  hideDefaultBadges={isSingleProviderTier}
                />
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-200 py-10 dark:border-neutral-700">
            <Unplug size={26} className="text-neutral-300 dark:text-neutral-600" />
            <p className="m-0! text-sm font-medium text-neutral-500 dark:text-neutral-400">
              {__("No providers connected yet", "structura")}
            </p>
          </div>
        )}
      </section>

      {/* Available Providers */}
      {available.length > 0 ? (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Plug size={14} className="text-neutral-400" />
            <h2 className="m-0! flex! items-center text-[11px] font-black uppercase tracking-widest text-neutral-500">
              {__("Available providers", "structura")}
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {available.map((id) => {
              const meta = catalog[id];
              if (!meta) return null;
              const isAvailableForTier = !!providers[id];
              const atCap = installed.length >= providerCountCap;
              const isCapLocked = atCap && isAvailableForTier;
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
      ) : null}

      {/* Reuse a key already saved on a sibling site in this workspace. */}
      <WorkspaceKeysPicker
        providerLabels={
          catalog
            ? Object.fromEntries(
                Object.entries(catalog).map(([id, meta]) => [id, meta.name]),
              )
            : undefined
        }
      />

      {!hasWorkingProvider ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/40 dark:bg-amber-950/20">
          <p className="m-0! text-xs font-semibold text-amber-700 dark:text-amber-400">
            {__(
              "Connect at least one text provider to continue — the rest of the setup needs it to generate suggestions.",
              "structura",
            )}
          </p>
        </div>
      ) : null}

      {wizardTarget ? (
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
      ) : null}

      {upgradeTarget ? (
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
      ) : null}
    </div>
  );
};
