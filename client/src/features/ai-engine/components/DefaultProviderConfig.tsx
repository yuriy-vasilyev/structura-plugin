import { __ } from "@wordpress/i18n";
import { Type, Image, Settings2 } from "lucide-react";
import { Select, cn } from "@structura/ui";
import { useUpdateAiSettings } from "../api/useUpdateAiSettings";

interface ProviderOption {
  id: string;
  name: string;
  connected: boolean;
}

interface DefaultProviderConfigProps {
  /** Current default text provider ID. */
  defaultTextProvider: string;
  /** Current default image provider ID. */
  defaultImageProvider: string;
  /** Providers that support text (connected only). */
  textProviders: ProviderOption[];
  /** Providers that support image (connected only). */
  imageProviders: ProviderOption[];
}

/**
 * Lets the user choose which connected provider to use by default
 * for new campaigns (text generation and image generation).
 * Per-campaign overrides are still available in the campaign wizard.
 */
export const DefaultProviderConfig = ({
  defaultTextProvider,
  defaultImageProvider,
  textProviders,
  imageProviders,
}: DefaultProviderConfigProps) => {
  const { mutate: updateSettings } = useUpdateAiSettings();

  const handleDefaultChange = (field: "text_provider" | "image_provider", value: string) => {
    updateSettings({ ai: { defaults: { [field]: value } } });
  };

  // Don't render if no connected providers at all
  if (textProviders.length === 0 && imageProviders.length === 0) return null;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <div className="mb-5 flex items-center gap-2">
        <Settings2 size={15} className="text-neutral-400" />
        <h3 className="m-0! text-[11px] font-black tracking-widest text-neutral-500 uppercase">
          {__("Default Providers", "structura")}
        </h3>
      </div>

      <p className="m-0! mb-4 text-[11px] leading-relaxed text-neutral-400">
        {__(
          "New campaigns will use these providers by default. You can override them per campaign.",
          "structura"
        )}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Text provider default */}
        {textProviders.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Type size={12} className="text-blue-500" />
              <span className="text-[9px] font-black tracking-widest text-neutral-400 uppercase">
                {__("Text Generation", "structura")}
              </span>
            </div>
            <Select
              value={defaultTextProvider}
              onValueChange={(val) => handleDefaultChange("text_provider", val as string)}
              options={textProviders.map((p) => ({ value: p.id, label: p.name }))}
            >
              <Select.Trigger placeholder={__("Select provider...", "structura")} />
              <Select.Content className="w-(--button-width)">
                {textProviders.map((p) => (
                  <Select.Item key={p.id} value={p.id}>
                    {p.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        )}

        {/* Image provider default */}
        {imageProviders.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Image size={12} className="text-purple-500" />
              <span className="text-[9px] font-black tracking-widest text-neutral-400 uppercase">
                {__("Image Generation", "structura")}
              </span>
            </div>
            <Select
              value={defaultImageProvider}
              onValueChange={(val) => handleDefaultChange("image_provider", val as string)}
              options={imageProviders.map((p) => ({ value: p.id, label: p.name }))}
            >
              <Select.Trigger placeholder={__("Select provider...", "structura")} />
              <Select.Content className="w-(--button-width)">
                {imageProviders.map((p) => (
                  <Select.Item key={p.id} value={p.id}>
                    {p.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
};
