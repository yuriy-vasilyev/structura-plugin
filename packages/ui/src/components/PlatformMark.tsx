import { CodeXml } from "lucide-react";
import { cn } from "../utils";

/**
 * Site builders the article-delivery connect flow knows, keyed by id, with
 * each display name written the way its owner writes it.
 *
 * Spec: specs/article-delivery-connect-flow.md §2, §5.
 */
export const PLATFORMS = {
  lovable: "Lovable",
  bolt: "Bolt",
  v0: "v0",
  replit: "Replit",
  custom: "Custom",
} as const;

/** Id of a site builder in {@link PLATFORMS}. */
export type Platform = keyof typeof PLATFORMS;

/** Props for {@link PlatformMark}. */
export interface PlatformMarkProps {
  /** Which builder's mark to draw. */
  platform: Platform;
  /** Rendered size in px. Defaults to 32 (the option-card tile). */
  size?: 16 | 32;
  /** Extra classes on the root element. */
  className?: string;
}

/**
 * Letterform stand-ins until the official press-kit SVGs are added by hand.
 * Drawn as stroked paths rather than SVG `<text>`, which would leak the
 * glyph into the text content next to the builder's name.
 */
const LETTERFORMS: Record<Exclude<Platform, "custom">, string> = {
  lovable: "M11 7V25H22",
  bolt: "M11 7h6a4.5 4.5 0 0 1 0 9h-6zM11 16h7a4.5 4.5 0 0 1 0 9h-7z",
  v0: "M4 12l4.5 12L13 12M22 12a4.5 6 0 1 0 0.01 0z",
  replit: "M11 25V7h6a4.5 4.5 0 0 1 0 9h-6M16 16l6 9",
};

/**
 * `<PlatformMark>` — a site builder's mark in `currentColor`, at 16 or
 * 32px. Decorative: always pair it with the builder's name in text (see
 * `PlatformChip`), so it is hidden from assistive tech.
 */
export function PlatformMark({ platform, size = 32, className }: PlatformMarkProps) {
  if (platform === "custom") {
    return (
      <CodeXml
        size={size}
        aria-hidden="true"
        data-platform={platform}
        className={cn("shrink-0", className)}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-platform={platform}
      className={cn("shrink-0", className)}
    >
      <path d={LETTERFORMS[platform]} />
    </svg>
  );
}
