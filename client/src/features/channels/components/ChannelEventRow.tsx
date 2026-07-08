/**
 * Single row of the Channels Activity timeline.
 *
 * Phase 1: pure presentational, only `dispatchedTo` was populated and the
 * footer just said "Dispatched to: …".
 *
 * Phase 2: now renders the per-integration `results` map the cloud
 * dispatcher writes after each notify() call. Each entry becomes a status
 * pill so the user can see which channels got the post and which failed (and
 * why). When `results` is empty we fall back to the old `dispatchedTo`
 * summary so historical events from before Phase 2 still render.
 */

import { __, sprintf } from "@wordpress/i18n";
import { ExternalLink, Radio } from "lucide-react";
import { Badge } from "@structura/ui";
import type { ChannelEvent, DispatchResultStatus } from "../types";
import { VideoEventRow } from "./VideoEventRow";

interface ChannelEventRowProps {
  event: ChannelEvent;
}

const statusIntent = (
  status: DispatchResultStatus,
): "success" | "secondary" | "warning" | "destructive" => {
  switch (status) {
    case "ok":
      return "success";
    case "skipped":
    // Anti-spam throttle — a benign skip, not a failure. Neutral, like skipped.
    case "rate_limited":
      return "secondary";
    case "transient_error":
    case "timeout":
      return "warning";
    case "permanent_error":
    default:
      return "destructive";
  }
};

const statusLabel = (status: DispatchResultStatus): string => {
  switch (status) {
    case "ok":
      return __("Delivered", "structura");
    case "skipped":
      return __("Skipped", "structura");
    case "rate_limited":
      // Throttled by the per-connection cooldown — surfaced as a benign skip.
      return __("Skipped (recently posted)", "structura");
    case "transient_error":
      return __("Retrying", "structura");
    case "timeout":
      return __("Timed out", "structura");
    case "permanent_error":
    default:
      return __("Failed", "structura");
  }
};

export const ChannelEventRow = ({ event }: ChannelEventRowProps) => {
  // Video renders carry their whole lifecycle on `videoJob` — the generic
  // per-integration result pills can't express "rendering / download /
  // expired", so those events delegate to the dedicated row (handoff §3).
  if (event.videoJob) {
    return <VideoEventRow event={event} />;
  }

  const resultEntries = Object.entries(event.results ?? {});
  const hasResults = resultEntries.length > 0;

  const fallbackLabel =
    event.dispatchedTo.length === 0
      ? __("No integrations connected yet", "structura")
      : sprintf(
          // translators: %s is a comma-separated list of integration ids (e.g. "slack, indexnow")
          __("Dispatched to: %s", "structura"),
          event.dispatchedTo.join(", "),
        );

  return (
    <li className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Radio size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-semibold text-neutral-900">
            {event.postTitle ||
              sprintf(__("Post #%d", "structura"), event.postId)}
          </p>
          {event.postUrl && (
            <a
              href={event.postUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
            >
              {__("Open", "structura")}
              <ExternalLink size={12} />
            </a>
          )}
        </div>

        {hasResults ? (
          <ul className="mt-2 flex flex-wrap items-center gap-2">
            {resultEntries.map(([rowKey, result]) => {
              // `results` is keyed by connectionId now — read the integrationId
              // off the row for the label, falling back to the key for legacy
              // integrationId-keyed events.
              const integrationId = result.integrationId ?? rowKey;
              return (
              <li key={rowKey} className="flex items-center gap-2">
                <Badge intent={statusIntent(result.status)} variant="solid">
                  <span className="font-semibold">{integrationId}</span>
                  <span className="ml-1 opacity-80">
                    {statusLabel(result.status)}
                  </span>
                </Badge>
                {result.externalUrl && (
                  <a
                    href={result.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-brand-600 hover:underline"
                    aria-label={sprintf(
                      // translators: %s is the integration id (e.g. "slack")
                      __("Open the message in %s", "structura"),
                      integrationId,
                    )}
                  >
                    <ExternalLink size={11} />
                  </a>
                )}
                {result.error && (
                  <span
                    className="text-xs text-red-700"
                    title={result.error.code}
                  >
                    {result.error.message}
                  </span>
                )}
              </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-neutral-500">{fallbackLabel}</p>
        )}

        <p className="mt-1 text-xs text-neutral-400">
          {new Date(event.createdAt).toLocaleString()}
        </p>
      </div>
    </li>
  );
};
