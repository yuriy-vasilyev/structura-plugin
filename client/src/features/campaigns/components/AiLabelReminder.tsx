import { FC } from "react";
import { __ } from "@wordpress/i18n";
import { Alert, Button, shouldShowAiLabelReminder } from "@structura/ui";
import { ArrowRight, Camera, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router";

import { useVisualPresetsQuery } from "@/features/settings/api/useVisualPresets";
import { useSiteContentLanguage } from "@/features/campaigns/components/CampaignLanguageField";
import { docsUrl } from "@/utils/docsUrl";

/**
 * Reminder that photo-style images may need the EU AI label
 * (specs/ai-image-label.md §7). Non-blocking and not dismissible: there is
 * no per-campaign persistence, so it disappears as soon as any condition
 * stops holding (images off, another medium, a non-EU language, or the
 * label turned on in Visuals). The decision is `shouldShowAiLabelReminder`.
 *
 * Self-contained like {@link VisualStyleFallbackNotice}: it reads the bound
 * preset and the site language itself; the caller passes the form's image
 * state and campaign language (`"default"` follows the site).
 */
export const AiLabelReminder: FC<{ imagesEnabled: boolean; language: string }> = ({
  imagesEnabled,
  language,
}) => {
  const navigate = useNavigate();
  const { data } = useVisualPresetsQuery();
  const siteLanguage = useSiteContentLanguage();
  const bound = data?.presets?.find((p) => p.presetId === data.boundPresetId) ?? null;

  const show = shouldShowAiLabelReminder({
    imagesEnabled,
    presetsLoaded: !!data,
    preset: bound,
    language,
    siteLanguage,
  });
  if (!show) return null;

  return (
    <Alert variant="info" className="mt-4!">
      <Camera />
      <Alert.Title>{__("Photo-style images may need an AI label", "structura")}</Alert.Title>
      <Alert.Description>
        {__(
          "EU rules ask publishers to mark realistic AI-generated images. The AI label is off for this site.",
          "structura"
        )}
      </Alert.Description>
      <Alert.Action className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button size="sm" variant="secondary" onClick={() => navigate("/visuals")}>
          {__("Turn it on in Visuals", "structura")}
          <ArrowRight size={14} className="ml-2" strokeWidth={2} />
        </Button>
        <a
          href={docsUrl("using/generated-posts/visuals#ai-label")}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs"
        >
          {__("Learn more", "structura")}
          <ExternalLink className="h-3 w-3" />
        </a>
      </Alert.Action>
    </Alert>
  );
};
