/**
 * "Broadsheet" — editorial authority on paper-white.
 *
 * Port of the design handoff
 * (marketing/design_handoff_video_templates, templates-b.jsx §Broadsheet):
 * Newsreader serif display over the one PAPER surface (#f6f1e7) in the
 * lineup, Inter letter-spaced small caps for labels, baseline
 * lift-reveals, drawn hairline rules, and a continuous 6%-opacity
 * duotone featured-image drift so typography beats are never static.
 *
 * Accent guard: paper is light, so every accent-as-ink use goes through
 * `acc.onPaper` (darkened until ≥3:1 on #f6f1e7). The raw accent never
 * appears as text.
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
import { loadFont as loadNewsreader } from "@remotion/google-fonts/Newsreader";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import type { SceneVisual, VideoCompositionProps } from "../../types";
import { buildTimeline, chunkWords } from "../../timing";
import { accentSet, alpha, type AccentSet } from "../../shared/accent";
import { str } from "../../shared/strings";

const { fontFamily: SERIF } = loadNewsreader("normal", {
  weights: ["400", "500"],
  subsets: ["latin", "latin-ext"],
});
loadNewsreader("italic", {
  weights: ["400", "500"],
  subsets: ["latin", "latin-ext"],
});
const { fontFamily: SANS } = loadInter("normal", {
  weights: ["700", "800"],
  subsets: ["latin", "latin-ext"],
});

const PAPER = "#f6f1e7";
const INK = "#211d15";
const MUTED = "#948a76";
const CAPTION_INK = "#3a352a";

/** Film-grain feTurbulence tile — verbatim from the design handoff. */
const GRAIN_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E";

/** cubic-bezier(.16,1,.3,1) — the template's single editorial easing. */
const EASE = Easing.bezier(0.16, 1, 0.3, 1);

const EARLY_CTA_DELAY_SECONDS = 0.4;
const EARLY_CTA_SECONDS = 3.2;

/** Shrink a single-line display size so long strings never clip. */
const fitFontSize = (base: number, text: string, maxWidth: number, emPerChar: number): number =>
  Math.min(base, Math.floor(maxWidth / Math.max(1, text.length * emPerChar)));

const Grain: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundImage: `url("${GRAIN_URL}")`,
      opacity: 0.16,
      pointerEvents: "none",
    }}
  />
);

/**
 * Continuous duotone featured-image drift — keeps every paper beat
 * moving (platform rule: nothing static). Falls back to a drifting
 * accent wash when there is no featured image.
 */
