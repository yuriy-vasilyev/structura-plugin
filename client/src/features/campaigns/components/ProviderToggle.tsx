import { FC, useMemo, useState, useEffect } from "react";
import { __ } from "@wordpress/i18n";
import { AlertTriangle, Bot, Type, Image } from "lucide-react";
import { Select, Switch, Tooltip, cn } from "@structura/ui";
import { useAiSettingsQuery } from "@/features/ai-engine";
import { useAvailableModelsQuery } from "@/features/ai-engine/api/useAvailableModelsQuery";
import { maybeGetModelWarning, resolveDefaultModel } from "@/features/ai-engine/helpers";
import { useLicense, useDefaultProviders } from "@/features/settings";
import { AIProvider } from "@/features/campaigns/types";
import { getProviderVisual } from "@/features/campaigns/constants";

// ─── Sub-components ──────────────────────────────────────────────────────────

interface ProviderButtonProps {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  /** When true, shows a warning indicator and disables the button. */
  incomplete?: boolean;
}

const ProviderButton: FC<ProviderButtonProps> = ({ selected, onClick, icon, title, incomplete }) => {
  const button = (
    <button
      type="button"
      onClick={incomplete ? undefined : onClick}
      disabled={incomplete}
      className={cn(
        "relative flex flex-1 items-center justify-center gap-2 rounded-lg border py-2 transition-all",
        incomplete
          ? "cursor-not-allowed border-neutral-100 bg-neutral-50/50 text-neutral-300 opacity-60 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-600"
          : selected
            ? "cursor-pointer border-brand-200 bg-white text-brand-600 shadow-sm ring-2 ring-brand-50 dark:border-brand-500/30 dark:bg-neutral-800 dark:text-brand-400 dark:ring-brand-950/20"
            : "cursor-pointer border-neutral-100 bg-neutral-50 text-neutral-400 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-700"
      )}
    >
      <div className={cn(
        incomplete
          ? "text-neutral-300 dark:text-neutral-600"
          : selected
            ? "text-brand-600 dark:text-brand-400"
            : "text-neutral-400 dark:text-neutral-500"
      )}>
        {icon}
      </div>
      <span className="text-[10px] font-black tracking-widest uppercase">{title}</span>
      {incomplete && (
        <AlertTriangle size={11} className="absolute top-1 right-1 text-amber-500 dark:text-amber-400" />
      )}
    </button>
  );

  if (incomplete) {
    return (
      <Tooltip
        title={__("Complete model setup in AI Engine settings", "structura")}
        position="top"
      >
        {button}
      </Tooltip>
    );
  }

  return button;
};

// ─── Provider icons lookup (delegates to shared PROVIDER_VISUALS) ────────────

const getProviderIcon = (id: string, size = 15) => {
  const Icon = getProviderVisual(id).icon;
  return <Icon size={size} />;
};

// ─── Main component ──────────────────────────────────────────────────────────

export interface ProviderToggleProps {
  /** Currently selected text provider. */
  textProvider: AIProvider;
  /** Currently selected image provider. */
  imageProvider: AIProvider;
  /** Called when the text provider changes. Consumer should also clear text model. */
  onTextProviderChange: (provider: AIProvider) => void;
  /** Called when the image provider changes. Consumer should also clear image model. */
  onImageProviderChange: (provider: AIProvider) => void;
  /** Which providers are available for text generation. */
  availableTextProviders: string[];
  /** Which providers are available for image generation. */
  availableImageProviders: string[];

  // ── Optional model selection ────────────────────────────────────────────
  /** When true, shows text & image model selectors beneath the toggles. */
  showModelSelectors?: boolean;
  /** Current text model id. Required when showModelSelectors is true. */
  textModel?: string;
  /** Current image model id. Required when showModelSelectors is true. */
  imageModel?: string;
  /** Called when text model changes. */
  onTextModelChange?: (modelId: string) => void;
  /** Called when image model changes. */
  onImageModelChange?: (modelId: string) => void;
}

/**
 * Split provider toggle with per-capability provider selection.
 *
 * Shows separate text/image provider sections so users can mix providers
 * (e.g., Claude for text + DALL-E for images).
 *
 * Usage A — Provider only (SuggestStrategySection):
 *   <ProviderToggle
 *     textProvider="gemini"
 *     imageProvider="openai"
 *     onTextProviderChange={...}
 *     onImageProviderChange={...}
 *     availableTextProviders={[...]}
 *     availableImageProviders={[...]}
 *   />
 *
 * Usage B — Provider + models (StepObjective):
 *   <ProviderToggle
 *     textProvider="openai"
 *     imageProvider="gemini"
 *     onTextProviderChange={...}
 *     onImageProviderChange={...}
 *     availableTextProviders={[...]}
 *     availableImageProviders={[...]}
 *     showModelSelectors
 *     textModel="gpt-4o"
 *     imageModel="imagen-3-fast"
 *     onTextModelChange={...}
 *     onImageModelChange={...}
 *   />
 */
