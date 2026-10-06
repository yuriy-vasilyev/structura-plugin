import { useMemo, useState } from "react";
import { Navigate } from "react-router";
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
import { orderTextProviders } from "@/features/campaigns/aiGuidance";
import { planHasImageGeneration } from "../helpers";

// Components
import { InstalledProviderCard } from "../components/InstalledProviderCard";
import { AvailableProviderCard } from "../components/AvailableProviderCard";
import { ProviderSetupWizard } from "../components/ProviderSetupWizard";
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
  textTier?: string;
  imageTier?: string;
  isDefaultText: boolean;
  isDefaultImage: boolean;
}

/**
 * AI Engine — Provider Management
 *
 * Two-section layout:
 *  1. "Your Providers"  – connected providers with Default badges
 *  2. "Available"       – providers to add
 *
 * Every plan, anonymous included, may connect every provider and the
 * cards show what each provider can do (2026-10-06,
 * specs/open-providers.md). The tier locks, the per-plan provider count
 * cap and the image-capability strip on `none` were deleted then; whether
 * the plan makes images is passed to the wizard instead.
 *
 * Clicking "Set Up" / "Manage" opens a multi-step wizard that handles
 * API key, connection test, model selection, AND default provider config.
 */
export const AiEngine = () => {
  const { data: settings, isLoading } = useAiSettingsQuery();
  const { plan } = useLicense();

  const isCloud = isManagedPlan(plan as PlanId);
  const imagesAvailable = planHasImageGeneration(plan);

  const providers = settings?.providers;
  const catalog = settings?.catalog;
  const defaults = settings?.defaults;

  /* ── Wizard state ─────────────────────────────────────────────── */
  const [wizardTarget, setWizardTarget] = useState<WizardTarget | null>(null);

  /* ── Derived lists ────────────────────────────────────────────── */
  const { installed, available } = useMemo(() => {
    if (!catalog || !providers) return { installed: [] as string[], available: [] as string[] };

    const inst: string[] = [];
    const avail: string[] = [];

    // Claude, OpenAI, Gemini wherever providers are listed (owner review
    // 2026-10-06).
    for (const id of orderTextProviders(Object.keys(catalog))) {
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
    return Object.values(providers).filter((p) => p.connected && p.capabilities.includes("text"))
      .length;
  }, [providers]);

  const connectedImageCount = useMemo(() => {
    if (!providers) return 0;
    return Object.values(providers).filter((p) => p.connected && p.capabilities.includes("image"))
      .length;
  }, [providers]);

  // Managed plans have no providers to manage and never see provider
  // names; the nav entry is hidden, and a direct visit lands on the
  // dashboard (specs/managed-ai-lineup.md §3.3).
  if (isCloud) {
    return <Navigate to="/" replace />;
  }

  if (isLoading || !settings || !catalog || !providers || !defaults) {
    return <PageLoader label={__("Syncing AI Vault…", "structura")} size="lg" padding="lg" />;
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
      capabilities: meta.capabilities,
      keyUrl: meta.key_url,
      keyPrefix: meta.key_prefix,
      isConnected: reconfigure && !!status?.connected,
      textModel: status?.text_model,
      imageModel: status?.image_model,
      textTier: status?.text_tier,
      imageTier: status?.image_tier,
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
                    capabilities={meta.capabilities}
                    maskedKey={status.masked_key}
                    isCloud={isCloud}
                    isDefaultText={defaults.text_provider === id}
                    isDefaultImage={defaults.image_provider === id}
                    incomplete={isIncomplete}
                    onManage={() => openWizard(id, true)}
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
                <p className="mt-1! mb-0! text-xs text-neutral-400 dark:text-neutral-500">
                  {__("Set up a provider below to start generating content with AI.", "structura")}
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

                return (
                  <AvailableProviderCard
                    key={id}
                    id={id}
                    name={meta.name}
                    description={meta.description}
                    capabilities={meta.capabilities}
                    onSetUp={() => openWizard(id)}
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
              ? Object.fromEntries(Object.entries(catalog).map(([id, meta]) => [id, meta.name]))
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
          currentTextTier={wizardTarget.textTier}
          currentImageTier={wizardTarget.imageTier}
          isDefaultText={wizardTarget.isDefaultText}
          isDefaultImage={wizardTarget.isDefaultImage}
          imagesAvailable={imagesAvailable}
        />
      )}

    </PageContainer>
  );
};
