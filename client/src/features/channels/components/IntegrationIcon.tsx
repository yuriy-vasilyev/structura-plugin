/**
 * IntegrationIcon — renders the brand mark for a catalog entry / connection.
 *
 * Resolution priority:
 *   1. Hardcoded override for integration ids whose brand mark we host
 *      ourselves. These are brands that are NOT in the simple-icons library —
 *      either removed for trademark reasons (Slack, LinkedIn) or never
 *      included (Microsoft Bing, IndexNow). Shipping a monogram for these
 *      keeps the icon row uniform instead of half-loaded.
 *   2. `entry.iconUrl` — the catalog's own URL (simple-icons CDN today). This
 *      is the hot path for the brands that ARE in simple-icons
 *      (Gmail, WhatsApp, Discord, Mailchimp…).
 *   3. Generic Plug fallback — last-resort when neither is present (catalog
 *      pre-CDN, or a brand-new integration id the client hasn't shipped an
 *      override for yet).
 *
 * Keeping this in one component means the three surfaces that render integration
 * icons (store card, install modal header, connection row) stay visually in
 * lockstep: same rounded corners, same bg ring, same fallback treatment.
 */

import type { ComponentType, ReactNode } from "react";
import { Plug, Webhook, type LucideProps } from "lucide-react";
import { cn, VideoChannelGlyph } from "@structura/ui";
import { VIDEO_INTEGRATION_ID } from "../videoChannel";

interface IntegrationIconProps {
  integrationId: string;
  iconUrl?: string | null;
  /**
   * Visual size in Tailwind utility classes — e.g. "size-9" on the connection
   * row, "size-10" in the store/modal. We keep this a class name (rather than
   * a pixel number) so we inherit the surrounding design-token sizing system.
   */
  sizeClassName?: string;
  /** Optional extra classes appended after the default chrome. */
  className?: string;
}

/**
 * Inline monograms for brands missing from simple-icons. Using letter marks
 * (rather than the real logos) keeps us clear of the trademark-usage concerns
 * that caused simple-icons to drop Slack and LinkedIn in the first place.
 *
 * Brand colours are the ones each company publishes in their brand guide —
 * we just use them as the tile background so the pill still reads as the
 * right provider at a glance.
 *
 * A monogram can optionally provide a Lucide `icon` instead of a `label` for
 * concepts that aren't a vendor brand at all (e.g. the generic webhook
 * protocol — there's no "webhook brand"). The `label` is still required as a
 * fallback so `renderRawIntegrationMark` (used in text-only callers) keeps
 * working even for icon-based entries.
 */
type BrandMonogram = {
  label: string;
  bg: string;
  fg: string;
  icon?: ComponentType<LucideProps>;
};

const BRAND_MONOGRAMS: Record<string, BrandMonogram | undefined> = {
  "slack-webhook": {
    // Slack's brand purple (aubergine). Keep the monogram two-letter so it
    // doesn't collide with the Stripe "S" people already associate with that
    // specific purple.
    label: "Sl",
    bg: "#4A154B",
    fg: "#FFFFFF",
  },
  linkedin: {
    // LinkedIn's corporate blue. "in" mirrors their lowercase monogram.
    label: "in",
    bg: "#0A66C2",
    fg: "#FFFFFF",
  },
  indexnow: {
    // IndexNow's protocol green — teal-adjacent, used on indexnow.org.
    // "IN" so it reads as a crawler-family mark without being a sign-in icon.
    label: "IN",
    bg: "#00897B",
    fg: "#FFFFFF",
  },
  // Future-proofing: if we later add a "bing" catalog entry (IndexNow uses
  // the bing mark today in the catalog), surface it here too.
  bing: {
    label: "b",
    bg: "#008373",
    fg: "#FFFFFF",
  },
  "webhook-ping": {
    // Webhooks aren't a vendor brand, they're a protocol — so there's no
    // logo to license. The catalog previously pointed at simple-icons'
    // `webhook` slug which doesn't exist there, producing the broken-image
    // glyph in the store tile (see screenshot, 2026-04-22). Use Lucide's
    // hexagon-with-dots `Webhook` glyph (the same mark most webhook
    // providers use in their own UIs) over a neutral slate tile so it
    // reads as "generic HTTP endpoint" rather than imitating any one
    // vendor. `label: "W"` is the fallback for `renderRawIntegrationMark`.
    label: "W",
    bg: "#475569",
    fg: "#FFFFFF",
    icon: Webhook,
  },
};

export const IntegrationIcon = ({
  integrationId,
  iconUrl,
  sizeClassName = "size-10",
  className,
}: IntegrationIconProps) => {
  const override = BRAND_MONOGRAMS[integrationId];
  const baseClass = cn(
    sizeClassName,
    "shrink-0 rounded-xl overflow-hidden",
    className,
  );

  // Video channel — our own mark (9:16 frame + play wedge) on the
  // brand-tinted tile, per the handoff's icon decision (#5): the channel
  // renders for both YouTube Shorts and TikTok, so using either platform's
  // logo would be wrong twice over (misleading + brand-licensing exposure).
  if (integrationId === VIDEO_INTEGRATION_ID) {
    return (
      <div
        className={cn(
          baseClass,
          "flex items-center justify-center bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
        )}
        aria-hidden
      >
        <VideoChannelGlyph className="h-[55%] w-[55%]" />
      </div>
    );
  }

  if (override) {
    const OverrideIcon = override.icon;
    return (
      <div
        className={cn(
          baseClass,
          "flex items-center justify-center text-sm font-bold tracking-tight",
        )}
        style={{ backgroundColor: override.bg, color: override.fg }}
        aria-hidden
      >
        {OverrideIcon ? (
          // `size` is wired through the default `size-*` Tailwind class on
          // the wrapper — the icon itself just needs a concrete pixel size
          // that matches the tile's optical weight. 18 matches the Plug
          // fallback below so the two look balanced side by side.
          <OverrideIcon size={18} />
        ) : (
          override.label
        )}
      </div>
    );
  }

  if (iconUrl) {
    // `object-contain` + small padding prevents brand marks from bleeding to
    // the tile edge when the source is an oddly-cropped SVG. Bg keeps the
    // monochrome marks readable on dark mode.
    return (
      <img
        src={iconUrl}
        alt=""
        className={cn(
          baseClass,
          "bg-white object-contain p-1 ring-1 ring-neutral-200 dark:ring-neutral-700",
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        baseClass,
        "bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300 flex items-center justify-center",
      )}
      aria-hidden
    >
      <Plug size={18} />
    </div>
  );
};

/** Exposed for tests that want to assert against the list of locally-hosted brands. */
export const hasLocalIcon = (integrationId: string): boolean =>
  Boolean(BRAND_MONOGRAMS[integrationId]);

/** Exposed so the server-side catalog can be kept honest about which URLs we need. */
export const LOCAL_ICON_IDS: ReadonlyArray<string> = Object.freeze(
  Object.keys(BRAND_MONOGRAMS),
);

/**
 * Small helper for the rare caller that wants to render an integration icon
 * alongside other content without the rounded tile chrome — not used in the
 * three primary surfaces today but handy for e.g. a compact dropdown item.
 */
export const renderRawIntegrationMark = (
  integrationId: string,
): ReactNode | null => {
  const override = BRAND_MONOGRAMS[integrationId];
  if (!override) return null;
  return <span style={{ color: override.bg }}>{override.label}</span>;
};