export const ProviderToggle: FC<ProviderToggleProps> = ({
  textProvider,
  imageProvider,
  onTextProviderChange,
  onImageProviderChange,
  availableTextProviders,
  availableImageProviders,
  showModelSelectors = false,
  textModel = "",
  imageModel = "",
  onTextModelChange,
  onImageModelChange,
}) => {
  const { data: availableModels } = useAvailableModelsQuery();
  const { data: aiSettings } = useAiSettingsQuery();
  const { isLicensed } = useLicense();
  const { isProviderIncomplete } = useDefaultProviders();
  // Default ON — most users want their default models. Power users
  // who want a per-post override flip the toggle off and pick from
  // the per-provider Select below. Pre-2026-05-10 this defaulted
  // OFF, which forced every Generate-Now run to manually re-tick
  // the box even when the AI Engine page already had defaults
  // configured.
  const [useRecommended, setUseRecommended] = useState(true);

  // Image generation requires at least a Free license
  const showImageSection = isLicensed && availableImageProviders.length > 0;

  // Check if the currently selected providers are incomplete
  const isTextProviderIncomplete = isProviderIncomplete(textProvider);
  const isImageProviderIncomplete = isProviderIncomplete(imageProvider);

  // Sync the recommended toggle when the current models already match defaults
  useEffect(() => {
    if (!availableModels || !showModelSelectors) return;
    const textDefaults = availableModels.defaults[textProvider];
    const imageDefaults = availableModels.defaults[imageProvider];
    if (
      textDefaults &&
      imageDefaults &&
      textModel === textDefaults.text &&
      imageModel === imageDefaults.image
    ) {
      setUseRecommended(true);
    }
  }, [availableModels, textProvider, imageProvider, textModel, imageModel, showModelSelectors]);

  // Auto-fill empty models on first load. Needed standalone for
  // GeneratePostPage (no CampaignProvider there); under the campaign
  // form it's a no-op backstop — `useModelBackfill` in
  // CampaignContext.tsx fills first. Both go through
  // `resolveDefaultModel` so they can't resolve different models for
  // the same empty field.
  useEffect(() => {
    if (!availableModels || !showModelSelectors) return;
    const sources = {
      providerSettings: aiSettings?.providers,
      catalogDefaults: availableModels.defaults,
    };
    if (!textModel) {
      const resolved = resolveDefaultModel({
        provider: textProvider,
        capability: "text",
        ...sources,
      });
      if (resolved) onTextModelChange?.(resolved);
    }
    if (!imageModel) {
      const resolved = resolveDefaultModel({
        provider: imageProvider,
        capability: "image",
        ...sources,
      });
      if (resolved) onImageModelChange?.(resolved);
    }
  }, [availableModels, aiSettings, textProvider, imageProvider, showModelSelectors]);

  const filteredTextModels = useMemo(
    () => availableModels?.text?.filter((m) => m.provider === textProvider) || [],
    [availableModels, textProvider]
  );

  const filteredImageModels = useMemo(
    () => availableModels?.image?.filter((m) => m.provider === imageProvider) || [],
    [availableModels, imageProvider]
  );

  const handleToggleRecommended = (checked: boolean) => {
    setUseRecommended(checked);
    if (checked && availableModels) {
      const textDefaults = availableModels.defaults[textProvider];
      const imageDefaults = availableModels.defaults[imageProvider];
      if (textDefaults) onTextModelChange?.(textDefaults.text ?? "");
      if (imageDefaults) onImageModelChange?.(imageDefaults.image ?? "");
    }
  };

  const showTextToggle = availableTextProviders.length > 1;
  const showImageToggle = availableImageProviders.length > 1;

  return (
    <div className="space-y-0 divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-neutral-50/30 overflow-hidden dark:divide-neutral-800 dark:border-neutral-700 dark:bg-neutral-900/30">
      {/* ── Text Provider ─────────────────────────────────────────── */}
      <div className="space-y-0">
        <div className="flex items-center gap-2 bg-neutral-50/50 px-3 py-2 dark:bg-neutral-800/30">
          <Type size={12} className="text-blue-500" />
          <span className="text-[9px] font-black tracking-widest text-neutral-400 uppercase">
            {__("Text Provider", "structura")}
          </span>
        </div>
        {showTextToggle && (
          <div className="flex gap-1.5 px-1.5 pb-1.5">
            {(availableTextProviders as AIProvider[]).map((p) => (
              <ProviderButton
                key={p}
                selected={textProvider === p}
                onClick={() => onTextProviderChange(p)}
                icon={getProviderIcon(p)}
                title={getProviderVisual(p).label}
                incomplete={isProviderIncomplete(p)}
              />
            ))}
          </div>
        )}
        {isTextProviderIncomplete && (
          <div className="flex items-center gap-1.5 px-3 pb-2 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle size={11} />
            {__("Model not selected — complete setup in AI Engine settings", "structura")}
          </div>
        )}
      </div>

      {/* ── Image Provider (hidden for unlicensed users — no image gen) ── */}
      {showImageSection && (
        <div className="space-y-0">
          <div className="flex items-center gap-2 bg-neutral-50/50 px-3 py-2 dark:bg-neutral-800/30">
            <Image size={12} className="text-purple-500" />
            <span className="text-[9px] font-black tracking-widest text-neutral-400 uppercase">
              {__("Image Provider", "structura")}
            </span>
          </div>
          {showImageToggle && (
            <div className="flex gap-1.5 px-1.5 pb-1.5">
              {(availableImageProviders as AIProvider[]).map((p) => (
                <ProviderButton
                  key={p}
                  selected={imageProvider === p}
                  onClick={() => onImageProviderChange(p)}
                  icon={getProviderIcon(p)}
                  title={getProviderVisual(p).label}
                  incomplete={isProviderIncomplete(p)}
                />
              ))}
            </div>
          )}
          {isImageProviderIncomplete && (
            <div className="flex items-center gap-1.5 px-3 pb-2 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle size={11} />
              {__("Model not selected — complete setup in AI Engine settings", "structura")}
            </div>
          )}
        </div>
      )}

      {/* ── Model selectors (optional) ────────────────────────────── */}
      {showModelSelectors && (
        <div className="p-3 space-y-3">
          {/* Recommended switch */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot size={13} className="text-brand-600 dark:text-brand-400" />
              <span className="text-[10px] font-black tracking-widest text-neutral-500 uppercase">
                {__("Engine", "structura")}
              </span>
            </div>
            <Switch
              label={__("Recommended", "structura")}
              checked={useRecommended}
              onChange={handleToggleRecommended}
            />
          </div>

          {useRecommended ? (
            <div className="animate-in fade-in slide-in-from-top-1 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-neutral-400 uppercase">
                {__("Using recommended models", "structura")}
              </span>
              <div className="ml-auto flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-0.5 text-[9px] font-bold text-brand-600 dark:bg-brand-950/30 dark:text-brand-400">
                {availableModels?.defaults[textProvider]?.text && (
                  <span>{availableModels.defaults[textProvider].text}</span>
                )}
                {showImageSection && availableModels?.defaults[imageProvider]?.image && (
                  <>
                    <span className="text-brand-300 dark:text-brand-600">·</span>
                    <span>{availableModels.defaults[imageProvider].image}</span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className={cn(
              "animate-in fade-in slide-in-from-top-1 grid grid-cols-1 gap-2.5",
              showImageSection && "sm:grid-cols-2"
            )}>
              <Select
                options={filteredTextModels.map((m) => ({ value: m.id, label: m.name }))}
                value={textModel}
                onValueChange={(val) => onTextModelChange?.(val as string)}
              >
                <Select.Label>{__("Text Model", "structura")}</Select.Label>
                <Select.Trigger placeholder={__("Select text model...", "structura")} />
                <Select.Content className="w-(--button-width)">
                  {filteredTextModels.map((m) => (
                    <Select.Item
                      key={m.id}
                      value={m.id}
                      description={maybeGetModelWarning({ model: m.id, models: [...(availableModels?.text ?? []), ...(availableModels?.image ?? [])] })}
                    >
                      {m.name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>

              {showImageSection && (
                <Select
                  options={filteredImageModels.map((m) => ({ value: m.id, label: m.name }))}
                  value={imageModel}
                  onValueChange={(val) => onImageModelChange?.(val as string)}
                >
                  <Select.Label>{__("Image Model", "structura")}</Select.Label>
                  <Select.Trigger placeholder={__("Select image model...", "structura")} />
                  <Select.Content className="w-(--button-width)">
                    {filteredImageModels.map((m) => (
                      <Select.Item
                        key={m.id}
                        value={m.id}
                        description={maybeGetModelWarning({ model: m.id, models: [...(availableModels?.text ?? []), ...(availableModels?.image ?? [])] })}
                      >
                        {m.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
