import { useCallback, useEffect, useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
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
import { Button, cn, Dialog, InputField, RecommendedLabel, Select, Switch } from "@structura/ui";
import { getProviderVisual } from "@/features/campaigns/constants";
import { recommendedTier, recommendedWord } from "@/features/campaigns/aiGuidance";
import { mirrorModelForTier } from "@/features/campaigns/modelTier";
import type { AIProvider } from "@/features/campaigns/types";
import { looksLikeUrlNotApiKey } from "@/utils/providerMeta";
import { useSaveKey } from "../api/useSaveKey";
import { useProviderPulse } from "../api/useProviderPulse";
import { useAvailableModelsQuery } from "../api/useAvailableModelsQuery";
import { useRefreshModels } from "../api/useRefreshModels";
import { useUpdateAiSettings } from "../api/useUpdateAiSettings";
import { usesRecommendedModel } from "../helpers";

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
   * The tier ("top" | "mid") the "Use recommended model" switch stored, or
   * "" / undefined when the site picked a model or never used the switch.
   */
  currentTextTier?: string;
  currentImageTier?: string;
  /**
   * False on plans without image generation (anonymous `none`): the
   * configure step says so instead of offering an image model, and no
   * image model or image default is saved. The overview still lists the
   * provider's image capability (owner review 2026-10-06). Defaults to true.
   */
  imagesAvailable?: boolean;
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
  currentTextTier,
  currentImageTier,
  imagesAvailable = true,
}: ProviderSetupWizardProps) => {
  // The forced "Default for text / image" toggles of the one-provider
  // anonymous plan (Phase 1.8 §1.8.4) were deleted 2026-10-06: every plan
  // may connect every provider (specs/open-providers.md).

  /* ── Recommended model (owner review 2026-10-06) ──────────────────
     "Use recommended model" saves the provider's recommended TIER with
     the model it maps to today, so the site default follows the catalog
     when that tier's model moves (`resolveDefaultModel` resolves a stored
     tier first). A provider without a recommended model for a capability
     (Gemini text) still uses Standard but carries no "Recommended" chip. */
  const pid = providerId as AIProvider;
  const recTextTier = recommendedTier(providerId, "text") ?? "mid";
  const recImageTier = recommendedTier(providerId, "image") ?? "mid";
  const recTextModelId = mirrorModelForTier(pid, "text", recTextTier);
  const recImageModelId = mirrorModelForTier(pid, "image", recImageTier);
  const textIsRecommended = recommendedTier(providerId, "text") !== undefined;
  const imageIsRecommended = recommendedTier(providerId, "image") !== undefined;
  // On for a new connection, a stored tier, or a stored model that IS the
  // recommended one; off when the site picked another model (it keeps it).
  const [useRecommendedText, setUseRecommendedText] = useState(
    () => !isConnected || usesRecommendedModel(providerId, "text", currentTextTier, currentTextModel)
  );
  const [useRecommendedImage, setUseRecommendedImage] = useState(
    () => !isConnected || usesRecommendedModel(providerId, "image", currentImageTier, currentImageModel)
  );

  /* ── Wizard state ─────────────────────────────────────────────── */
  const [step, setStep] = useState<WizardStep>(isConnected ? "models" : "intro");
  const [keyInput, setKeyInput] = useState("");
  const [keySubmitted, setKeySubmitted] = useState(isConnected);
  // Pre-check before saving: a pasted URL can never be a key, and the
  // masked input means the user can't see that's what they did.
  const urlPasted = looksLikeUrlNotApiKey(keyInput);
  const [selectedTextModel, setSelectedTextModel] = useState(currentTextModel ?? "");
  const [selectedImageModel, setSelectedImageModel] = useState(currentImageModel ?? "");
  // When the tier forces defaults, the toggles are always on and
  // user clicks are ignored. Initial values still seed the displayed
  // checked state in the non-forced case.
  // 2026-10-02: the text toggle no longer starts on for a new connection.
  // Left pre-checked, it saved an explicit default the customer never
  // chose, which then outranked the best connected provider
  // (specs/byok-ai-guidance.md §9). Only switching it on writes one.
  const [setDefaultText, setSetDefaultText] = useState(isDefaultText);
  const [setDefaultImage, setSetDefaultImage] = useState(!isConnected || isDefaultImage);

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

  // The dropdown opens on the recommended tier's model when the served
  // list carries it, else on the served `recommended` entry (frozen for
  // images, specs/byok-ai-guidance.md §2), else the catalog default.
  const servedTextRecommended =
    (recTextModelId && textModels.some((m) => m.id === recTextModelId) ? recTextModelId : undefined) ??
    textModels.find((m) => m.recommended)?.id;
  const servedImageRecommended =
    (recImageModelId && imageModels.some((m) => m.id === recImageModelId) ? recImageModelId : undefined) ??
    imageModels.find((m) => m.recommended)?.id;
  const recommendedTextModelId = servedTextRecommended;
  const recommendedImageModelId = servedImageRecommended;

  const hasText = capabilities.includes("text");
  const hasImage = capabilities.includes("image");
  // The provider makes images but the plan does not (anonymous).
  const imageEnabled = hasImage && imagesAvailable;

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
  // What Finish saves: the recommended tier with its model while the
  // switch is on, else the picked model with the tier cleared.
  const textToSave = useRecommendedText && recTextModelId
    ? { model: recTextModelId, tier: recTextTier }
    : { model: effectiveTextModel, tier: "" };
  const imageToSave = useRecommendedImage && recImageModelId
    ? { model: recImageModelId, tier: recImageTier }
    : { model: effectiveImageModel, tier: "" };
  const missingRequiredModels =
    (hasText && textModels.length > 0 && !textToSave.model) ||
    (imageEnabled && imageModels.length > 0 && !imageToSave.model);

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
    if (!keyInput.trim() || urlPasted) return;
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
  }, [keyInput, urlPasted, providerId, saveKey]);

  const handleTestConnection = useCallback(() => {
    checkPulse();
  }, [checkPulse]);

  const handleFinish = useCallback(() => {
    const data: Record<string, any> = { ai: {} };

    // Save model selections — keyed directly by provider ID (PHP expects $ai[$pid]).
    // The tier travels beside the model ("" clears it), like a campaign's
    // textTier + textModel. No image model on a plan without images.
    const saveText = hasText && !!textToSave.model;
    const saveImage = imageEnabled && !!imageToSave.model;
    if (saveText || saveImage) {
      data.ai[providerId] = {
        ...(saveText && { text_model: textToSave.model, text_tier: textToSave.tier }),
        ...(saveImage && { image_model: imageToSave.model, image_tier: imageToSave.tier }),
      };
    }

    // Save default provider selections.
    // Only include a capability when:
    //   - toggle ON  → set this provider as default
    //   - toggle OFF → clear only if this provider WAS the default (don't clobber other providers)
    const defaults: Record<string, string> = {};
    if (hasText && setDefaultText) defaults.text_provider = providerId;
    if (hasText && !setDefaultText && isDefaultText) defaults.text_provider = "";
    if (imageEnabled && setDefaultImage) defaults.image_provider = providerId;
    if (imageEnabled && !setDefaultImage && isDefaultImage) defaults.image_provider = "";
    if (Object.keys(defaults).length > 0) {
      data.ai.defaults = defaults;
    }

    if (Object.keys(data.ai).length > 0) {
      updateSettings(data, { onSuccess: () => onClose() });
    } else {
      onClose();
    }
  }, [
    textToSave,
    imageToSave,
    setDefaultText,
    setDefaultImage,
    hasText,
    imageEnabled,
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
                      visual.color
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
                        <p className="mt-1! mb-0! text-[11px] leading-relaxed text-neutral-400">
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
                <p className="mt-2! mb-0! text-sm text-neutral-500 dark:text-neutral-400">
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
                error={
                  urlPasted
                    ? keyPrefix
                      ? sprintf(
                          /* translators: %s: the provider's API key prefix, e.g. "sk-" */
                          __(
                            'That looks like a web address, not an API key. Paste the key itself — it starts with "%s".',
                            "structura"
                          ),
                          keyPrefix
                        )
                      : __(
                          "That looks like a web address, not an API key. Paste the key itself from your provider's dashboard.",
                          "structura"
                        )
                    : undefined
                }
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
                  <p className="mt-2! mb-0! text-sm text-neutral-500">
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
                <p className="mt-2! mb-0! text-sm text-neutral-500 dark:text-neutral-400">
                  {__("Pick models and set this provider as your default.", "structura")}
                </p>
              </div>

              {/* Text model — recommended switch, dropdown behind it */}
              {hasText && textModels.length > 0 && (
                <div className="space-y-2" data-testid="wizard-text-model">
                  <div className="flex items-center gap-1.5">
                    <Type size={12} className="text-blue-500" />
                    <span className="text-[10px] font-black tracking-widest text-neutral-400 uppercase">
                      {__("Text Model", "structura")}
                    </span>
                  </div>
                  <RecommendedModelSwitch
                    checked={useRecommendedText}
                    onChange={setUseRecommendedText}
                    showChip={textIsRecommended}
                    explain
                  />
                  {!useRecommendedText && (
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
                              {textIsRecommended && m.id === recTextModelId && (
                                <RecommendedLabel label={recommendedWord()} />
                              )}
                            </span>
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
                  )}
                </div>
              )}

              {/* Image model — same switch; on a plan without images, a line instead */}
              {hasImage && (imageModels.length > 0 || !imagesAvailable) && (
                <div className="space-y-2" data-testid="wizard-image-model">
                  <div className="flex items-center gap-1.5">
                    <Image size={12} className="text-purple-500" />
                    <span className="text-[10px] font-black tracking-widest text-neutral-400 uppercase">
                      {__("Image Model", "structura")}
                    </span>
                  </div>
                  {!imagesAvailable ? (
                    <p className="m-0! text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                      {__("Image generation is not available on your current plan.", "structura")}
                    </p>
                  ) : (
                    <>
                      <RecommendedModelSwitch
                        checked={useRecommendedImage}
                        onChange={setUseRecommendedImage}
                        showChip={imageIsRecommended}
                      />
                      {!useRecommendedImage && (
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
                                <span className="flex items-center justify-between gap-2">
                                  <span>{m.name}</span>
                                  {imageIsRecommended && m.id === recImageModelId && (
                                    <RecommendedLabel label={recommendedWord()} />
                                  )}
                                </span>
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select>
                      )}
                    </>
                  )}
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
                  {__(
                    "New campaigns will use default providers automatically. You can override per campaign.",
                    "structura"
                  )}
                </p>

                {hasText && (
                  <Switch
                    label={__("Default for text generation", "structura")}
                    checked={setDefaultText}
                    onChange={setSetDefaultText}
                  />
                )}

                {imageEnabled && (
                  <Switch
                    label={__("Default for image generation", "structura")}
                    checked={setDefaultImage}
                    onChange={setSetDefaultImage}
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
                  disabled={!keyInput.trim() || urlPasted}
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

/**
 * The "Use recommended model" switch of the configure step, with the
 * "Recommended" chip beside its label when we recommend a model for this
 * provider and capability. `explain` adds the one-line reason under it.
 */
const RecommendedModelSwitch = ({
  checked,
  onChange,
  showChip,
  explain = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  showChip: boolean;
  explain?: boolean;
}) => (
  <div className="space-y-1.5 rounded-xl border border-neutral-100 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-800/30">
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Visible copy of the switch's own (sr-only) label. */}
        <span aria-hidden="true" className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
          {__("Use recommended model", "structura")}
        </span>
        {showChip && <RecommendedLabel label={recommendedWord()} />}
      </div>
      <Switch
        hiddenLabel
        label={__("Use recommended model", "structura")}
        checked={checked}
        onChange={onChange}
      />
    </div>
    {explain && (
      <p className="m-0! text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        {__(
          "We review new models regularly and move the recommendation when a better one proves itself. We suggest leaving this choice with us.",
          "structura"
        )}
      </p>
    )}
  </div>
);
