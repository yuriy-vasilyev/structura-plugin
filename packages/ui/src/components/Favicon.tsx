import { useState } from "react";
import { Globe, type LucideIcon } from "lucide-react";
import { cn } from "../utils";

export interface FaviconProps {
  /** Bare hostname or domain, e.g. "nerdwallet.com". */
  domain: string;
  /** Rendered box size in px (the source is fetched at 2× for crispness). */
  size?: number;
  className?: string;
  /** Icon shown when the favicon fails to load. Defaults to a globe. */
  fallback?: LucideIcon;
}

/**
 * Sizes S2 serves as requested (probed 2026-10-09). Any other `sz` comes back
 * as its 16px default even for domains with real icons, which `onLoad` below
 * reads as "no favicon".
 */
const S2_SIZES = [32, 40, 48, 64, 96, 128];

/** The smallest S2-served size covering 2x the box, capped at 128px. */
function s2Size(size: number): number {
  return S2_SIZES.find((s) => s >= size * 2) ?? 128;
}

/**
 * Favicon — a website's favicon by domain, via Google's public S2 service.
 *
 * Free, no API key, and returns a generic glyph for unknown domains. On a hard
 * load error it swaps to {@link FaviconProps.fallback} (a lucide icon) so a
 * 404'd favicon never renders a broken-image box. Consolidates the
 * copy-pasted `faviconUrl` + `DomainFavicon` helpers that previously lived in
 * the onboarding wizard, campaign authority discovery, and the AI-engine keys
 * picker.
 */
export function Favicon({
  domain,
  size = 14,
  className,
  fallback: Fallback = Globe,
}: FaviconProps) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <Fallback size={size} className={cn("shrink-0 text-neutral-400", className)} />
    );
  }
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(
        domain,
      )}&sz=${s2Size(size)}`}
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 rounded-sm", className)}
      loading="lazy"
      onError={() => setFailed(true)}
      // S2 never 404s for unknown domains — it answers with its default
      // globe at 16×16 regardless of the requested size, which upscales
      // into a blurry smudge. We always request ≥32px, so a ≤16px
      // response IS the default globe: swap to the crisp icon fallback.
      onLoad={(e) => {
        if (e.currentTarget.naturalWidth <= 16) setFailed(true);
      }}
    />
  );
}
