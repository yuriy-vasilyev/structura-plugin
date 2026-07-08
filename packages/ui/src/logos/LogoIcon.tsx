import type { FC } from "react";
import { cn } from "../utils";

interface LogoIconProps {
  className?: string;
  variant?: "dark" | "white" | "mono";
  /**
   * Use the gradient + shadow version at sizes >= 48px.
   * Falls back to flat fills at smaller sizes for clarity.
   * Ignored for the `mono` variant, which is always flat.
   */
  gradient?: boolean;
}

/**
 * Structura "Ascending Overlap" logo mark.
 *
 * Three overlapping rounded rectangles stepping diagonally
 * upward from bottom-left (dark/foundation) to top-right (bright/peak).
 */
export const LogoIcon: FC<LogoIconProps> = ({ className, variant = "dark", gradient = true }) => {
  // Monochrome (design-guide §2.2): a single white ink at stepped opacity —
  // peak 100% / middle 80% / foundation 55%. Built for the mark sitting on a
  // mid-tone/colored fill (the brand-indigo auth panel, the LinkedIn avatar),
  // where the `white` variant's near-brand foundation layer vanishes into the
  // background. Always flat — the 55% floor, not gradients/shadows, is what
  // preserves the three-step silhouette there.
  const isMono = variant === "mono";
  const monoOpacity = { layer1: 0.55, layer2: 0.8, layer3: 1 };

  // Flat fill colors per non-mono variant (used when gradients are off).
  const fills =
    variant === "white"
      ? { layer1: "#6366f1", layer2: "#a5b4fc", layer3: "#e0e7ff" }
      : { layer1: "#2a2574", layer2: "#6366f1", layer3: "#a5b4fc" };

  // Gradients/shadows never apply to the flat monochrome mark.
  const useGradient = gradient && !isMono;

  // Unique gradient IDs to avoid collisions if multiple icons render on the same page
  const uid = variant === "white" ? "logo-w" : "logo-d";

  return (
    <svg
      className={cn("h-10 w-10", className)}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {useGradient && (
        <defs>
          <linearGradient id={`${uid}-g1`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={variant === "white" ? "#4f46e5" : "#2a2574"} />
            <stop offset="100%" stopColor={variant === "white" ? "#6366f1" : "#3730a3"} />
          </linearGradient>
          <linearGradient id={`${uid}-g2`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={variant === "white" ? "#818cf8" : "#4338ca"} />
            <stop offset="100%" stopColor={variant === "white" ? "#a5b4fc" : "#6366f1"} />
          </linearGradient>
          <linearGradient id={`${uid}-g3`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={variant === "white" ? "#c7d2fe" : "#818cf8"} />
            <stop offset="100%" stopColor={variant === "white" ? "#e0e7ff" : "#a5b4fc"} />
          </linearGradient>
          <filter id={`${uid}-shadow`}>
            <feDropShadow
              dx="0"
              dy="1.5"
              stdDeviation="2"
              floodColor="#1e1b4b"
              floodOpacity="0.2"
            />
          </filter>
        </defs>
      )}

      {/* Layer 1: Foundation — bottom-left, widest, darkest */}
      <rect
        x="8"
        y="54"
        width="54"
        height="24"
        rx="6"
        fill={isMono ? "white" : useGradient ? `url(#${uid}-g1)` : fills.layer1}
        opacity={isMono ? monoOpacity.layer1 : undefined}
      />

      {/* Layer 2: Structure — offset right + up, overlaps both */}
      <rect
        x="24"
        y="34"
        width="48"
        height="24"
        rx="6"
        fill={isMono ? "white" : useGradient ? `url(#${uid}-g2)` : fills.layer2}
        opacity={isMono ? monoOpacity.layer2 : undefined}
        filter={useGradient ? `url(#${uid}-shadow)` : undefined}
      />

      {/* Layer 3: Peak — top-right, smallest, brightest */}
      <rect
        x="40"
        y="14"
        width="42"
        height="24"
        rx="6"
        fill={isMono ? "white" : useGradient ? `url(#${uid}-g3)` : fills.layer3}
        opacity={isMono ? monoOpacity.layer3 : undefined}
        filter={useGradient ? `url(#${uid}-shadow)` : undefined}
      />

      {/* Overlap highlights (gradient version only) */}
      {useGradient && (
        <>
          <rect x="24" y="54" width="38" height="4" rx="2" fill="white" opacity="0.08" />
          <rect x="40" y="34" width="32" height="4" rx="2" fill="white" opacity="0.10" />
        </>
      )}
    </svg>
  );
};
