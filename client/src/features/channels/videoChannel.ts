/**
 * Video channel — constants, wire vocabulary, and pure helpers.
 *
 * Central home for everything the Video channel UI shares across the
 * store card, config modal, activity rows, and connection row so the
 * voice/preset catalogs can't drift between surfaces.
 *
 * Design handoff: marketing/design_handoff_video_channel/README.md.
 *
 * i18n note: voice/preset display names and their descriptors are proper
 * nouns / tone fragments ("Ava", "Warm · Conversational", "Kinetic") and
 * are deliberately NOT wrapped in `__()` — they read identically in all
 * four locales, and translating a voice's name would desync it from the
 * audible sample.
 */

import type { VideoJob, VideoSocialPackages } from "./types";

/** Catalog id of the Video channel integration. */
export const VIDEO_INTEGRATION_ID = "video";

/** Voice a fresh install starts with (cloud applies the same default). */
export const DEFAULT_VIDEO_VOICE = "ava";

/** Visual style a fresh install starts with. */
export const DEFAULT_VIDEO_STYLE = "clean";

/**
 * One selectable voiceover voice. `id` is the `video_voice` wire value;
 * `sexTag` is the one-letter pill in the voice menu (handoff §2.1).
 */
export interface VideoVoiceOption {
  id: string;
  name: string;
  descriptor: string;
  sexTag: "F" | "M";
}

/**
 * The six v1 voices, in menu order. Keep ids in lockstep with the cloud's
 * voice catalog — an unknown id is rejected on save.
 */
export const VIDEO_VOICES: readonly VideoVoiceOption[] = [
  { id: "ava", name: "Ava", descriptor: "Warm · Conversational", sexTag: "F" },
  { id: "marcus", name: "Marcus", descriptor: "Deep · Authoritative", sexTag: "M" },
  { id: "lena", name: "Lena", descriptor: "Bright · Energetic", sexTag: "F" },
  { id: "oliver", name: "Oliver", descriptor: "Crisp · Neutral", sexTag: "M" },
  { id: "priya", name: "Priya", descriptor: "Friendly · Upbeat", sexTag: "F" },
  { id: "noah", name: "Noah", descriptor: "Calm · Narrative", sexTag: "M" },
];

/**
 * One visual-style preset. `id` is the `video_style` wire value.
 */
export interface VideoStylePreset {
  id: string;
  name: string;
  descriptor: string;
}

/** The three v1 caption-style presets (handoff §2.2). */
export const VIDEO_STYLE_PRESETS: readonly VideoStylePreset[] = [
  { id: "clean", name: "Clean", descriptor: "Minimal captions, soft fades" },
  { id: "bold", name: "Bold", descriptor: "High-contrast, punchy cuts" },
  { id: "kinetic", name: "Kinetic", descriptor: "Word-by-word motion" },
];

/**
 * Resolve a voice id to its option, falling back to the Ava default so an
 * unknown id from a newer cloud (or an absent field on a pre-video doc)
 * never crashes a row or the modal.
 */
export const videoVoiceById = (id: string | undefined): VideoVoiceOption =>
  VIDEO_VOICES.find((v) => v.id === id) ??
  (VIDEO_VOICES.find((v) => v.id === DEFAULT_VIDEO_VOICE) as VideoVoiceOption);

/** Resolve a style id to its preset, falling back to Clean. */
export const videoStyleById = (id: string | undefined): VideoStylePreset =>
  VIDEO_STYLE_PRESETS.find((p) => p.id === id) ??
  (VIDEO_STYLE_PRESETS.find((p) => p.id === DEFAULT_VIDEO_STYLE) as VideoStylePreset);

/**
 * CDN URL of a voice's static 2-second preview sample. The file may 404
 * until samples are generated — playback failures must stay silent (stop
 * the playing state, no toast).
 */
export const voiceSampleUrl = (voiceId: string): string =>
  `https://storage.googleapis.com/structura-releases/assets/voice-samples/${voiceId}.mp3`;

/**
 * The five lifecycle states an activity row renders (handoff §3).
 * `"expired"` exists only here — see {@link resolveVideoRowState}.
 */
export type VideoRowState =
  | "rendering"
  | "ready"
  | "expired"
  | "failed"
  | "skipped_quota";

