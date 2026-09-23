import { __ } from "@wordpress/i18n";
import { useMemo } from "react";
import { Loader2, UserCheck } from "lucide-react";

// Hooks
import { useCampaignForm } from "@/features/campaigns/context/CampaignContext";
import { useSitePersonasQuery } from "@/features/personas";
import { useDefaultProviders, useLicense } from "@/features/settings";

// UI Components
import { Card, InputField, Select, TextArea } from "@structura/ui";
import { AIProvider, CampaignMode } from "@/features/campaigns/types";
import { ProviderToggle } from "../ProviderToggle";
import { mirrorModelForTier } from "@/features/campaigns/modelTier";
import { useMagicSuggest } from "@/hooks/useMagicSuggest";
import { MagicSuggestButton } from "@/features/campaigns/components/MagicSuggestButton";

export const StepObjective = () => {
  const { formData, updateForm, mode } = useCampaignForm();

  // Site-scoped: the whole workspace library here listed every sibling
  // site's voice on a multi-site workspace (2026-09-22).
  const { data: personas, isLoading: loadingPersonas } = useSitePersonasQuery(
    formData.intelligence.personaId,
  );
  const { plan } = useLicense();
  const { availableProviders, availableImageProviders, isFullyConfigured, isCloud } = useDefaultProviders();

  const { suggest, isSuggesting: isStrategizing } = useMagicSuggest();

  // 1. Logic: Auto-suggest strategy.
  //
  // The cloud now auto-detects the homepage + key landing pages from
  // the plugin's site_identity payload (since 2026-04-28). No user-
  // pasted URLs needed — `context` is always empty here. The user-
  // pasted repeater stays in VisualsPage where logo / brand-guidelines
  // URLs genuinely can't be auto-detected.
  const generateStrategy = async (provider: AIProvider) => {
    const data = await suggest("campaign", {
      provider,
      context: [],
      language: formData.intelligence.language,
    });

    if (data?.name && data?.strategy) {
      const update: Parameters<typeof updateForm<"identity">>[1] = {
        name: data.name,
        objective: data.strategy,
      };

      // Apply the AI-recommended campaign mode only if it's a valid known value.
      const validModes: CampaignMode[] = ["traffic_magnet", "quick_wins", "conversion", "authority"];
      if (data.campaign_mode && validModes.includes(data.campaign_mode as CampaignMode)) {
        update.campaignMode = data.campaign_mode as CampaignMode;
        // A suggestion is not a decision: leaving the source "inferred" keeps
        // the cloud free to re-derive the approach as the footprint moves.
        update.campaignModeSource = "inferred";
      }

      updateForm("identity", update);
    }
  };

  // Persona formatting
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
    <div className="animate-in slide-in-from-right-4 space-y-8 duration-normal">
      {/* SECTION 1: IDENTITY & STRATEGY */}
      <div className="space-y-6">
        <MagicSuggestButton
          isLoading={isStrategizing}
          onTrigger={(provider) => generateStrategy(provider)}
          ctaLabel={
            mode === "single"
              ? __("Generate Post Strategy", "structura")
              : __("Generate Campaign Strategy", "structura")
          }
          subLabel={__(
            "We'll study your site and craft a targeted strategy.",
            "structura",
          )}
        />

        <div className="grid grid-cols-1 gap-6">
          {mode !== "single" && (
            <InputField
              label={__("Campaign Name", "structura")}
              placeholder={__("e.g. Winter 2026 SEO Push", "structura")}
              value={formData.identity.name}
              onChange={(e) => updateForm("identity", { name: e.target.value })}
            />
          )}

          <TextArea
            label={__("Deep Objective", "structura")}
            placeholder={__("Describe the overarching goal...", "structura")}
            value={formData.identity.objective}
            onChange={(e) => updateForm("identity", { objective: e.target.value })}
            rows={6}
          />
        </div>
      </div>

      {/* SECTION 3: PROVIDER + ENGINE (shown inline when not fully configured) */}
      {!isFullyConfigured && availableProviders.length > 0 && (
        <Card className="overflow-hidden border-neutral-200 p-0!">
          <ProviderToggle
            textProvider={formData.intelligence.textProvider}
            imageProvider={formData.intelligence.imageProvider}
            onTextProviderChange={(p) =>
              updateForm("intelligence", {
                textProvider: p,
                textModel:
                  mirrorModelForTier(p, "text", formData.intelligence.textTier ?? "mid") ?? "",
              })
            }
            onImageProviderChange={(p) =>
              updateForm("intelligence", {
                imageProvider: p,
                imageModel:
                  mirrorModelForTier(p, "image", formData.intelligence.imageTier ?? "mid") ?? "",
              })
            }
            availableTextProviders={availableProviders}
            availableImageProviders={availableImageProviders}
            showTierSelectors={!isCloud}
            textTier={formData.intelligence.textTier ?? "mid"}
            imageTier={formData.intelligence.imageTier ?? "mid"}
            onTextTierChange={(t) =>
              updateForm("intelligence", {
                textTier: t,
                textModel:
                  mirrorModelForTier(formData.intelligence.textProvider, "text", t) ?? "",
              })
            }
            onImageTierChange={(t) =>
              updateForm("intelligence", {
                imageTier: t,
                imageModel:
                  mirrorModelForTier(formData.intelligence.imageProvider, "image", t) ?? "",
              })
            }
          />
        </Card>
      )}

      {/* SECTION 4: PERSONA */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <UserCheck size={14} className="text-neutral-400" />
          <span className="text-[10px] font-black tracking-widest text-neutral-400 uppercase">
            {__("Assigned Persona", "structura")}
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
