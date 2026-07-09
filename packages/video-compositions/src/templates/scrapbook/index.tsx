/**
 * "Scrapbook" — paper collage (Reels, TikTok; makers/food/lifestyle).
 *
 * Port of the design handoff at
 * marketing/design_handoff_video_templates (templates-c.jsx, README §5):
 *  - Craft-paper surface (radial #ece2cf→#d8cbb0) + film grain.
 *  - Archivo 900 headlines on torn white strips (28-point clip-path),
 *    Caveat annotations (step badge, domain, link line).
 *  - Pieces "plop" in on a 450ms spring (scale .5→1, rotate 9°→0,
 *    damping ≈ 10) with 140–220ms stagger, then sway ±0.7° continuously
 *    on their own 4–6s cycle — desynced by per-piece phase offsets.
 *  - Accent is decorative (scraps, tape, marker swipes); accent-as-text
 *    is guarded via accentSet().onPaper.
 *  - Fallback beat (visual missing / kind "color") = craft paper +
 *    accent scraps + taped featured photo — intentional, not degraded.
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
import { loadFont as loadArchivo } from "@remotion/google-fonts/Archivo";
import { loadFont as loadCaveat } from "@remotion/google-fonts/Caveat";
import type { SceneVisual, VideoCompositionProps } from "../../types";
import { buildTimeline } from "../../timing";
import { accentSet, alpha, type AccentSet } from "../../shared/accent";
import { str } from "../../shared/strings";

const { fontFamily: archivo } = loadArchivo("normal", { weights: ["700", "900"] });
const { fontFamily: caveat } = loadCaveat("normal", { weights: ["700"] });

const INK = "#262019";
const CAVEAT_INK = "#3a3226";
const STRIP_BG = "#fdfaf2";
const TAPE_BG = "rgba(250,246,232,.62)";

/** 28-point torn-paper edge — verbatim from templates-c.jsx. */
const TORN =
  "polygon(0% 8%, 3% 2%, 9% 6%, 16% 1%, 24% 5%, 33% 0%, 41% 4%, 52% 1%, 61% 5%, 70% 0%, 79% 4%, 88% 1%, 95% 5%, 100% 2%, 100% 92%, 97% 98%, 90% 94%, 82% 99%, 73% 95%, 63% 100%, 54% 96%, 44% 99%, 35% 95%, 25% 100%, 16% 96%, 8% 99%, 2% 95%, 0% 100%)";

/** feTurbulence grain texture — verbatim from templates-c.jsx (GRAIN2). */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='m'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23m)' opacity='0.45'/%3E%3C/svg%3E\")";

/**
 * Continuous ±0.7° sway on a per-piece 4–6s cycle. Deterministic:
 * period and phase derive from the piece index (no Math.random), so
 * pieces desync but every render is identical.
 */
const swayTransform = (t: number, seed: number): string => {
  const period = 4 + ((seed * 1.7) % 2); // 4–6s
  const phase = seed * 1.37;
  const wave = Math.sin((t / period) * Math.PI * 2 + phase);
  const rot = wave * 0.7;
  const y = (wave + 1) * -5; // 0 → -10px, matching the CSS alternate loop
  return `rotate(${rot}deg) translateY(${y}px)`;
};

/**
 * A collage piece: plops in (450ms spring, scale .5→1, rotate 9°→0)
 * after `delay` seconds, then sways forever on its own cycle.
 */
const Piece: React.FC<{
  delay: number;
  seed: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ delay, seed, style, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const s = spring({
    frame: frame - Math.round(delay * fps),
    fps,
    config: { damping: 10, mass: 0.5 },
  });
  const scale = 0.5 + 0.5 * s;
  const rotate = 9 * (1 - s);
  return (
    <div style={{ position: "absolute", ...style }}>
      <div
        style={{
          opacity: Math.min(1, s * 2),
          transform: `scale(${scale}) rotate(${rotate}deg)`,
        }}
      >
        <div style={{ transform: swayTransform(t, seed) }}>{children}</div>
      </div>
    </div>
  );
};

