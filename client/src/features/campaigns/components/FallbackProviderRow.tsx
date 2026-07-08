/**
 * @deprecated 2026-04-29 — replaced by <CampaignAiEngineSection />, which
 *   bundles primary provider, model, and fallback into a compact
 *   dropdown layout. No remaining imports — safe to delete in the next
 *   cleanup pass. Kept temporarily so any in-flight branches that still
 *   reference it don't blow up on rebase.
 *
 * FallbackProviderRow — opt-in safety net below the primary ProviderToggle.
 *
 * When the primary provider throws a transient error (429 / 5xx / timeout),
 * the cloud engine retries the call through the fallback provider once
 * before surfacing the error. See functions/src/ai/provider-fallback.ts for
 * the classification + retry logic.
 *
 * Plan-specific behavior:
 *   - Cloud / Agency  → all providers eligible; the cloud uses PLAN_DEFAULTS
 *     to pick the fallback model (no user model config needed).
 *   - Pro (BYOK)      → only providers the user has already connected a key
 *     for are eligible. The read-only "model hint" shows the default text
 *     (or image) model the user already configured for that provider, so
 *     they know exactly which model the fallback will run on.
 *   - Free            → the whole row is locked with a Pro upsell tooltip
 *     (there's no cloud API key and no BYOK support).
 *
 * Same-as-primary selection is blocked in the UI (button is disabled with
 * a tooltip). The server-side validator enforces the same rule as a
 * defense-in-depth check.
 */

import { FC, useMemo } from "react";
import { __ } from "@wordpress/i18n";
import { Image, Lock, Type, Zap } from "lucide-react";
import { cn, Tooltip } from "@structura/ui";
import { useAiSettingsQuery } from "@/features/ai-engine";
import { useLicense, useDefaultProviders } from "@/features/settings";
import { AIProvider } from "@/features/campaigns/types";
import { getProviderVisual } from "@/features/campaigns/constants";
import { useCampaignForm } from "@/features/campaigns/context/CampaignContext";

/** Text-only providers cannot be selected as an image fallback. */
const TEXT_ONLY_PROVIDERS: AIProvider[] = ["anthropic"];

type Capability = "text" | "image";

interface FallbackButtonProps {
  provider: AIProvider | null;
  selected: boolean;
  disabled: boolean;
  disabledReason?: string;
  onClick: () => void;
  /** Read-only model hint shown below the provider label (Pro BYOK only). */
  modelHint?: string;
}

const FallbackButton: FC<FallbackButtonProps> = ({
  provider,
  selected,
  disabled,
  disabledReason,
  onClick,
  modelHint,
}) => {
  const Icon = provider ? getProviderVisual(provider).icon : null;
  const label = provider
    ? getProviderVisual(provider).label
    : __("None", "structura");

  const button = (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        "relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border py-2 transition-all",
        disabled
          ? "cursor-not-allowed border-neutral-100 bg-neutral-50/50 text-neutral-300 opacity-60 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-600"
          : selected
            ? "cursor-pointer border-brand-200 bg-white text-brand-600 shadow-sm ring-2 ring-brand-50 dark:border-brand-500/30 dark:bg-neutral-800 dark:text-brand-400 dark:ring-brand-950/20"
            : "cursor-pointer border-neutral-100 bg-neutral-50 text-neutral-400 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-700",
      )}
    >
      <div className="flex items-center gap-2">
        {Icon ? <Icon size={15} /> : <Zap size={15} className="opacity-40" />}
        <span className="text-[10px] font-black tracking-widest uppercase">
          {label}
        </span>
      </div>
      {modelHint && (
        <span className="text-[9px] font-medium tracking-wide text-neutral-400 dark:text-neutral-500">
          {modelHint}
        </span>
      )}
    </button>
  );

  if (disabled && disabledReason) {
    return (
      <Tooltip title={disabledReason} position="top">
        {button}
      </Tooltip>
    );
  }

  return button;
};

interface FallbackRowProps {
  /** "text" or "image" — controls which primary we diff against and which providers are eligible. */
  capability: Capability;
}

/**
 * Inline row rendered beneath ProviderToggle. Title is static ("Fallback
 * provider (optional)") because the surrounding ProviderToggle already
 * labels the Text / Image context.
 */
