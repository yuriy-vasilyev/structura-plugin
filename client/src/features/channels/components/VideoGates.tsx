/**
 * Video channel gates & empty states (design handoff §4).
 *
 *   - `VideoFirstRunEmptyState` — Activity page, when a video connection
 *     exists but nothing has rendered yet. Reassures ("on its way") and
 *     routes to the connection's settings.
 *   - `VideoUpgradeGate` — a non-Cloud-Pro user deep-links into a video
 *     connection URL (e.g. after a plan downgrade). Explains the lock and
 *     routes to pricing with the dedicated `unlock_video` intent so the
 *     marketing page can highlight the Cloud Pro tier and analytics can
 *     attribute the conversion to this surface.
 */

import { __ } from "@wordpress/i18n";
import { ArrowUpRight, Lock } from "lucide-react";
import { Link } from "react-router";
import { Button, EmptyState, VideoChannelGlyph } from "@structura/ui";
import { buildMarketingPricingUrl } from "@/utils/portalLinks";

export const VideoFirstRunEmptyState = () => (
  <EmptyState
    icon={<VideoChannelGlyph className="h-6 w-6" />}
    title={__("Your first video is on its way", "structura")}
    description={__(
      "It will appear here after your next post publishes. Rendering takes a few minutes — you’ll see live progress.",
      "structura",
    )}
    action={
      <Button asChild variant="secondary" size="sm">
        {/* The video connection's settings (voice / style / cadence) live on
            its row's Edit affordance — the Connections page is the shortest
            reliable path there. */}
        <Link to="/channels/connections">
          {__("Configure Video", "structura")}
        </Link>
      </Button>
    }
  />
);

export const VideoUpgradeGate = () => {
  const domain =
    typeof window !== "undefined" ? window.location.hostname : undefined;

  return (
    <EmptyState
      icon={<Lock size={22} />}
      title={__("Video is a Cloud Pro feature", "structura")}
      description={__(
        "This link points to the Video channel, which isn’t included in your plan. Upgrade to turn every post into a vertical video for Shorts and TikTok.",
        "structura",
      )}
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="primary"
            size="sm"
            href={buildMarketingPricingUrl({ intent: "unlock_video", domain })}
            target="_blank"
            rel="noreferrer"
          >
            <ArrowUpRight size={14} className="mr-1.5" aria-hidden />
            {__("Upgrade plan", "structura")}
          </Button>
          <Button asChild variant="transparent" size="sm">
            <Link to="/channels/store">{__("Back to Store", "structura")}</Link>
          </Button>
        </div>
      }
    />
  );
};
