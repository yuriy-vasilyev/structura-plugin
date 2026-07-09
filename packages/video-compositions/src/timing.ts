/**
 * Timeline math — pure, frame-rate agnostic (everything in seconds).
 *
 * Mirrors production's estimated-pacing fallback: ~2.4 spoken words per
 * second of natural TTS (see TARGET_TOTAL_WORDS in
 * functions/src/channels/prompts/videoScript.ts). When real Whisper
 * word timings are supplied the segment boundaries snap to them instead.
 */

import type { TimedChunk, TimedWord, VideoScript } from "./types";

export const WORDS_PER_SECOND = 2.4;

/** A scene shorter than this reads as a glitch, not a beat. */
const MIN_SEGMENT_SECONDS = 2.2;

/** Breath room after each spoken segment before the next starts. */
const SEGMENT_PADDING_SECONDS = 0.35;

export interface TimelineSegment {
  kind: "hook" | "scene" | "cta";
  /** Scene index for `kind === "scene"`, else -1. */
  sceneIndex: number;
  voiceover: string;
  /** Step headline for scenes. */
  caption?: string;
  start: number;
  duration: number;
}

export interface Timeline {
  segments: TimelineSegment[];
  totalDuration: number;
  words: TimedWord[];
  chunks: TimedChunk[];
}

const countWords = (text: string): number =>
  text.trim().split(/\s+/).filter(Boolean).length;

const estimateDuration = (text: string): number =>
  Math.max(
    MIN_SEGMENT_SECONDS,
    countWords(text) / WORDS_PER_SECOND + SEGMENT_PADDING_SECONDS,
  );

/**
 * Spread a segment's words evenly across its spoken window — the
 * stand-in for Whisper timings so karaoke captions work in silent
 * previews too.
 */
const estimateWords = (
  text: string,
  start: number,
  duration: number,
): TimedWord[] => {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const speech = duration - SEGMENT_PADDING_SECONDS;
  const per = speech / tokens.length;
  return tokens.map((word, i) => ({
    word,
    start: start + i * per,
    end: start + (i + 1) * per,
  }));
};

/** Break words into short caption chunks (~production's 4-word cards). */
export const chunkWords = (
  words: TimedWord[],
  maxWords = 4,
): TimedChunk[] => {
  const chunks: TimedChunk[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    const slice = words.slice(i, i + maxWords);
    chunks.push({
      text: slice.map((w) => w.word).join(" "),
      start: slice[0].start,
      end: slice[slice.length - 1].end,
    });
  }
  return chunks;
};

/**
 * Build the full timeline for a script. When `realWords` is provided
 * (Whisper), word timings are used verbatim and segment boundaries are
 * estimated proportionally inside the measured total; otherwise
 * everything is estimated.
 */
export const buildTimeline = (
  script: VideoScript,
  realWords?: TimedWord[],
): Timeline => {
  const parts: Array<Pick<TimelineSegment, "kind" | "sceneIndex" | "voiceover" | "caption">> = [
    { kind: "hook", sceneIndex: -1, voiceover: script.hook },
    ...script.scenes.map((s, i) => ({
      kind: "scene" as const,
      sceneIndex: i,
      voiceover: s.voiceover,
      caption: s.caption,
    })),
    { kind: "cta", sceneIndex: -1, voiceover: script.cta },
  ];

  const rawDurations = parts.map((p) => estimateDuration(p.voiceover));
  let scale = 1;
  if (realWords && realWords.length > 0) {
    const measured = realWords[realWords.length - 1].end + SEGMENT_PADDING_SECONDS;
    scale = measured / rawDurations.reduce((a, b) => a + b, 0);
  }

  let cursor = 0;
  const segments: TimelineSegment[] = parts.map((p, i) => {
    const duration = rawDurations[i] * scale;
    const seg = { ...p, start: cursor, duration };
    cursor += duration;
    return seg;
  });

  const words =
    realWords && realWords.length > 0
      ? realWords
      : segments.flatMap((s) => estimateWords(s.voiceover, s.start, s.duration));

  // Chunk per segment so a caption card never straddles a scene cut —
  // the tail of one voiceover must not ride into the next beat.
  const chunks = segments.flatMap((s) =>
    chunkWords(
      words.filter((w) => w.start >= s.start - 1e-4 && w.start < s.start + s.duration - 1e-4),
    ),
  );

  return {
    segments,
    totalDuration: cursor,
    words,
    chunks,
  };
};
