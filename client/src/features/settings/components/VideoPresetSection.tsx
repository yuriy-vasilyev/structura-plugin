/**
 * Visual preset — Video styling controls (video-visuals handoff §1).
 *
 * Video look-and-feel lives on the visual preset (sibling of the image
 * art direction, never merged with it). This module holds the wp-admin
 * building blocks:
 *
 *   - `VideoStyleCards`       — Clean / Bold / Kinetic preset cards with
 *     the fixed `VideoStylePreview` art, re-tinted live by the preset's
 *     palette accent.
 *   - `CaptionPlacementField` — Top / Middle / Bottom placement radio.
 *   - `VideoPresetSection`    — the full editor section (head + style +
 *     art direction + placement + automatic palette row) rendered on the
 *     Visuals page.
 *   - `VideoStylingGateTeaser`— the compact locked row for plans without
 *     the Video channel; CTA routes to pricing with `unlock_video`.
 *
 * The wizard's collapsed row (handoff §4) composes `VideoStyleCards` +
 * `CaptionPlacementField` directly; keeping them exported here is what
 * guarantees the two surfaces can't drift.
 */

import type { ReactNode } from "react";
import { __ } from "@wordpress/i18n";
import { ArrowUpRight } from "lucide-react";
import {
  Badge,
  Button,
  PaletteSwatches,
  PlacementRadio,
  PresetRadioCard,
  PresetRadioCardGroup,
  SectionGateTeaser,
  TextArea,
  VideoChannelGlyph,
  VideoStylePreview,
  type CaptionPlacement,
  type VideoStyleKind,
} from "@structura/ui";
import { VIDEO_STYLE_PRESETS } from "@/features/channels/videoChannel";
import { buildMarketingPricingUrl } from "@/utils/portalLinks";

/** Overline field label — matches the dialog's existing label treatment. */
const OVERLINE =
  "m-0! block text-[10px] font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500";

/** Effective render defaults for absent preset fields (renderer contract). */
export const DEFAULT_PRESET_VIDEO_STYLE: VideoStyleKind = "clean";
export const DEFAULT_PRESET_CAPTION_PLACEMENT: CaptionPlacement = "bottom";

export function VideoStyleCards({
  value,
  onChange,
  accent,
  compact = false,
}: {
  value: VideoStyleKind;
  onChange: (style: VideoStyleKind) => void;
  /** Preset palette accent (first palette entry); stock indigo when absent. */
  accent?: string;
  /** Wizard density: hides the descriptor line under each card. */
  compact?: boolean;
}) {
  return (
    <PresetRadioCardGroup
      aria-label={__("Video style preset", "structura")}
      value={value}
      onValueChange={(next) => onChange(next as VideoStyleKind)}
    >
      {VIDEO_STYLE_PRESETS.map((preset) => (
        <PresetRadioCard
          key={preset.id}
          value={preset.id}
          name={preset.name}
          description={compact ? undefined : preset.descriptor}
          thumbnail={
            <VideoStylePreview
              kind={preset.id as VideoStyleKind}
              {...(accent ? { accent } : {})}
            />
          }
        />
      ))}
    </PresetRadioCardGroup>
  );
}

export function CaptionPlacementField({
  value,
  onChange,
}: {
  value: CaptionPlacement;
  onChange: (placement: CaptionPlacement) => void;
}) {
  return (
    <PlacementRadio
      aria-label={__("Caption placement", "structura")}
      value={value}
      onValueChange={onChange}
      labels={{
        top: __("Top", "structura"),
        middle: __("Middle", "structura"),
        bottom: __("Bottom", "structura"),
      }}
    />
  );
}

/** Brand-tinted 36px tile with the channel's own 9:16+play glyph. */
function VideoTile() {
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
      <VideoChannelGlyph className="h-5 w-5" />
    </div>
  );
}

export interface VideoPresetSectionProps {
  /** Preset fields — pass what's stored; render defaults applied here. */
  videoStyle?: VideoStyleKind;
  videoArtDirection?: string;
  captionPlacement?: CaptionPlacement;
  palette?: string[];
  onVideoStyleChange: (style: VideoStyleKind) => void;
  onVideoArtDirectionChange: (value: string) => void;
  onCaptionPlacementChange: (placement: CaptionPlacement) => void;
  /**
   * The page's suggest affordance for the video art direction — the same
   * `SuggestStrategySection` component the image field uses, so grounding
   * (homepage screenshot + brand resources) stays identical. Rendered in
   * the field's label row.
   */
  suggestSlot?: ReactNode;
}

