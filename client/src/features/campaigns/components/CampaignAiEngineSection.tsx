/**
 * CampaignAiEngineSection — compact AI Engine block for the campaign
 * create + edit screens.
 *
 * Replaces the previous combo of <ProviderToggle> (wide button group
 * for Text Provider / Image Provider) + <FallbackProviderRow> (wide
 * button group for Fallback Text / Fallback Image) with a denser
 * dropdown-based layout. The four button-row blocks shown to the user
 * become three rows of compact selects:
 *
 *    [pre-generation strip]
 *    Text:  Provider ▾    Model ▾   Fallback ▾
 *    Image: Provider ▾    Model ▾   Fallback ▾
 *
 * Why pre-generation lives here (and not in the schedule step):
 *   the pre-generation toggle modifies *how* the engine produces
 *   scheduled posts (batch up-front vs sync at fire-time). It belongs
 *   next to the provider/model/fallback pickers because that's the
 *   "engine" mental model. Surfacing it inside the schedule step led
 *   to confusing behavior (toggle was hidden in the default Smart
 *   schedule mode).
 *
 * Surfaces NOT touched by this component (still use <ProviderToggle>):
 *   - GeneratePostPage (one-off post generation)
 *   - StepObjective / SimpleStepStrategy (suggest-strategy preamble)
 *   These have different ergonomics — they're modal-style pickers
 *   where the wide button group pulls double duty as a primary CTA.
 */

import { FC, useMemo, useState } from "react";
import { __ } from "@wordpress/i18n";
import { AlertTriangle, Image as ImageIcon, Lock, Sparkles, Type, Zap } from "lucide-react";
import { Select, Switch, Tooltip, cn } from "@structura/ui";
import { isManagedPlan, type PlanId } from "@structura/types";

import { useAiSettingsQuery } from "@/features/ai-engine";
import { useAvailableModelsQuery } from "@/features/ai-engine/api/useAvailableModelsQuery";
import { maybeGetModelWarning } from "@/features/ai-engine/helpers";
import { useDefaultProviders, useLicense } from "@/features/settings";
import { useCampaignForm } from "@/features/campaigns/context/CampaignContext";
import { AIProvider } from "@/features/campaigns/types";
import { getProviderVisual } from "@/features/campaigns/constants";

/** Text-only providers cannot be selected as image providers or image fallbacks. */
const TEXT_ONLY_PROVIDERS: AIProvider[] = ["anthropic"];

// ─── Compact label cell ──────────────────────────────────────────────────────

const CapabilityLabel: FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <div className="flex items-center gap-2 sm:min-w-[72px]">
    {icon}
    <span className="text-[9px] font-black tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
      {title}
    </span>
  </div>
);

// ─── Pre-generation strip (BYOK switch / managed banner) ─────────────────────