/**
 * Map a wire job to its display state. "Expired" is DERIVED client-side:
 * a ready job whose 7-day signed URL (`expiresAt`) is already in the
 * past. The cloud never rewrites the doc on expiry, so this is the single
 * place that boundary is computed.
 *
 * @param nowMs - Injection point for tests; defaults to the wall clock.
 */
export const resolveVideoRowState = (
  job: VideoJob,
  nowMs: number = Date.now(),
): VideoRowState => {
  if (job.status === "ready" && job.expiresAt) {
    const expires = Date.parse(job.expiresAt);
    // Defensive: an unparseable timestamp keeps the row in "ready" —
    // better to offer a possibly-dead download than to hide a live one.
    if (Number.isFinite(expires) && expires < nowMs) return "expired";
  }
  return job.status;
};

/**
 * Format a duration in seconds as `m:ss` ("0:47"). Digits are
 * locale-neutral; the surrounding meta line handles translation.
 */
export const formatVideoDuration = (durationSec: number): string => {
  const total = Math.max(0, Math.floor(durationSec));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

/**
 * Format a byte count as one-decimal binary megabytes ("24.8 MB") —
 * matches what desktop file managers show for the downloaded file.
 */
export const formatVideoBytes = (bytes: number): string => {
  const mb = bytes / (1024 * 1024);
  return `${mb.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} MB`;
};

// ── Caption packages ─────────────────────────────────────────────────────
// Platform-captions handoff (marketing/design_handoff_platform_captions).

/**
 * Advisory character limits for the caption-package counters — only where
 * a real platform limit exists (no counter on the Shorts description; its
 * 5,000-char limit is never approached). Advisory means never blocking:
 * over-limit flips the counter amber, copy keeps working — the fields are
 * read-only and the uploader decides.
 */
export const CAPTION_LIMITS = {
  shortsTitle: 100,
  tiktokHook: 100,
  reelsHook: 125,
} as const;

/** Presentation role of one `\n\n` block inside a composed caption. */
export type CaptionBlockKind = "hook" | "body" | "hashtags";

/** One presentational block of a composed caption string. */
export interface CaptionBlock {
  kind: CaptionBlockKind;
  text: string;
}

/**
 * Split a fully-composed caption string into presentation blocks.
 *
 * The wire ships plain strings with `\n\n` between blocks and NO
 * structured `hooks` field, so display roles are derived here: a block
 * starting with `#` is the hashtag run; with `hookFirst`, the first block
 * is the hook — the platform's truncation window, rendered emphasized and
 * fed to the advisory counter.
 *
 * @remarks
 * Single `\n` breaks stay inside their block (e.g. CTA + "link in bio").
 * Empty blocks are dropped so a sloppy composer can't render blank gaps.
 */
export const parseCaptionBlocks = (
  raw: string,
  { hookFirst = false }: { hookFirst?: boolean } = {},
): CaptionBlock[] =>
  raw
    .split("\n\n")
    .filter((text) => text.trim() !== "")
    .map((text, index) => ({
      text,
      kind: text.trimStart().startsWith("#")
        ? "hashtags"
        : hookFirst && index === 0
          ? "hook"
          : "body",
    }));

/**
 * First `\n\n` block of a composed caption — the hook window the advisory
 * counters measure (TikTok /100, Reels /125).
 */
export const captionHook = (raw: string): string =>
  raw.split("\n\n").find((block) => block.trim() !== "") ?? "";

/**
 * Shape guard for {@link VideoSocialPackages}: all three platforms present
 * with string leaves. Anything less is treated as absent so a malformed
 * wire doc renders the legacy Ready row instead of broken paste buttons.
 */
export const isSocialPackages = (
  value: unknown,
): value is VideoSocialPackages => {
  if (typeof value !== "object" || value === null) return false;
  const v = value as {
    shorts?: { title?: unknown; description?: unknown };
    tiktok?: { caption?: unknown };
    reels?: { caption?: unknown };
  };
  return (
    typeof v.shorts?.title === "string" &&
    typeof v.shorts?.description === "string" &&
    typeof v.tiktok?.caption === "string" &&
    typeof v.reels?.caption === "string"
  );
};
