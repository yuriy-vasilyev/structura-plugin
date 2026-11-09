import type { SignatureId, SignatureMeta } from "./types";

const THUMBNAIL_BASE = "https://www.structurawp.com/visual-signatures";

const thumbnail = (id: SignatureId) => ({
  small: `${THUMBNAIL_BASE}/${id}-640.webp`,
  large: `${THUMBNAIL_BASE}/${id}-1280.webp`,
});

/**
 * The library, in the order the Visuals page shows it: the house signature
 * first, then grouped by medium (specs/visual-signatures.md §3, handoff §0).
 */
export const VISUAL_SIGNATURES: readonly SignatureMeta[] = [
  {
    id: "editorial-reportage",
    version: 1,
    medium: "photography",
    roles: ["background", "surface", "accent", "ink"],
    house: true,
    thumbnail: thumbnail("editorial-reportage"),
  },
  {
    id: "still-life-studio",
    version: 1,
    medium: "photography",
    roles: ["background", "primary", "accent", "ink"],
    house: false,
    thumbnail: thumbnail("still-life-studio"),
  },
  {
    id: "paper-cut",
    version: 1,
    medium: "illustration",
    roles: ["background", "surface", "primary", "accent", "ink"],
    house: false,
    thumbnail: thumbnail("paper-cut"),
  },
  {
    id: "ink-and-fill",
    version: 1,
    medium: "illustration",
    roles: ["background", "primary", "accent", "ink"],
    house: false,
    thumbnail: thumbnail("ink-and-fill"),
  },
  {
    id: "miniature-world",
    version: 1,
    medium: "3d_render",
    roles: ["background", "primary", "accent", "ink"],
    house: false,
    thumbnail: thumbnail("miniature-world"),
  },
  {
    id: "isometric-glass",
    version: 1,
    medium: "3d_render",
    roles: ["background", "surface", "primary", "accent", "ink"],
    house: false,
    thumbnail: thumbnail("isometric-glass"),
  },
];

export const HOUSE_SIGNATURE_ID: SignatureId = "editorial-reportage";

/** Type guard for a stored or wire signature id. */
export function isSignatureId(value: unknown): value is SignatureId {
  return typeof value === "string" && VISUAL_SIGNATURES.some((s) => s.id === value);
}

/** The signature's metadata, or undefined for an unknown id. */
export function getSignatureMeta(id: string): SignatureMeta | undefined {
  return VISUAL_SIGNATURES.find((s) => s.id === id);
}

/**
 * The medium a preset renders in: a curated signature's library medium, a
 * custom signature's own, else the stored free-text medium, else
 * photography (the same rule the cloud compiler applies). For surfaces that
 * branch on the medium, such as the campaign form's AI-label reminder.
 */
export function effectiveMedium(preset: {
  signature?: { kind: "curated"; id: string } | { kind: "custom"; medium: string } | null;
  medium?: string | null;
}): string {
  const sig = preset.signature;
  if (sig?.kind === "curated") return getSignatureMeta(sig.id)?.medium ?? preset.medium ?? "photography";
  if (sig?.kind === "custom") return sig.medium;
  return preset.medium ?? "photography";
}
