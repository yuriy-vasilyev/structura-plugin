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
import { Button, cn, Dialog, InputField, LinkifiedText, Switch } from "@structura/ui";
import { getProviderVisual } from "@/features/campaigns/constants";
import { looksLikeUrlNotApiKey } from "@/utils/providerMeta";
import { useSaveKey } from "../api/useSaveKey";
import { useTestKey, type KeyTestResult } from "../api/useTestKey";
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
  /** Whether this provider is currently the default for text. */
  isDefaultText?: boolean;
  /** Whether this provider is currently the default for image. */
  isDefaultImage?: boolean;
  /**
   * False on plans without image generation (anonymous `none`): the
   * configure step says so instead of naming an image model, and no image
   * default is saved. The overview still lists the provider's image
   * capability (owner review 2026-10-06). Defaults to true.
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

/** Copy for a failed key test that carries no message from the provider. */
function keyTestFallback(code: KeyTestResult["errorCode"]): string {
  switch (code) {
    case "auth":
      return __("That key was rejected. Double-check it and try again.", "structura");
    case "rate_limit":
      return __("The provider is rate-limiting the test. Try again in a moment.", "structura");
    case "model_unavailable":
      return __("The provider didn't return a usable model. Check the key's access.", "structura");
    case "network":
      return __("Couldn't reach the provider. Check your connection and try again.", "structura");
    case "timeout":
      return __("The provider took too long to respond. Try again.", "structura");
    default:
      return __("The key couldn't be verified. Double-check it and try again.", "structura");
  }
}

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
  isDefaultText = false,
  isDefaultImage = false,
  imagesAvailable = true,
}: ProviderSetupWizardProps) => {
  // The forced "Default for text / image" toggles of the one-provider
  // anonymous plan (Phase 1.8 §1.8.4) were deleted 2026-10-06: every plan
  // may connect every provider (specs/open-providers.md).
  // The "Use recommended model" switch and the model dropdowns were deleted
  // 2026-11-25: no customer picks a model or a tier, and the cloud runs each
  // provider's Standard model (owner decision, specs/byok-ai-guidance.md
  // §2.2). The read-only model names the configure step showed in their
  // place went the same day: no customer surface names a model.

  /* ── Wizard state ─────────────────────────────────────────────── */
  const [step, setStep] = useState<WizardStep>(isConnected ? "models" : "intro");
  const [keyInput, setKeyInput] = useState("");
  const [keySubmitted, setKeySubmitted] = useState(isConnected);
  // Pre-check before saving: a pasted URL can never be a key, and the
  // masked input means the user can't see that's what they did.
  const urlPasted = looksLikeUrlNotApiKey(keyInput);
  // Failed live test, shown under the key field until the key changes.
  const [testFailure, setTestFailure] = useState<KeyTestResult | null>(null);
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
  const { mutateAsync: testKey, isPending: isTestingKey } = useTestKey();
  const { isOnline, latency, isChecking, checkPulse } = useProviderPulse(providerId, keySubmitted);
  const { data: modelsData } = useAvailableModelsQuery();
  const { mutate: refreshModels, isPending: isRefreshing } = useRefreshModels();
  const { mutate: updateSettings, isPending: isSavingSettings } = useUpdateAiSettings();

  const currentStepIndex = STEPS.indexOf(step);

  const hasText = capabilities.includes("text");
  const hasImage = capabilities.includes("image");
  // The provider makes images but the plan does not (anonymous).
  const imageEnabled = hasImage && imagesAvailable;

  // Auto-refresh when the wizard reaches the models step and the served
  // catalog has no model for this provider. This handles the common case of
  // stale cache after a new provider deploy.
  const [hasAutoRefreshed, setHasAutoRefreshed] = useState(false);
  const servedDefaults = modelsData?.defaults?.[providerId];
  const noModelsAvailable = !servedDefaults?.text && !servedDefaults?.image;

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
  // The key is live-tested before it is saved (specs/provider-key-test.md §3).
  // Until 2026-11-18 it was saved untested, and a key with no credit only
  // failed at the first generation.
  const handleSubmitKey = useCallback(async () => {
    if (!keyInput.trim() || urlPasted || isTestingKey || isSavingKey) return;
    setTestFailure(null);
    let result: KeyTestResult;
    try {
      result = await testKey({ provider: providerId, key: keyInput.trim() });
    } catch {
      // The test could not run (cloud unreachable): network-class copy.
      result = { ok: false, latencyMs: 0, errorCode: "network" };
    }
    if (!result.ok) {
      setTestFailure(result);
      return;
    }
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
  }, [keyInput, urlPasted, isTestingKey, isSavingKey, providerId, testKey, saveKey]);

  const handleTestConnection = useCallback(() => {
    checkPulse();
  }, [checkPulse]);

  const handleFinish = useCallback(() => {
    const data: Record<string, any> = { ai: {} };

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
    setTestFailure(null);
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
                onChange={(e) => {
                  setKeyInput(e.target.value);
                  setTestFailure(null);
                }}
                placeholder={keyPrefix ?? __("Enter API key...", "structura")}
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSubmitKey();
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
                    : testFailure
                      ? testFailure.providerMessage
                        ? (
                            <LinkifiedText
                              text={testFailure.providerMessage}
                              newTabLabel={__("(opens in a new tab)", "structura")}
                            />
                          )
                        : keyTestFallback(testFailure.errorCode)
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
                      "Your API key is valid and the provider is responding.",
                      "structura"
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ▸ CONFIGURE (defaults) ─────────────────────────────── */}
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
                  {__("Set this provider as your default.", "structura")}
                </p>
              </div>

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

                {/* The provider makes images but the plan does not (anonymous). */}
                {hasImage && !imagesAvailable && (
                  <p className="m-0! text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                    {__("Image generation is not available on your current plan.", "structura")}
                  </p>
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
                  loading={isTestingKey || isSavingKey}
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
                  loading={isSavingSettings}
                  disabled={noModelsAvailable}
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
