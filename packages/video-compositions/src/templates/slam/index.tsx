/**
 * "Slam" — kinetic typography template (TikTok, Shorts, Reels).
 *
 * Port of the design handoff at
 * marketing/design_handoff_video_templates (README §2 "Slam",
 * templates-a.jsx). Motion language:
 *  - Anton uppercase mass: 158px hook, 112px headlines; Archivo 600–700
 *    support; captions on a dark 50% pill, centered.
 *  - Word slams: ~220ms scale 2.3→1 + blur 16→0 (damping ≈ 8), stagger
 *    paced to the spoken hook (design intent 170ms).
 *  - Scene transitions: hard cut + 320ms accent flash (0.65→0).
 *  - Continuous rotating conic accent gradient (9s linear) behind every
 *    typography beat; diagonal accent sweep on the fallback beat.
 *  - Giant outlined step numeral (WebkitTextStroke) drifting behind the
 *    headline — the number IS the scene.
 *  - Accent guard: raw accent only decorates (flash, bar, sweep, stamp
 *    fill); accent-as-text always uses `acc.onDark` / `acc.ink`.
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
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadArchivo } from "@remotion/google-fonts/Archivo";
import type { SceneVisual, VideoCompositionProps } from "../../types";
import { buildTimeline } from "../../timing";
import { accentSet, alpha, type AccentSet } from "../../shared/accent";
import { str } from "../../shared/strings";

const { fontFamily: anton } = loadAnton("normal", { weights: ["400"] });
const { fontFamily: archivo } = loadArchivo("normal", {
  weights: ["600", "700"],
});

const BASE = "#0b0d14";
/** Early CTA dwell — enters after the hook, gone before it annoys. */
const EARLY_CTA_SECONDS = 3.2;

type Media = { kind: "video" | "image"; url: string };

const resolveMedia = (visual: SceneVisual | undefined): Media | null =>
  visual && visual.kind !== "color" && visual.url
    ? { kind: visual.kind, url: visual.url }
    : null;

const coverStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

/**
 * Base + rotating conic accent gradient (design `slSpin`, 9s linear
 * infinite) — the continuous motion behind every typography beat.
 */
