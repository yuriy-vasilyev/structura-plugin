/**
 * "Offhand" — DIY/UGC-native template (TikTok, Reels).
 *
 * Port of the design handoff at
 * marketing/design_handoff_video_templates (README §1 "Offhand",
 * templates-a.jsx). Motion language:
 *  - Rubik 900 sticker type — white fill + thick ink stroke via
 *    `-webkit-text-stroke` + `paint-order: stroke fill`, so text
 *    survives any footage.
 *  - Word pops: ~320ms spring (damping 9, mass 0.5) with slight
 *    rotation; stagger paced to the spoken hook (design intent 150ms).
 *  - Cuts are zoom-punches 1.18→1 in 380ms; every beat rides a
 *    continuous handheld drift (±12px / ±0.6°, 5.5s alternate loop —
 *    deterministic Math.sin, never a locked-off frame).
 *  - Fallback beat (`SceneVisual.kind === "color"` / missing media) =
 *    accent-mixed backdrop + drifting accent blur-blobs — intentional,
 *    never degraded.
 *  - Karaoke: accent marker fills behind the active word, 1.06 scale.
 */

import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Rubik";
import type { SceneVisual, VideoCompositionProps } from "../../types";
import { buildTimeline } from "../../timing";
import { accentSet, alpha, mix, type AccentSet } from "../../shared/accent";
import { str } from "../../shared/strings";

const { fontFamily } = loadFont("normal", { weights: ["700", "800", "900"] });

const INK = "#14161c";
/** Early CTA dwell — enters after the hook, gone before it annoys. */
const EARLY_CTA_SECONDS = 3.2;

/** Rubik-900 sticker text: white fill drawn over a fat ink stroke. */
const sticker = (strokePx: number): React.CSSProperties => ({
  fontFamily,
  fontWeight: 900,
  color: "#fff",
  WebkitTextStroke: `${strokePx}px ${INK}`,
  paintOrder: "stroke fill",
  textShadow: "0 8px 24px rgba(0,0,0,0.35)",
});

type Media = { kind: "video" | "image"; url: string };

const resolveMedia = (
  visual: SceneVisual | undefined,
  fallbackImage: string | null,
): Media | null => {
  if (visual && visual.kind !== "color" && visual.url) {
    return { kind: visual.kind, url: visual.url };
  }
  if (fallbackImage) return { kind: "image", url: fallbackImage };
  return null;
};

/**
 * Continuous handheld drift — CSS `ofWobble` (5.5s ease-in-out infinite
 * alternate ⇒ an 11s sine period). Base scale ~1.1 hides the pan edges.
 */
const useHandheld = (seed: number): string => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps + seed * 1.7;
  const p = Math.sin((t / 11) * Math.PI * 2);
  return `scale(${1.1 + 0.012 * p}) translate(${(12 * p).toFixed(2)}px, ${(9 * p).toFixed(2)}px) rotate(${(0.55 * p).toFixed(3)}deg)`;
};

const coverStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const CoverMedia: React.FC<{ media: Media }> = ({ media }) =>
  media.kind === "video" ? (
    <OffthreadVideo src={media.url} muted style={coverStyle} />
  ) : (
    <Img src={media.url} style={coverStyle} />
  );

/** Handheld full-bleed media + legibility gradient. */
const HandheldMedia: React.FC<{
  media: Media;
  seed: number;
  filter?: string;
}> = ({ media, seed, filter }) => {
  const drift = useHandheld(seed);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: drift, filter }}>
        <CoverMedia media={media} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * The designed no-footage backdrop: accent mixed 45% toward near-black
 * plus two drifting accent blur-blobs (CSS `ofBlob`, 6s alternate ⇒ 12s
 * sine period; second blob offset half a cycle).
 */
