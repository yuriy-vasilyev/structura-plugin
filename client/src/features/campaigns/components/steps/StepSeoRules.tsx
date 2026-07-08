import { __ } from "@wordpress/i18n";
import { useCampaignForm } from "@/features/campaigns/context/CampaignContext";
import { SeoRuleName, useLicense, useSeoRules } from "@/features/settings";
import { SelectionCard } from "@/components/Shared/SelectionCard";

export const StepSeoRules = () => {
  const { formData, updateForm } = useCampaignForm();
  const { rules } = useSeoRules();
  const { isLicensed, isPaidLicense } = useLicense();

  // Extract specifically from the intelligence cluster
  const { seoRules } = formData.intelligence;

  /**
   * INTERACTION: Toggle rule
   * Updates the nested 'seoRules' within the 'intelligence' cluster
   */
  const toggleRule = (name: SeoRuleName) => {
    updateForm("intelligence", {
      seoRules: {
        ...seoRules,
        [name]: !seoRules[name as SeoRuleName],
      },
    });
  };

  if (!rules) {
    return null;
  }

  return (
    <div className="animate-in slide-in-from-right-4 space-y-6 duration-500">
      <header className="flex flex-col gap-1">
        <h3 className="m-0! text-lg font-black tracking-tight text-neutral-900 uppercase">
          {__("SEO Directives", "structura")}
        </h3>
        <p className="m-0! text-xs text-neutral-500">
          {__(
            "Configure granular intelligence rules for this roadmap. Pro rules are automatically locked for Free accounts.",
            "structura"
          )}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Object.entries(rules).map(([name, rule]) => (
          <SelectionCard
            key={name}
            id={name as SeoRuleName}
            label={rule.label}
            description={rule.description}
            isPro={["byok", "cloud"].includes(rule.plan)}
            hasProAccess={isPaidLicense}
            isFree={rule.plan === "free"}
            hasFreeAccess={isLicensed}
            isEnabled={seoRules[name as SeoRuleName]}
            onToggle={(id) => toggleRule(id as SeoRuleName)}
          />
        ))}
      </div>
    </div>
  );
};
