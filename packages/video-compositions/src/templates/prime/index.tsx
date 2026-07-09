/**
 * "Prime" — filmic, media-forward. The footage is the star.
 *
 * Port of the design handoff
 * (marketing/design_handoff_video_templates, templates-b.jsx §Prime):
 * Oswald caps with the "movie title" letter-tracking landing
 * (0.3em → 0.035em), continuous Ken Burns on every media beat, a
 * cinematic grade gradient, a 3-step film-grain jitter loop, quiet
 * lower-thirds with a kicker + accent bar, and a near-black outro with
 * an accent floor glow.
 *
 * Accent guard: text, kickers, and bars use `acc.onDark` (lightened
 * until ≥3:1 on the grade black); ONLY the decorative outro floor glow
 * uses the raw accent.
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
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadOswald } from "@remotion/google-fonts/Oswald";
import type { SceneVisual, VideoCompositionProps } from "../../types";
import { buildTimeline } from "../../timing";
import { accentSet, type AccentSet } from "../../shared/accent";
import { str } from "../../shared/strings";

const { fontFamily: OSWALD } = loadOswald("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin", "latin-ext"],
});

const BASE = "#0b0c0f";
const GRADE =
  "linear-gradient(180deg, rgba(5,6,8,0.45), rgba(5,6,8,0.02) 32%, rgba(5,6,8,0.06) 55%, rgba(5,6,8,0.8))";

/** Film-grain feTurbulence tile — verbatim from the design handoff. */
const GRAIN_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E";

/** cubic-bezier(.16,1,.3,1) — shared cinematic easing. */
const EASE = Easing.bezier(0.16, 1, 0.3, 1);

const EARLY_CTA_DELAY_SECONDS = 0.5;
const EARLY_CTA_SECONDS = 3.2;

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Shrink a single-line display size so long strings never clip. */
const fitFontSize = (base: number, text: string, maxWidth: number, emPerChar: number): number =>
  Math.min(base, Math.floor(maxWidth / Math.max(1, text.length * emPerChar)));

/** 3-step grain jitter loop (0.6s cycle) over every beat. */
const GrainJitter: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const offsets: Array<[number, number]> = [
    [0, 0],
    [-40, 26],
    [30, -34],
  ];
  const [x, y] = offsets[Math.floor(frame / (0.2 * fps)) % 3];
  return (
    <div
      style={{
        position: "absolute",
        inset: "-10%",
        backgroundImage: `url("${GRAIN_URL}")`,
        opacity: 0.14,
        transform: `translate(${x}px, ${y}px)`,
        pointerEvents: "none",
      }}
    />
  );
};

const Grade: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => (
  <AbsoluteFill style={{ background: GRADE, opacity }} />
);

/**
 * Drifting light-leak blob — a 6s ease-in-out alternate loop
 * approximated with a cosine so it is fully frame-derived.
 */
const LightLeak: React.FC<{
  color: string;
  width: number;
  height: number;
  blur: number;
  opacity: number;
  periodSeconds: number;
  style?: React.CSSProperties;
}> = ({ color, width, height, blur, opacity, periodSeconds, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const p = 0.5 - 0.5 * Math.cos((t * Math.PI) / periodSeconds);
  const x = interpolate(p, [0, 1], [-80, 120]);
  const y = interpolate(p, [0, 1], [-40, 80]);
  return (
    <div
      style={{
        position: "absolute",
        width,
        height,
        borderRadius: "50%",
        filter: `blur(${blur}px)`,
        opacity,
        background: color,
        transform: `translate(${x}px, ${y}px)`,
        ...style,
      }}
    />
  );
};

/** Continuous Ken Burns — push 1.06→1.15 or pan ±28px, always linear. */
const KenBurnsMedia: React.FC<{
  visual: SceneVisual;
  mode: "push" | "pan";
  durationInFrames: number;
  filter?: string;
}> = ({ visual, mode, durationInFrames, filter }) => {
  const frame = useCurrentFrame();
  const transform =
    mode === "push"
      ? `scale(${interpolate(frame, [0, durationInFrames], [1.06, 1.15])})`
      : `scale(1.14) translateX(${interpolate(frame, [0, durationInFrames], [-28, 28])}px)`;
  const media =
    visual.kind === "video" ? (
      <OffthreadVideo
        src={visual.url!}
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    ) : (
      <Img src={visual.url!} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    );
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: BASE }}>
      <AbsoluteFill style={{ transform, filter }}>{media}</AbsoluteFill>
    </AbsoluteFill>
  );
};