const FallbackBackdrop: React.FC<{ acc: AccentSet }> = ({ acc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const blob = (phase: number) => (Math.sin((t / 12) * Math.PI * 2 + phase) + 1) / 2;
  const p1 = blob(0);
  const p2 = blob(Math.PI);
  const blobStyle = (p: number): React.CSSProperties => ({
    position: "absolute",
    borderRadius: "50%",
    filter: "blur(70px)",
    transform: `translate(${-60 + 130 * p}px, ${-40 + 100 * p}px) scale(${1 + 0.25 * p})`,
  });
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(165deg, ${mix(acc.raw, "#101010", 0.45)}, #14161c 70%)`,
        }}
      />
      <div
        style={{
          ...blobStyle(p1),
          width: 700,
          height: 700,
          left: -120,
          top: 180,
          background: alpha(acc.raw, 0.5),
        }}
      />
      <div
        style={{
          ...blobStyle(p2),
          width: 560,
          height: 560,
          right: -100,
          bottom: 260,
          background: alpha(acc.raw, 0.32),
        }}
      />
    </AbsoluteFill>
  );
};

/** ~320ms sticker pop: scale .35→1, rotate -7°→0 (design `ofPop`). */
const usePop = (delaySeconds: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - Math.round(delaySeconds * fps),
    fps,
    config: { damping: 9, mass: 0.5 },
  });
  return {
    opacity: Math.min(1, s * 2),
    scale: interpolate(s, [0, 1], [0.35, 1]),
    rotate: interpolate(s, [0, 1], [-7, 0]),
  };
};

/** Hook line — sticker words popping in, paced to the spoken hook. */
const HookBeat: React.FC<{
  text: string;
  duration: number;
  media: Media | null;
  acc: AccentSet;
}> = ({ text, duration, media, acc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.trim().split(/\s+/).filter(Boolean);
  const speech = Math.max(duration - 0.4, 0.8);
  // Design stagger is 150ms; real pacing follows the voiceover window.
  const per = speech / Math.max(words.length, 1);

  return (
    <AbsoluteFill>
      {media ? (
        <>
          <HandheldMedia media={media} seed={0} />
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.3), rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.42))",
            }}
          />
        </>
      ) : (
        <FallbackBackdrop acc={acc} />
      )}
      <div
        style={{
          position: "absolute",
          left: 70,
          right: 70,
          top: 0,
          bottom: 0,
          display: "flex",
          flexWrap: "wrap",
          alignContent: "center",
          justifyContent: "center",
          gap: "10px 26px",
          textAlign: "center",
          fontSize: 104,
          lineHeight: 1.05,
          ...sticker(14),
        }}
      >
        {words.map((w, i) => {
          const s = spring({
            frame: frame - Math.round((0.15 + i * per) * fps),
            fps,
            config: { damping: 9, mass: 0.5 },
          });
          // Deterministic "hot word" cadence — the script contract has no
          // per-word emphasis data, so every 3rd word takes the marker
          // (same heuristic punch uses).
          const hot = i % 3 === 2;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                opacity: Math.min(1, s * 2),
                transform: `scale(${interpolate(s, [0, 1], [0.35, 1])}) rotate(${interpolate(s, [0, 1], [-7, 0])}deg)`,
                ...(hot
                  ? {
                      background: acc.raw,
                      color: acc.ink,
                      WebkitTextStroke: "0px transparent",
                      textShadow: "none",
                      padding: "2px 24px",
                      borderRadius: 20,
                    }
                  : null),
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Rotated "1/4" accent sticker chip, top-left — hand-placed count. */
const StepChip: React.FC<{ index: number; total: number; acc: AccentSet }> = ({
  index,
  total,
  acc,
}) => {
  const pop = usePop(0.25);
  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        top: 236,
        transform: `rotate(-4deg) scale(${pop.scale})`,
        opacity: pop.opacity,
        fontFamily,
        fontWeight: 900,
        fontSize: 52,
        padding: "14px 34px",
        borderRadius: 22,
        boxShadow: "0 10px 24px rgba(0,0,0,0.3)",
        background: acc.raw,
        color: acc.ink,
      }}
    >
      {index}/{total}
    </div>
  );
};

