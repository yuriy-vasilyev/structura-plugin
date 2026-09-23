/**
 * WritingApproachOverride — the campaign's `campaignMode`, demoted from a
 * tile group on the main form to one select inside Advanced.
 *
 * Structura infers the approach from the site's current search footprint
 * (spec `campaign-language-and-smart-setup.md` §5), so the tiles were asking
 * the user to answer a question the system had already answered better.
 * Touching the select is what makes the choice the user's: it stamps
 * `campaignModeSource: "user"`, which stops the cloud re-inferring the mode
 * as the footprint moves.
 */
import { __, sprintf } from "@wordpress/i18n";
import { useMemo } from "react";
import { Select } from "@structura/ui";

import { useCampaignForm } from "@/features/campaigns/context/CampaignContext";
import type { CampaignMode } from "@/features/campaigns/types";

const MODE_LABELS = (): Record<CampaignMode, string> => ({
  traffic_magnet: __("Traffic magnet — chase search volume", "structura"),
  quick_wins: __("Quick wins — rank fast on easy terms", "structura"),
  conversion: __("Conversion — lead readers to your offer", "structura"),
  authority: __("Authority — build topical depth", "structura"),
});

const MODE_ORDER: CampaignMode[] = [
  "authority",
  "quick_wins",
  "conversion",
  "traffic_magnet",
];

/** Short name used in the collapsed Advanced summary and the helper line. */
export const campaignModeShortLabel = (mode: CampaignMode | undefined): string => {
  switch (mode) {
    case "traffic_magnet":
      return __("Traffic magnet", "structura");
    case "quick_wins":
      return __("Quick wins", "structura");
    case "conversion":
      return __("Conversion", "structura");
    case "authority":
      return __("Authority", "structura");
    default:
      return __("Not set", "structura");
  }
};

export const WritingApproachOverride = () => {
  const { formData, updateForm } = useCampaignForm();
  const { campaignMode, campaignModeSource } = formData.identity;

  const isInferred = campaignModeSource !== "user";

  const options = useMemo(() => {
    const labels = MODE_LABELS();
    return MODE_ORDER.map((mode) => ({
      value: mode,
      label:
        isInferred && mode === campaignMode
          ? sprintf(
              /* translators: %s is a writing approach, e.g. "Authority — build topical depth". */
              __("%s (inferred)", "structura"),
              labels[mode],
            )
          : labels[mode],
    }));
  }, [campaignMode, isInferred]);

  return (
    <div className="space-y-1.5 px-2 py-2">
      <span className="block text-[10px] font-black tracking-widest text-neutral-400 uppercase">
        {__("Override writing approach", "structura")}
      </span>
      <div className="max-w-sm">
        <Select
          value={campaignMode ?? "traffic_magnet"}
          onValueChange={(val) =>
            updateForm("identity", {
              campaignMode: val as CampaignMode,
              campaignModeSource: "user",
            })
          }
          options={options}
        >
          <Select.Label hidden>
            {__("Override writing approach", "structura")}
          </Select.Label>
          <Select.Trigger placeholder={__("Select…", "structura")} />
          <Select.Content className="w-(--button-width)">
            {options.map((opt) => (
              <Select.Item key={opt.value} value={opt.value}>
                {opt.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </div>
      <p className="m-0! text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
        {isInferred && campaignMode
          ? sprintf(
              /* translators: %s is a writing approach, e.g. "Authority". */
              __(
                "Structura picked %s from your site's current search footprint. Override it only if you know better.",
                "structura",
              ),
              campaignModeShortLabel(campaignMode),
            )
          : __(
              "You picked this approach yourself — Structura won't change it as your site grows.",
              "structura",
            )}
      </p>
    </div>
  );
};
