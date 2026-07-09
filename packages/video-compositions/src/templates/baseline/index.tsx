/**
 * "Baseline" template — a like-for-like port of the Shotstack assembly
 * layout (branded title card → media scenes with numbered step
 * headlines + karaoke captions → branded end card) but with real
 * motion: spring entrances, per-word caption pops, continuous Ken Burns
 * — everything the Shotstack HTML renderer could not do.
 *
 * This exists to compare renderers on equal footing; the new template
 * lineup lives in sibling folders.
 */

import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Montserrat";
import type { SceneVisual, VideoCompositionProps } from "../../types";
import { buildTimeline } from "../../timing";

const { fontFamily } = loadFont("normal", {
  weights: ["500", "700", "900"],
});

const DARK = "#0f172a";

/** Full-bleed media with a slow push-in so stills never read static. */
const SceneMedia: React.FC<{
  visual: SceneVisual | undefined;
  fallbackImage: string | null;
  accent: string;
  durationInFrames: number;
  zoomOut?: boolean;
}> = ({ visual, fallbackImage, accent, durationInFrames, zoomOut }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(
    frame,
    [0, durationInFrames],
    zoomOut ? [1.12, 1] : [1, 1.12],
  );

  const resolved: SceneVisual =
    visual && visual.kind !== "color"
      ? visual
      : fallbackImage
        ? { kind: "image", url: fallbackImage }
        : { kind: "color" };

  return (
    <AbsoluteFill style={{ backgroundColor: DARK, overflow: "hidden" }}>
      {resolved.kind === "video" && resolved.url ? (
        <OffthreadVideo
          src={resolved.url}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale})`,
          }}
        />
      ) : resolved.kind === "image" && resolved.url ? (
        <Img
          src={resolved.url}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale})`,
          }}
        />
      ) : (
        <AbsoluteFill
          style={{
            background: `radial-gradient(120% 120% at 20% 10%, ${accent}33, ${DARK} 65%)`,
          }}
        />
      )}
      {/* Legibility scrim behind captions/headlines. */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(15,23,42,0.35) 0%, rgba(15,23,42,0) 30% 62%, rgba(15,23,42,0.55) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

/** Numbered step headline chip, springing in from below. */
const StepHeadline: React.FC<{
  index: number;
  text: string;
  accent: string;
  placement: "top" | "bottom";
}> = ({ index, text, accent, placement }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14, mass: 0.6 } });
  const y = interpolate(enter, [0, 1], [placement === "top" ? -60 : 60, 0]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: placement === "top" ? "flex-start" : "flex-end",
        alignItems: "flex-start",
        padding: "140px 64px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          transform: `translateY(${y}px)`,
          opacity: enter,
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 900,
            fontSize: 64,
            color: DARK,
            backgroundColor: accent,
            borderRadius: 20,
            width: 96,
            height: 96,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {index}
        </div>
        <div
          style={{
            fontFamily,
            fontWeight: 700,
            fontSize: 54,
            color: "#fff",
            backgroundColor: "rgba(15,23,42,0.72)",
            borderRadius: 20,
            padding: "18px 32px",
            maxWidth: 760,
          }}
        >
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Karaoke captions — the spoken word pops in scale + accent color. */
const KaraokeCaptions: React.FC<{
  props: VideoCompositionProps;
  accent: string;
}> = ({ props, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { chunks, words } = React.useMemo(
    () => buildTimeline(props.script, props.words),
    [props.script, props.words],
  );

  const chunk = chunks.find((c) => t >= c.start && t < c.end);
  if (!chunk) return null;

  const chunkWords = words.filter((w) => w.start >= chunk.start - 1e-4 && w.end <= chunk.end + 1e-4);
  const placement = props.settings.captionPlacement;

  return (
    <AbsoluteFill
      style={{
        justifyContent:
          placement === "top" ? "flex-start" : placement === "middle" ? "center" : "flex-end",
        alignItems: "center",
        padding: "360px 56px",
      }}
    >
      <div
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: 64,
          lineHeight: 1.25,
          textAlign: "center",
          color: "#fff",
          backgroundColor: "rgba(15,23,42,0.6)",
          borderRadius: 24,
          padding: "20px 36px",
          maxWidth: 920,
        }}
      >
        {chunkWords.map((w, i) => {
          const active = t >= w.start && t < w.end;
          const pop = active
            ? 1 + 0.12 * Math.sin(Math.min((t - w.start) / 0.12, 1) * Math.PI * 0.5)
            : 1;
          return (
            <span
              key={i}
              style={{
                color: active ? accent : "#fff",
                display: "inline-block",
                transform: `scale(${pop})`,
                // Em-based gap: inline-block swallows the literal spaces
                // between spans, so the gap must be explicit.
                marginRight: "0.35em",
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Branded opening card: title springs in over an accent gradient. */
const TitleCard: React.FC<{ props: VideoCompositionProps; accent: string }> = ({
  props,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16 } });
  const barW = interpolate(spring({ frame: frame - 8, fps, config: { damping: 18 } }), [0, 1], [0, 220]);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(140% 100% at 80% 0%, ${accent}55, ${DARK} 70%)`,
        justifyContent: "center",
        padding: 88,
      }}
    >
      <div style={{ opacity: enter, transform: `translateY(${(1 - enter) * 80}px)` }}>
        <div style={{ height: 14, width: barW, backgroundColor: accent, borderRadius: 7, marginBottom: 48 }} />
        <div style={{ fontFamily, fontWeight: 900, fontSize: 96, lineHeight: 1.08, color: "#fff" }}>
          {props.postTitle}
        </div>
        <div style={{ fontFamily, fontWeight: 500, fontSize: 44, color: "#cbd5e1", marginTop: 40 }}>
          {props.domain}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Branded end card with the article pointer. */
const EndCard: React.FC<{ props: VideoCompositionProps; accent: string }> = ({
  props,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 15 } });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: DARK,
        justifyContent: "center",
        alignItems: "center",
        gap: 36,
      }}
    >
      <div
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: 60,
          color: "#cbd5e1",
          opacity: enter,
        }}
      >
        Full guide:
      </div>
      <div
        style={{
          fontFamily,
          fontWeight: 900,
          fontSize: 76,
          color: "#fff",
          backgroundColor: accent,
          borderRadius: 28,
          padding: "28px 56px",
          transform: `scale(${0.8 + enter * 0.2})`,
          opacity: enter,
        }}
      >
        {props.domain}
      </div>
    </AbsoluteFill>
  );
};

export const Baseline: React.FC<VideoCompositionProps> = (props) => {
  const { fps } = useVideoConfig();
  const accent = props.settings.paletteAccent ?? "#38bdf8";
  const timeline = React.useMemo(
    () => buildTimeline(props.script, props.words),
    [props.script, props.words],
  );

  return (
    <AbsoluteFill style={{ backgroundColor: DARK }}>
      {timeline.segments.map((seg) => {
        const from = Math.round(seg.start * fps);
        const dur = Math.max(1, Math.round(seg.duration * fps));
        return (
          <Sequence key={`${seg.kind}-${seg.sceneIndex}`} from={from} durationInFrames={dur}>
            {seg.kind === "hook" ? (
              <TitleCard props={props} accent={accent} />
            ) : seg.kind === "cta" ? (
              <EndCard props={props} accent={accent} />
            ) : (
              <>
                <SceneMedia
                  visual={props.visuals[seg.sceneIndex + 1]}
                  fallbackImage={props.featuredImageUrl}
                  accent={accent}
                  durationInFrames={dur}
                  zoomOut={seg.sceneIndex % 2 === 1}
                />
                <StepHeadline
                  index={seg.sceneIndex + 1}
                  text={seg.caption ?? ""}
                  accent={accent}
                  placement={props.settings.captionPlacement === "top" ? "bottom" : "top"}
                />
              </>
            )}
          </Sequence>
        );
      })}
      {/* Captions ride above everything, timed globally. */}
      <KaraokeCaptions props={props} accent={accent} />
      {props.voiceoverUrl ? <Audio src={props.voiceoverUrl} /> : null}
    </AbsoluteFill>
  );
};
