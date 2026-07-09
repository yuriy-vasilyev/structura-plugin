/**
 * "Checklist" — data/utility (Shorts, TikTok; trades/services/technical).
 *
 * Port of the design handoff at
 * marketing/design_handoff_video_templates (templates-c.jsx, README §6):
 *  - Surface #0e1420 + 108px grid lines drifting on a 9s loop.
 *  - Persistent chrome on EVERY beat: segmented top progress bar (one
 *    segment per scene, filling with real playback progress, y=210) +
 *    mono "02/03" counter — the retention device.
 *  - Mechanical 160ms snaps (translateY 26px→0, near-linear); media
 *    reveals via clip-path wipe left→right 300ms inside accent corner
 *    brackets; caret blinks on 1s steps.
 *  - Fallback beat (visual missing / kind "color") = the checklist rows
 *    treatment on the grid — done/now/next states per scene.
 *  - Outro ticks off all scene checkboxes with 120ms stagger, then the
 *    mono domain chip + localized "Link in description".
 *  - All accent strokes/text derive from accentSet().onDark; chip fills
 *    use 16%-alpha raw accent tint. Never raw accent as text.
 */

import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadSpaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";
import type { SceneVisual, VideoCompositionProps } from "../../types";
import { buildTimeline } from "../../timing";
import { accentSet, alpha, type AccentSet } from "../../shared/accent";
import { str } from "../../shared/strings";

const { fontFamily: grotesk } = loadSpaceGrotesk("normal", {
  weights: ["500", "700"],
});
const { fontFamily: mono } = loadJetBrainsMono("normal", {
  weights: ["500", "700"],
});

const BASE = "#0e1420";
const TEXT = "#f4f7fb";
const MUTED = "#8b98ad";
const CAPTION_TEXT = "#dbe3ee";

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Near-linear 160ms mechanical snap: translateY 26px→0 + fade. */
const snap = (t: number, delay: number): React.CSSProperties => {
  const p = Math.min(Math.max((t - delay) / 0.16, 0), 1);
  return { opacity: p, transform: `translateY(${26 * (1 - p)}px)` };
};

/** 108px grid drifting one cell per 9s — the always-on motion layer. */
const GridDrift: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const shift = ((t % 9) / 9) * 108;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: -108,
          backgroundImage:
            "linear-gradient(rgba(148,163,184,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.07) 1px, transparent 1px)",
          backgroundSize: "108px 108px",
          transform: `translate(${shift}px, ${shift}px)`,
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * Persistent chrome: segmented progress bar at y=210 (one segment per
 * scene, filled with REAL playback progress) + mono counter. Rendered
 * at the composition root so it survives every beat.
 */
const Chrome: React.FC<{
  acc: AccentSet;
  totalScenes: number;
  totalDuration: number;
}> = ({ acc, totalScenes, totalDuration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = Math.min((frame / fps) / totalDuration, 1);
  const current = Math.min(Math.floor(p * totalScenes) + 1, totalScenes);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          top: 210,
          display: "flex",
          gap: 12,
        }}
      >
        {Array.from({ length: totalScenes }).map((_, i) => {
          const fill = Math.min(Math.max(p * totalScenes - i, 0), 1);
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: 10,
                borderRadius: 5,
                background: "rgba(148,163,184,.22)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  borderRadius: 5,
                  width: `${fill * 100}%`,
                  background: acc.onDark,
                }}
              />
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: "absolute",
          right: 80,
          top: 250,
          fontFamily: mono,
          fontWeight: 500,
          fontSize: 34,
          color: MUTED,
        }}
      >
        {pad2(current)}/{pad2(totalScenes)}
      </div>
    </>
  );
};

