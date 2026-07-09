/**
 * Accent contrast guard — port of `VT` color math from the design
 * handoff (marketing/design_handoff_video_templates, shared.jsx).
 *
 * The customer supplies ONE accent color of unknown quality. Rules:
 *  1. The raw accent is decorative only (fills, bars, glows, flashes).
 *  2. Accent-as-text is always derived: nudged 10% toward white (on
 *     dark surfaces) or black (on paper) per iteration until WCAG
 *     contrast ≥ 3:1.
 *  3. Text sitting ON an accent fill picks white iff white clears 3:1,
 *     else near-black ink.
 */

export const DARK_BG = "#10131c";
export const PAPER_BG = "#f6f1e7";

export const hexToRgb = (hex: string): [number, number, number] => {
  let x = String(hex || "#888888").replace("#", "");
  if (x.length === 3) x = x.split("").map((c) => c + c).join("");
  const n = parseInt(x, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const luminance = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG relative-luminance contrast ratio. */
export const contrast = (a: string, b: string): number => {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

/** Linear mix of two hex colors; p=0 → a, p=1 → b. */
export const mix = (a: string, b: string, p: number): string => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return (
    "#" +
    A.map((v, i) =>
      Math.round(v + (B[i] - v) * p)
        .toString(16)
        .padStart(2, "0"),
    ).join("")
  );
};

/** rgba() string from a hex color. */
export const alpha = (hex: string, a: number): string => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

/** Nudge accent toward white/black until it clears `target` contrast on `bg`. */
export const guardOn = (accent: string, bg: string, target = 3): string => {
  let c = accent;
  const toward = luminance(bg) > 0.5 ? "#141414" : "#ffffff";
  for (let i = 0; i < 26 && contrast(c, bg) < target; i++) c = mix(c, toward, 0.1);
  return c;
};

/** Ink for text sitting ON an accent fill. */
export const inkOn = (accent: string): string =>
  contrast("#ffffff", accent) >= 3 ? "#ffffff" : "#14161c";

export interface AccentSet {
  /** Customer's raw accent — decorative use only. */
  raw: string;
  /** Guarded for text on the dark reference surface. */
  onDark: string;
  /** Guarded for text on the paper surface (Broadsheet). */
  onPaper: string;
  /** Ink color for text on an accent fill. */
  ink: string;
}

/** Everything a template needs to use the customer accent safely. */
export const accentSet = (accent: string): AccentSet => ({
  raw: accent,
  onDark: guardOn(accent, DARK_BG, 3),
  onPaper: guardOn(accent, PAPER_BG, 3),
  ink: inkOn(accent),
});
