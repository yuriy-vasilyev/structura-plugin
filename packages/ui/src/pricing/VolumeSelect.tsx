"use client";

// A client boundary: the pricing barrel is imported by Next server modules
// (www/lib/founding-offer.ts), and the shared Select holds React context.
import { FC } from "react";
import { RecommendedLabel } from "../components/RecommendedLabel";
import { Select } from "../components/Select";

/** One listed volume in a {@link VolumeSelect}. */
export interface VolumeSelectOption {
  /**
   * Option identity: the price's posts per site per month (`max_posts`),
   * never an array index (specs/cloud-volume-pricing.md §6).
   */
  value: number;
  /** Visible name, already translated (e.g. "30 posts"). */
  label: string;
  /** Second line in the open list (e.g. "90 images · 10 AI videos"). */
  description?: string;
  /**
   * Recommendation chip. Fixed to the option, so it stays on the
   * recommended option whichever option is selected.
   */
  recommended?: { label: string; description?: string };
}

export interface VolumeSelectProps {
  /** Visible label above the trigger (e.g. "Posts per site per month"). */
  label: string;
  options: ReadonlyArray<VolumeSelectOption>;
  value: number;
  onValueChange: (value: number) => void;
  /**
   * Line under the trigger: the `recommended` chip while the recommended
   * option is selected, the `other` text otherwise. Absent → no line (the
   * compact select beside the comparison matrix).
   */
  helper?: { recommended: string; other: string };
  className?: string;
}

/**
 * Posts-per-site volume picker for the Cloud plan. The shared `Select` with a
 * prominent label, its default resting border (owner review 2026-10-12: the
 * design preview's stronger border was rejected) and a 48px trigger. Used by
 * the Cloud plan card and the comparison matrix, which share one selection.
 */
export const VolumeSelect: FC<VolumeSelectProps> = ({
  label,
  options,
  value,
  onValueChange,
  helper,
  className,
}) => {
  const selectedIsRecommended = Boolean(options.find((o) => o.value === value)?.recommended);
  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(Number(next))}
      options={options.map((o) => ({ value: o.value, label: o.label }))}
      className={className}
    >
      <Select.Label labelStyle="prominent">{label}</Select.Label>
      <Select.Trigger className="min-h-12 text-base font-semibold" />
      <Select.Content className="w-(--button-width) min-w-[min(18rem,calc(100vw-2rem))]">
        {options.map((o) => (
          <Select.Item
            key={o.value}
            value={o.value}
            description={o.description}
            recommended={o.recommended}
          >
            {o.label}
          </Select.Item>
        ))}
      </Select.Content>
      {helper && (
        <div className="mt-3 flex min-h-5 items-center text-xs text-neutral-600 dark:text-neutral-400">
          {selectedIsRecommended ? <RecommendedLabel label={helper.recommended} /> : helper.other}
        </div>
      )}
    </Select>
  );
};
