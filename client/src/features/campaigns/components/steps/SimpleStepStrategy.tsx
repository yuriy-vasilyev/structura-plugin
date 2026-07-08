import { __ } from "@wordpress/i18n";
import { useMemo } from "react";
import { BookOpen, Globe2, Loader2, Target, TrendingUp, UserCheck, Zap } from "lucide-react";

import { useCampaignForm } from "@/features/campaigns/context/CampaignContext";
import { usePersonasQuery } from "@/features/personas";
import { useDefaultProviders, useLicense } from "@/features/settings";

import { Card, InputField, Select, TextArea, cn } from "@structura/ui";
import { AIProvider, CampaignMode } from "@/features/campaigns/types";
import { ProviderToggle } from "../ProviderToggle";
import { useMagicSuggest } from "@/hooks/useMagicSuggest";
import { MagicSuggestButton } from "@/features/campaigns/components/MagicSuggestButton";

const CAMPAIGN_MODES: {
  value: CampaignMode;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  {
    value: "traffic_magnet",
    label: __("Traffic Magnet", "structura"),
    description: __("Broad informational content for high search volume.", "structura"),
    icon: Globe2,
  },
  {
    value: "quick_wins",
    label: __("Quick Wins", "structura"),
    description: __("Low-competition topics you can rank for fast.", "structura"),
    icon: Zap,
  },
  {
    value: "conversion",
    label: __("Conversion", "structura"),
    description: __("Bottom-of-funnel content that turns readers into customers.", "structura"),
    icon: TrendingUp,
  },
  {
    value: "authority",
    label: __("Authority", "structura"),
    description: __("Expert-level writing that builds topical trust.", "structura"),
    icon: BookOpen,
  },
];

/**
 * Simple Mode — Step 1: Strategy
 *
 * A streamlined version of StepObjective that focuses on the essential decisions:
 * - Campaign name & objective (with AI suggestion)
 * - Campaign mode
 * - Provider selection (with model selectors for non-Cloud users)
 * - Persona assignment
 */
