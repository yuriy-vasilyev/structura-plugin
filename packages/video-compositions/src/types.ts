/**
 * Wire types the compositions consume.
 *
 * `VideoScript` / `TimedChunk` mirror the production contract in
 * `functions/src/channels/prompts/videoScript.ts` and
 * `functions/src/channels/video/captions.ts`. They are duplicated here
 * (prototype phase) because functions/ is not a workspace package;
 * promote them to `@structura/types` before the Remotion pipeline
 * ships. Keep field-for-field in sync.
 */

/** One visual beat of the video. */
export interface VideoScriptScene {
  /** Voiceover narration — 1–2 short spoken sentences. */
  voiceover: string;
  /** On-screen step headline — ≤5 words, imperative. */
  caption: string;
  /** Stock-footage search query (always English). */
  visualQuery: string;
}

/** Structured script the synthesis worker renders. */
export interface VideoScript {
  /** Opening voiceover line — must stop the scroll in the first 2 seconds. */
  hook: string;
  scenes: VideoScriptScene[];
  /** Closing voiceover line pointing at the article. */
  cta: string;
  socialCaption: string;
  hashtags: string[];
}

/** A caption chunk with speech timing (Whisper-derived in production). */
export interface TimedChunk {
  text: string;
  start: number;
  end: number;
}

/** A single word with speech timing — drives karaoke highlighting. */
export interface TimedWord {
  word: string;
  start: number;
  end: number;
}

/** Resolved visual for one timeline slot (hook, scenes…, cta). */
export interface SceneVisual {
  kind: "video" | "image" | "color";
  /** Absent for `color`. */
  url?: string;
}

export type CaptionPlacement = "top" | "middle" | "bottom";

/**
 * Per-render style settings — mirrors the resolved output of
 * `resolveVideoRenderSettings` in functions/src/channels/video.
 */
export interface RenderStyleSettings {
  /** Template id — replaces the Shotstack-era clean/bold/kinetic enum. */
  template: string;
  captionPlacement: CaptionPlacement;
  /** Brand accent from the bound visual preset's palette. */
  paletteAccent?: string;
}

/**
 * Everything a composition needs to render one video.
 *
 * A `type` alias, not an `interface`: Remotion's `Composition` requires
 * props assignable to `Record<string, unknown>`, which only type
 * aliases satisfy (implicit index signature).
 */
export type VideoCompositionProps = {
  script: VideoScript;
  visuals: SceneVisual[];
  settings: RenderStyleSettings;
  postTitle: string;
  /** Bare domain shown on title/end cards (derived from postUrl). */
  domain: string;
  featuredImageUrl: string | null;
  /**
   * TTS voiceover URL. Optional in the prototype — absent means silent
   * preview with estimated pacing.
   */
  voiceoverUrl?: string;
  /**
   * Whisper word timings. Absent ⇒ the timeline estimates pacing from
   * word counts (same fallback production uses when transcription fails).
   */
  words?: TimedWord[];
  /** Locale for the end-card copy ("Full guide:" is localized in prod). */
  locale?: string;
};
