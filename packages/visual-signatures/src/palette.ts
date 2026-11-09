import type { PaletteRole } from "./types";

/**
 * The colours a signature renders in when a preset has no brand palette:
 * the thumbnails' set (specs/visual-signatures.md §2).
 */
export const NEUTRAL_PALETTE: Readonly<Record<PaletteRole, string>> = {
  background: "#F4F4F1",
  surface: "#E4E4DF",
  primary: "#8C8C86",
  accent: "#4B4B47",
  ink: "#1E1E1C",
};

const HEX_RE = /^#?([0-9a-f]{6})$/i;

/** `#RRGGBB` upper-cased, or null when the value is not a six-digit hex. */
export function normaliseHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = HEX_RE.exec(value.trim());
  return m ? `#${m[1]!.toUpperCase()}` : null;
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Relative luminance in 0..1 (WCAG), used to find the lightest and darkest brand colours. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Linear mix of two colours; `amount` is the share of `b`. */
export function mix(a: string, b: string, amount: number): string {
  const ca = channels(a);
  const cb = channels(b);
  return toHex([0, 1, 2].map((i) => ca[i]! + (cb[i]! - ca[i]!) * amount) as [number, number, number]);
}

/**
 * Fills a signature's colour roles from a brand palette, deterministically,
 * so the same preset always compiles to the same prompt:
 *
 * - accent: the first colour (the palette is stored accent first, as the
 *   video renderer reads it);
 * - primary: the second colour, else the accent;
 * - ink: the darkest colour when it is dark enough to read as ink, else the
 *   accent shaded towards black;
 * - background: the lightest colour when it is light enough to carry a
 *   scene, else a pale tint of the accent;
 * - surface: the background nudged towards the ink.
 *
 * Only the roles the signature declares are returned. An empty or invalid
 * palette yields the neutral set.
 */
export function resolvePaletteRoles(
  palette: readonly string[] | undefined | null,
  roles: readonly PaletteRole[],
): Partial<Record<PaletteRole, string>> {
  const hexes = (palette ?? []).map(normaliseHex).filter((h): h is string => h !== null);
  const all: Record<PaletteRole, string> = hexes.length === 0 ? { ...NEUTRAL_PALETTE } : fromBrand(hexes);
  const out: Partial<Record<PaletteRole, string>> = {};
  for (const role of roles) out[role] = all[role];
  return out;
}

function fromBrand(hexes: string[]): Record<PaletteRole, string> {
  const accent = hexes[0]!;
  const primary = hexes[1] ?? accent;
  const byLum = [...hexes].sort((a, b) => luminance(a) - luminance(b));
  const darkest = byLum[0]!;
  const lightest = byLum[byLum.length - 1]!;
  const ink = luminance(darkest) < 0.1 ? darkest : mix(accent, "#000000", 0.8);
  const background = luminance(lightest) > 0.7 ? lightest : mix(accent, "#FFFFFF", 0.92);
  const surface = mix(background, ink, 0.07);
  return { background, surface, primary, accent, ink };
}
