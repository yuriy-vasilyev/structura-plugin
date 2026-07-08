import { useCallback, useEffect, useState } from "react";
import { __ } from "@wordpress/i18n";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Image,
  Key,
  Loader2,
  RefreshCw,
  Sparkles,
  Star,
  Type,
  Zap,
} from "lucide-react";
import { Button, cn, Dialog, InputField, Select, Switch } from "@structura/ui";
import { getProviderVisual } from "@/features/campaigns/constants";
import { useSaveKey } from "../api/useSaveKey";
import { useProviderPulse } from "../api/useProviderPulse";
import { useAvailableModelsQuery } from "../api/useAvailableModelsQuery";
import { useRefreshModels } from "../api/useRefreshModels";
import { useUpdateAiSettings } from "../api/useUpdateAiSettings";

/* ────────────────────────────────────────────────────────────────── */
/*  Types                                                            */
/* ────────────────────────────────────────────────────────────────── */

interface ProviderSetupWizardProps {
  open: boolean;
  onClose: () => void;
  providerId: string;
  providerName: string;
  description: string;
  capabilities: Array<"text" | "image">;
  keyUrl: string;
  keyPrefix?: string;
  /** Whether this provider is already connected (re-configure flow). */
  isConnected?: boolean;
  currentTextModel?: string;
  currentImageModel?: string;
  /** Whether this provider is currently the default for text. */
  isDefaultText?: boolean;
  /** Whether this provider is currently the default for image. */
  isDefaultImage?: boolean;
  /**
   * Phase 1.8 §1.8.4 — maximum number of providers the user can
   * configure simultaneously at the calling tier. When `1` (anonymous
   * `none` tier), the "Default Provider" toggles are hidden because
   * the choice is degenerate: a single configured provider is always
   * the default for whatever capabilities it offers. Defaults to a
   * value > 1 so callers that don't pass it (older tiers, tests
   * that don't care) keep rendering the toggles.
   */
  providerCountCap?: number;
}

type WizardStep = "intro" | "key" | "test" | "models";
const STEPS: WizardStep[] = ["intro", "key", "test", "models"];

const STEP_LABELS: Record<WizardStep, string> = {
  intro: __("Overview", "structura"),
  key: __("API Key", "structura"),
  test: __("Connection", "structura"),
  models: __("Configure", "structura"),
};

const CAPABILITY_META = {
  text: {
    label: __("Text Generation", "structura"),
    icon: Type,
    color: "text-blue-500",
    description: __(
      "Generate blog posts, articles, meta descriptions, and other written content.",
      "structura"
    ),
  },
  image: {
    label: __("Image Generation", "structura"),
    icon: Image,
    color: "text-purple-500",
    description: __(
      "Create featured images, body illustrations, and other visual content.",
      "structura"
    ),
  },
};

/* ────────────────────────────────────────────────────────────────── */
/*  Component                                                        */
/* ────────────────────────────────────────────────────────────────── */

