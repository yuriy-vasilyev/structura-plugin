/**
 * VideoEventRow — the video-render lifecycle row on the Channels Activity
 * page.
 *
 * Rendered by `ChannelEventRow` whenever an event carries a `videoJob`;
 * keeps the generic row's shell (icon tile · post title · status badge ·
 * timestamp) and swaps the body per lifecycle state (design handoff §3,
 * marketing/design_handoff_video_channel/README.md):
 *
 *   - rendering      — pulsing badge + indeterminate bar (+ optional
 *                      pipeline stage in mono)
 *   - ready          — 56×100 thumbnail, meta line, Download primary,
 *                      Preview → MediaLightbox with NATIVE video controls
 *   - failed         — red alert panel (reason + "nothing used from your
 *                      quota"), Retry render, View post
 *   - expired        — DERIVED client-side (ready + expiresAt in the
 *                      past); dimmed thumbnail, Regenerate + quota footnote
 *   - skipped_quota  — amber panel with the quota numbers + upgrade link
 *
 * The whole row is `role="status" aria-live="polite"` so state flips
 * (Rendering → Ready) announce without stealing focus (handoff §7).
 */

import { useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
import {
  Captions,
  ArrowUpRight,
  Clock,
  Download,
  ExternalLink,
  Play,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { Badge, Button, ConfirmDialog, MediaLightbox, ProgressBar } from "@structura/ui";
import { useChannelConnectionsQuery } from "../api/useChannelConnectionsQuery";
import type { ChannelEvent, VideoJob } from "../types";
import {
  formatVideoBytes,
  formatVideoDuration,
  isSocialPackages,
  resolveVideoRowState,
} from "../videoChannel";
import { useVideoRetryMutation } from "../api/useVideoRetryMutation";
import { CaptionPackage } from "./CaptionPackage";
import { IntegrationIcon } from "./IntegrationIcon";
import { buildMarketingPricingUrl } from "@/utils/portalLinks";

interface VideoEventRowProps {
  event: ChannelEvent;
}

/** Short localized date ("Jul 9") for expiry copy and meta lines. */
const shortDate = (iso: string): string => {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? iso
    : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const upgradeHref = () =>
  buildMarketingPricingUrl({
    intent: "unlock_video",
    domain: typeof window !== "undefined" ? window.location.hostname : undefined,
  });

export const VideoEventRow = ({ event }: VideoEventRowProps) => {
  const job = event.videoJob;
  // Defensive: callers gate on `event.videoJob`, but a malformed doc must
  // degrade to nothing rather than crash the whole Activity feed.
  if (!job) return null;

  const state = resolveVideoRowState(job);

  return (
    // aria-live on the row: Rendering → Ready flips announce politely
    // when the events query refetches (handoff §7).
    <li
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:ring-1 dark:ring-white/[.04]"
    >
      <IntegrationIcon
        integrationId="video"
        sizeClassName="size-9"
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="m-0! truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {event.postTitle ||
              sprintf(__("Post #%d", "structura"), event.postId)}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <StateBadge state={state} />
          </div>
        </div>

        <StateBody state={state} job={job} event={event} />

        <p className="mt-2! mb-0! text-xs text-neutral-400 dark:text-neutral-500">
          {new Date(event.createdAt).toLocaleString()}
        </p>
      </div>
    </li>
  );
};

// ---------------------------------------------------------------------------
// Badge + body per state
// ---------------------------------------------------------------------------

function StateBadge({
  state,
}: {
  state: ReturnType<typeof resolveVideoRowState>;
}) {
  switch (state) {
    case "rendering":
      // dotPulse = the in-progress affordance; static under
      // prefers-reduced-motion (the Badge primitive handles that).
      return (
        <Badge intent="indigo" variant="solid" dotPulse>
          {__("Rendering", "structura")}
        </Badge>
      );
    case "ready":
      return (
        <Badge intent="success" variant="solid">
          {__("Ready", "structura")}
        </Badge>
      );
    case "expired":
      return (
        <Badge intent="default" variant="solid">
          {__("Expired", "structura")}
        </Badge>
      );
    case "skipped_quota":
      return (
        <Badge intent="warning" variant="solid">
          {__("Skipped", "structura")}
        </Badge>
      );
    case "failed":
    default:
      return (
        <Badge intent="destructive" variant="solid">
          {__("Failed", "structura")}
        </Badge>
      );
  }
}

function StateBody({
  state,
  job,
  event,
}: {
  state: ReturnType<typeof resolveVideoRowState>;
  job: VideoJob;
  event: ChannelEvent;
}) {
  switch (state) {
    case "rendering":
      return <RenderingBody job={job} />;
    case "ready":
      return <ReadyBody job={job} event={event} />;
    case "expired":
      return <ExpiredBody job={job} />;
    case "skipped_quota":
      return <SkippedBody job={job} />;
    case "failed":
    default:
      return <FailedBody job={job} event={event} />;
  }
}

function RenderingBody({ job }: { job: VideoJob }) {
  return (
    <div className="mt-2.5 max-w-md">
      {/* Indeterminate (no value): total render time is unknown. Brand
          track tint per the handoff's live-bar treatment. */}
      <ProgressBar className="bg-brand-100 dark:bg-brand-500/20" />
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {__(
            "Rendering your video — usually takes a few minutes.",
            "structura",
          )}
        </span>
        {job.stage && (
          // Pipeline stage strings come from the render pipeline verbatim
          // (mono, technical) — not translated by design.
          <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
            {job.stage}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * 56×100 vertical thumbnail with a play (or clock) overlay and the
 * duration chip — the shared visual for ready + expired states. With
 * `onClick` (Ready state) it renders as a real button opening the same
 * preview lightbox as the Preview action; without it (expired/dimmed)
 * it stays an inert div.
 */
function VideoThumb({
  job,
  dimmed = false,
  onClick,
}: {
  job: VideoJob;
  dimmed?: boolean;
  onClick?: () => void;
}) {
  const OverlayIcon = dimmed ? Clock : Play;
  const classes =
    "relative h-[100px] w-14 shrink-0 overflow-hidden rounded-lg bg-gradient-to-b from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800" +
    (dimmed ? " opacity-50 grayscale" : "") +
    // Neutralize wp-admin's default button chrome (border/padding)
    // alongside the pointer/hover/focus affordances.
    (onClick
      ? " group cursor-pointer appearance-none border-0 p-0 transition hover:ring-2 hover:ring-brand-400/60 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none"
      : "");
  const content = (
    <>
      {job.thumbnailUrl && (
        <img
          src={job.thumbnailUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex size-7 items-center justify-center rounded-full bg-neutral-950/60 text-white backdrop-blur-sm transition-transform group-hover:scale-110">
          <OverlayIcon size={13} aria-hidden />
        </div>
      </div>
      {job.durationSec != null && (
        <span className="absolute right-1 bottom-1 rounded bg-neutral-950/75 px-1 py-0.5 font-mono text-[9px] font-semibold text-white">
          {formatVideoDuration(job.durationSec)}
        </span>
      )}
    </>
  );
  return onClick ? (
    <button
      type="button"
      aria-label={__("Preview", "structura")}
      onClick={onClick}
      className={classes}
    >
      {content}
    </button>
  ) : (
    <div className={classes}>{content}</div>
  );
}

function ReadyBody({ job, event }: { job: VideoJob; event: ChannelEvent }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const retry = useVideoRetryMutation();
  // Live quota numbers for the confirmation copy — TanStack dedupes
  // this with the connections page's own query.
  const { videoQuota } = useChannelConnectionsQuery();

  // "0:47 · 24.8 MB · link expires Jul 9" — omit fragments the wire
  // didn't provide rather than rendering placeholders.
  const metaParts = [
    job.durationSec != null ? formatVideoDuration(job.durationSec) : null,
    job.bytes != null ? formatVideoBytes(job.bytes) : null,
    job.expiresAt
      ? sprintf(
          /* translators: %s = short date, e.g. "Jul 9". */
          __("link expires %s", "structura"),
          shortDate(job.expiresAt),
        )
      : null,
  ].filter(Boolean);

  return (
    <>
      <div className="mt-2.5 flex gap-3">
        <VideoThumb
          job={job}
          onClick={job.downloadUrl ? () => setPreviewOpen(true) : undefined}
        />
        <div className="min-w-0 flex-1">
          {metaParts.length > 0 && (
            <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
              {metaParts.join(" · ")}
            </p>
          )}
          <p className="mt-2! mb-0! text-xs text-neutral-500 dark:text-neutral-400">
            {__("Ready to upload to YouTube Shorts or TikTok.", "structura")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {job.downloadUrl && (
              <Button
                variant="primary"
                size="sm"
                href={job.downloadUrl}
                download
              >
                <Download size={14} className="mr-1.5" aria-hidden />
                {__("Download video", "structura")}
              </Button>
            )}
            {job.downloadUrl && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPreviewOpen(true)}
              >
                <Play size={14} className="mr-1.5" aria-hidden />
                {__("Preview", "structura")}
              </Button>
            )}
            {job.srtUrl && (
              <Button variant="transparent" size="sm" href={job.srtUrl} download>
                <Captions size={14} className="mr-1.5" aria-hidden />
                {__("Captions (.srt)", "structura")}
              </Button>
            )}
            <Button
              variant="transparent"
              size="sm"
              onClick={() => setRegenerateOpen(true)}
              disabled={retry.isPending}
            >
              <RotateCcw size={14} className="mr-1.5" aria-hidden />
              {retry.isPending
                ? __("Regenerating…", "structura")
                : __("Regenerate", "structura")}
            </Button>
          </div>

          {/* A re-render of a healthy video spends a real monthly video —
              confirm with the live cost before enqueueing (2026-07-03
              first-render feedback). */}
          <ConfirmDialog
            isOpen={regenerateOpen}
            onClose={() => setRegenerateOpen(false)}
            onConfirm={() => {
              setRegenerateOpen(false);
              retry.mutate(job.jobId);
            }}
            variant="primary"
            title={__("Regenerate this video?", "structura")}
            description={
              videoQuota
                ? sprintf(
                    /* translators: 1: monthly video cap, 2: videos used this month. */
                    __(
                      "This will use 1 of your %1$d monthly videos (%2$d of %1$d used). The same script is re-rendered with the latest visuals and voice.",
                      "structura",
                    ),
                    videoQuota.cap,
                    videoQuota.used,
                  )
                : __(
                    "This will use 1 video from your monthly quota. The same script is re-rendered with the latest visuals and voice.",
                    "structura",
                  )
            }
            confirmButtonProps={{ label: __("Regenerate", "structura") }}
          />

          {job.downloadUrl && (
            <MediaLightbox
              open={previewOpen}
              onClose={() => setPreviewOpen(false)}
              src={job.downloadUrl}
              poster={job.thumbnailUrl}
              closeLabel={__("Close preview", "structura")}
              // Preload nothing until the user hits play — the signed URL is a
              // full render, not a stream-optimized asset.
              videoProps={{ preload: "metadata" }}
            >
              <p className="m-0! text-[10px] font-black tracking-widest text-neutral-400 uppercase">
                {__("Now previewing", "structura")}
              </p>
              <h3 className="mt-2! mb-0! text-lg leading-snug font-bold tracking-tight text-white">
                {event.postTitle}
              </h3>
              <p className="mt-2! mb-0! text-xs text-neutral-400">
                {[
                  job.durationSec != null
                    ? formatVideoDuration(job.durationSec)
                    : null,
                  job.bytes != null ? formatVideoBytes(job.bytes) : null,
                  // Output format is fixed (9:16 @ 1080×1920) — a spec, not copy.
                  "1080×1920",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-5 flex flex-col items-start gap-2.5">
                <Button variant="primary" size="sm" href={job.downloadUrl} download>
                  <Download size={14} className="mr-1.5" aria-hidden />
                  {__("Download video", "structura")}
                </Button>
                <p className="m-0! text-xs leading-relaxed text-neutral-400">
                  {__(
                    "Upload it to YouTube Shorts or TikTok. Auto-publish is on the roadmap.",
                    "structura",
                  )}
                </p>
                {job.expiresAt && (
                  <p className="m-0! text-[11px] text-neutral-500">
                    {sprintf(
                      /* translators: %s = short date, e.g. "Jul 9". */
                      __("Download link expires %s.", "structura"),
                      shortDate(job.expiresAt),
                    )}
                  </p>
                )}
              </div>
            </MediaLightbox>
          )}
        </div>
      </div>

      {/* Per-platform paste packages, full-width under the actions row
          (platform-captions handoff). The guard doubles as the legacy
          fallback: pre-2026-07 renders (and malformed docs) carry no
          socialPackages and keep today's row untouched — no switcher, no
          counters, no empty tabs (handoff board 05). */}
      {isSocialPackages(job.socialPackages) && (
        <CaptionPackage packages={job.socialPackages} />
      )}
    </>
  );
}

function FailedBody({ job, event }: { job: VideoJob; event: ChannelEvent }) {
  const retry = useVideoRetryMutation();
  const reason = job.error?.message?.trim();

  return (
    <div className="mt-2.5 max-w-md space-y-2.5">
      <p
        role="alert"
        className="m-0! rounded-lg bg-red-50 px-2.5 py-1.5 text-xs leading-relaxed text-red-700 dark:bg-red-950/40 dark:text-red-300"
      >
        {/* Always end with the quota reassurance — failures are free. */}
        {reason ? `${reason} ` : ""}
        {__("Nothing was used from your quota.", "structura")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => retry.mutate(job.jobId)}
          disabled={retry.isPending}
        >
          <RotateCcw size={14} className="mr-1.5" aria-hidden />
          {retry.isPending
            ? __("Retrying…", "structura")
            : __("Retry render", "structura")}
        </Button>
        {event.postUrl && (
          <Button
            variant="transparent"
            size="sm"
            href={event.postUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={14} className="mr-1.5" aria-hidden />
            {__("View post", "structura")}
          </Button>
        )}
      </div>
    </div>
  );
}

function ExpiredBody({ job }: { job: VideoJob }) {
  const retry = useVideoRetryMutation();

  return (
    <div className="mt-2.5 flex gap-3">
      <VideoThumb job={job} dimmed />
      <div className="min-w-0 flex-1">
        <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
          {job.expiresAt
            ? sprintf(
                /* translators: %s = short date, e.g. "Jul 1". */
                __(
                  "This download link expired %s — videos are kept for 7 days.",
                  "structura",
                ),
                shortDate(job.expiresAt),
              )
            : __(
                "This download link expired — videos are kept for 7 days.",
                "structura",
              )}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => retry.mutate(job.jobId)}
            disabled={retry.isPending}
          >
            <RefreshCw size={14} className="mr-1.5" aria-hidden />
            {retry.isPending
              ? __("Regenerating…", "structura")
              : __("Regenerate", "structura")}
          </Button>
        </div>
        <p className="mt-2! mb-0! text-[11px] text-neutral-400 dark:text-neutral-500">
          {__("Regenerating uses 1 video from your monthly quota.", "structura")}
        </p>
      </div>
    </div>
  );
}

function SkippedBody({ job }: { job: VideoJob }) {
  return (
    <div className="mt-2.5 max-w-md space-y-2.5">
      <p className="m-0! rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        {job.quotaUsed != null && job.quotaCap != null
          ? sprintf(
              /* translators: %1$d = videos used, %2$d = monthly cap. */
              __(
                "Monthly video limit reached (%1$d of %2$d), so this post was skipped. Renders resume when your quota resets.",
                "structura",
              ),
              job.quotaUsed,
              job.quotaCap,
            )
          : __(
              "Monthly video limit reached, so this post was skipped. Renders resume when your quota resets.",
              "structura",
            )}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          href={upgradeHref()}
          target="_blank"
          rel="noreferrer"
        >
          <ArrowUpRight size={14} className="mr-1.5" aria-hidden />
          {__("Upgrade for more videos", "structura")}
        </Button>
      </div>
    </div>
  );
}