export const FallbackProviderRow: FC<FallbackRowProps> = ({ capability }) => {
  const { formData, updateForm } = useCampaignForm();
  const { isLicensed } = useLicense();
  const { availableProviders, availableImageProviders, isCloud } = useDefaultProviders();
  const { data: ai } = useAiSettingsQuery();

  const isFree = !isLicensed;
  const primary: AIProvider =
    capability === "text"
      ? formData.intelligence.textProvider
      : formData.intelligence.imageProvider;

  const currentFallback: AIProvider | null =
    (capability === "text"
      ? formData.intelligence.fallbackTextProvider
      : formData.intelligence.fallbackImageProvider) ?? null;

  // Candidate list: for text, every supported provider; for image, only
  // image-capable providers (drop text-only like Anthropic).
  const candidates = useMemo<AIProvider[]>(() => {
    const all = capability === "text" ? availableProviders : availableImageProviders;
    const dedup = new Set(all as AIProvider[]);
    // Ensure the full known set shows for Cloud (already handled by
    // useDefaultProviders.availableProviders), and filter text-only out of
    // the image row for Pro too.
    return Array.from(dedup).filter((p) =>
      capability === "text" ? true : !TEXT_ONLY_PROVIDERS.includes(p),
    );
  }, [capability, availableProviders, availableImageProviders]);

  const onPick = (next: AIProvider | null) => {
    if (capability === "text") {
      updateForm("intelligence", { fallbackTextProvider: next });
    } else {
      updateForm("intelligence", { fallbackImageProvider: next });
    }
  };

  // Pro eligibility for a candidate: key must be connected AND the model
  // for the target capability must already be set. Otherwise the cloud
  // wouldn't actually be able to fire the fallback, so we shouldn't pretend
  // it will. Cloud/Agency bypass this — they always have a master key.
  const isProviderEligible = (p: AIProvider): boolean => {
    if (p === primary) return false; // same-as-primary never allowed
    if (isFree) return false;
    if (isCloud) return true;
    const info = ai?.providers?.[p];
    if (!info?.connected) return false;
    return capability === "text" ? !!info.text_model : !!info.image_model;
  };

  const getDisabledReason = (p: AIProvider): string | undefined => {
    if (p === primary) {
      return __("Fallback must differ from the primary provider.", "structura");
    }
    if (isFree) {
      return __("Upgrade to Pro to unlock provider fallback.", "structura");
    }
    if (isCloud) return undefined;
    const info = ai?.providers?.[p];
    if (!info?.connected) {
      return __("Connect this provider's API key in AI Engine settings.", "structura");
    }
    const missingModel =
      capability === "text" ? !info.text_model : !info.image_model;
    if (missingModel) {
      return __("Complete model setup for this provider in AI Engine settings.", "structura");
    }
    return undefined;
  };

  // Model hint — Pro only, when connected AND a default model is set.
  // For Cloud users the model is decided by PLAN_DEFAULTS server-side, so
  // showing a client-guessed hint would be misleading.
  const modelHintFor = (p: AIProvider): string | undefined => {
    if (isCloud || isFree) return undefined;
    const info = ai?.providers?.[p];
    if (!info?.connected) return undefined;
    const model = capability === "text" ? info.text_model : info.image_model;
    return model || undefined;
  };

  const icon =
    capability === "text" ? (
      <Type size={12} className="text-blue-500" />
    ) : (
      <Image size={12} className="text-purple-500" />
    );

  return (
    <div className="space-y-0 border-t border-neutral-100 dark:border-neutral-800">
      <div className="flex items-center justify-between bg-neutral-50/50 px-3 py-2 dark:bg-neutral-800/30">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[9px] font-black tracking-widest text-neutral-400 uppercase">
            {capability === "text"
              ? __("Fallback Text Provider", "structura")
              : __("Fallback Image Provider", "structura")}
          </span>
          <span className="text-[9px] font-medium text-neutral-400 lowercase">
            {__("(optional)", "structura")}
          </span>
        </div>
        {isFree && (
          <Tooltip
            title={__("Upgrade to Pro to unlock provider fallback.", "structura")}
            position="top"
          >
            <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black tracking-widest text-amber-700 uppercase dark:bg-amber-950/30 dark:text-amber-400">
              <Lock size={9} />
              {__("Pro", "structura")}
            </span>
          </Tooltip>
        )}
      </div>

      <div className="flex gap-1.5 px-1.5 pb-1.5">
        {/* "None" = disable fallback for this capability. Always enabled
            (even on Free) so the user can at minimum confirm the current
            setting; the provider buttons next to it do the gating. */}
        <FallbackButton
          provider={null}
          selected={currentFallback === null}
          disabled={false}
          onClick={() => onPick(null)}
        />
        {candidates.map((p) => (
          <FallbackButton
            key={p}
            provider={p}
            selected={currentFallback === p}
            disabled={!isProviderEligible(p)}
            disabledReason={getDisabledReason(p)}
            onClick={() => onPick(p)}
            modelHint={modelHintFor(p)}
          />
        ))}
      </div>

      <p className="px-3 pb-2 text-[10px] leading-snug text-neutral-400 dark:text-neutral-500">
        {capability === "text"
          ? __(
              "If the primary text provider is temporarily unavailable (rate-limited, timeouts, or 5xx), we'll retry the same request through this provider once before failing the run.",
              "structura",
            )
          : __(
              "If the primary image provider is temporarily unavailable, we'll retry once through this provider before failing the run.",
              "structura",
            )}
      </p>
    </div>
  );
};