export const SimpleStepStrategy = () => {
  const { formData, updateForm, mode } = useCampaignForm();
  const { data: personas = [], isLoading: loadingPersonas } = usePersonasQuery();
  const { plan } = useLicense();
  const { suggest, isSuggesting: isStrategizing } = useMagicSuggest();
  const { availableProviders, availableImageProviders, isFullyConfigured, isCloud } = useDefaultProviders();
  const isSingle = mode === "single";

  // Cloud auto-detects homepage + landing pages from site_identity
  // (since 2026-04-28); empty context here is intentional. The
  // user-pasted repeater stays in VisualsPage where the logo and
  // brand-guidelines URLs aren't auto-detectable.
  const generateStrategy = async (provider: AIProvider) => {
    const data = await suggest("campaign", {
      provider,
      context: [],
    });

    if (data?.name && data?.strategy) {
      const update: Parameters<typeof updateForm<"identity">>[1] = {
        name: data.name,
        objective: data.strategy,
      };

      const validModes: CampaignMode[] = ["traffic_magnet", "quick_wins", "conversion", "authority"];
      if (data.campaign_mode && validModes.includes(data.campaign_mode as CampaignMode)) {
        update.campaignMode = data.campaign_mode as CampaignMode;
      }

      updateForm("identity", update);
    }
  };

  const personaOptions = useMemo(
    () => [
      { value: "random", label: __("Random persona", "structura") },
      // 2026-05-01 — `String(p.id)` normalises legacy numeric ids
      // and cloud nanoids into one option-value shape so the form's
      // `String(personaId)` value round-trips through `<Select>`'s
      // strict-equality option-find regardless of source.
      ...personas.map((p) => ({ value: String(p.id), label: p.name })),
    ],
    [personas]
  );

  return (
    <div className="animate-in slide-in-from-right-4 space-y-6 duration-normal">
      {/* AI STRATEGY SUGGESTION */}
      <MagicSuggestButton
        isLoading={isStrategizing}
        onTrigger={(provider) => generateStrategy(provider)}
        ctaLabel={
          isSingle
            ? __("Generate Post Strategy", "structura")
            : __("Generate Campaign Strategy", "structura")
        }
        subLabel={__(
          "We'll study your site and craft a targeted strategy.",
          "structura",
        )}
      />

      {/* NAME + OBJECTIVE */}
      <div className="grid grid-cols-1 gap-4">
        {!isSingle && (
          <InputField
            label={__("Campaign Name", "structura")}
            placeholder={__("e.g. Winter 2026 SEO Push", "structura")}
            value={formData.identity.name}
            onChange={(e) => updateForm("identity", { name: e.target.value })}
          />
        )}

        <TextArea
          label={isSingle ? __("Post Objective", "structura") : __("Deep Objective", "structura")}
          placeholder={__("Describe the overarching goal...", "structura")}
          value={formData.identity.objective}
          onChange={(e) => updateForm("identity", { objective: e.target.value })}
          rows={4}
        />
      </div>

      {/* CAMPAIGN MODE */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Target size={13} className="text-neutral-400" />
          <span className="text-[10px] font-black tracking-widest text-neutral-400 uppercase">
            {isSingle ? __("Content Goal", "structura") : __("Campaign Mode", "structura")}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {CAMPAIGN_MODES.map((m) => {
            const Icon = m.icon;
            const isSelected = formData.identity.campaignMode === m.value;

            return (
              <button
                key={m.value}
                type="button"
                onClick={() => updateForm("identity", { campaignMode: m.value })}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-all duration-fast",
                  isSelected
                    ? "border-brand-300 bg-brand-50/70 ring-1 ring-brand-200 dark:border-brand-700 dark:bg-brand-950/70 dark:ring-brand-800"
                    : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
                )}
              >
                <Icon
                  size={13}
                  className={isSelected ? "text-brand-500" : "text-neutral-400"}
                />
                <div>
                  <span
                    className={cn(
                      "text-[10px] font-black tracking-widest uppercase",
                      isSelected ? "text-brand-700 dark:text-brand-300" : "text-neutral-500 dark:text-neutral-400"
                    )}
                  >
                    {m.label}
                  </span>
                  <p
                    className={cn(
                      "m-0! text-[10px] leading-snug",
                      isSelected ? "text-brand-600/70 dark:text-brand-300/70" : "text-neutral-400 dark:text-neutral-500"
                    )}
                  >
                    {m.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* PROVIDER + ENGINE (shown inline when not fully configured) */}
      {!isFullyConfigured && availableProviders.length > 0 && (
        <Card className="overflow-hidden border-neutral-200 p-0!">
          <ProviderToggle
            textProvider={formData.intelligence.textProvider}
            imageProvider={formData.intelligence.imageProvider}
            onTextProviderChange={(p) =>
              updateForm("intelligence", { textProvider: p, textModel: "" })
            }
            onImageProviderChange={(p) =>
              updateForm("intelligence", { imageProvider: p, imageModel: "" })
            }
            availableTextProviders={availableProviders}
            availableImageProviders={availableImageProviders}
            showModelSelectors={!isCloud}
            textModel={formData.intelligence.textModel}
            imageModel={formData.intelligence.imageModel}
            onTextModelChange={(val) => updateForm("intelligence", { textModel: val })}
            onImageModelChange={(val) => updateForm("intelligence", { imageModel: val })}
          />
        </Card>
      )}

      {/* PERSONA */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <UserCheck size={13} className="text-neutral-400" />
          <span className="text-[10px] font-black tracking-widest text-neutral-400 uppercase">
            {__("Persona", "structura")}
          </span>
        </div>
        {loadingPersonas ? (
          <div className="flex h-10 items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50">
            <Loader2 className="mr-2 size-3 animate-spin text-neutral-400" />
            <span className="text-[10px] font-bold text-neutral-400 uppercase">
              {__("Syncing...", "structura")}
            </span>
          </div>
        ) : (
          <Select
            // 2026-05-01 — keep persona ids as strings; cloud personas
            // use nanoids and `Number()` produces `NaN` which breaks
            // `<Select>` round-tripping (placeholder shows after every
            // click).
            value={
              formData.intelligence.personaId === "random"
                ? "random"
                : String(formData.intelligence.personaId)
            }
            onValueChange={(val) =>
              updateForm("intelligence", {
                personaId: val === "random" ? "random" : String(val),
              })
            }
            options={personaOptions}
          >
            <Select.Trigger placeholder={__("Choose a Persona...", "structura")} />
            <Select.Content className="w-(--button-width)">
              {personaOptions.map((opt) => (
                <Select.Item key={opt.value} value={opt.value}>
                  {opt.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        )}
      </div>
    </div>
  );
};