const SpinBg: React.FC<{ acc: AccentSet; strength: number }> = ({
  acc,
  strength,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const angle = ((frame / fps / 9) * 360) % 360;
  return (
    <AbsoluteFill style={{ background: BASE, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: "-55%",
          opacity: 0.5,
          transform: `rotate(${angle}deg)`,
          background: `conic-gradient(from 20deg, ${alpha(acc.raw, 0)}, ${alpha(acc.raw, strength)} 18%, ${alpha(acc.raw, 0)} 42%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/** 320ms accent flash marking every hard cut (design `slFlash`). */
const Flash: React.FC<{ acc: AccentSet }> = ({ acc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, Math.round(0.32 * fps)], [0.65, 0], {
    extrapolateRight: "clamp",
  });
  if (opacity <= 0) return null;
  return (
    <AbsoluteFill style={{ background: acc.raw, opacity, pointerEvents: "none" }} />
  );
};

/**
 * One slamming word: ~220ms scale 2.3→1 + blur 16→0 with spring
 * overshoot (damping 8, time-compressed to the design's 220ms).
 */
const SlamWord: React.FC<{
  word: string;
  delaySeconds: number;
  color?: string;
}> = ({ word, delaySeconds, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - Math.round(delaySeconds * fps),
    fps,
    config: { damping: 8 },
    durationInFrames: Math.max(1, Math.round(0.22 * fps)),
  });
  const blur = Math.max(0, 16 * (1 - s));
  return (
    <span
      style={{
        display: "inline-block",
        opacity: Math.min(1, s * 2),
        transform: `scale(${interpolate(s, [0, 1], [2.3, 1])})`,
        transformOrigin: "50% 85%",
        filter: blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : undefined,
        color,
      }}
    >
      {word}
    </span>
  );
};

/** Hook — Anton 158px words slam in, paced to the spoken hook. */
const HookBeat: React.FC<{
  text: string;
  duration: number;
  acc: AccentSet;
}> = ({ text, duration, acc }) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const speech = Math.max(duration - 0.4, 0.8);
  // Design stagger is 170ms; real pacing follows the voiceover window.
  const per = speech / Math.max(words.length, 1);

  return (
    <AbsoluteFill>
      <SpinBg acc={acc} strength={0.34} />
      <div
        style={{
          position: "absolute",
          left: 76,
          right: 76,
          top: 0,
          bottom: 0,
          display: "flex",
          flexWrap: "wrap",
          alignContent: "center",
          gap: "2px 34px",
          fontFamily: anton,
          fontSize: 158,
          lineHeight: 1.02,
          color: "#fff",
          textTransform: "uppercase",
        }}
      >
        {words.map((w, i) => (
          <SlamWord
            key={i}
            word={w}
            delaySeconds={0.1 + i * per}
            // Every 3rd-ish word goes hot — the script contract carries no
            // per-word emphasis, so the cadence is deterministic.
            color={i % 3 === 2 ? acc.onDark : undefined}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Giant outlined step numeral drifting behind the headline (design
 * `sl-num`, 4.2s ease-in-out alternate ⇒ 8.4s sine period).
 */
const StepNumeral: React.FC<{
  index: number;
  total?: number;
  stroke: string;
  position: React.CSSProperties;
}> = ({ index, total, stroke, position }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const y = 6 + 20 * Math.sin((t / 8.4) * Math.PI * 2);
  return (
    <div
      style={{
        position: "absolute",
        ...position,
        fontFamily: anton,
        fontSize: 430,
        lineHeight: 1,
        color: "transparent",
        WebkitTextStroke: `4px ${stroke}`,
        transform: `translateY(${y.toFixed(2)}px)`,
      }}
    >
      {index}
      {total != null ? (
        <span
          style={{
            fontFamily: archivo,
            fontWeight: 600,
            fontSize: 56,
            color: "#8b93a7",
            WebkitTextStroke: "0px transparent",
          }}
        >
          {" "}
          /{total}
        </span>
      ) : null}
    </div>
  );
};

/** Anton headline sliding in from the left (design `slInX`). */
const useSlideInX = (delaySeconds: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - Math.round(delaySeconds * fps),
    fps,
    config: { damping: 12, mass: 0.6 },
  });
  return {
    opacity: Math.min(1, s * 2),
    x: interpolate(s, [0, 1], [-120, 0]),
  };
};

/** 220px accent underline bar drawing in (design `slBar`). */
const AccentBar: React.FC<{
  acc: AccentSet;
  delaySeconds: number;
  style?: React.CSSProperties;
}> = ({ acc, delaySeconds, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - Math.round(delaySeconds * fps),
    fps,
    config: { damping: 14 },
  });
  return (
    <div
      style={{
        height: 16,
        borderRadius: 8,
        width: 220 * s,
        background: acc.raw,
        ...style,
      }}
    />
  );
};

/** Media scene: linear zoom footage, grade, numeral, headline + bar. */
const MediaBeat: React.FC<{
  index: number;
  total: number;
  headline: string;
  media: Media;
  acc: AccentSet;
  durationInFrames: number;
}> = ({ index, total, headline, media, acc, durationInFrames }) => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.09]);
  const slide = useSlideInX(0.12);

  return (
    <AbsoluteFill style={{ background: BASE }}>
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
          {media.kind === "video" ? (
            <OffthreadVideo src={media.url} muted style={coverStyle} />
          ) : (
            <Img src={media.url} style={coverStyle} />
          )}
        </AbsoluteFill>
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(11,13,20,0.25), rgba(11,13,20,0) 35%, rgba(11,13,20,0.05) 55%, rgba(11,13,20,0.88))",
        }}
      />
      <StepNumeral
        index={index}
        total={total}
        stroke={acc.onDark}
        position={{ right: 40, top: 130 }}
      />
      <div
        style={{
          position: "absolute",
          left: 76,
          right: 200,
          bottom: 560,
          fontFamily: anton,
          fontSize: 112,
          lineHeight: 1.04,
          color: "#fff",
          textTransform: "uppercase",
          opacity: slide.opacity,
          transform: `translateX(${slide.x}px)`,
        }}
      >
        {headline}
      </div>
      <AccentBar
        acc={acc}
        delaySeconds={0.3}
        style={{ position: "absolute", left: 76, bottom: 500 }}
      />
      <Flash acc={acc} />
    </AbsoluteFill>
  );
};

/**
 * Fallback beat (no usable footage): conic spin + diagonal accent sweep
 * + outlined numeral + two-tone type wall — intentional, never degraded.
 */
const FallbackBeat: React.FC<{
  index: number;
  headline: string;
  acc: AccentSet;
}> = ({ index, headline, acc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  // Diagonal accent sweep, 3.4s linear loop from -30% to 120% (design `slSweep`).
  const sweepLeft = -30 + ((t % 3.4) / 3.4) * 150;
  const line1 = useSlideInX(0.05);
  const line2 = useSlideInX(0.2);

  const words = headline.trim().split(/\s+/).filter(Boolean);
  const half = Math.ceil(words.length / 2);
  const lineStyle: React.CSSProperties = {
    display: "block",
    fontFamily: anton,
    fontSize: 150,
    lineHeight: 1.04,
    textTransform: "uppercase",
  };

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <SpinBg acc={acc} strength={0.5} />
      <div
        style={{
          position: "absolute",
          top: "-20%",
          bottom: "-20%",
          width: 220,
          left: `${sweepLeft}%`,
          transform: "rotate(18deg)",
          opacity: 0.16,
          background: `linear-gradient(90deg, transparent, ${acc.raw}, transparent)`,
        }}
      />
      <StepNumeral
        index={index}
        stroke={alpha(acc.onDark, 0.55)}
        position={{ left: 40, top: 90 }}
      />
      <div style={{ position: "absolute", left: 76, right: 76, top: 680 }}>
        <span
          style={{
            ...lineStyle,
            color: "#fff",
            opacity: line1.opacity,
            transform: `translateX(${line1.x}px)`,
          }}
        >
          {words.slice(0, half).join(" ")}
        </span>
        <span
          style={{
            ...lineStyle,
            color: "transparent",
            WebkitTextStroke: `3px ${acc.onDark}`,
            opacity: line2.opacity,
            transform: `translateX(${line2.x}px)`,
          }}
        >
          {words.slice(half).join(" ")}
        </span>
        <AccentBar acc={acc} delaySeconds={0.35} style={{ marginTop: 34 }} />
      </div>
      <Flash acc={acc} />
    </AbsoluteFill>
  );
};

/** Dark CTA pill top-left, guarded-accent border + dot (design `sl-cta`). */
const EarlyCta: React.FC<{
  domain: string;
  acc: AccentSet;
  locale?: string;
}> = ({ domain, acc, locale }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 13, mass: 0.6 } });
  const exit = spring({
    frame: frame - (durationInFrames - Math.round(0.35 * fps)),
    fps,
    config: { damping: 20 },
  });
  const x =
    interpolate(enter, [0, 1], [-480, 0]) + interpolate(exit, [0, 1], [0, -480]);

  return (
    <div
      style={{
        position: "absolute",
        left: 76,
        top: 220,
        transform: `translateX(${x}px)`,
        opacity: Math.min(1, enter * 2) * (1 - exit),
        display: "flex",
        alignItems: "center",
        gap: 18,
        fontFamily: archivo,
        fontWeight: 700,
        fontSize: 42,
        color: "#fff",
        background: "rgba(8,10,16,0.72)",
        border: `3px solid ${acc.onDark}`,
        borderRadius: 999,
        padding: "16px 34px",
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          background: acc.onDark,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {str("fullGuide", locale)} → {domain}
    </div>
  );
};

/** ~2s outro: accent stamp pill + "link in description" line. */
const OutroBeat: React.FC<{
  domain: string;
  acc: AccentSet;
  locale?: string;
}> = ({ domain, acc, locale }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Stamp: scale 2→1, rotate 3°→0 (design `slStamp`).
  const stamp = spring({
    frame: frame - Math.round(0.1 * fps),
    fps,
    config: { damping: 11, mass: 0.5 },
  });
  const sub = spring({
    frame: frame - Math.round(0.45 * fps),
    fps,
    config: { damping: 8 },
    durationInFrames: Math.max(1, Math.round(0.3 * fps)),
  });

  return (
    <AbsoluteFill>
      <SpinBg acc={acc} strength={0.3} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontFamily: anton,
            fontSize: 96,
            padding: "30px 64px",
            borderRadius: 32,
            background: acc.raw,
            color: acc.ink,
            opacity: Math.min(1, stamp * 2),
            transform: `scale(${interpolate(stamp, [0, 1], [2, 1])}) rotate(${interpolate(stamp, [0, 1], [3, 0])}deg)`,
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
          top: 1120,
          textAlign: "center",
          fontFamily: archivo,
          fontWeight: 600,
          fontSize: 46,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#aeb6c8",
          opacity: Math.min(1, sub * 2),
          transform: `scale(${interpolate(sub, [0, 1], [2.3, 1])})`,
        }}
      >
        {str("linkDesc", locale)}
      </div>
      <Flash acc={acc} />
    </AbsoluteFill>
  );
};

/**
 * Karaoke captions — Archivo 700 64px on a 50% dark pill, centered;
 * active word takes guarded accent + 1.14 scale. Suppressed during hook
 * and cta segments (both carry their own text).
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
        left: 0,
        right: 0,
        bottom: 300,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          // Wide enough that the active word's 1.14 scale overflow
          // (transform takes no layout space) can't visually glue words.
          gap: "4px 30px",
          fontFamily: archivo,
          fontWeight: 700,
          fontSize: 64,
          color: "#fff",
          textAlign: "center",
          background: "rgba(8,10,16,0.5)",
          borderRadius: 24,
          padding: "18px 30px",
          maxWidth: 920,
        }}
      >
        {chunkWords.map((w, i) => {
          const active = t >= w.start && t < w.end;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                color: active ? acc.onDark : "#fff",
                transform: active ? "scale(1.14)" : "scale(1)",
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export const Slam: React.FC<VideoCompositionProps> = (props) => {
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

  return (
    <AbsoluteFill style={{ backgroundColor: BASE }}>
      {timeline.segments.map((seg) => {
        const from = Math.round(seg.start * fps);
        const dur = Math.max(1, Math.round(seg.duration * fps));
        const media =
          seg.kind === "scene" ? resolveMedia(props.visuals[seg.sceneIndex + 1]) : null;
        return (
          <Sequence key={`${seg.kind}-${seg.sceneIndex}`} from={from} durationInFrames={dur}>
            {seg.kind === "hook" ? (
              <HookBeat text={props.script.hook} duration={seg.duration} acc={acc} />
            ) : seg.kind === "cta" ? (
              <OutroBeat domain={props.domain} acc={acc} locale={props.locale} />
            ) : media ? (
              <MediaBeat
                index={seg.sceneIndex + 1}
                total={totalScenes}
                headline={seg.caption ?? ""}
                media={media}
                acc={acc}
                durationInFrames={dur}
              />
            ) : (
              <FallbackBeat
                index={seg.sceneIndex + 1}
                headline={seg.caption ?? ""}
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