/**
 * The full Video section body for the preset editor. The caller owns the
 * `border-t` divider + `id="video"` anchor wrapper so the locked teaser
 * can live at the same deep-link target.
 */
export function VideoPresetSection({
  videoStyle,
  videoArtDirection,
  captionPlacement,
  palette,
  onVideoStyleChange,
  onVideoArtDirectionChange,
  onCaptionPlacementChange,
  suggestSlot,
}: VideoPresetSectionProps) {
  const accent = palette?.[0];

  return (
    <div>
      {/* Section head */}
      <div className="flex items-start gap-3">
        <VideoTile />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="m-0! text-sm font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {__("Video", "structura")}
            </h4>
            <Badge intent="premium">{__("Cloud Pro", "structura")}</Badge>
          </div>
          <p className="m-0! mt-0.5! text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            {__(
              "How videos rendered from posts look, on every site using this preset — style, captions and motion.",
              "structura",
            )}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        {/* Style preset */}
        <div className="space-y-1.5">
          <span className={OVERLINE}>{__("Style preset", "structura")}</span>
          <VideoStyleCards
            value={videoStyle ?? DEFAULT_PRESET_VIDEO_STYLE}
            onChange={onVideoStyleChange}
            {...(accent ? { accent } : {})}
          />
        </div>

        {/* Video art direction */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className={OVERLINE}>
              {__("Video art direction", "structura")}
            </span>
          </div>
          {suggestSlot}
          <TextArea
            label={__("Video Art Direction", "structura")}
            hiddenLabel
            rows={5}
            value={videoArtDirection ?? ""}
            onChange={(e) => onVideoArtDirectionChange(e.target.value)}
            placeholder={__(
              "Footage, pacing, mood and settings for rendered videos…",
              "structura",
            )}
            className="w-full rounded-2xl border-gray-200 bg-gray-50 font-mono text-xs leading-relaxed dark:border-neutral-800 dark:bg-neutral-950"
          />
          <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
            {__(
              "Motion, footage and pacing — separate from the image style above. Suggest drafts it from your homepage screenshot and brand info.",
              "structura",
            )}
          </p>
        </div>

        {/* Caption placement */}
        <div className="space-y-1.5">
          <span className={OVERLINE}>
            {__("Caption placement", "structura")}
          </span>
          <CaptionPlacementField
            value={captionPlacement ?? DEFAULT_PRESET_CAPTION_PLACEMENT}
            onChange={onCaptionPlacementChange}
          />
          <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
            {__("Bottom feels native on Shorts, TikTok and Reels.", "structura")}
          </p>
        </div>

        {/* Brand palette pickup — automatic, no toggle (designer's call). */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-neutral-50/70 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800/50">
          <div className="min-w-0">
            <p className="m-0! text-xs font-bold text-neutral-900 dark:text-neutral-100">
              {__("Brand palette in captions", "structura")}
            </p>
            <p className="m-0! mt-0.5! text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              {__(
                "Caption accents automatically use this preset's palette — the previews above show the result.",
                "structura",
              )}
            </p>
          </div>
          {palette && palette.length > 0 && (
            <PaletteSwatches
              colors={palette}
              label={__("Preset palette", "structura")}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Locked teaser for plans without the Video channel — same gate
 * vocabulary as the channel's deep-link gate (`unlock_video` intent so
 * pricing highlights Cloud Pro and analytics attribute the surface).
 * Gated fields are neither rendered nor fetched behind this row.
 */
export function VideoStylingGateTeaser({ plan }: { plan?: string }) {
  const domain =
    typeof window !== "undefined" ? window.location.hostname : undefined;

  return (
    <SectionGateTeaser
      // wp-admin ships WP's global <p> margins; the ui primitive is
      // surface-neutral, so the reset rides in from here.
      className="[&_p]:m-0!"
      title={__("Video styling", "structura")}
      badge={__("Cloud Pro", "structura")}
      line={__(
        "Style presets, caption placement and brand-palette captions for every rendered video.",
        "structura",
      )}
      cta={
        <Button asChild variant="secondary" size="sm">
          <a
            href={buildMarketingPricingUrl({ intent: "unlock_video", domain, plan })}
            target="_blank"
            rel="noreferrer"
          >
            <ArrowUpRight size={14} className="mr-1.5" aria-hidden />
            {__("Upgrade plan", "structura")}
          </a>
        </Button>
      }
    />
  );
}