/** "Movie title" landing: letter-tracking 0.3em→0.035em + fade, 1.05s. */
const TrackLine: React.FC<{
  delay: number;
  fontSize: number;
  fontWeight: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay, fontSize, fontWeight, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = interpolate(frame - delay * fps, [0, 1.05 * fps], [0, 1], {
    easing: EASE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const tracking = interpolate(p, [0, 1], [0.3, 0.035]);
  return (
    <div
      style={{
        fontFamily: OSWALD,
        fontWeight,
        fontSize,
        lineHeight: 1.16,
        color: "#fff",
        textTransform: "uppercase",
        opacity: p,
        letterSpacing: `${tracking}em`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Kicker row: accent bar(s) + "01 / 04" tracked count. */
const Kicker: React.FC<{
  index: number;
  total: number;
  acc: AccentSet;
  centered?: boolean;
}> = ({ index, total, acc, centered }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: centered ? "center" : "flex-start",
      gap: 24,
    }}
  >
    <div style={{ width: 90, height: 5, background: acc.onDark }} />
    <span
      style={{
        fontFamily: OSWALD,
        fontWeight: 500,
        fontSize: 44,
        letterSpacing: "0.3em",
        color: acc.onDark,
      }}
    >
      {pad2(index)} / {pad2(total)}
    </span>
    {centered ? <div style={{ width: 90, height: 5, background: acc.onDark }} /> : null}
  </div>
);

/** Cold open: footage + grade + two tracked title lines + hairline. */
const HookBeat: React.FC<{
  props: VideoCompositionProps;
  acc: AccentSet;
  durationInFrames: number;
}> = ({ props, acc, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hookVisual = props.visuals[0];
  const usable = hookVisual && hookVisual.kind !== "color" && hookVisual.url;
  const words = props.script.hook.trim().split(/\s+/).filter(Boolean);
  const half = Math.ceil(words.length / 2);
  const hair = interpolate(frame - 0.2 * fps, [0, 0.9 * fps], [0, 1], {
    easing: EASE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: BASE }}>
      {usable ? (
        <KenBurnsMedia visual={hookVisual!} mode="push" durationInFrames={durationInFrames} />
      ) : props.featuredImageUrl ? (
        <KenBurnsMedia
          visual={{ kind: "image", url: props.featuredImageUrl }}
          mode="push"
          durationInFrames={durationInFrames}
        />
      ) : (
        <LightLeak
          color="#ffffff"
          width={900}
          height={900}
          blur={90}
          opacity={0.14}
          periodSeconds={6}
          style={{ left: -150, top: 260 }}
        />
      )}
      <Grade />
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 90,
          top: 0,
          bottom: 120,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 44,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 150,
            height: 3,
            margin: "0 auto",
            background: acc.onDark,
            transform: `scaleX(${hair})`,
          }}
        />
        <TrackLine delay={0.1} fontSize={96} fontWeight={500}>
          {words.slice(0, half).join(" ")}
        </TrackLine>
        <TrackLine delay={0.45} fontSize={96} fontWeight={500}>
          {words.slice(half).join(" ")}
        </TrackLine>
      </div>
    </AbsoluteFill>
  );
};

/** Media scene: Ken Burns footage, grade, lower-third with kicker. */
const MediaBeat: React.FC<{
  visual: SceneVisual;
  headline: string;
  index: number;
  total: number;
  acc: AccentSet;
  durationInFrames: number;
}> = ({ visual, headline, index, total, acc, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Alternate the Ken Burns move per scene so back-to-back beats differ.
  const mode: "push" | "pan" = index % 2 === 1 ? "pan" : "push";
  const enter = interpolate(frame - 0.15 * fps, [0, 0.7 * fps], [0, 1], {
    easing: EASE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: BASE }}>
      <KenBurnsMedia visual={visual} mode={mode} durationInFrames={durationInFrames} />
      <Grade />
      <div
        style={{
          position: "absolute",
          left: 90,
          // Keep the lower-third clear of the right engagement rail.
          right: 140,
          bottom: 430,
          opacity: enter,
          transform: `translateY(${46 * (1 - enter)}px)`,
        }}
      >
        <Kicker index={index} total={total} acc={acc} />
        <div
          style={{
            fontFamily: OSWALD,
            fontWeight: 600,
            fontSize: 84,
            letterSpacing: "0.04em",
            lineHeight: 1.1,
            color: "#fff",
            textTransform: "uppercase",
            marginTop: 14,
          }}
        >
          {headline}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * Designed fallback for `kind === "color"`: featured image blurred 26px
 * under a heavy grade with a drifting light leak. No featured image ⇒
 * near-black base, the leak alone keeps the beat alive.
 */
const FallbackBeat: React.FC<{
  props: VideoCompositionProps;
  headline: string;
  index: number;
  total: number;
  acc: AccentSet;
  durationInFrames: number;
}> = ({ props, headline, index, total, acc, durationInFrames }) => (
  <AbsoluteFill style={{ backgroundColor: BASE }}>
    {props.featuredImageUrl ? (
      <KenBurnsMedia
        visual={{ kind: "image", url: props.featuredImageUrl }}
        mode="push"
        durationInFrames={durationInFrames}
        filter="blur(26px) brightness(0.5) saturate(0.8)"
      />
    ) : null}
    <Grade opacity={0.9} />
    <LightLeak
      color="#ffffff"
      width={900}
      height={900}
      blur={90}
      opacity={0.14}
      periodSeconds={6}
      style={{ left: -200, top: 300 }}
    />
    <div style={{ position: "absolute", left: 110, right: 110, top: 640, textAlign: "center" }}>
      <Kicker index={index} total={total} acc={acc} centered />
      <TrackLine delay={0.15} fontSize={92} fontWeight={600} style={{ lineHeight: 1.1, marginTop: 34 }}>
        {headline}
      </TrackLine>
    </div>
  </AbsoluteFill>
);

/** Outro (~2s): near-black, RAW-accent floor glow, tracked domain. */
const OutroBeat: React.FC<{ props: VideoCompositionProps; acc: AccentSet }> = ({ props, acc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sub = interpolate(frame - 0.5 * fps, [0, 0.8 * fps], [0, 1], {
    easing: EASE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const domainSize = fitFontSize(100, props.domain, 980, 0.63);
  return (
    <AbsoluteFill style={{ backgroundColor: BASE, overflow: "hidden" }}>
      {/* The one sanctioned RAW-accent use: a decorative floor glow. */}
      <LightLeak
        color={acc.raw}
        width={1400}
        height={900}
        blur={120}
        opacity={0.22}
        periodSeconds={5}
        style={{ left: "50%", bottom: -500, marginLeft: -700 }}
      />
      <div style={{ position: "absolute", left: 40, right: 40, top: 850, textAlign: "center" }}>
        <TrackLine delay={0.1} fontSize={domainSize} fontWeight={600} style={{ lineHeight: 1.1 }}>
          {props.domain}
        </TrackLine>
      </div>
      <div
        style={{
          position: "absolute",
          left: 70,
          right: 70,
          top: 1030,
          textAlign: "center",
          fontFamily: OSWALD,
          fontWeight: 400,
          fontSize: 42,
          letterSpacing: "0.3em",
          lineHeight: 1.5,
          color: "rgba(255,255,255,0.55)",
          textTransform: "uppercase",
          opacity: sub,
          transform: `translateY(${46 * (1 - sub)}px)`,
        }}
      >
        {str("linkDesc", props.locale)}
      </div>
    </AbsoluteFill>
  );
};

/** Early CTA bar: accent tab + tracked caps, top-left, ~3s. */
const EarlyCta: React.FC<{
  domain: string;
  locale: string | undefined;
  acc: AccentSet;
}> = ({ domain, locale, acc }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = interpolate(frame, [0, 0.36 * fps], [0, 1], {
    easing: EASE,
    extrapolateRight: "clamp",
  });
  const exit = interpolate(frame, [durationInFrames - 0.36 * fps, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 90,
        right: 140,
        top: 230,
        display: "flex",
        alignItems: "center",
        gap: 24,
        opacity: enter * (1 - exit),
        transform: `translateX(${-60 * (1 - enter)}px)`,
      }}
    >
      <div style={{ width: 8, height: 56, background: acc.onDark, flexShrink: 0 }} />
      <span
        style={{
          fontFamily: OSWALD,
          fontWeight: 500,
          fontSize: 44,
          letterSpacing: "0.14em",
          color: "#fff",
          textTransform: "uppercase",
          textShadow: "0 3px 18px rgba(0,0,0,0.6)",
        }}
      >
        {str("fullGuide", locale)} → {domain}
      </span>
    </div>
  );
};

/** Karaoke captions: quiet Oswald mid-frame, color-only accent shift. */
const Captions: React.FC<{ props: VideoCompositionProps; acc: AccentSet }> = ({ props, acc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { chunks, words, segments } = React.useMemo(
    () => buildTimeline(props.script, props.words),
    [props.script, props.words],
  );

  // Hook typography and the outro already carry their own copy —
  // captions would double both. Scenes only (same rule as punch).
  const hookEnd = segments[0].start + segments[0].duration;
  const ctaStart = segments[segments.length - 1].start;
  if (t < hookEnd || t >= ctaStart) return null;

  const chunk = chunks.find((c) => t >= c.start && t < c.end);
  if (!chunk) return null;
  const chunkWordsList = words.filter(
    (w) => w.start >= chunk.start - 1e-4 && w.end <= chunk.end + 1e-4,
  );

  return (
    <div
      style={{
        position: "absolute",
        left: 110,
        right: 110,
        top: 880,
        textAlign: "center",
        fontFamily: OSWALD,
        fontWeight: 400,
        fontSize: 56,
        lineHeight: 1.35,
        color: "#f2f3f5",
        textShadow: "0 4px 24px rgba(0,0,0,0.55)",
      }}
    >
      {chunkWordsList.map((w, i) => {
        const active = t >= w.start && t < w.end;
        return (
          // Color-only karaoke shift — the footage stays the star.
          <span key={i} style={{ color: active ? acc.onDark : "#f2f3f5", marginRight: "0.3em" }}>
            {w.word}
          </span>
        );
      })}
    </div>
  );
};

export const Prime: React.FC<VideoCompositionProps> = (props) => {
  const { fps } = useVideoConfig();
  const acc = accentSet(props.settings.paletteAccent ?? "#38bdf8");
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
        const visual = seg.kind === "scene" ? props.visuals[seg.sceneIndex + 1] : undefined;
        const hasMedia = Boolean(visual && visual.kind !== "color" && visual.url);
        return (
          <Sequence key={`${seg.kind}-${seg.sceneIndex}`} from={from} durationInFrames={dur}>
            {seg.kind === "hook" ? (
              <HookBeat props={props} acc={acc} durationInFrames={dur} />
            ) : seg.kind === "cta" ? (
              <OutroBeat props={props} acc={acc} />
            ) : hasMedia ? (
              <MediaBeat
                visual={visual!}
                headline={seg.caption ?? ""}
                index={seg.sceneIndex + 1}
                total={totalScenes}
                acc={acc}
                durationInFrames={dur}
              />
            ) : (
              <FallbackBeat
                props={props}
                headline={seg.caption ?? ""}
                index={seg.sceneIndex + 1}
                total={totalScenes}
                acc={acc}
                durationInFrames={dur}
              />
            )}
          </Sequence>
        );
      })}

      {/* Early CTA bar — enters during scene 1, right after the hook. */}
      <Sequence
        from={Math.round((hook.start + hook.duration + EARLY_CTA_DELAY_SECONDS) * fps)}
        durationInFrames={Math.round(EARLY_CTA_SECONDS * fps)}
      >
        <EarlyCta domain={props.domain} locale={props.locale} acc={acc} />
      </Sequence>

      <Captions props={props} acc={acc} />
      {/* Grain rides above everything, captions included — film, not UI. */}
      <GrainJitter />
      {props.voiceoverUrl ? <Audio src={props.voiceoverUrl} /> : null}
    </AbsoluteFill>
  );
};
