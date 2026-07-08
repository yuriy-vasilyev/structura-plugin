import { __ } from "@wordpress/i18n";
import { FileStack, Image as ImageIcon, Languages, Layout, Rocket, Scale } from "lucide-react";
import { useCampaignForm } from "@/features/campaigns/context/CampaignContext";
import { useLicense } from "@/features/settings/api/useLicense";
import { CONTENT_BLOCKS } from "@/features/settings/constants";

// UI Components
import { Card, InputField, ReferralLinksEditor, Select, Switch, TextArea } from "@structura/ui";
import { useRef } from "react";
import { SelectionCard } from "@/components/Shared/SelectionCard";
import { LANGUAGES } from "@/data/languages";
import { SUPPORTED_BLOCK_TYPE } from "@/features/settings";
import { buildReferralLabels } from "@/utils/referralLabels";

export const StepArchitecture = () => {
  const { formData, updateForm } = useCampaignForm();
  const { isPaidLicense, isLicensed } = useLicense();
  // Disable image generation when the uploads dir isn't writable —
  // images would silently never save. Same probe as the cross-wp-admin
  // banner (Image_Uploads_Unwritable_Notice); false on older plugins.
  const uploadsUnwritable = !!window.structuraConfig?.uploads_unwritable;

  const { intelligence, structure } = formData;

  // Referral-links section: lets the FTC nudge scroll back to the disclosure
  // card above (same step). Labels shared with the site + onboarding surfaces.
  const disclosureRef = useRef<HTMLDivElement>(null);
  const referralLabels = buildReferralLabels();

  const toggleBlock = (blockName: SUPPORTED_BLOCK_TYPE) => {
    const current = structure.enabledBlocks || [];
    const newBlocks = current.includes(blockName)
      ? current.filter((b) => b !== blockName)
      : [...current, blockName];

    updateForm("structure", { enabledBlocks: newBlocks as SUPPORTED_BLOCK_TYPE[] });
  };

  return (
    <div className="animate-in slide-in-from-right-4 space-y-8 duration-normal">
      {/* SECTION 1: LINGUISTICS & MAGNITUDE */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="space-y-4">
          <div className="flex items-center gap-3 text-brand-600 dark:text-brand-400">
            <Languages size={18} />
            <h4 className="m-0! text-[10px] font-black tracking-widest text-neutral-400 uppercase">
              {__("Output Language", "structura")}
            </h4>
          </div>
          <Select
            value={intelligence.language}
            onValueChange={(val) => updateForm("intelligence", { language: val as string })}
            options={[{ value: "default", label: __("System Default", "structura") }, ...LANGUAGES]}
          >
            <Select.Label hidden>{__("Content Language", "structura")}</Select.Label>
            <Select.Trigger placeholder={__("Select language...", "structura")} />
            <Select.Content className="w-(--button-width)">
              {[{ value: "default", label: __("System Default", "structura") }, ...LANGUAGES].map(
                (l) => (
                  <Select.Item key={l.value} value={l.value}>
                    {l.label}
                  </Select.Item>
                )
              )}
            </Select.Content>
          </Select>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center gap-3 text-brand-600 dark:text-brand-400">
            <FileStack size={18} />
            <h4 className="m-0! text-[10px] font-black tracking-widest text-neutral-400 uppercase">
              {__("Post Length", "structura")}
            </h4>
          </div>
          {/*
            Non-paid tiers (Free + anonymous None) have a 500-word
            server-side clamp in `functions/src/ai/instruction-builder.ts`.
            Surface the ceiling in the input so the user sees the cap
            instead of typing 2700 and silently receiving ~500. Paid
            tiers pick their own length (default 2700).
          */}
          <InputField
            label={__("Target Word Count", "structura")}
            hiddenLabel
            type="number"
            value={intelligence.postLength}
            max={!isPaidLicense ? 500 : undefined}
            onChange={(e) => {
              const parsed = parseInt(e.target.value);
              const next = Number.isFinite(parsed) ? parsed : 0;
              updateForm("intelligence", {
                postLength: !isPaidLicense ? Math.min(next, 500) : next,
              });
            }}
            rightAdornment={
              <span className="text-[10px] font-bold text-neutral-400 uppercase">
                {__("Words", "structura")}
              </span>
            }
          />
          {!isPaidLicense && (
            <p className="m-0! mt-1.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
              {__(
                "Free and anonymous installs are capped at 500 words per post. Upgrade to Pro to publish longer posts.",
                "structura"
              )}
            </p>
          )}
        </Card>
      </div>

      {/* SECTION 2: GENERAL */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Rocket size={18} className="text-rose-600" />
          <h4 className="m-0! text-[10px] font-black tracking-widest text-neutral-400 uppercase">
            {__("General Improvements", "structura")}
          </h4>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectionCard<string>
            id="replaceLongDashes"
            label={__("Replace long AI-like dashes", "structura")}
            description={__(
              "Normalize AI dashes (like—this) to standard format (like - this).",
              "structura"
            )}
            isEnabled={intelligence.replaceLongDashes}
            onToggle={() =>
              updateForm("intelligence", { replaceLongDashes: !intelligence.replaceLongDashes })
            }
          />
          <SelectionCard<string>
            id="disableEmojis"
            label={__("Disable emojis", "structura")}
            description={__(
              "Some AI models include emojis in the content. Enable this to remove them for a cleaner output.",
              "structura"
            )}
            isEnabled={intelligence.disableEmojis}
            onToggle={() =>
              updateForm("intelligence", { disableEmojis: !intelligence.disableEmojis })
            }
          />
        </div>
      </div>

      {/* SECTION 3: VISUAL COMPOSITION */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <ImageIcon size={18} className="text-emerald-600" />
          <h4 className="m-0! text-[10px] font-black tracking-widest text-neutral-400 uppercase">
            {__("Images", "structura")}
          </h4>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectionCard
            id="featuredImage"
            label={__("Generate featured image", "structura")}
            description={__("Create a relevant featured image for the post.", "structura")}
            isEnabled={structure.featuredImage}
            onToggle={() => updateForm("structure", { featuredImage: !structure.featuredImage })}
            isFree
            hasFreeAccess={isLicensed}
            disabled={uploadsUnwritable}
          />

          <SelectionCard
            id="bodyImages"
            label={__("Body image generation", "structura")}
            description={__("Identify spots and generate images in the post body.", "structura")}
            isPro
            hasProAccess={isPaidLicense}
            isEnabled={structure.bodyImages}
            onToggle={() => updateForm("structure", { bodyImages: !structure.bodyImages })}
            disabled={uploadsUnwritable}
          />
        </div>
        {uploadsUnwritable && (
          <p className="m-0! text-[11px] leading-snug text-amber-600 dark:text-amber-500">
            {__(
              "Image generation is unavailable because WordPress can't write to your uploads folder. Posts will still publish without images.",
              "structura"
            )}{" "}
            <a
              href="https://docs.structurawp.com/troubleshooting/images-not-generating"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-amber-700 dark:hover:text-amber-400"
            >
              {__("How to fix this", "structura")}
            </a>
          </p>
        )}
      </div>

      {/* SECTION 4: STRUCTURAL DNA */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Layout size={18} className="text-purple-600" />
          <h4 className="m-0! text-[10px] font-black tracking-widest text-neutral-400 uppercase">
            {__("Content Blocks", "structura")}
          </h4>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CONTENT_BLOCKS.map((block) => (
            <SelectionCard
              key={block.name}
              id={block.name}
              label={block.label}
              description={block.description}
              isFree={block.name === "core/heading"}
              hasFreeAccess={isLicensed}
              isPro={block.isPro}
              hasProAccess={isPaidLicense}
              isRequired={block.isRequired}
              isEnabled={structure.enabledBlocks.includes(block.name as SUPPORTED_BLOCK_TYPE)}
              onToggle={toggleBlock}
            />
          ))}
        </div>
      </div>

      {/* SECTION 5: DISCLOSURE */}
      <div ref={disclosureRef}>
      <Card className="border-emerald-100 bg-emerald-50/20">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3 text-emerald-600">
            <Scale size={18} />
            <h4 className="m-0! text-[10px] font-black tracking-widest text-neutral-400 uppercase">
              {__("AI Transparency Signal", "structura")}
            </h4>
          </div>
          <Switch
            label={__("Enabled", "structura")}
            checked={structure.disclosure.enabled}
            onChange={(checked) =>
              updateForm("structure", {
                disclosure: { ...structure.disclosure, enabled: checked },
              })
            }
          />
        </div>
        <TextArea
          label={__("Disclosure Notice", "structura")}
          value={structure.disclosure.text}
          onChange={(e) =>
            updateForm("structure", {
              disclosure: { ...structure.disclosure, text: e.target.value },
            })
          }
          disabled={!structure.disclosure.enabled}
          rows={2}
          className="bg-white"
        />
      </Card>
      </div>

      {/* SECTION 6: REFERRAL LINKS — paid-only; the cloud drops referral links
          from generation on free tiers, so lock the editor to match instead of
          presenting a paid feature as fully usable. */}
      <div>
        <ReferralLinksEditor
          binding="campaign"
          value={structure.referralLinks ?? []}
          onChange={(referralLinks) => updateForm("structure", { referralLinks })}
          onDisclosureClick={() =>
            disclosureRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
          }
          labels={referralLabels}
          disabled={!isPaidLicense}
        />
        {!isPaidLicense && (
          <p className="m-0! mt-1.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
            {__(
              "Referral links are a paid feature. Upgrade to Pro to weave your tracking links into relevant posts.",
              "structura",
            )}
          </p>
        )}
      </div>
    </div>
  );
};