/** Scene beat: zoom-punched handheld media, or the accent fallback. */
const SceneBeat: React.FC<{
  index: number;
  total: number;
  headline: string;
  media: Media | null;
  acc: AccentSet;
}> = ({ index, total, headline, media, acc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = usePop(0.35);
  const drift = useHandheld(index * 2.3);
  // Jump-cut zoom-punch: 1.18→1 in 380ms (design `ofPunch`).
  const punch = interpolate(frame, [0, Math.round(0.38 * fps)], [1.18, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const headlineStyle: React.CSSProperties = {
    position: "absolute",
    left: 70,
    right: 70,
    textAlign: "center",
    lineHeight: 1.08,
    opacity: pop.opacity,
    ...sticker(14),
  };

  return (
    <AbsoluteFill>
      {media ? (
        <>
          <AbsoluteFill style={{ transform: `scale(${punch})` }}>
            <HandheldMedia media={media} seed={index * 2.3} />
          </AbsoluteFill>
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.32), rgba(0,0,0,0) 38%, rgba(0,0,0,0.45))",
            }}
          />
          <div
            style={{
              ...headlineStyle,
              top: 420,
              fontSize: 96,
              transform: `rotate(-1.6deg) scale(${pop.scale})`,
            }}
          >
            {headline}
          </div>
        </>
      ) : (
        <>
          <FallbackBackdrop acc={acc} />
          {/* Text keeps the handheld drift so the fallback never sits still. */}
          <AbsoluteFill style={{ transform: drift }}>
            <div
              style={{
                ...headlineStyle,
                top: 640,
                fontSize: 116,
                transform: `rotate(-1.6deg) scale(${pop.scale})`,
              }}
            >
              {headline}
            </div>
          </AbsoluteFill>
        </>
      )}
      <StepChip index={index} total={total} acc={acc} />
    </AbsoluteFill>
  );
};

/** White comment-style CTA pill, bottom-left, accent dot. */
const EarlyCta: React.FC<{
  domain: string;
  acc: AccentSet;
  locale?: string;
}> = ({ domain, acc, locale }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 11, mass: 0.6 } });
  const exit = spring({
    frame: frame - (durationInFrames - Math.round(0.35 * fps)),
    fps,
    config: { damping: 20 },
  });
  const y =
    interpolate(enter, [0, 1], [140, 0]) + interpolate(exit, [0, 1], [0, 140]);
  const rotate = interpolate(enter, [0, 1], [2, -1]);

  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        top: 1560,
        transform: `translateY(${y}px) rotate(${rotate}deg)`,
        opacity: Math.min(1, enter * 2) * (1 - exit),
        display: "flex",
        alignItems: "center",
        gap: 20,
        background: "#fff",
        color: INK,
        fontFamily,
        fontWeight: 800,
        fontSize: 42,
        padding: "20px 38px",
        borderRadius: 999,
        boxShadow: "0 14px 30px rgba(0,0,0,0.35)",
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          background: acc.raw,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {str("fullGuide", locale)} → {domain}
    </div>
  );
};

/** ~2s outro: domain slams onto a white sticker pill over blurred media. */
const OutroBeat: React.FC<{
  domain: string;
  media: Media | null;
  acc: AccentSet;
  locale?: string;
}> = ({ domain, media, acc, locale }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Domain slam-in: scale 2.4→1, rotate -8°→-2° (design `ofSlam`).
  const slam = spring({
    frame: frame - Math.round(0.15 * fps),
    fps,
    config: { damping: 11, mass: 0.5 },
  });
  const link = usePop(0.55);

  return (
    <AbsoluteFill>
      {media ? (
        <HandheldMedia media={media} seed={0} filter="blur(10px) brightness(0.55)" />
      ) : (
        <FallbackBackdrop acc={acc} />
      )}
      <div style={{ position: "absolute", left: 0, right: 0, top: 820, display: "flex", justifyContent: "center" }}>
        <div
          style={{
            fontFamily,
            fontWeight: 900,
            fontSize: 88,
            background: "#fff",
            color: INK,
            padding: "18px 46px",
            borderRadius: 26,
            boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
            opacity: Math.min(1, slam * 2),
            transform: `scale(${interpolate(slam, [0, 1], [2.4, 1])}) rotate(${interpolate(slam, [0, 1], [-8, -2])}deg)`,
          }}
        >
          {domain}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 990,
          textAlign: "center",
          fontSize: 56,
          opacity: link.opacity,
          transform: `scale(${link.scale})`,
          ...sticker(11),
        }}
      >
        {str("linkDesc", locale)}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Karaoke sticker captions at y≈1550 — accent marker behind the active
 * word, 1.06 scale. Suppressed during hook and cta segments (both carry
 * their own text).
 */
