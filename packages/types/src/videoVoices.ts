/**
 * Video-channel TTS voice catalog — shared by the wp-admin SPA and the
 * portal voice picker (design handoff: marketing/design_handoff_voice_picker).
 *
 * MIRRORS the functions-side source of truth
 * (`functions/src/channels/video/tts.ts` + `voices.ts`) — keep the
 * voice lists and descriptors field-for-field in sync. The catalog is
 * static product data; only AVAILABILITY (tier gating, connected
 * providers) comes from the wire.
 *
 * Voice names and descriptors are NOT translated (proper nouns / tone
 * words — same rule as the legacy persona descriptors).
 */

export type VideoTtsProvider = "openai" | "gemini";

export interface VideoVoiceOption {
  /** Canonical stored value — `provider:id` (`openai:nova`). */
  id: string;
  provider: VideoTtsProvider;
  /** Display name ("Nova", "Zephyr"). */
  name: string;
  /** Two-word character tag for the option row. */
  descriptor: string;
}

/** Product default since 2026-07-09 (bake-off winner). */
export const DEFAULT_VIDEO_VOICE = "gemini:Zephyr";

const OPENAI_VOICES: ReadonlyArray<[string, string]> = [
  ["alloy", "Crisp · Neutral"],
  ["ash", "Grounded · Steady"],
  ["coral", "Friendly · Upbeat"],
  ["echo", "Calm · Narrative"],
  ["fable", "Expressive · Storytelling"],
  ["nova", "Warm · Conversational"],
  ["onyx", "Deep · Authoritative"],
  ["sage", "Soft · Thoughtful"],
  ["shimmer", "Bright · Energetic"],
];

const GEMINI_VOICES: ReadonlyArray<[string, string]> = [
  ["Zephyr", "Bright · Energetic"],
  ["Puck", "Upbeat · Playful"],
  ["Charon", "Informative · Steady"],
  ["Kore", "Firm · Confident"],
  ["Fenrir", "Excitable · Bold"],
  ["Leda", "Youthful · Fresh"],
  ["Orus", "Firm · Direct"],
  ["Aoede", "Breezy · Light"],
  ["Callirrhoe", "Easy-going · Relaxed"],
  ["Autonoe", "Bright · Clear"],
  ["Enceladus", "Breathy · Soft"],
  ["Iapetus", "Clear · Neutral"],
  ["Umbriel", "Easy-going · Warm"],
  ["Algieba", "Smooth · Polished"],
  ["Despina", "Smooth · Calm"],
  ["Erinome", "Clear · Precise"],
  ["Algenib", "Gravelly · Textured"],
  ["Rasalgethi", "Informative · Warm"],
  ["Laomedeia", "Upbeat · Lively"],
  ["Achernar", "Soft · Gentle"],
  ["Alnilam", "Firm · Grounded"],
  ["Schedar", "Even · Balanced"],
  ["Gacrux", "Mature · Assured"],
  ["Pulcherrima", "Forward · Expressive"],
  ["Achird", "Friendly · Open"],
  ["Zubenelgenubi", "Casual · Conversational"],
  ["Vindemiatrix", "Gentle · Measured"],
  ["Sadachbia", "Lively · Animated"],
  ["Sadaltager", "Knowledgeable · Composed"],
  ["Sulafat", "Warm · Rich"],
];

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Full two-provider catalog, OpenAI first (matches the picker's group order). */
export const VIDEO_VOICE_CATALOG: readonly VideoVoiceOption[] = [
  ...OPENAI_VOICES.map(([id, descriptor]) => ({
    id: `openai:${id}`,
    provider: "openai" as const,
    name: capitalize(id),
    descriptor,
  })),
  ...GEMINI_VOICES.map(([id, descriptor]) => ({
    id: `gemini:${id}`,
    provider: "gemini" as const,
    name: id,
    descriptor,
  })),
];

/**
 * Legacy persona ids (pre-2026-07 connections) → canonical voice.
 * The picker never shows persona names; a stored persona resolves to
 * its real voice with a one-time reassurance helper (handoff §Closed
 * trigger).
 */
export const LEGACY_VIDEO_PERSONAS: Readonly<
  Record<string, { label: string; canonical: string }>
> = {
  ava: { label: "Ava", canonical: "openai:nova" },
  marcus: { label: "Marcus", canonical: "openai:onyx" },
  lena: { label: "Lena", canonical: "openai:shimmer" },
  oliver: { label: "Oliver", canonical: "openai:alloy" },
  priya: { label: "Priya", canonical: "openai:coral" },
  noah: { label: "Noah", canonical: "openai:echo" },
};

const SAMPLE_BASE =
  "https://storage.googleapis.com/structura-releases/assets/voice-samples/v2";

/** CDN sample URL for a canonical voice id (OpenAI mp3, Gemini wav). */
export function videoVoiceSampleUrl(canonicalId: string): string {
  const [provider, id] = canonicalId.split(":");
  return `${SAMPLE_BASE}/${provider}-${id}.${provider === "gemini" ? "wav" : "mp3"}`;
}

/**
 * Resolve any stored `videoVoice` value (persona id, bare OpenAI id,
 * canonical id) to the catalog entry, plus the legacy persona label
 * when the stored value predates the canonical format — the trigger's
 * one-time "Ava is now Nova" helper keys off it.
 */
export function resolveStoredVideoVoice(stored: string | undefined | null): {
  option: VideoVoiceOption;
  legacyPersonaLabel?: string;
} {
  const fallback = VIDEO_VOICE_CATALOG.find((v) => v.id === DEFAULT_VIDEO_VOICE)!;
  if (!stored) return { option: fallback };
  const persona = LEGACY_VIDEO_PERSONAS[stored];
  if (persona) {
    const option = VIDEO_VOICE_CATALOG.find((v) => v.id === persona.canonical)!;
    return { option, legacyPersonaLabel: persona.label };
  }
  const canonical = stored.includes(":") ? stored : `openai:${stored}`;
  const option = VIDEO_VOICE_CATALOG.find((v) => v.id === canonical);
  return option ? { option } : { option: fallback };
}