const DuotoneDrift: React.FC<{
  image: string | null;
  accent: AccentSet;
  opacity: number;
  contrastBoost?: boolean;
}> = ({ image, accent, opacity, contrastBoost }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  // 7s ease-in-out alternate loop (brDrift) approximated with a cosine.
  const p = 0.5 - 0.5 * Math.cos((t * Math.PI) / 7);
  const scale = 1 + 0.03 * p;
  const y = -16 * p;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${scale}) translateY(${y}px)`, opacity }}>
        {image ? (
          <Img
            src={image}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: contrastBoost ? "grayscale(1) contrast(1.1)" : "grayscale(1)",
            }}
          />
        ) : (
          <AbsoluteFill
            style={{
              background: `radial-gradient(120% 90% at 30% 20%, ${alpha(accent.raw, 0.6)}, transparent 70%)`,
            }}
          />
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Baseline lift-reveal: translateY 112% → 0 over 800ms behind a mask. */
const Lift: React.FC<{
  delay: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const y = interpolate(frame - delay * fps, [0, 0.8 * fps], [112, 0], {
    easing: EASE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <span style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom", ...style }}>
      <span style={{ display: "inline-block", transform: `translateY(${y}%)` }}>{children}</span>
    </span>
  );
};

/** Hairline rule drawing scaleX 0 → 1 over 1.1s, left-anchored. */
const Rule: React.FC<{ delay: number; style?: React.CSSProperties }> = ({ delay, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sx = interpolate(frame - delay * fps, [0, 1.1 * fps], [0, 1], {
    easing: EASE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        height: 4,
        background: INK,
        transform: `scaleX(${sx})`,
        transformOrigin: "0 50%",
        ...style,
      }}
    />
  );
};

const smallCaps = (size: number): React.CSSProperties => ({
  fontFamily: SANS,
  fontWeight: 800,
  fontSize: size,
  letterSpacing: "0.3em",
  textTransform: "uppercase",
});

/** Cold open: serif hook on paper, word-by-word baseline lifts. */
const HookBeat: React.FC<{ props: VideoCompositionProps; acc: AccentSet }> = ({ props, acc }) => {
  const words = props.script.hook.trim().split(/\s+/).filter(Boolean);
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <DuotoneDrift image={props.featuredImageUrl} accent={acc} opacity={0.07} contrastBoost />
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 90,
          top: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 48,
        }}
      >
        <div style={{ ...smallCaps(32), letterSpacing: "0.32em", color: MUTED }}>
          <Lift delay={0.05}>{props.domain}</Lift>
        </div>
        <div
          style={{
            fontFamily: SERIF,
            fontWeight: 500,
            fontSize: 112,
            lineHeight: 1.12,
            color: INK,
            display: "flex",
            flexWrap: "wrap",
            columnGap: "0.28em",
          }}
        >
          {words.map((w, i) => {
            // The wire contract carries no authored hot-word indices, so
            // emphasis is deterministic (same rhythm punch uses).
            const hot = i % 3 === 2;
            return (
              <Lift key={i} delay={0.15 + i * 0.09}>
                <span style={hot ? { color: acc.onPaper, fontStyle: "italic" } : undefined}>{w}</span>
              </Lift>
            );
          })}
        </div>
        <Rule delay={0.5} style={{ width: 200 }} />
      </div>
    </AbsoluteFill>
  );
};

/** Media scene: photo/clip above, paper panel with "No. N · of M" below. */
const MediaBeat: React.FC<{
  visual: SceneVisual;
  headline: string;
  index: number;
  total: number;
  acc: AccentSet;
  locale: string | undefined;
  durationInFrames: number;
}> = ({ visual, headline, index, total, acc, locale, durationInFrames }) => {
  const frame = useCurrentFrame();
  const push = interpolate(frame, [0, durationInFrames], [1.02, 1.1]);
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 1050, overflow: "hidden" }}>
        <AbsoluteFill style={{ transform: `scale(${push})` }}>
          {visual.kind === "video" ? (
            <OffthreadVideo
              src={visual.url!}
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <Img src={visual.url!} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
        </AbsoluteFill>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 870,
          background: PAPER,
          padding: "64px 84px 0",
        }}
      >
        <Rule delay={0.15} style={{ width: "100%" }} />
        <div style={{ display: "flex", alignItems: "baseline", gap: 28, marginTop: 44 }}>
          {/* "No." stays a design glyph; only the connector localizes. */}
          <span style={{ ...smallCaps(34), color: acc.onPaper }}>No. {index}</span>
          <span style={{ ...smallCaps(34), color: MUTED }}>
            · {str("of", locale)} {total}
          </span>
        </div>
        <div
          style={{
            fontFamily: SERIF,
            fontWeight: 500,
            fontSize: 92,
            lineHeight: 1.08,
            color: INK,
            marginTop: 26,
          }}
        >
          <Lift delay={0.3}>{headline}</Lift>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Designed fallback for `kind === "color"`: circled numerator on paper. */
const FallbackBeat: React.FC<{
  props: VideoCompositionProps;
  headline: string;
  index: number;
  total: number;
  acc: AccentSet;
  locale: string | undefined;
}> = ({ props, headline, index, total, acc, locale }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = interpolate(frame, [0, fps], [0, 1], {
    easing: EASE,
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <DuotoneDrift image={props.featuredImageUrl} accent={acc} opacity={0.06} />
      <div style={{ position: "absolute", left: 90, right: 90, top: 340 }}>
        <div
          style={{
            width: 300,
            height: 300,
            border: `3px solid ${INK}`,
            borderRadius: "50%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto",
            opacity: enter,
            transform: `scale(${0.85 + 0.15 * enter})`,
          }}
        >
          <span style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 140, lineHeight: 1, color: INK }}>
            {index}
          </span>
          <span style={{ ...smallCaps(34), color: MUTED, marginTop: 10 }}>
            {str("of", locale)} {total}
          </span>
        </div>
        <div
          style={{
            fontFamily: SERIF,
            fontWeight: 500,
            fontSize: 100,
            lineHeight: 1.08,
            color: INK,
            textAlign: "center",
            marginTop: 70,
          }}
        >
          <Lift delay={0.25}>{headline}</Lift>
        </div>
        <Rule delay={0.45} style={{ width: 200, margin: "54px auto 0" }} />
      </div>
    </AbsoluteFill>
  );
};

/** Outro (~2s): drawn rules, small-caps domain, italic accent link line. */
const OutroBeat: React.FC<{ props: VideoCompositionProps; acc: AccentSet }> = ({ props, acc }) => {
  const domainSize = fitFontSize(64, props.domain, 840, 0.83);
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <DuotoneDrift image={props.featuredImageUrl} accent={acc} opacity={0.05} />
      <div style={{ position: "absolute", left: 120, right: 120, top: 830, textAlign: "center" }}>
        <Rule delay={0} style={{ width: 160, margin: "0 auto" }} />
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            letterSpacing: "0.26em",
            textTransform: "uppercase",
            color: INK,
            fontSize: domainSize,
            marginTop: 48,
          }}
        >
          <Lift delay={0.15}>{props.domain}</Lift>
        </div>
        <div
          style={{
            marginTop: 34,
            fontFamily: SERIF,
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: 52,
            color: acc.onPaper,
          }}
        >
          <Lift delay={0.35}>{str("linkDesc", props.locale)}</Lift>
        </div>
        <Rule delay={0.5} style={{ width: 160, margin: "52px auto 0" }} />
      </div>
    </AbsoluteFill>
  );
};

/** Early CTA chip: thin-bordered serif-italic pill, top-center, ~3s. */
const EarlyCta: React.FC<{ domain: string; locale: string | undefined }> = ({ domain, locale }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = interpolate(frame, [0, 0.36 * fps], [0, 1], {
    easing: EASE,
    extrapolateRight: "clamp",
  });
  const exit = interpolate(frame, [durationInFrames - 0.36 * fps, durationInFrames], [0, 1], {
    easing: EASE,
    extrapolateLeft: "clamp",
  });
  const y = -90 * (1 - enter) - 90 * exit;
  return (
    <div
      style={{
        position: "absolute",
        top: 210,
        left: 60,
        right: 60,
        display: "flex",
        justifyContent: "center",
        opacity: enter * (1 - exit),
        transform: `translateY(${y}px)`,
      }}
    >
      <div
        style={{
          border: `2.5px solid ${INK}`,
          borderRadius: 999,
          padding: "16px 40px",
          fontFamily: SERIF,
          fontStyle: "italic",
          fontWeight: 400,
          fontSize: 42,
          color: INK,
          background: alpha(PAPER, 0.85),
        }}
      >
        {str("fullGuide", locale)} → {domain}
      </div>
    </div>
  );
};

/** Karaoke captions: Newsreader italic, no pill, color-only highlight. */
const Captions: React.FC<{ props: VideoCompositionProps; acc: AccentSet }> = ({ props, acc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { words, segments } = React.useMemo(
    () => buildTimeline(props.script, props.words),
    [props.script, props.words],
  );
  // Broadsheet reads at 5-word chunks (design: CapTrack chunk={5}).
  const chunks = React.useMemo(() => chunkWords(words, 5), [words]);

  // The hook is on screen as typography and the outro carries the CTA —
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
        left: 100,
        right: 100,
        bottom: 300,
        textAlign: "center",
        fontFamily: SERIF,
        fontStyle: "italic",
        fontWeight: 400,
        fontSize: 58,
        lineHeight: 1.3,
        color: CAPTION_INK,
      }}
    >
      {chunkWordsList.map((w, i) => {
        const active = t >= w.start && t < w.end;
        return (
          // Color-only karaoke shift — zero scale, readability first.
          <span key={i} style={{ color: active ? acc.onPaper : CAPTION_INK, marginRight: "0.3em" }}>
            {w.word}
          </span>
        );
      })}
    </div>
  );
};

export const Broadsheet: React.FC<VideoCompositionProps> = (props) => {
  const { fps } = useVideoConfig();
  const acc = accentSet(props.settings.paletteAccent ?? "#38bdf8");
  const timeline = React.useMemo(
    () => buildTimeline(props.script, props.words),
    [props.script, props.words],
  );
  const hook = timeline.segments[0];
  const totalScenes = props.script.scenes.length;

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      {timeline.segments.map((seg) => {
        const from = Math.round(seg.start * fps);
        const dur = Math.max(1, Math.round(seg.duration * fps));
        const visual = seg.kind === "scene" ? props.visuals[seg.sceneIndex + 1] : undefined;
        const hasMedia = Boolean(visual && visual.kind !== "color" && visual.url);
        return (
          <Sequence key={`${seg.kind}-${seg.sceneIndex}`} from={from} durationInFrames={dur}>
            {seg.kind === "hook" ? (
              <HookBeat props={props} acc={acc} />
            ) : seg.kind === "cta" ? (
              <OutroBeat props={props} acc={acc} />
            ) : hasMedia ? (
              <MediaBeat
                visual={visual!}
                headline={seg.caption ?? ""}
                index={seg.sceneIndex + 1}
                total={totalScenes}
                acc={acc}
                locale={props.locale}
                durationInFrames={dur}
              />
            ) : (
              <FallbackBeat
                props={props}
                headline={seg.caption ?? ""}
                index={seg.sceneIndex + 1}
                total={totalScenes}
                acc={acc}
                locale={props.locale}
              />
            )}
          </Sequence>
        );
      })}

      {/* Early CTA chip — enters during scene 1, right after the hook. */}
      <Sequence
        from={Math.round((hook.start + hook.duration + EARLY_CTA_DELAY_SECONDS) * fps)}
        durationInFrames={Math.round(EARLY_CTA_SECONDS * fps)}
      >
        <EarlyCta domain={props.domain} locale={props.locale} />
      </Sequence>

      <Captions props={props} acc={acc} />
      <Grain />
      {props.voiceoverUrl ? <Audio src={props.voiceoverUrl} /> : null}
    </AbsoluteFill>
  );
};
