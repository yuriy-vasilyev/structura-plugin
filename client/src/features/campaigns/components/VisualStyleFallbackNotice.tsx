import { FC } from "react";
import { __ } from "@wordpress/i18n";
import { Alert, Button } from "@structura/ui";
import { ArrowRight, Palette } from "lucide-react";
import { useNavigate } from "react-router";

import { useVisualPresetsQuery } from "@/features/settings/api/useVisualPresets";

/**
 * Non-blocking heads-up shown when image generation is enabled on a form
 * but the site has no visual style (art-direction preset) bound.
 *
 * Images still generate — the cloud falls back to a generic house style
 * (`DEFAULT_ART_DIRECTION`) — so this is an awareness nudge, not a
 * blocker (2026-07-09). It replaces the old "bind a preset before
 * generating images" hard block: a site installed at the "none" tier
 * skips the Visuals onboarding step, so after upgrading it can have
 * images enabled with nothing bound and would otherwise be stuck.
 *
 * Self-contained: it reads the preset binding itself; the caller only
 * tells it whether images are currently enabled on the form. Renders
 * nothing when images are off, while the binding is loading, or when a
 * style IS configured (the `useVisualPresetsQuery` gate means `none`-tier
 * installs — which can't enable images anyway — never fetch).
 */
export const VisualStyleFallbackNotice: FC<{ imagesEnabled: boolean }> = ({
  imagesEnabled,
}) => {
  const navigate = useNavigate();
  const { data, isLoading } = useVisualPresetsQuery();

  if (!imagesEnabled || isLoading) return null;
  // A visual style is bound — nothing to nudge about.
  if (data?.boundPresetId != null) return null;

  return (
    <Alert variant="info">
      <Palette />
      <Alert.Title>
        {__("Images will use a generic style", "structura")}
      </Alert.Title>
      <Alert.Description>
        {__(
          "No visual style is set for this site, so generated images use a neutral default look. Set your brand's art direction in Visuals for on-brand images.",
          "structura",
        )}
      </Alert.Description>
      <Alert.Action>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => navigate("/visuals")}
        >
          {__("Set visual style", "structura")}
          <ArrowRight size={14} className="ml-2" strokeWidth={2} />
        </Button>
      </Alert.Action>
    </Alert>
  );
};
