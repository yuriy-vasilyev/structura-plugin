import { FC } from "react";
import { __ } from "@wordpress/i18n";
import { Alert, Button } from "@structura/ui";
import { ArrowRight, KeyRound } from "lucide-react";
import { useNavigate } from "react-router";

/**
 * The warning beside every image control on a site that can draw no images
 * (`useDefaultProviders().noImageProvider`), with the way to AI Engine. The
 * caller renders it only then.
 */
export const NoImageProviderNotice: FC<{ className?: string }> = ({ className }) => {
  const navigate = useNavigate();

  return (
    <Alert variant="warning" role="status" className={className}>
      <KeyRound />
      <Alert.Title>{__("No images on this site yet", "structura")}</Alert.Title>
      <Alert.Description>
        {__(
          "Images are drawn with your own OpenAI or Gemini key, and this site has neither connected. Posts are published without images until you connect one.",
          "structura"
        )}
      </Alert.Description>
      <Alert.Action>
        <Button size="sm" variant="secondary" onClick={() => navigate("/ai-engine")}>
          {__("Connect a key", "structura")}
          <ArrowRight size={14} className="ml-2" strokeWidth={2} />
        </Button>
      </Alert.Action>
    </Alert>
  );
};