export const ProviderSetupWizard = ({
  open,
  onClose,
  providerId,
  providerName,
  description,
  capabilities,
  keyUrl,
  keyPrefix,
  isConnected = false,
  currentTextModel,
  currentImageModel,
  isDefaultText = false,
  isDefaultImage = false,
  providerCountCap = 3,
}: ProviderSetupWizardProps) => {
  // Phase 1.8 §1.8.4 — single-provider tiers (anonymous `none`) only
  // ever have one configurable provider, so the "Default for text /
  // image" toggles are degenerate (their only honest answer is
  // "yes"). Pre-2026-05-10 the section was hidden outright, but that
  // dropped the default flags from the saved state — so when the user
  // upgraded to Free / paid and added a second provider, neither was
  // marked default and the campaign UI flashed the "no default
  // selected" warning. We now keep the section visible + force-on +
  // disabled with a one-line explanation, AND treat the force-on as
  // a real save so the upgrade-then-add-provider path inherits a
  // pre-set default for whatever the single-provider user already
  // configured.
  const forceDefaults = providerCountCap === 1;
  /* ── Wizard state ─────────────────────────────────────────────── */
  const [step, setStep] = useState<WizardStep>(isConnected ? "models" : "intro");
  const [keyInput, setKeyInput] = useState("");
  const [keySubmitted, setKeySubmitted] = useState(isConnected);
  const [selectedTextModel, setSelectedTextModel] = useState(currentTextModel ?? "");
  const [selectedImageModel, setSelectedImageModel] = useState(currentImageModel ?? "");
  // When the tier forces defaults, the toggles are always on and
  // user clicks are ignored. Initial values still seed the displayed
  // checked state in the non-forced case.
  const [setDefaultText, setSetDefaultText] = useState(!isConnected || isDefaultText);
  const [setDefaultImage, setSetDefaultImage] = useState(!isConnected || isDefaultImage);
  const effectiveDefaultText = forceDefaults ? true : setDefaultText;
  const effectiveDefaultImage = forceDefaults ? true : setDefaultImage;

  /* ── Queries & mutations ──────────────────────────────────────── */
  const { mutate: saveKey, isPending: isSavingKey } = useSaveKey();
  const { isOnline, latency, isChecking, checkPulse } = useProviderPulse(providerId, keySubmitted);
  const { data: modelsData } = useAvailableModelsQuery();
  const { mutate: refreshModels, isPending: isRefreshing } = useRefreshModels();
  const { mutate: updateSettings, isPending: isSavingModels } = useUpdateAiSettings();

  const currentStepIndex = STEPS.indexOf(step);

  /* ── Derived model lists ──────────────────────────────────────── */
  // Hide `fast: true` models from the BYOK picker. Fast models exist
  // in the catalog so the cloud can use them internally (SERP heading
  // extraction, scraping, keyword discovery) but they underperform on
  // long-form content generation. The catalog stays the source of
  // truth — we just don't expose this subset as a user-pickable option.
  const textModels = (modelsData?.text ?? []).filter((m) => m.provider === providerId && !m.fast);
  const imageModels = (modelsData?.image ?? []).filter((m) => m.provider === providerId && !m.fast);
  const defaultModels = modelsData?.defaults?.[providerId];

  // For brand-new users (no model saved yet), pre-select the
  // `recommended: true` entry rather than the catalog `default: true`.
  // This matters for Anthropic where catalog default is Sonnet (mid)
  // but we want users landing on Opus (top). For OpenAI / Gemini the
  // two flags point at the same model so this is a no-op there.
  // Falls through to `defaultModels.text` if no recommended is set
  // (defensive — every provider should have one tagged).
  const recommendedTextModelId = textModels.find((m) => m.recommended)?.id;
  const recommendedImageModelId = imageModels.find((m) => m.recommended)?.id;

  const hasText = capabilities.includes("text");
  const hasImage = capabilities.includes("image");

  // Once the model catalog arrives, snap the selection to the recommended
  // entry (or catalog default) for any capability the user hasn't already
  // chosen. Without this, the Select trigger renders its fallback chain
  // visually but `selectedTextModel` / `selectedImageModel` stay empty —
  // so on Finish we'd save the catalog default instead of the displayed
  // recommended (e.g. Anthropic users would land on Sonnet despite seeing
  // Opus in the trigger). Effect is idempotent: it skips once a value is
  // set, so user picks aren't clobbered by a later refetch.
  useEffect(() => {
    if (hasText && !selectedTextModel && textModels.length > 0) {
      const initial = recommendedTextModelId || defaultModels?.text;
      if (initial) setSelectedTextModel(initial);
    }
    if (hasImage && !selectedImageModel && imageModels.length > 0) {
      const initial = recommendedImageModelId || defaultModels?.image;
      if (initial) setSelectedImageModel(initial);
    }
  }, [
    hasText,
    hasImage,
    selectedTextModel,
    selectedImageModel,
    textModels.length,
    imageModels.length,
    recommendedTextModelId,
    recommendedImageModelId,
    defaultModels?.text,
    defaultModels?.image,
  ]);

  // Models are required before saving — resolved from explicit selection,
  // recommended (top quality per provider), then catalog default.
  // Recommended sits ahead of `defaultModels?.*` so Anthropic saves Opus,
  // not Sonnet, when the user clicks Finish without touching the Select.
  const effectiveTextModel =
    selectedTextModel || recommendedTextModelId || defaultModels?.text || "";
  const effectiveImageModel =
    selectedImageModel || recommendedImageModelId || defaultModels?.image || "";
  const missingRequiredModels =
    (hasText && textModels.length > 0 && !effectiveTextModel) ||
    (hasImage && imageModels.length > 0 && !effectiveImageModel);

  // Auto-refresh when the wizard reaches the models step and finds no models.
  // This handles the common case of stale cache after a new provider deploy.
  const [hasAutoRefreshed, setHasAutoRefreshed] = useState(false);
  const noModelsAvailable = textModels.length === 0 && imageModels.length === 0;

  useEffect(() => {
    if (
      step === "models" &&
      noModelsAvailable &&
      modelsData &&
      !hasAutoRefreshed &&
      !isRefreshing
    ) {
      setHasAutoRefreshed(true);
      refreshModels();
    }
  }, [step, noModelsAvailable, modelsData, hasAutoRefreshed, isRefreshing, refreshModels]);

  /* ── Handlers ─────────────────────────────────────────────────── */
  const handleSubmitKey = useCallback(() => {
    if (!keyInput.trim()) return;
    saveKey(
      { provider: providerId, key: keyInput.trim() },
      {
        onSuccess: () => {
          setKeySubmitted(true);
          setKeyInput("");
          setStep("test");
        },
      }
    );
  }, [keyInput, providerId, saveKey]);

  const handleTestConnection = useCallback(() => {
    checkPulse();
  }, [checkPulse]);

  const handleFinish = useCallback(() => {
    const data: Record<string, any> = { ai: {} };

    // Save model selections — keyed directly by provider ID (PHP expects $ai[$pid])
    // Use effective models (explicit pick or server default) so models are always persisted
    if (effectiveTextModel || effectiveImageModel) {
      data.ai[providerId] = {
        ...(effectiveTextModel && { text_model: effectiveTextModel }),
        ...(effectiveImageModel && { image_model: effectiveImageModel }),
      };
    }

    // Save default provider selections.
    // Only include a capability when:
    //   - toggle ON  → set this provider as default
    //   - toggle OFF → clear only if this provider WAS the default (don't clobber other providers)
    //
    // `effectiveDefaultText` / `effectiveDefaultImage` collapse the
    // user-facing toggle state with the tier-forced override (Phase
    // 1.8 §1.8.4): on `none` tier the toggle is force-on regardless
    // of click state, so the saved record carries the default flags
    // and any subsequent upgrade-then-add-provider flow inherits
    // them.
    const defaults: Record<string, string> = {};
    if (hasText && effectiveDefaultText) defaults.text_provider = providerId;
    if (hasText && !effectiveDefaultText && isDefaultText) defaults.text_provider = "";
    if (hasImage && effectiveDefaultImage) defaults.image_provider = providerId;
    if (hasImage && !effectiveDefaultImage && isDefaultImage) defaults.image_provider = "";
    if (Object.keys(defaults).length > 0) {
      data.ai.defaults = defaults;
    }

    if (Object.keys(data.ai).length > 0) {
      updateSettings(data, { onSuccess: () => onClose() });
    } else {
      onClose();
    }
  }, [
    effectiveTextModel,
    effectiveImageModel,
    effectiveDefaultText,
    effectiveDefaultImage,
    hasText,
    hasImage,
    providerId,
    isDefaultText,
    isDefaultImage,
    updateSettings,
    onClose,
  ]);

  const goNext = () => {
    const next = STEPS[currentStepIndex + 1];
    if (next) setStep(next);
  };

  const goBack = () => {
    const prev = STEPS[currentStepIndex - 1];
    if (prev) setStep(prev);
  };

  const handleClose = () => {
    setStep(isConnected ? "models" : "intro");
    setKeyInput("");
    setKeySubmitted(isConnected);
    onClose();
  };

  /* ────────────────────────────────────────────────────────────── */
  /*  Render                                                        */
  /* ────────────────────────────────────────────────────────────── */

  return (
    <Dialog.Root open={open} onClose={handleClose} size="lg">
      <Dialog.Content>
        {/* ── Step indicator ────────────────────────────────────── */}
        <div className="mb-6 flex items-center justify-center gap-1">
          {STEPS.map((s, i) => {
            const isActive = s === step;
            const isComplete = i < currentStepIndex;
            return (
              <div key={s} className="flex items-center gap-1">
                {i > 0 && (
                  <div
                    className={cn(
                      "h-px w-8 transition-colors",
                      isComplete ? "bg-emerald-400" : "bg-neutral-200 dark:bg-neutral-700"
                    )}
                  />
                )}
                <div
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase transition-all",
                    isActive
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                      : isComplete
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
                        : "text-neutral-400 dark:text-neutral-500"
                  )}
                >
                  {isComplete && <CheckCircle2 size={10} />}
                  {STEP_LABELS[s]}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Step content ──────────────────────────────────────── */}
        <div className="min-h-75">
          {/* ▸ INTRO ──────────────────────────────────────────── */}
          {step === "intro" && (
            <div className="space-y-6 text-center">
              {(() => {
                // Wizard intro now matches the AI Engine page's
                // provider cards (`AvailableProviderCard`) — same
                // logo, same neutral chip — so the user has visual
                // continuity from "click Connect on Gemini" → "Set
                // up Google Gemini" rather than a generic "G" letter
                // tile. The `getProviderVisual` source-of-truth is
                // shared with Campaigns and Channels surfaces; the
                // colored-letter `getProviderMeta` lives on for
                // legacy callers that still want the brand-tile look.
                const visual = getProviderVisual(providerId);
                const Icon = visual.icon;
                return (
                  <div
                    className={cn(
                      "mx-auto flex size-16 items-center justify-center rounded-2xl shadow-sm",
                      "bg-neutral-100 dark:bg-neutral-800",
                      visual.color,
                    )}
                  >
                    <Icon size={32} />
                  </div>
                );
              })()}

              <div className="mx-auto max-w-md text-center">
                <h2 className="m-0! text-xl font-bold text-neutral-900 dark:text-white">
                  {__("Set up", "structura")} {providerName}
                </h2>
                <p className="m-0! mx-auto mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                  {description}
                </p>
              </div>

              <div className="mx-auto flex max-w-md flex-col gap-3">
                {capabilities.map((cap) => {
                  const capMeta = CAPABILITY_META[cap];
                  if (!capMeta) return null;
                  const Icon = capMeta.icon;
                  return (
                    <div
                      key={cap}
                      className="flex items-start gap-3 rounded-xl border border-neutral-100 bg-neutral-50/50 p-4 text-left dark:border-neutral-800 dark:bg-neutral-800/30"
                    >
                      <Icon size={18} className={cn("mt-0.5 shrink-0", capMeta.color)} />
                      <div>
                        <p className="m-0! text-xs font-bold text-neutral-900 dark:text-neutral-100">
                          {capMeta.label}
                        </p>
                        <p className="m-0! mt-1 text-[11px] leading-relaxed text-neutral-400">
                          {capMeta.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ▸ API KEY ────────────────────────────────────────── */}
          {step === "key" && (
            <div className="mx-auto max-w-md space-y-6">
              <div className="text-center">
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/30">
                  <Key size={20} className="text-amber-500" />
                </div>
                <h2 className="m-0! text-lg font-bold text-neutral-900 dark:text-white">
                  {__("Enter your API key", "structura")}
                </h2>
                <p className="m-0! mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                  {__(
                    "Your key is encrypted with AES-256-CBC and never leaves your server.",
                    "structura"
                  )}
                </p>
              </div>

              <InputField
                label={__("API Key", "structura")}
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={keyPrefix ?? __("Enter API key...", "structura")}
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmitKey();
                }}
              />

              <a
                href={keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand-600 inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400 no-underline transition-colors dark:text-neutral-500"
              >
                <ExternalLink size={12} />
                {__("Get your API key from", "structura")} {providerName}
              </a>
            </div>
          )}

          {/* ▸ TEST CONNECTION ─────────────────────────────────── */}
          {step === "test" && (
            <div className="mx-auto max-w-md space-y-6 text-center">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/30">
                {isChecking ? (
                  <Loader2 size={20} className="animate-spin text-emerald-500" />
                ) : isOnline ? (
                  <CheckCircle2 size={20} className="text-emerald-500" />
                ) : (
                  <Zap size={20} className="text-emerald-500" />
                )}
              </div>

              <div>
                <h2 className="m-0! text-lg font-bold text-neutral-900 dark:text-white">
                  {isOnline
                    ? __("Connection successful", "structura")
                    : isChecking
                      ? __("Testing connection...", "structura")
                      : __("Test your connection", "structura")}
                </h2>
                {/* Latency line only renders when the cloud reported a
                    real measurement. Phase 5c left this `null` for the
                    plugin path; a future cloud-side probe will populate
                    it again. */}
                {isOnline && latency !== null && (
                  <p className="m-0! mt-2 text-sm text-neutral-500">
                    {__("Response time:", "structura")}{" "}
                    <span className="font-mono font-bold text-emerald-600">{latency}ms</span>
                  </p>
                )}
              </div>

              {!isOnline && !isChecking && (
                <Button variant="accent" onClick={handleTestConnection} className="mx-auto">
                  <Zap size={14} className="mr-1.5" />
                  {__("Test Connection", "structura")}
                </Button>
              )}

              {isOnline && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 dark:border-emerald-900/30 dark:bg-emerald-950/20">
                  <p className="m-0! text-xs leading-relaxed text-emerald-700 dark:text-emerald-300">
                    {__(
                      "Your API key is valid and the provider is responding. Next, choose your preferred models.",
                      "structura"
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ▸ CONFIGURE (models + defaults) ───────────────────── */}
          {step === "models" && (
            <div className="mx-auto max-w-md space-y-6">
              <div className="text-center">
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-950/30">
                  <Sparkles size={20} className="text-violet-500" />
                </div>
                <h2 className="m-0! text-lg font-bold text-neutral-900 dark:text-white">
                  {__("Configure provider", "structura")}
                </h2>
                <p className="m-0! mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                  {__("Pick models and set this provider as your default.", "structura")}
                </p>
              </div>

              {/* Text model selector */}
              {hasText && textModels.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Type size={12} className="text-blue-500" />
                    <span className="text-[10px] font-black tracking-widest text-neutral-400 uppercase">
                      {__("Text Model", "structura")}
                    </span>
                  </div>
                  <Select
                    value={selectedTextModel || recommendedTextModelId || defaultModels?.text || ""}
                    onValueChange={(val) => setSelectedTextModel(val as string)}
                    options={textModels.map((m) => ({ value: m.id, label: m.name }))}
                  >
                    <Select.Trigger placeholder={__("Select model...", "structura")} />
                    <Select.Content className="w-(--button-width)">
                      {textModels.map((m) => (
                        <Select.Item key={m.id} value={m.id}>
                          <span className="flex items-center justify-between gap-2">
                            <span>{m.name}</span>
                            {m.recommended && (
                              <span className="bg-brand-100 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase">
                                {__("Recommended", "structura")}
                              </span>
                            )}
                          </span>
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </div>
              )}

              {/* Image model selector */}
              {hasImage && imageModels.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Image size={12} className="text-purple-500" />
                    <span className="text-[10px] font-black tracking-widest text-neutral-400 uppercase">
                      {__("Image Model", "structura")}
                    </span>
                  </div>
                  <Select
                    value={
                      selectedImageModel || recommendedImageModelId || defaultModels?.image || ""
                    }
                    onValueChange={(val) => setSelectedImageModel(val as string)}
                    options={imageModels.map((m) => ({ value: m.id, label: m.name }))}
                  >
                    <Select.Trigger placeholder={__("Select model...", "structura")} />
                    <Select.Content className="w-(--button-width)">
                      {imageModels.map((m) => (
                        <Select.Item key={m.id} value={m.id}>
                          {m.name}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </div>
              )}

              {/* ── Default provider toggles ─────────────────────── */}
              <div className="space-y-3 rounded-xl border border-neutral-100 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-800/30">
                <div className="flex items-center gap-1.5">
                  <Star size={12} className="text-amber-500" />
                  <span className="text-[10px] font-black tracking-widest text-neutral-400 uppercase">
                    {__("Default Provider", "structura")}
                  </span>
                </div>
                <p className="mt-0! text-[11px] leading-relaxed text-neutral-400">
                  {forceDefaults
                    ? __(
                        "Your plan supports one provider at a time, so this provider is automatically your default. The setting is saved and will carry over if you add more providers later.",
                        "structura"
                      )
                    : __(
                        "New campaigns will use default providers automatically. You can override per campaign.",
                        "structura"
                      )}
                </p>

                {hasText && (
                  <Switch
                    label={__("Default for text generation", "structura")}
                    checked={effectiveDefaultText}
                    onChange={forceDefaults ? () => {} : setSetDefaultText}
                    disabled={forceDefaults}
                  />
                )}

                {hasImage && (
                  <Switch
                    label={__("Default for image generation", "structura")}
                    checked={effectiveDefaultImage}
                    onChange={forceDefaults ? () => {} : setSetDefaultImage}
                    disabled={forceDefaults}
                  />
                )}
              </div>

              {noModelsAvailable && (
                <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 text-center dark:border-amber-900/30 dark:bg-amber-950/20">
                  {isRefreshing ? (
                    <>
                      <Loader2 size={14} className="mx-auto mb-1.5 animate-spin text-amber-500" />
                      <p className="m-0! text-xs text-amber-600 dark:text-amber-400">
                        {__("Refreshing model catalog…", "structura")}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="m-0! mb-2 text-xs text-amber-600 dark:text-amber-400">
                        {__(
                          "No models available for this provider yet. The model catalog may need to sync.",
                          "structura"
                        )}
                      </p>
                      <Button variant="secondary" size="sm" onClick={() => refreshModels()}>
                        <RefreshCw size={12} className="mr-1.5" />
                        {__("Refresh Models", "structura")}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer navigation ─────────────────────────────────── */}
        <Dialog.Footer>
          <div className="flex w-full items-center justify-between">
            {currentStepIndex > 0 && !isConnected ? (
              <Button variant="secondary" onClick={goBack}>
                <ArrowLeft size={14} className="mr-1.5" />
                {__("Back", "structura")}
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={handleClose}>
                {__("Cancel", "structura")}
              </Button>

              {step === "intro" && (
                <Button variant="accent" onClick={goNext}>
                  {__("Get Started", "structura")}
                  <ArrowRight size={14} className="ml-1.5" />
                </Button>
              )}

              {step === "key" && (
                <Button
                  variant="accent"
                  onClick={handleSubmitKey}
                  loading={isSavingKey}
                  disabled={!keyInput.trim()}
                >
                  {__("Save & Test", "structura")}
                  <ArrowRight size={14} className="ml-1.5" />
                </Button>
              )}

              {step === "test" && (
                <Button variant="accent" onClick={goNext} disabled={!isOnline}>
                  {__("Configure", "structura")}
                  <ArrowRight size={14} className="ml-1.5" />
                </Button>
              )}

              {step === "models" && (
                <Button
                  variant="accent"
                  onClick={handleFinish}
                  loading={isSavingModels}
                  disabled={
                    missingRequiredModels || (textModels.length === 0 && imageModels.length === 0)
                  }
                >
                  <CheckCircle2 size={14} className="mr-1.5" />
                  {isConnected ? __("Save Changes", "structura") : __("Finish Setup", "structura")}
                </Button>
              )}
            </div>
          </div>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};