/** Torn white strip carrying Archivo 900 ink text. */
const TornStrip: React.FC<{
  fontSize?: number;
  rotate?: number;
  children: React.ReactNode;
}> = ({ fontSize = 88, rotate = 0, children }) => (
  <div
    style={{
      background: STRIP_BG,
      boxShadow: "0 10px 30px rgba(60,45,20,.28)",
      padding: "22px 44px",
      clipPath: TORN,
      fontFamily: archivo,
      fontWeight: 900,
      fontSize,
      lineHeight: 1.05,
      color: INK,
      width: "fit-content",
      maxWidth: "100%",
      transform: `rotate(${rotate}deg)`,
    }}
  >
    {children}
  </div>
);

/** Two masking-tape corners; the right one is tinted with raw accent. */
const Tapes: React.FC<{ accentRaw: string }> = ({ accentRaw }) => {
  const tape: React.CSSProperties = {
    position: "absolute",
    width: 190,
    height: 64,
    background: TAPE_BG,
    boxShadow: "0 4px 12px rgba(60,45,20,.18)",
  };
  return (
    <>
      <div style={{ ...tape, left: -60, top: -26, transform: "rotate(-38deg)" }} />
      <div
        style={{
          ...tape,
          right: -60,
          top: -26,
          transform: "rotate(34deg)",
          background: alpha(accentRaw, 0.4),
        }}
      />
    </>
  );
};

/** Background paper scrap drifting continuously (scFloat port). */
const Scrap: React.FC<{
  seed: number;
  color: string;
  clip: string;
  style: React.CSSProperties;
}> = ({ seed, color, clip, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const wave = Math.sin((t / 5.4) * Math.PI * 2 + seed * 2.1);
  return (
    <div
      style={{
        position: "absolute",
        ...style,
        background: color,
        clipPath: clip,
        transform: `translate(${(wave + 1) * 9}px, ${(wave + 1) * -13}px) rotate(${-3 + (wave + 1) * 2.5}deg)`,
      }}
    />
  );
};

/** Hand-drawn circle step badge — Caveat numeral "1 of 4". */
const StepBadge: React.FC<{
  index: number;
  total: number;
  locale: string | undefined;
  size?: number;
}> = ({ index, total, locale, size = 230 }) => (
  <div
    style={{
      width: size,
      height: size,
      border: `6px solid ${INK}`,
      borderRadius: "50%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      transform: "rotate(-4deg)",
      background: "rgba(253,250,242,.7)",
      fontFamily: caveat,
      fontWeight: 700,
      color: CAVEAT_INK,
    }}
  >
    <span style={{ fontSize: size * 0.48, lineHeight: 1 }}>{index}</span>
    <span style={{ fontSize: size * 0.17 }}>
      {str("of", locale)} {total}
    </span>
  </div>
);

/** Taped polaroid frame around a photo/clip. */
const TapedPhoto: React.FC<{
  accentRaw: string;
  rotate: number;
  width?: number | string;
  children: React.ReactNode;
}> = ({ accentRaw, rotate, width, children }) => (
  <div
    style={{
      background: "#fff",
      padding: "18px 18px 84px",
      boxShadow: "0 24px 50px rgba(60,45,20,.35)",
      transform: `rotate(${rotate}deg)`,
      position: "relative",
      width,
    }}
  >
    <Tapes accentRaw={accentRaw} />
    {children}
  </div>
);

const Media: React.FC<{ visual: SceneVisual; height: number }> = ({
  visual,
  height,
}) => {
  const style: React.CSSProperties = {
    width: "100%",
    height,
    objectFit: "cover",
    display: "block",
  };
  return visual.kind === "video" ? (
    <OffthreadVideo src={visual.url!} muted style={style} />
  ) : (
    <Img src={visual.url!} style={style} />
  );
};

/** Hook: proposition on torn strips, cold open, no title card. */
const HookBeat: React.FC<{
  text: string;
  acc: AccentSet;
  domain: string;
  featuredImageUrl: string | null;
}> = ({ text, acc, domain, featuredImageUrl }) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const half = Math.ceil(words.length / 2);
  const strip = (ws: string[], offset: number, delay: number, rotate: number, seed: number) => (
    <Piece key={seed} delay={delay} seed={seed} style={{ position: "relative" }}>
      <TornStrip rotate={rotate}>
        {ws.map((w, i) => {
          // No hot-word metadata on the wire — deterministic emphasis
          // (every 3rd word) mirrors the punch template's convention.
          const hot = (i + offset) % 3 === 2;
          return (
            <span
              key={i}
              style={
                hot
                  ? {
                      background: acc.raw,
                      color: acc.ink,
                      padding: "0 16px",
                      boxDecorationBreak: "clone",
                      WebkitBoxDecorationBreak: "clone",
                    }
                  : undefined
              }
            >
              {w}{" "}
            </span>
          );
        })}
      </TornStrip>
    </Piece>
  );

  return (
    <AbsoluteFill>
      <Scrap
        seed={1}
        color={alpha(acc.raw, 0.85)}
        clip="polygon(4% 0,100% 6%,94% 100%,0 92%)"
        style={{ left: -60, top: 160, width: 340, height: 260 }}
      />
      <Scrap
        seed={2}
        color={STRIP_BG}
        clip="polygon(0 10%,90% 0,100% 88%,8% 100%)"
        style={{ right: -80, bottom: 420, width: 300, height: 300 }}
      />
      <div
        style={{
          position: "absolute",
          left: 70,
          right: 70,
          top: 520,
          display: "flex",
          flexDirection: "column",
          gap: 30,
          alignItems: "center",
        }}
      >
        {strip(words.slice(0, half), 0, 0.1, -2, 3)}
        {strip(words.slice(half), half, 0.32, 1.6, 4)}
      </div>
      {featuredImageUrl ? (
        <Piece delay={0.55} seed={5} style={{ right: 90, bottom: 330 }}>
          <TapedPhoto accentRaw={acc.raw} rotate={5} width={360}>
            <Img
              src={featuredImageUrl}
              style={{ width: "100%", height: 300, objectFit: "cover", display: "block" }}
            />
            <div
              style={{
                fontFamily: caveat,
                fontWeight: 700,
                color: CAVEAT_INK,
                fontSize: 44,
                textAlign: "center",
                marginTop: 10,
              }}
            >
              {domain}
            </div>
          </TapedPhoto>
        </Piece>
      ) : null}
    </AbsoluteFill>
  );
};