const Captions: React.FC<{ props: VideoCompositionProps; acc: AccentSet }> = ({
  props,
  acc,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { chunks, words, segments } = React.useMemo(
    () => buildTimeline(props.script, props.words),
    [props.script, props.words],
  );

  const hookEnd = segments[0].start + segments[0].duration;
  const ctaStart = segments[segments.length - 1].start;
  if (t < hookEnd || t >= ctaStart) return null;

  const chunk = chunks.find((c) => t >= c.start && t < c.end);
  if (!chunk) return null;
  const chunkWords = words.filter(
    (w) => w.start >= chunk.start - 1e-4 && w.end <= chunk.end + 1e-4,
  );

  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        bottom: 310,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "6px 16px",
        fontSize: 60,
        textAlign: "center",
        ...sticker(11),
      }}
    >
      {chunkWords.map((w, i) => {
        const active = t >= w.start && t < w.end;
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              padding: "2px 12px",
              borderRadius: 14,
              ...(active
                ? {
                    background: acc.raw,
                    color: acc.ink,
                    WebkitTextStroke: "0px transparent",
                    textShadow: "none",
                    transform: "scale(1.06)",
                  }
                : null),
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
};

export const Offhand: React.FC<VideoCompositionProps> = (props) => {
  const { fps } = useVideoConfig();
  const acc = React.useMemo(
    () => accentSet(props.settings.paletteAccent ?? "#38bdf8"),
    [props.settings.paletteAccent],
  );
  const timeline = React.useMemo(
    () => buildTimeline(props.script, props.words),
    [props.script, props.words],
  );
  const hook = timeline.segments[0];
  const totalScenes = props.script.scenes.length;
  const hookMedia = resolveMedia(props.visuals[0], props.featuredImageUrl);
  // Outro reuses the hook footage blurred (design) when the cta slot is empty.
  const outroMedia = resolveMedia(props.visuals[totalScenes + 1], null) ?? hookMedia;

  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      {timeline.segments.map((seg) => {
        const from = Math.round(seg.start * fps);
        const dur = Math.max(1, Math.round(seg.duration * fps));
        return (
          <Sequence key={`${seg.kind}-${seg.sceneIndex}`} from={from} durationInFrames={dur}>
            {seg.kind === "hook" ? (
              <HookBeat
                text={props.script.hook}
                duration={seg.duration}
                media={hookMedia}
                acc={acc}
              />
            ) : seg.kind === "cta" ? (
              <OutroBeat
                domain={props.domain}
                media={outroMedia}
                acc={acc}
                locale={props.locale}
              />
            ) : (
              <SceneBeat
                index={seg.sceneIndex + 1}
                total={totalScenes}
                headline={seg.caption ?? ""}
                media={resolveMedia(props.visuals[seg.sceneIndex + 1], null)}
                acc={acc}
              />
            )}
          </Sequence>
        );
      })}

      {/* Early CTA — enters during scene 1, right after the hook. */}
      <Sequence
        from={Math.round((hook.start + hook.duration) * fps)}
        durationInFrames={Math.round(EARLY_CTA_SECONDS * fps)}
      >
        <EarlyCta domain={props.domain} acc={acc} locale={props.locale} />
      </Sequence>

      <Captions props={props} acc={acc} />
      {props.voiceoverUrl ? <Audio src={props.voiceoverUrl} /> : null}
    </AbsoluteFill>
  );
};
