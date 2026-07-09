/**
 * "Punch" — the first research-informed template (typography-led).
 *
 * Encodes the 2026-07 short-form conversion research:
 *  - COLD OPEN: no title card — the hook line slams in word-by-word over
 *    moving visuals inside the first seconds (TikTok: proposition in 3s,
 *    hook inside 6s; "trim any lulls", no intro cards).
 *  - EARLY CTA: a "Full guide → domain" chip slides in right after the
 *    hook (~first quarter) instead of relying on an end card — Wistia's
 *    36k-CTA data favors early placement for sub-60s video; the
 *    "end CTA performs best" claim failed verification.
 *  - NO STATIC TEXT FRAMES: typography beats keep a continuously moving
 *    background (gradient drift + featured-image parallax) — Instagram
 *    demotes majority-static-text reels.
 *  - TIGHT OUTRO: ~2s CTA sting, not a 5s branded card — completion rate
 *    is the ranked metric on all three platforms.
 *
 * Typography-led by design: stock footage becomes optional b-roll, so
 * weak Pexels matches can't drag the video down.
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

const { fontFamily } = loadFont("normal", { weights: ["500", "700", "900"] });

const DARK = "#0b1120";
const EARLY_CTA_SECONDS = 2.6;

/** Continuously drifting brand backdrop — never a static frame. */
const MotionBackdrop: React.FC<{
  accent: string;
  image: string | null;
  seed: number;
}> = ({ accent, image, seed }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const angle = (seed * 47 + t * 6) % 360;
  const drift = Math.sin(t * 0.5 + seed) * 40;

  return (
    <AbsoluteFill style={{ backgroundColor: DARK, overflow: "hidden" }}>
      {image ? (
        <Img
          src={image}
          style={{
            width: "115%",
            height: "115%",
            objectFit: "cover",
            opacity: 0.28,
            transform: `translate(${drift - 40}px, ${-drift / 2 - 40}px) scale(1.08)`,
            filter: "saturate(0.7)",
          }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          background: `linear-gradient(${angle}deg, ${accent}42 0%, rgba(11,17,32,0.92) 55%, ${accent}1f 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/** Hook words slam in one-by-one, timed to speech. */
const HookSlam: React.FC<{
  text: string;
  start: number;
  duration: number;
  accent: string;
}> = ({ text, start, duration, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const speech = Math.max(duration - 0.4, 0.8);
  const per = speech / words.length;

  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: 72 }}>
      <div
        style={{
          fontFamily,
          fontWeight: 900,
          fontSize: 116,
          lineHeight: 1.06,
          color: "#fff",
          textTransform: "uppercase",
        }}
      >
        {words.map((w, i) => {
          const wStart = start + i * per;
          const p = Math.min(Math.max((t - wStart) / 0.16, 0), 1);
          // Overshoot slam: scale 1.6 → 1 as the word lands.
          const scale = 1.6 - 0.6 * p;
          const emphasized = i % 3 === 2;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                opacity: p,
                transform: `scale(${scale})`,
                transformOrigin: "50% 80%",
                color: emphasized ? accent : "#fff",
                marginRight: "0.32em",
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

/** Early-CTA chip — slides in after the hook, gone before it annoys. */
const EarlyCta: React.FC<{ domain: string; accent: string }> = ({
  domain,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 15, mass: 0.5 } });
  const exit = spring({
    frame: frame - (durationInFrames - Math.round(0.35 * fps)),
    fps,
    config: { damping: 20 },
  });
  const x = interpolate(enter, [0, 1], [-560, 0]) + interpolate(exit, [0, 1], [0, -560]);

  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", padding: "150px 56px" }}>
      <div
        style={{
          transform: `translateX(${x}px)`,
          display: "flex",
          alignItems: "center",
          gap: 18,
          backgroundColor: "rgba(11,17,32,0.82)",
          border: `3px solid ${accent}`,
          borderRadius: 999,
          padding: "18px 34px",
          alignSelf: "flex-start",
        }}
      >
        <div style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: accent }} />
        <div style={{ fontFamily, fontWeight: 700, fontSize: 40, color: "#fff" }}>
          Full guide → {domain}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Typography beat: step number + big headline, media as b-roll window. */
const SceneBeat: React.FC<{
  index: number;
  headline: string;
  visual: SceneVisual | undefined;
  accent: string;
  totalScenes: number;
  durationInFrames: number;
}> = ({ index, headline, visual, accent, totalScenes, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 13, mass: 0.6 } });
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.1]);
  const hasMedia = visual && visual.kind !== "color" && visual.url;

  return (
    <AbsoluteFill>
      {/* B-roll window — media supports the text, never carries it. */}
      {hasMedia ? (
        <AbsoluteFill
          style={{ justifyContent: "flex-end", alignItems: "center", padding: "0 56px 440px" }}
        >
          <div
            style={{
              width: "100%",
              height: 640,
              borderRadius: 36,
              overflow: "hidden",
              transform: `translateY(${(1 - enter) * 120}px)`,
              opacity: enter,
              boxShadow: "0 40px 80px rgba(0,0,0,0.45)",
            }}
          >
            {visual!.kind === "video" ? (
              <OffthreadVideo
                src={visual!.url!}
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` }}
              />
            ) : (
              <Img
                src={visual!.url!}
                style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` }}
              />
            )}
          </div>
        </AbsoluteFill>
      ) : null}

      <AbsoluteFill style={{ justifyContent: "flex-start", padding: "280px 72px" }}>
        <div style={{ opacity: enter, transform: `translateY(${(1 - enter) * -60}px)` }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
            <span style={{ fontFamily, fontWeight: 900, fontSize: 140, color: accent }}>
              {index}
            </span>
            <span style={{ fontFamily, fontWeight: 500, fontSize: 48, color: "#94a3b8" }}>
              / {totalScenes}
            </span>
          </div>
          <div
            style={{
              fontFamily,
              fontWeight: 900,
              fontSize: 80,
              lineHeight: 1.08,
              color: "#fff",
              textTransform: "uppercase",
              maxWidth: 900,
            }}
          >
            {headline}
          </div>
          <div style={{ height: 12, width: 180 * enter, backgroundColor: accent, borderRadius: 6, marginTop: 28 }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** ~2s outro sting: domain pill + where the link lives. Not a 5s card. */
const OutroSting: React.FC<{ domain: string; accent: string }> = ({ domain, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 12, mass: 0.5 } });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 30 }}>
      <div
        style={{
          fontFamily,
          fontWeight: 900,
          fontSize: 84,
          color: DARK,
          backgroundColor: accent,
          borderRadius: 28,
          padding: "26px 52px",
          transform: `scale(${0.7 + 0.3 * enter})`,
          opacity: enter,
        }}
      >
        {domain}
      </div>
      <div style={{ fontFamily, fontWeight: 700, fontSize: 44, color: "#e2e8f0", opacity: enter }}>
        Link in description
      </div>
    </AbsoluteFill>
  );
};

/** Karaoke captions tuned to ~2-4 word chunks (≈5–10 words/sec shown). */
const Captions: React.FC<{ props: VideoCompositionProps; accent: string }> = ({
  props,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { chunks, words, segments } = React.useMemo(
    () => buildTimeline(props.script, props.words),
    [props.script, props.words],
  );

  // Hook text is on screen as the slam and the outro sting carries the
  // CTA message — captions would double both. Scenes only.
  const hookEnd = segments[0].start + segments[0].duration;
  const ctaStart = segments[segments.length - 1].start;
  if (t < hookEnd || t >= ctaStart) return null;

  const chunk = chunks.find((c) => t >= c.start && t < c.end);
  if (!chunk) return null;
  const chunkWords = words.filter(
    (w) => w.start >= chunk.start - 1e-4 && w.end <= chunk.end + 1e-4,
  );

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: "0 56px 200px" }}>
      <div
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: 62,
          lineHeight: 1.22,
          textAlign: "center",
          color: "#fff",
          backgroundColor: "rgba(11,17,32,0.66)",
          borderRadius: 22,
          padding: "18px 34px",
          maxWidth: 940,
        }}
      >
        {chunkWords.map((w, i) => {
          const active = t >= w.start && t < w.end;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                color: active ? accent : "#fff",
                transform: active ? "scale(1.1)" : "scale(1)",
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

export const Punch: React.FC<VideoCompositionProps> = (props) => {
  const { fps } = useVideoConfig();
  const accent = props.settings.paletteAccent ?? "#38bdf8";
  const timeline = React.useMemo(
    () => buildTimeline(props.script, props.words),
    [props.script, props.words],
  );
  const hook = timeline.segments[0];
  const totalScenes = props.script.scenes.length;

  return (
    <AbsoluteFill style={{ backgroundColor: DARK }}>
      {timeline.segments.map((seg, i) => {
        const from = Math.round(seg.start * fps);
        const dur = Math.max(1, Math.round(seg.duration * fps));
        return (
          <Sequence key={`${seg.kind}-${seg.sceneIndex}`} from={from} durationInFrames={dur}>
            <MotionBackdrop accent={accent} image={props.featuredImageUrl} seed={i} />
            {seg.kind === "hook" ? (
              <HookSlam text={props.script.hook} start={0} duration={seg.duration} accent={accent} />
            ) : seg.kind === "cta" ? (
              <OutroSting domain={props.domain} accent={accent} />
            ) : (
              <SceneBeat
                index={seg.sceneIndex + 1}
                headline={seg.caption ?? ""}
                visual={props.visuals[seg.sceneIndex + 1]}
                accent={accent}
                totalScenes={totalScenes}
                durationInFrames={dur}
              />
            )}
          </Sequence>
        );
      })}

      {/* Early CTA chip right after the hook — the research-backed slot. */}
      <Sequence
        from={Math.round((hook.start + hook.duration) * fps)}
        durationInFrames={Math.round(EARLY_CTA_SECONDS * fps)}
      >
        <EarlyCta domain={props.domain} accent={accent} />
      </Sequence>

      <Captions props={props} accent={accent} />
      {props.voiceoverUrl ? <Audio src={props.voiceoverUrl} /> : null}
    </AbsoluteFill>
  );
};
