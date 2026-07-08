import React, { forwardRef } from "react";
import { cn } from "../utils";

/**
 * The three video caption styles a visual preset can select.
 */
export type VideoStyleKind = "clean" | "bold" | "kinetic";

/**
 * Stock accent used when a preset has no palette — brand indigo
 * (brand-600). Matches `STOCK_ACCENT` in the video-visuals boards.
 */
export const STOCK_VIDEO_ACCENT = "#5B3FE5";

/*
 * The preview art is deliberately fixed and identical in light and dark
 * (no `dark:` variants inside): a warm bright "footage" gradient — the
 * worst case for white captions — proves the outline treatment keeps
 * captions readable on any footage, which is exactly what the production
 * render does. Raw hexes are sanctioned here by the handoff (§2 "Preview
 * art (fix)"); everything around the art stays on tokens.
 */
const FOOTAGE_GRADIENT = "linear-gradient(160deg,#e2dccf 0%,#c8bfae 46%,#8e8474 100%)";

/**
 * Dark scrim pill behind the white caption samples. The boards drew
 * text-shadow outlines here, but the production renderer (Shotstack
 * html assets, HTML4/CSS2.1) silently drops text-shadow — the real
 * videos carry a scrim pill instead, so the preview shows the same
 * treatment rather than promising an outline the render can't do.
 */
const CAPTION_SCRIM = "rgba(0,0,0,.6)";

/**
 * Picks a readable text color (near-black or white) for content sitting
 * on an arbitrary accent color.
 *
 * Uses perceived brightness (YIQ: `0.299R + 0.587G + 0.114B`) with the
 * conventional 128 threshold rather than a WCAG contrast-winner: a pure
 * contrast comparison would flip mid-tone accents like the handoff's
 * demo copper `#B36D33` to dark text, but the boards (and the production
 * render) keep white captions on such accents — YIQ@128 matches that
 * design intent while still flipping to dark on genuinely light accents.
 *
 * @param hex - `#RGB` / `#RRGGBB` (hash optional). Unparsable input
 *   returns white — accents default toward the dark stock indigo, so
 *   white is the safer failure mode.
 * @returns `"#0a0a0a"` (neutral-950) for light accents, `"#ffffff"` for
 *   dark ones.
 */
export function readableOn(hex: string): "#0a0a0a" | "#ffffff" {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return "#ffffff";
  let value = match[1];
  if (value.length === 3) {
    value = value
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness >= 128 ? "#0a0a0a" : "#ffffff";
}

export interface VideoStylePreviewProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Which style's caption sample to draw. */
  kind: VideoStyleKind;
  /**
   * Preset accent hex for the Bold underline / Kinetic chip. Defaults to
   * {@link STOCK_VIDEO_ACCENT} — pass the preset palette's accent so
   * thumbs re-tint live when the palette changes.
   */
  accent?: string;
}

/**
 * VideoStylePreview — the fixed preview art for the Clean / Bold /
 * Kinetic video style cards (video-visuals handoff §2).
 *
 * Renders a warm footage gradient with a bottom scrim and white,
 * outlined caption samples — identical pixels in light and dark, so the
 * thumb reads as "footage", not UI. Fills its container: aspect and
 * rounding come from the consumer's thumb slot (typically
 * `PresetRadioCard`'s `thumbnail` slot).
 *
 * @remarks
 * The whole component is `aria-hidden` — the caption samples are
 * decorative English and never translated; the consuming card's
 * `aria-label` carries the meaning (e.g. "Kinetic — word-by-word
 * captions, brand accent chip").
 */
export const VideoStylePreview = forwardRef<HTMLDivElement, VideoStylePreviewProps>(
  ({ kind, accent = STOCK_VIDEO_ACCENT, className, style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-kind={kind}
        className={cn("relative h-full w-full overflow-hidden rounded-lg", className)}
        style={{ backgroundImage: FOOTAGE_GRADIENT, ...style }}
        {...props}
        aria-hidden="true"
      >
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-neutral-950/30 to-transparent" />
        {kind === "clean" && (
          <div className="absolute inset-x-2 bottom-2 text-center">
            <span
              className="rounded-md px-1.5 py-0.5 text-[8.5px] font-semibold leading-tight text-white"
              style={{ backgroundColor: CAPTION_SCRIM }}
            >
              grows 3× faster
            </span>
          </div>
        )}
        {kind === "bold" && (
          <div className="absolute inset-x-1 bottom-2 text-center">
            <span
              className="inline-block rounded-md px-1.5 py-1 text-[10px] font-black uppercase leading-none tracking-tight text-white"
              style={{ backgroundColor: CAPTION_SCRIM }}
            >
              GROWS
              <br />
              3× FASTER
            </span>
            <span
              className="mx-auto mt-1 block h-[3px] w-7 rounded-full"
              style={{ backgroundColor: accent }}
            />
          </div>
        )}
        {kind === "kinetic" && (
          <div className="absolute inset-x-1 bottom-2 flex flex-wrap justify-center gap-[3px]">
            <span
              className="rounded-sm px-1 py-0.5 text-[8px] font-extrabold leading-none"
              style={{ backgroundColor: accent, color: readableOn(accent) }}
            >
              3×
            </span>
            <span className="rounded-sm bg-neutral-950/85 px-1 py-0.5 text-[8px] font-bold leading-none text-white">
              faster
            </span>
          </div>
        )}
      </div>
    );
  }
);
VideoStylePreview.displayName = "VideoStylePreview";