/** Blinking terminal caret — 1s steps(1), on for the first half. */
const Caret: React.FC<{ color: string }> = ({ color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const on = frame % fps < fps / 2;
  return (
    <span
      style={{
        display: "inline-block",
        width: "0.6em",
        height: "1.1em",
        verticalAlign: "text-bottom",
        background: color,
        opacity: on ? 1 : 0,
      }}
    />
  );
};

/** Hook: terminal path line + word-by-word snapping proposition. */
const HookBeat: React.FC<{
  text: string;
  acc: AccentSet;
  domain: string;
}> = ({ text, acc, domain }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const words = text.trim().split(/\s+/).filter(Boolean);

  return (
    <AbsoluteFill
      style={{
        left: 84,
        right: 84,
        width: "auto",
        justifyContent: "center",
        gap: 40,
      }}
    >
      <div
        style={{
          ...snap(t, 0.05),
          fontFamily: mono,
          fontWeight: 500,
          fontSize: 38,
          color: acc.onDark,
          letterSpacing: "0.12em",
        }}
      >
        ~/{domain}
        <Caret color={acc.onDark} />
      </div>
      <div
        style={{
          fontFamily: grotesk,
          fontWeight: 700,
          fontSize: 104,
          lineHeight: 1.1,
          color: TEXT,
          display: "flex",
          flexWrap: "wrap",
          gap: "0 0.3em",
        }}
      >
        {words.map((w, i) => {
          // No hot-word metadata on the wire — deterministic emphasis
          // (every 3rd word), same convention as the punch template.
          const hot = i % 3 === 2;
          return (
            <span
              key={i}
              style={{
                ...snap(t, 0.25 + i * 0.11),
                color: hot ? acc.onDark : TEXT,
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

/** Accent corner brackets framing the media shot. */
const Brackets: React.FC<{ color: string }> = ({ color }) => {
  const corner = (pos: React.CSSProperties, borders: React.CSSProperties) => (
    <div
      style={{
        position: "absolute",
        width: 64,
        height: 64,
        borderStyle: "solid",
        borderWidth: 0,
        borderColor: color,
        ...pos,
        ...borders,
      }}
    />
  );
  return (
    <>
      {corner({ left: -6, top: -6 }, { borderLeftWidth: 6, borderTopWidth: 6 })}
      {corner({ right: -6, top: -6 }, { borderRightWidth: 6, borderTopWidth: 6 })}
      {corner({ left: -6, bottom: -6 }, { borderLeftWidth: 6, borderBottomWidth: 6 })}
      {corner({ right: -6, bottom: -6 }, { borderRightWidth: 6, borderBottomWidth: 6 })}
    </>
  );
};

/** Mono step chip: 16%-alpha accent tint + guarded border/text. */
const StepChip: React.FC<{
  acc: AccentSet;
  locale: string | undefined;
  index: number;
  total: number;
  style?: React.CSSProperties;
}> = ({ acc, locale, index, total, style }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 16,
      padding: "14px 28px",
      borderRadius: 10,
      fontFamily: mono,
      fontWeight: 500,
      fontSize: 36,
      letterSpacing: "0.1em",
      background: alpha(acc.raw, 0.16),
      border: `2px solid ${alpha(acc.onDark, 0.6)}`,
      color: acc.onDark,
      ...style,
    }}
  >
    {str("step", locale).toUpperCase()} {index}/{total}
  </div>
);

/** Media scene: bracketed shot wiping in left→right + step chip + headline. */
const MediaBeat: React.FC<{
  sceneIndex: number;
  caption: string;
  visual: SceneVisual;
  acc: AccentSet;
  locale: string | undefined;
  totalScenes: number;
}> = ({ sceneIndex, caption, visual, acc, locale, totalScenes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  // Clip-path wipe left→right, 300ms, after a 100ms hold.
  const wipe = Math.min(Math.max((t - 0.1) / 0.3, 0), 1);
  const mediaStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  };

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 84,
          right: 84,
          top: 430,
          height: 760,
          clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)`,
        }}
      >
        {visual.kind === "video" ? (
          <OffthreadVideo src={visual.url!} muted style={mediaStyle} />
        ) : (
          <Img src={visual.url!} style={mediaStyle} />
        )}
        <Brackets color={acc.onDark} />
      </div>
      <div style={{ position: "absolute", left: 84, right: 84, top: 1250 }}>
        <div style={snap(t, 0.25)}>
          <StepChip acc={acc} locale={locale} index={sceneIndex + 1} total={totalScenes} />
        </div>
        <div
          style={{
            ...snap(t, 0.35),
            fontFamily: grotesk,
            fontWeight: 700,
            fontSize: 90,
            lineHeight: 1.08,
            color: TEXT,
            marginTop: 26,
          }}
        >
          {caption}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * FALLBACK — no usable stock: the checklist-rows treatment on the grid.
 * Every scene caption becomes a row; rows before the current scene are
 * done (ticked), the current one is "now" (accent tint + border), later
 * ones are dimmed. Designed to look intentional, never degraded.
 */
const FallbackBeat: React.FC<{
  sceneIndex: number;
  captions: string[];
  acc: AccentSet;
}> = ({ sceneIndex, captions, acc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 84,
          right: 84,
          top: 480,
          display: "flex",
          flexDirection: "column",
          gap: 26,
        }}
      >
        {captions.map((cap, i) => {
          const state = i < sceneIndex ? "done" : i === sceneIndex ? "now" : "next";
          return (
            <div
              key={i}
              style={{
                ...snap(t, 0.15 + i * 0.14),
                display: "flex",
                alignItems: "center",
                gap: 34,
                padding: "34px 40px",
                borderRadius: 14,
                background: state === "now" ? alpha(acc.raw, 0.14) : "rgba(148,163,184,.06)",
                border:
                  state === "now"
                    ? `3px solid ${alpha(acc.onDark, 0.7)}`
                    : "3px solid transparent",
                opacity: state === "next" ? 0.55 : undefined,
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 10,
                  border: `4px solid ${state !== "next" ? acc.onDark : "rgba(148,163,184,.5)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "none",
                }}
              >
                {state === "done" ? (
                  <span style={{ fontSize: 40, lineHeight: 1, fontWeight: 900, color: acc.onDark }}>
                    ✓
                  </span>
                ) : null}
                {state === "now" ? (
                  <span
                    style={{ width: 22, height: 22, background: acc.onDark, borderRadius: 4 }}
                  />
                ) : null}
              </div>
              <span
                style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 62, color: TEXT }}
              >
                {cap}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontFamily: mono,
                  fontWeight: 500,
                  fontSize: 34,
                  color: MUTED,
                }}
              >
                {pad2(i + 1)}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Early CTA: bordered mono chip at left 84 / top 230 wiping in like the
 * media frames. Enters during scene 1, gone in ~3s.
 */
const EarlyCta: React.FC<{
  domain: string;
  acc: AccentSet;
  locale: string | undefined;
}> = ({ domain, acc, locale }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const wipe = Math.min(Math.max(t / 0.27, 0), 1);
  const exit = interpolate(
    frame,
    [durationInFrames - Math.round(0.34 * fps), durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        left: 84,
        top: 230,
        clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)`,
        opacity: 1 - exit,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 16,
          padding: "14px 28px",
          borderRadius: 10,
          fontFamily: mono,
          fontWeight: 500,
          fontSize: 36,
          letterSpacing: "0.1em",
          border: `3px solid ${acc.onDark}`,
          color: acc.onDark,
          background: alpha(BASE, 0.7),
        }}
      >
        <span style={{ width: 14, height: 14, background: acc.onDark, display: "inline-block" }} />
        {str("fullGuide", locale)} → {domain}
      </div>
    </div>
  );
};

/**
 * Outro (~2s): every scene checkbox ticks off with a 120ms stagger,
 * then the mono domain chip + localized "Link in description".
 */
const OutroBeat: React.FC<{
  domain: string;
  acc: AccentSet;
  locale: string | undefined;
  totalScenes: number;
}> = ({ domain, acc, locale, totalScenes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 700,
          display: "flex",
          justifyContent: "center",
          gap: 30,
        }}
      >
        {Array.from({ length: totalScenes }).map((_, i) => (
          <div
            key={i}
            style={{
              ...snap(t, 0.05 + i * 0.12),
              width: 56,
              height: 56,
              borderRadius: 10,
              border: `4px solid ${acc.onDark}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 40, lineHeight: 1, fontWeight: 900, color: acc.onDark }}>
              ✓
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          ...snap(t, 0.4),
          position: "absolute",
          left: 0,
          right: 0,
          top: 880,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "24px 48px",
            borderRadius: 10,
            border: `4px solid ${acc.onDark}`,
            fontFamily: mono,
            fontWeight: 700,
            fontSize: 60,
            letterSpacing: "0.1em",
            color: TEXT,
          }}
        >
          {domain}
        </div>
      </div>
      <div
        style={{
          ...snap(t, 0.6),
          position: "absolute",
          left: 0,
          right: 0,
          top: 1080,
          textAlign: "center",
          fontFamily: mono,
          fontWeight: 500,
          fontSize: 40,
          color: MUTED,
        }}
      >
        {str("linkDesc", locale)}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Karaoke captions: Space Grotesk 500, accent selection block behind
 * the active word — a moving text cursor. Suppressed during hook and
 * cta segments (their text is already on screen).
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
      style={{ justifyContent: "flex-end", alignItems: "center", padding: "0 90px 300px" }}
    >
      <div
        style={{
          fontFamily: grotesk,
          fontWeight: 500,
          fontSize: 56,
          lineHeight: 1.4,
          textAlign: "center",
          color: CAPTION_TEXT,
          maxWidth: 900,
        }}
      >
        {chunkWords.map((w, i) => {
          const active = t >= w.start && t < w.end;
          return (
            <span
              key={i}
              style={{
                padding: "0 6px",
                borderRadius: 8,
                marginRight: "0.2em",
                background: active ? acc.raw : undefined,
                color: active ? acc.ink : CAPTION_TEXT,
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

const EARLY_CTA_SECONDS = 3.0;

export const Checklist: React.FC<VideoCompositionProps> = (props) => {
  const { fps } = useVideoConfig();
  const acc = accentSet(props.settings.paletteAccent ?? "#38bdf8");
  const timeline = React.useMemo(
    () => buildTimeline(props.script, props.words),
    [props.script, props.words],
  );
  const hook = timeline.segments[0];
  const totalScenes = props.script.scenes.length;
  const sceneCaptions = props.script.scenes.map((s) => s.caption);

  return (
    <AbsoluteFill style={{ backgroundColor: BASE, overflow: "hidden" }}>
      <GridDrift />

      {timeline.segments.map((seg) => {
        const from = Math.round(seg.start * fps);
        const dur = Math.max(1, Math.round(seg.duration * fps));
        const visual = props.visuals[seg.sceneIndex + 1];
        const hasMedia = Boolean(visual && visual.kind !== "color" && visual.url);
        return (
          <Sequence key={`${seg.kind}-${seg.sceneIndex}`} from={from} durationInFrames={dur}>
            {seg.kind === "hook" ? (
              <HookBeat text={props.script.hook} acc={acc} domain={props.domain} />
            ) : seg.kind === "cta" ? (
              <OutroBeat
                domain={props.domain}
                acc={acc}
                locale={props.locale}
                totalScenes={totalScenes}
              />
            ) : hasMedia ? (
              <MediaBeat
                sceneIndex={seg.sceneIndex}
                caption={seg.caption ?? ""}
                visual={visual!}
                acc={acc}
                locale={props.locale}
                totalScenes={totalScenes}
              />
            ) : (
              <FallbackBeat sceneIndex={seg.sceneIndex} captions={sceneCaptions} acc={acc} />
            )}
          </Sequence>
        );
      })}

      {/* Early CTA chip — enters during scene 1, visible ~3s. */}
      <Sequence
        from={Math.round((hook.start + hook.duration) * fps)}
        durationInFrames={Math.round(EARLY_CTA_SECONDS * fps)}
      >
        <EarlyCta domain={props.domain} acc={acc} locale={props.locale} />
      </Sequence>

      <Captions props={props} acc={acc} />

      {/* Persistent chrome — real playback progress, on every beat. */}
      <Chrome
        acc={acc}
        totalScenes={totalScenes}
        totalDuration={timeline.totalDuration}
      />

      {props.voiceoverUrl ? <Audio src={props.voiceoverUrl} /> : null}
    </AbsoluteFill>
  );
};