/** One scene: taped media collage, or the craft-paper fallback beat. */
const SceneBeat: React.FC<{
  sceneIndex: number;
  caption: string;
  visual: SceneVisual | undefined;
  acc: AccentSet;
  locale: string | undefined;
  totalScenes: number;
  featuredImageUrl: string | null;
}> = ({ sceneIndex, caption, visual, acc, locale, totalScenes, featuredImageUrl }) => {
  const hasMedia = Boolean(visual && visual.kind !== "color" && visual.url);
  const seedBase = sceneIndex * 7 + 11;
  // Alternate tilts per scene so consecutive beats read as a re-arranged
  // collage, not a repeated layout.
  const flip = sceneIndex % 2 === 0 ? 1 : -1;

  if (hasMedia) {
    return (
      <AbsoluteFill>
        <Piece delay={0.1} seed={seedBase} style={{ left: 90, right: 90, top: 420 }}>
          <TapedPhoto accentRaw={acc.raw} rotate={2.2 * flip}>
            <Media visual={visual!} height={720} />
          </TapedPhoto>
        </Piece>
        <Piece delay={0.4} seed={seedBase + 1} style={{ left: 80, top: 300 }}>
          <StepBadge index={sceneIndex + 1} total={totalScenes} locale={locale} />
        </Piece>
        <Piece
          delay={0.55}
          seed={seedBase + 2}
          style={{ left: 70, right: 70, bottom: 470, display: "flex", justifyContent: "center" }}
        >
          <TornStrip fontSize={78} rotate={-1.4 * flip}>
            {caption}
          </TornStrip>
        </Piece>
      </AbsoluteFill>
    );
  }

  // FALLBACK — no usable stock: craft paper + accent scraps + taped
  // featured photo. Designed to look intentional, never degraded.
  return (
    <AbsoluteFill>
      <Scrap
        seed={seedBase}
        color={alpha(acc.raw, 0.8)}
        clip="polygon(6% 0,100% 8%,92% 100%,0 90%)"
        style={{ left: -70, bottom: 500, width: 380, height: 300 }}
      />
      {featuredImageUrl ? (
        <Piece delay={0.1} seed={seedBase + 1} style={{ right: 70, top: 300 }}>
          <TapedPhoto accentRaw={acc.raw} rotate={-4 * flip} width={420}>
            <Img
              src={featuredImageUrl}
              style={{ width: "100%", height: 360, objectFit: "cover", display: "block" }}
            />
          </TapedPhoto>
        </Piece>
      ) : (
        <Scrap
          seed={seedBase + 1}
          color={STRIP_BG}
          clip="polygon(0 10%,90% 0,100% 88%,8% 100%)"
          style={{ right: -60, top: 320, width: 320, height: 280 }}
        />
      )}
      <Piece delay={0.3} seed={seedBase + 2} style={{ left: 90, top: 380 }}>
        <StepBadge index={sceneIndex + 1} total={totalScenes} locale={locale} size={200} />
      </Piece>
      <div
        style={{
          position: "absolute",
          left: 70,
          right: 70,
          top: 850,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Piece delay={0.45} seed={seedBase + 3} style={{ position: "relative", maxWidth: "100%" }}>
          <TornStrip fontSize={92} rotate={1.8 * flip}>
            {caption}
          </TornStrip>
        </Piece>
      </div>
    </AbsoluteFill>
  );
};

/**
 * Early CTA: masking-tape strip, Caveat, top-center (y=224 — inside the
 * y ≥ 180 safe zone). Drops in after the hook, gone in ~3s.
 */
const EarlyCta: React.FC<{ domain: string; locale: string | undefined }> = ({
  domain,
  locale,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 12, mass: 0.6 } });
  const exit = interpolate(
    frame,
    [durationInFrames - Math.round(0.35 * fps), durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const y = interpolate(enter, [0, 1], [-80, 0]) - exit * 80;
  const rot = interpolate(enter, [0, 1], [-6, -1.6]);

  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: 224,
          transform: `translateY(${y}px) rotate(${rot}deg)`,
          opacity: Math.min(1, enter * 2) * (1 - exit),
          background: "rgba(250,246,232,.9)",
          boxShadow: "0 8px 22px rgba(60,45,20,.25)",
          padding: "16px 46px",
          fontFamily: caveat,
          fontWeight: 700,
          fontSize: 52,
          color: "#33291a",
          maxWidth: 900,
        }}
      >
        {str("fullGuide", locale)} → {domain}
      </div>
    </AbsoluteFill>
  );
};

