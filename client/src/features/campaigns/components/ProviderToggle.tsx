import { FC } from "react";
import { __ } from "@wordpress/i18n";
import { Type, Image } from "lucide-react";
import { RecommendedLabel, cn } from "@structura/ui";
import { useLicense, useDefaultProviders } from "@/features/settings";
import { AIProvider } from "@/features/campaigns/types";
import { getProviderVisual } from "@/features/campaigns/constants";
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
  /**
   * Text buttons only: the "Recommended" chip after the title, part of the
   * button's name (specs/byok-ai-guidance.md §5).
   */
  recommended?: boolean;
  /** Text buttons only: the provider id, so Undo can refocus this button. */
  textProviderId?: string;
}

// The "incomplete" (no model selected) state of these buttons went on
// 2026-11-25 with model selection itself (specs/byok-ai-guidance.md §2.2).
const ProviderButton: FC<ProviderButtonProps> = ({
  selected,
  onClick,
  icon,
  title,
  recommended,
  textProviderId,
}) => (
  <button
    type="button"
    data-text-provider={textProviderId}
    onClick={onClick}
    className={cn(
      // flex-wrap: the "Recommended" chip moves under the name rather
      // than overflowing a narrow button.
      "relative flex flex-1 flex-wrap items-center justify-center gap-2 gap-y-1 rounded-lg border py-2 transition-all",
      selected
        ? "cursor-pointer border-brand-200 bg-white text-brand-600 shadow-sm ring-2 ring-brand-50 dark:border-brand-500/30 dark:bg-neutral-800 dark:text-brand-400 dark:ring-brand-950/20"
        : "cursor-pointer border-neutral-100 bg-neutral-50 text-neutral-400 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-700"
    )}
  >
    <div className={cn(selected ? "text-brand-600 dark:text-brand-400" : "text-neutral-400 dark:text-neutral-500")}>
      {icon}
    </div>
    <span className="text-[10px] font-black tracking-widest uppercase">{title}</span>
    {recommended && (
      <>
        {" "}
        <RecommendedLabel label={recommendedWord()} />
      </>
    )}
  </button>
);

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
  /** Called when the text provider changes. */
  onTextProviderChange: (provider: AIProvider) => void;
  /** Called when the image provider changes. */
  onImageProviderChange: (provider: AIProvider) => void;
  /** Which providers are available for text generation. */
  availableTextProviders: string[];
  /** Which providers are available for image generation. */
  availableImageProviders: string[];
  /**
   * When true, a capability with exactly one provider renders no provider
   * row (Generate a Post, owner review 2026-10-06: nothing to choose).
   */
  hideSingleProviderRow?: boolean;
}

/**
 * Split provider toggle with per-capability provider selection.
 *
 * No model or tier is chosen since 2026-11-25 (owner decision,
 * specs/byok-ai-guidance.md §2.2): the cloud runs each provider's Standard
 * model. None is named either: the read-only "Engine" names that replaced
 * the Top / Standard dropdowns went the same day.
 */
export const ProviderToggle: FC<ProviderToggleProps> = ({
  textProvider,
  imageProvider,
  onTextProviderChange,
  onImageProviderChange,
  availableTextProviders,
  availableImageProviders,
  hideSingleProviderRow = false,
}) => {
  const { isLicensed } = useLicense();
  const { isCloud } = useDefaultProviders();

  // Pickers describe a provider the customer has (2026-10-02): with no text
  // provider connected nothing is selected, so there is no text row — only
  // the caller's "connect a provider" message.
  // The image row follows the same rule through `availableImageProviders`.
  const hasTextProvider = availableTextProviders.length > 0;

  const hideTextRow = hideSingleProviderRow && availableTextProviders.length === 1;
  const hideImageRow = hideSingleProviderRow && availableImageProviders.length === 1;

  // Managed plans never pick or see a text provider (specs/managed-ai-lineup.md
  // §3, §3.3). The caller keeps `textProvider` on the form, hidden.
  const showTextSection = !isCloud && hasTextProvider && !hideTextRow;

  // Image generation requires at least a Free license. Managed plans pick no
  // image provider either since 2026-10-06 (one image model bound by
  // Structura); the caller keeps `imageProvider` on the form, hidden, so the
  // image toggles still travel with a provider.
  const hasImageProvider = !isCloud && isLicensed && availableImageProviders.length > 0;
  const showImageSection = hasImageProvider && !hideImageRow;

  if (!showTextSection && !showImageSection) return null;

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
                  recommended={isRecommendedTextProvider(p)}
                  textProviderId={p}
                />
              ))}
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
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
