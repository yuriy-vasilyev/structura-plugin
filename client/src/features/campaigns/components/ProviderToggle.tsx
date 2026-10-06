import { FC } from "react";
import { __ } from "@wordpress/i18n";
import { AlertTriangle, Bot, Type, Image } from "lucide-react";
import { RecommendedLabel, Select, Tooltip, cn } from "@structura/ui";
import { useLicense, useDefaultProviders } from "@/features/settings";
import { AIProvider } from "@/features/campaigns/types";
import { getProviderVisual } from "@/features/campaigns/constants";
import { type ModelTier, buildTierOptions } from "@/features/campaigns/modelTier";
import {
  isRecommendedTextProvider,
  orderTextProviders,
  recommendedWord,
} from "@/features/campaigns/aiGuidance";

// ─── Sub-components ──────────────────────────────────────────────────────────

interface ProviderButtonProps {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  /** When true, shows a warning indicator and disables the button. */
  incomplete?: boolean;
  /**
   * Text buttons only: the "Recommended" chip after the title, part of the
   * button's name (specs/byok-ai-guidance.md §5). Not on disabled buttons.
   */
  recommended?: boolean;
  /** Text buttons only: the provider id, so Undo can refocus this button. */
  textProviderId?: string;
}

const ProviderButton: FC<ProviderButtonProps> = ({
  selected,
  onClick,
  icon,
  title,
  incomplete,
  recommended,
  textProviderId,
}) => {
  const button = (
    <button
      type="button"
      data-text-provider={textProviderId}
      onClick={incomplete ? undefined : onClick}
      disabled={incomplete}
      className={cn(
        // flex-wrap: the "Recommended" chip moves under the name rather
        // than overflowing a narrow button.
        "relative flex flex-1 flex-wrap items-center justify-center gap-2 gap-y-1 rounded-lg border py-2 transition-all",
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
      {recommended && !incomplete && (
        <>
          {" "}
          <RecommendedLabel label={recommendedWord()} />
        </>
      )}
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
  /** Called when the text provider changes. Consumer should also mirror the tier's model. */
  onTextProviderChange: (provider: AIProvider) => void;
  /** Called when the image provider changes. Consumer should also mirror the tier's model. */
  onImageProviderChange: (provider: AIProvider) => void;
  /** Which providers are available for text generation. */
  availableTextProviders: string[];
  /** Which providers are available for image generation. */
  availableImageProviders: string[];

  // ── Optional model-quality TIER selection ───────────────────────────────
  /**
   * When true, shows the Top/Standard tier selectors beneath the toggles.
   * BYOK/free only — managed plans own the model server-side and pass `false`.
   */
  showTierSelectors?: boolean;
  /** Current text quality tier. Required when `showTierSelectors` is true. */
  textTier?: ModelTier;
  /** Current image quality tier. Required when `showTierSelectors` is true. */
  imageTier?: ModelTier;
  /** Called when the text tier changes. Consumer stores the tier + mirrors the model. */
  onTextTierChange?: (tier: ModelTier) => void;
  /** Called when the image tier changes. Consumer stores the tier + mirrors the model. */
  onImageTierChange?: (tier: ModelTier) => void;
  /** Overrides `showTierSelectors` for the text model dropdown alone. */
  showTextTierSelector?: boolean;
  /** Overrides `showTierSelectors` for the image model dropdown alone. */
  showImageTierSelector?: boolean;
  /**
   * When true, a capability with exactly one provider renders no provider
   * row (Generate a Post, owner review 2026-10-06: nothing to choose).
   */
  hideSingleProviderRow?: boolean;
}

/**
 * Split provider toggle with per-capability provider selection + a model-quality
 * TIER picker.
 *
 * A user never sees a raw model list: the only model choice is Top / Standard,
 * labeled with the resolved model name ("Top (Gemini 3.1 Pro)"). The concrete
 * model is resolved from the tier at generation time; the consumer mirrors it
 * onto the campaign for display / back-compat.
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
 * Usage B — Provider + tiers (StepObjective / GeneratePostPage):
 *   <ProviderToggle
 *     textProvider="openai"
 *     imageProvider="gemini"
 *     onTextProviderChange={...}
 *     onImageProviderChange={...}
 *     availableTextProviders={[...]}
 *     availableImageProviders={[...]}
 *     showTierSelectors
 *     textTier="top"
 *     imageTier="mid"
 *     onTextTierChange={...}
 *     onImageTierChange={...}
 *   />
 */
export const ProviderToggle: FC<ProviderToggleProps> = ({
  textProvider,
  imageProvider,
  onTextProviderChange,
  onImageProviderChange,
  availableTextProviders,
  availableImageProviders,
  showTierSelectors = false,
  textTier = "top",
  imageTier = "top",
  onTextTierChange,
  onImageTierChange,
  showTextTierSelector = showTierSelectors,
  showImageTierSelector = showTierSelectors,
  hideSingleProviderRow = false,
}) => {
  const { isLicensed } = useLicense();
  const { isProviderIncomplete, isCloud } = useDefaultProviders();

  // Pickers describe a provider the customer has (2026-10-02): with no text
  // provider connected nothing is selected, so there is no text row and no
  // text model picker — only the caller's "connect a provider" message.
  // The image row follows the same rule through `availableImageProviders`.
  const hasTextProvider = availableTextProviders.length > 0;

  // Check if the currently selected providers are incomplete
  const isTextProviderIncomplete = isProviderIncomplete(textProvider);
  const isImageProviderIncomplete = isProviderIncomplete(imageProvider);

  // A lone provider's row is only kept while it carries the "complete
  // setup" warning.
  const hideTextRow =
    hideSingleProviderRow && availableTextProviders.length === 1 && !isTextProviderIncomplete;
  const hideImageRow =
    hideSingleProviderRow && availableImageProviders.length === 1 && !isImageProviderIncomplete;

  // Managed plans never pick or see a text provider (specs/managed-ai-lineup.md
  // §3, §3.3). The caller keeps `textProvider` on the form, hidden.
  const showTextSection = !isCloud && hasTextProvider && !hideTextRow;

  // Image generation requires at least a Free license. Managed plans pick no
  // image provider either since 2026-10-06 (one image model bound by
  // Structura); the caller keeps `imageProvider` on the form, hidden, so the
  // image toggles still travel with a provider.
  const hasImageProvider = !isCloud && isLicensed && availableImageProviders.length > 0;
  const showImageSection = hasImageProvider && !hideImageRow;

  const showTextTier = showTextTierSelector && hasTextProvider;
  const showImageTier = showImageTierSelector && hasImageProvider;
  const showTierGrid = showTextTier || showImageTier;
  if (!showTextSection && !showImageSection && !showTierGrid) return null;

  const textTierOptions = buildTierOptions(textProvider, "text");
  const imageTierOptions = buildTierOptions(imageProvider, "image");

  const showTextToggle = availableTextProviders.length > 1;
  const showImageToggle = availableImageProviders.length > 1;

  // One provider (2026-10-02): its name sits in the heading row as plain
  // text, so the row is never an empty label with nothing to choose.
  const singleTextProvider =
    availableTextProviders.length === 1 ? availableTextProviders[0] : null;
  const singleImageProvider =
    availableImageProviders.length === 1 ? availableImageProviders[0] : null;

  return (
    <div className="space-y-0 divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-neutral-50/30 overflow-hidden dark:divide-neutral-800 dark:border-neutral-700 dark:bg-neutral-900/30">
      {/* ── Text Provider (hidden on managed plans) ───────────────── */}
      {showTextSection && (
        <div className="space-y-0">
          <div className="flex items-center gap-2 bg-neutral-50/50 px-3 py-2 dark:bg-neutral-800/30">
            <Type size={12} className="text-blue-500" />
            <span className="text-[9px] font-black tracking-widest text-neutral-400 uppercase">
              {__("Text Provider", "structura")}
            </span>
            {singleTextProvider && (
              <span className="ml-auto text-[10px] font-bold text-neutral-700 dark:text-neutral-200">
                {getProviderVisual(singleTextProvider).label}
              </span>
            )}
          </div>
          {showTextToggle && (
            <div className="flex gap-1.5 px-1.5 pb-1.5">
              {orderTextProviders(availableTextProviders as AIProvider[]).map((p) => (
                <ProviderButton
                  key={p}
                  selected={textProvider === p}
                  onClick={() => onTextProviderChange(p)}
                  icon={getProviderIcon(p)}
                  title={getProviderVisual(p).label}
                  incomplete={isProviderIncomplete(p)}
                  recommended={isRecommendedTextProvider(p)}
                  textProviderId={p}
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
      )}

      {/* ── Image Provider (hidden for unlicensed users — no image gen) ── */}
      {showImageSection && (
        <div className="space-y-0">
          <div className="flex items-center gap-2 bg-neutral-50/50 px-3 py-2 dark:bg-neutral-800/30">
            <Image size={12} className="text-purple-500" />
            <span className="text-[9px] font-black tracking-widest text-neutral-400 uppercase">
              {__("Image Provider", "structura")}
            </span>
            {singleImageProvider && (
              <span className="ml-auto text-[10px] font-bold text-neutral-700 dark:text-neutral-200">
                {getProviderVisual(singleImageProvider).label}
              </span>
            )}
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

      {/* ── Model quality tier (BYOK/free only) ───────────────────── */}
      {showTierGrid && (
        <div className="p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Bot size={13} className="text-brand-600 dark:text-brand-400" />
            <span className="text-[10px] font-black tracking-widest text-neutral-500 uppercase">
              {__("Engine", "structura")}
            </span>
          </div>

          <div className={cn(
            "grid grid-cols-1 gap-2.5",
            showTextTier && showImageTier && "sm:grid-cols-2"
          )}>
            {showTextTier && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] font-bold tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
                  {__("Text Model", "structura")}
                </span>
                <Select
                  options={textTierOptions}
                  value={textTier}
                  onValueChange={(val) => onTextTierChange?.(val as ModelTier)}
                >
                  <Select.Trigger />
                  <Select.Content className="w-(--button-width)">
                    {textTierOptions.map((o) => (
                      <Select.Item key={o.value} value={o.value} recommended={o.recommended}>
                        {o.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
            )}

            {showImageTier && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] font-bold tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
                  {__("Image Model", "structura")}
                </span>
                <Select
                  options={imageTierOptions}
                  value={imageTier}
                  onValueChange={(val) => onImageTierChange?.(val as ModelTier)}
                >
                  <Select.Trigger />
                  <Select.Content className="w-(--button-width)">
                    {imageTierOptions.map((o) => (
                      <Select.Item key={o.value} value={o.value}>
                        {o.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