const PregenerationStrip: FC<{ enabled: boolean; onChange: (next: boolean) => void }> = ({
  enabled,
  onChange,
}) => {
  const { plan, isPaidLicense } = useLicense();
  const isManaged = isManagedPlan(plan as PlanId);

  if (isManaged) {
    return (
      <div className="border-brand-200 bg-brand-50/50 dark:border-brand-800 dark:bg-brand-950/30 flex items-start gap-3 rounded-xl border px-3 py-2.5">
        <div className="from-brand-500 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br to-purple-500 shadow-sm">
          <Sparkles size={13} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-brand-700 dark:text-brand-300 m-0! text-xs font-bold">
            {__("Instant publishes are on", "structura")}
          </p>
          <p className="text-brand-600/80 dark:text-brand-400/80 m-0! mt-0.5 text-[11px] leading-snug">
            {__(
              "Your scheduled posts are pre-generated so they publish instantly. Run Now still generates fresh on demand for one-off posts.",
              "structura",
            )}
          </p>
        </div>
      </div>
    );
  }

  // Free tier: pre-generation is Pro-only. The cloud's stock manager
  // requires a populated keyword bank (also Pro-locked) — without it
  // every refill skips with `keyword_bank_empty`, leaving the toggle
  // on but the chip silently absent. Surface a locked state with a
  // clear "Pro feature" cue so Free users see what they're missing
  // and don't enable a no-op toggle. Pro/BYOK still get the live
  // toggle below.
  if (!isPaidLicense) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/40 px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-900/40">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
          <Lock size={12} className="text-neutral-400 dark:text-neutral-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="m-0! text-xs font-bold text-neutral-600 dark:text-neutral-300">
              {__("Pre-generate posts ahead of schedule", "structura")}
            </p>
            <span className="from-brand-500 inline-flex items-center gap-1 rounded-full bg-gradient-to-r to-purple-500 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white uppercase">
              <Sparkles size={9} />
              {__("Pro", "structura")}
            </span>
          </div>
          <p className="m-0! mt-0.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
            {__(
              "Upgrade to Pro to pre-generate scheduled posts ahead of time. Scheduled posts publish in under a second instead of waiting on AI synthesis.",
              "structura",
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="bg-brand-50 dark:bg-brand-950/40 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
        <Zap size={13} className="text-brand-600 dark:text-brand-400" />
      </div>
      <Switch
        className="flex-1"
        label={__("Pre-generate posts ahead of schedule", "structura")}
        description={__(
          "Save up to 50% on AI costs and publish in under a second. Scheduled posts are written ahead of time; Run Now still generates fresh on demand.",
          "structura",
        )}
        checked={enabled}
        onChange={onChange}
      />
    </div>
  );
};

// ─── Provider option helpers ────────────────────────────────────────────────

const buildProviderOptions = (providers: AIProvider[]) =>
  providers.map((p) => ({
    value: p,
    label: getProviderVisual(p).label,
  }));

// ─── Capability row ─────────────────────────────────────────────────────────

interface CapabilityRowProps {
  capability: "text" | "image";
  /** Currently selected primary provider for this capability. */
  primary: AIProvider;
  onPrimaryChange: (next: AIProvider) => void;
  /** Currently selected fallback (or null = disabled). */
  fallback: AIProvider | null;
  onFallbackChange: (next: AIProvider | null) => void;
  /** Currently selected model id (BYOK only — empty for managed). */
  model: string;
  onModelChange: (next: string) => void;
  /** Providers available as primary picks. */
  primaryCandidates: AIProvider[];
  /** Providers eligible to act as fallback (subset of primaryCandidates). */
  fallbackCandidates: AIProvider[];
  /** Whether to render the model selector (false for managed/Cloud). */
  showModelSelector: boolean;
  /** Whether the user can select a fallback at all (Free → locked). */
  fallbackLocked: boolean;
  /** When fallbackLocked is true, the tooltip shown on the lock icon. */
  fallbackLockedReason?: string;
  /** Eligibility check per fallback candidate (Pro BYOK gates). */
  isFallbackEligible: (p: AIProvider) => boolean;
  /** Filtered models for the chosen primary (BYOK only). */
  modelOptions: { id: string; name: string }[];
  /** Lookup table for warning copy on model items. */
  allModels: { id: string; name: string; provider: string }[];
  /** Whether the primary provider is incomplete (no key / no model). */
  primaryIncomplete: boolean;
  /**
   * Campaign-level conflict notice, rendered as an inline amber warning
   * below the row. Distinct from `primaryIncomplete` (which reflects the
   * AI-Engine *settings*-level provider config): this one reflects this
   * campaign's own form state — e.g. image generation is switched on but
   * no image model is selected. Undefined renders nothing.
   */
  conflictWarning?: string;
}

const CapabilityRow: FC<CapabilityRowProps> = ({
  capability,
  primary,
  onPrimaryChange,
  fallback,
  onFallbackChange,
  model,
  onModelChange,
  primaryCandidates,
  fallbackCandidates,
  showModelSelector,
  fallbackLocked,
  fallbackLockedReason,
  isFallbackEligible,
  modelOptions,
  allModels,
  primaryIncomplete,
  conflictWarning,
}) => {
  const icon =
    capability === "text" ? (
      <Type size={12} className="text-blue-500" />
    ) : (
      <ImageIcon size={12} className="text-purple-500" />
    );
  const title = capability === "text" ? __("Text", "structura") : __("Image", "structura");

  // Fallback dropdown options: a synthetic "none" entry + every
  // *eligible* fallback candidate. Same-as-primary and ineligible
  // candidates (no key / no model on Pro BYOK) are filtered out
  // entirely. The legacy FallbackProviderRow showed them disabled
  // with a tooltip-explained reason, but in a dropdown that pattern
  // is awkward — fewer items, all valid, reads cleaner. Users still
  // learn the "why" via the AI Engine settings page (where the
  // missing key/model would be configured).
  const fallbackOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [
      { value: "__none__", label: __("None", "structura") },
    ];
    for (const candidate of fallbackCandidates) {
      if (candidate === primary) continue;
      if (!isFallbackEligible(candidate)) continue;
      opts.push({
        value: candidate,
        label: getProviderVisual(candidate).label,
      });
    }
    return opts;
  }, [fallbackCandidates, primary, isFallbackEligible]);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CapabilityLabel icon={icon} title={title} />

        {/* Primary provider — collapses to a static label when only one
            candidate is available so BYOK users with a single connected
            provider don't get a dropdown that does nothing. */}
        <div className="flex min-w-[150px] flex-1 items-center gap-2">
          <span className="text-[9px] font-bold tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
            {__("Provider", "structura")}
          </span>
          {primaryCandidates.length <= 1 ? (
            <span className="flex flex-1 items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50/60 px-3 py-1.5 text-[11px] font-medium text-neutral-700 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-300">
              {getProviderVisual(primary).label}
            </span>
          ) : (
            <Select
              className="flex-1"
              size="sm"
              options={buildProviderOptions(primaryCandidates)}
              value={primary}
              onValueChange={(v) => onPrimaryChange(v as AIProvider)}
            >
              <Select.Trigger />
              <Select.Content className="w-(--button-width)">
                {primaryCandidates.map((p) => (
                  <Select.Item key={p} value={p}>
                    {getProviderVisual(p).label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          )}
        </div>

        {/* Model (BYOK only) */}
        {showModelSelector && (
          <div className="flex min-w-[180px] flex-1 items-center gap-2">
            <span className="text-[9px] font-bold tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
              {__("Model", "structura")}
            </span>
            <Select
              className="flex-1"
              size="sm"
              options={modelOptions.map((m) => ({ value: m.id, label: m.name }))}
              value={model}
              onValueChange={(v) => onModelChange(v as string)}
            >
              <Select.Trigger placeholder={__("Select model...", "structura")} />
              <Select.Content className="w-(--button-width)">
                {modelOptions.map((m) => (
                  <Select.Item
                    key={m.id}
                    value={m.id}
                    description={maybeGetModelWarning({ model: m.id, models: allModels })}
                  >
                    {m.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        )}

        {/* Fallback */}
        <div className="flex min-w-[150px] flex-1 items-center gap-2">
          <span className="text-[9px] font-bold tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
            {__("Fallback", "structura")}
          </span>
          {fallbackLocked ? (
            <Tooltip
              title={fallbackLockedReason ?? __("Upgrade to Pro to unlock provider fallback.", "structura")}
              position="top"
            >
              <span className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50/60 px-3 py-1.5 text-[11px] font-medium text-neutral-400 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-500">
                <span className="flex items-center gap-1.5">
                  <Lock size={10} />
                  {__("Pro", "structura")}
                </span>
              </span>
            </Tooltip>
          ) : (
            <Select
              className="flex-1"
              size="sm"
              options={fallbackOptions.map((o) => ({ value: o.value, label: o.label }))}
              value={fallback ?? "__none__"}
              onValueChange={(v) => {
                const val = v as string;
                onFallbackChange(val === "__none__" ? null : (val as AIProvider));
              }}
            >
              <Select.Trigger />
              <Select.Content className="w-(--button-width)">
                {fallbackOptions.map((o) => (
                  <Select.Item key={o.value} value={o.value}>
                    {o.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          )}
        </div>
      </div>

      {primaryIncomplete && (
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
          <AlertTriangle size={11} />
          {__("Model not selected — complete setup in AI Engine settings", "structura")}
        </div>
      )}

      {conflictWarning && (
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
          <AlertTriangle size={11} />
          {conflictWarning}
        </div>
      )}
    </div>
  );
};

// ─── Section root ───────────────────────────────────────────────────────────

export interface CampaignAiEngineSectionProps {
  /** Providers eligible as primary text choices. */
  availableTextProviders: AIProvider[];
  /** Providers eligible as primary image choices. */
  availableImageProviders: AIProvider[];
}

export const CampaignAiEngineSection: FC<CampaignAiEngineSectionProps> = ({
  availableTextProviders,
  availableImageProviders,
}) => {
  const { formData, updateForm } = useCampaignForm();
  const { isCloud, isProviderIncomplete } = useDefaultProviders();
  const { isLicensed } = useLicense();
  const { data: availableModels } = useAvailableModelsQuery();
  const { data: ai } = useAiSettingsQuery();

  const showModelSelector = !isCloud;
  const isFree = !isLicensed;

  const intelligence = formData.intelligence;
  const schedule = formData.schedule;
  const structure = formData.structure;

  // Empty model fields are backfilled at the form-provider level
  // (`useModelBackfill` in CampaignContext.tsx) — NOT here. This
  // component sits inside the collapsed Advanced Settings group, so a
  // mount effect only fired for users who expanded it; everyone else
  // persisted `textModel: ""` and leaned on the cloud's silent fallback
  // (engine.ts "[engine] Empty textModel on campaign", 2026-06-04).

  const filteredTextModels = useMemo(
    () => availableModels?.text?.filter((m) => m.provider === intelligence.textProvider) ?? [],
    [availableModels, intelligence.textProvider],
  );
  const filteredImageModels = useMemo(
    () => availableModels?.image?.filter((m) => m.provider === intelligence.imageProvider) ?? [],
    [availableModels, intelligence.imageProvider],
  );
  const allModels = useMemo(
    () => [...(availableModels?.text ?? []), ...(availableModels?.image ?? [])],
    [availableModels],
  );

  // Fallback eligibility — see FallbackProviderRow for the full
  // rationale. Short version: Cloud has master keys so any other
  // provider is fine; Pro BYOK requires the candidate to be connected
  // and to have a model selected for this capability; Free is locked
  // entirely.
  const isFallbackEligibleFor = (capability: "text" | "image") => (p: AIProvider) => {
    const primary =
      capability === "text" ? intelligence.textProvider : intelligence.imageProvider;
    if (p === primary) return false;
    if (isFree) return false;
    if (isCloud) return true;
    const info = ai?.providers?.[p];
    if (!info?.connected) return false;
    return capability === "text" ? !!info.text_model : !!info.image_model;
  };

  // Fallback candidate pools mirror the primary candidate pools, minus
  // text-only providers from the image row.
  const textFallbackCandidates = availableTextProviders;
  const imageFallbackCandidates = availableImageProviders.filter(
    (p) => !TEXT_ONLY_PROVIDERS.includes(p),
  );

  // Campaign-level conflict: image generation is switched on but this
  // campaign carries no image model. BYOK only — `showModelSelector` is
  // `!isCloud`, and managed runs resolve an empty model server-side from
  // curated per-plan defaults, so it's never a user-actionable gap there.
  // The cloud now backfills the provider's default image model rather
  // than failing the run (image-resolver.ts), so this is advisory: we
  // surface it so the user picks the model they actually want instead of
  // silently inheriting the default.
  const imageGenEnabled = structure.featuredImage || structure.bodyImages;
  const imageGenWithoutModel =
    showModelSelector && imageGenEnabled && !intelligence.imageModel;

  return (
    <div className="space-y-3">
      {/* Pre-generation — BYOK switch or managed banner */}
      <PregenerationStrip
        enabled={schedule.pregenerationEnabled ?? true}
        onChange={(next) => updateForm("schedule", { pregenerationEnabled: next })}
      />

      {/* Text capability row */}
      <CapabilityRow
        capability="text"
        primary={intelligence.textProvider}
        onPrimaryChange={(p) =>
          updateForm("intelligence", { textProvider: p, textModel: "" })
        }
        fallback={intelligence.fallbackTextProvider ?? null}
        onFallbackChange={(p) => updateForm("intelligence", { fallbackTextProvider: p })}
        model={intelligence.textModel}
        onModelChange={(v) => updateForm("intelligence", { textModel: v })}
        primaryCandidates={availableTextProviders}
        fallbackCandidates={textFallbackCandidates}
        showModelSelector={showModelSelector}
        fallbackLocked={isFree}
        fallbackLockedReason={__("Upgrade to Pro to unlock provider fallback.", "structura")}
        isFallbackEligible={isFallbackEligibleFor("text")}
        modelOptions={filteredTextModels}
        allModels={allModels}
        primaryIncomplete={isProviderIncomplete(intelligence.textProvider)}
      />

      {/* Image capability row — only for licensed users (Free has no
          image gen at all). */}
      {availableImageProviders.length > 0 && isLicensed && (
        <CapabilityRow
          capability="image"
          primary={intelligence.imageProvider}
          onPrimaryChange={(p) =>
            updateForm("intelligence", { imageProvider: p, imageModel: "" })
          }
          fallback={intelligence.fallbackImageProvider ?? null}
          onFallbackChange={(p) => updateForm("intelligence", { fallbackImageProvider: p })}
          model={intelligence.imageModel}
          onModelChange={(v) => updateForm("intelligence", { imageModel: v })}
          primaryCandidates={availableImageProviders}
          fallbackCandidates={imageFallbackCandidates}
          showModelSelector={showModelSelector}
          fallbackLocked={false}
          isFallbackEligible={isFallbackEligibleFor("image")}
          modelOptions={filteredImageModels}
          allModels={allModels}
          primaryIncomplete={isProviderIncomplete(intelligence.imageProvider)}
          conflictWarning={
            imageGenWithoutModel
              ? __(
                  "Image generation is on but no image model is selected — pick one above, or we'll fall back to your provider's default.",
                  "structura",
                )
              : undefined
          }
        />
      )}

      {/* Footnote — fallback semantics (one line, replaces the two
          paragraphs that used to live under each FallbackProviderRow). */}
      {!isFree && (
        <p className="m-0! px-1 text-[10px] leading-snug text-neutral-400 dark:text-neutral-500">
          {__(
            "If the primary provider is temporarily unavailable (rate-limit, timeout, or 5xx), we'll retry once through the fallback before failing the run.",
            "structura",
          )}
        </p>
      )}
    </div>
  );
};