/** Outro (~2s): taped card — Archivo domain + guarded Caveat link line. */
const OutroBeat: React.FC<{
  domain: string;
  acc: AccentSet;
  locale: string | undefined;
}> = ({ domain, acc, locale }) => (
  <AbsoluteFill>
    <Piece delay={0.08} seed={31} style={{ left: 120, right: 120, top: 780 }}>
      <div
        style={{
          background: "#fff",
          padding: "54px 40px",
          boxShadow: "0 24px 50px rgba(60,45,20,.35)",
          transform: "rotate(-1.2deg)",
          position: "relative",
          textAlign: "center",
        }}
      >
        <Tapes accentRaw={acc.raw} />
        <div style={{ fontFamily: archivo, fontWeight: 900, fontSize: 74, color: INK }}>
          {domain}
        </div>
        <div
          style={{
            fontFamily: caveat,
            fontWeight: 700,
            fontSize: 56,
            marginTop: 16,
            // Accent-as-text on the white card — guarded, never raw.
            color: acc.onPaper,
          }}
        >
          {str("linkDesc", locale)}
        </div>
      </div>
    </Piece>
  </AbsoluteFill>
);

/**
 * Karaoke captions on small torn white chunks; the active word gets an
 * accent marker swipe (scaleX 0→1 behind the word). Suppressed during
 * hook (text already on screen) and cta (outro carries the message).
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
    <AbsoluteFill
      style={{ justifyContent: "flex-end", alignItems: "center", padding: "0 70px 300px" }}
    >
      <div
        style={{
          background: STRIP_BG,
          boxShadow: "0 8px 20px rgba(60,45,20,.25)",
          clipPath: TORN,
          padding: "14px 26px",
          fontFamily: archivo,
          fontWeight: 700,
          fontSize: 52,
          color: INK,
          textAlign: "center",
          maxWidth: 940,
        }}
      >
        {chunkWords.map((w, i) => {
          const active = t >= w.start && t < w.end;
          // Marker swipe: the accent block wipes across the word in
          // ~120ms as it becomes active.
          const swipe = active
            ? Math.min(Math.max((t - w.start) / 0.12, 0), 1)
            : 0;
          return (
            <span
              key={i}
              style={{
                position: "relative",
                display: "inline-block",
                padding: "0 8px",
                marginRight: "0.18em",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  inset: "4px -2px",
                  background: acc.raw,
                  borderRadius: 6,
                  transform: `scaleX(${swipe})`,
                  transformOrigin: "0 50%",
                }}
              />
              <span style={{ position: "relative", color: swipe > 0.4 ? acc.ink : INK }}>
                {w.word}
              </span>
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const EARLY_CTA_SECONDS = 3.0;

export const Scrapbook: React.FC<VideoCompositionProps> = (props) => {
  const { fps } = useVideoConfig();
  const acc = accentSet(props.settings.paletteAccent ?? "#38bdf8");
  const timeline = React.useMemo(
    () => buildTimeline(props.script, props.words),
    [props.script, props.words],
  );
  const hook = timeline.segments[0];
  const totalScenes = props.script.scenes.length;

  return (
    <AbsoluteFill
      style={{
        // Craft-paper surface — the one constant across every beat.
        background: "radial-gradient(120% 90% at 30% 20%, #ece2cf, #e2d6bd 60%, #d8cbb0)",
        overflow: "hidden",
      }}
    >
      {timeline.segments.map((seg) => {
        const from = Math.round(seg.start * fps);
        const dur = Math.max(1, Math.round(seg.duration * fps));
        return (
          <Sequence key={`${seg.kind}-${seg.sceneIndex}`} from={from} durationInFrames={dur}>
            {seg.kind === "hook" ? (
              <HookBeat
                text={props.script.hook}
                acc={acc}
                domain={props.domain}
                featuredImageUrl={props.featuredImageUrl}
              />
            ) : seg.kind === "cta" ? (
              <OutroBeat domain={props.domain} acc={acc} locale={props.locale} />
            ) : (
              <SceneBeat
                sceneIndex={seg.sceneIndex}
                caption={seg.caption ?? ""}
                visual={props.visuals[seg.sceneIndex + 1]}
                acc={acc}
                locale={props.locale}
                totalScenes={totalScenes}
                featuredImageUrl={props.featuredImageUrl}
              />
            )}
          </Sequence>
        );
      })}

      {/* Early CTA tape — enters during scene 1, visible ~3s. */}
      <Sequence
        from={Math.round((hook.start + hook.duration) * fps)}
        durationInFrames={Math.round(EARLY_CTA_SECONDS * fps)}
      >
        <EarlyCta domain={props.domain} locale={props.locale} />
      </Sequence>

      <Captions props={props} acc={acc} />

      {/* Grain sits above everything — 20% opacity paper texture. */}
      <AbsoluteFill
        style={{ backgroundImage: GRAIN, opacity: 0.2, pointerEvents: "none" }}
      />

      {props.voiceoverUrl ? <Audio src={props.voiceoverUrl} /> : null}
    </AbsoluteFill>
  );
};
