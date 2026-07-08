import { useQuery } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";
import type { RunStatusSerialized } from "@structura/types";
import { progressKeys } from "./keys";
import { useLicense } from "@/features/settings/api/useLicense";

/**
 * Wire shape returned by the WP REST bridge. The plugin passes the cloud
 * body through verbatim (see `Rest_Api::runs_get` and `Runs_Service`), so
 * this matches the cloud's `GET /v1/runs/{runId}` response byte-for-byte.
 *
 * `success: true` is the happy path; `{ success: false, error }` shapes
 * are returned as HTTP 4xx/5xx by the plugin bridge and get translated
 * into thrown errors by `@wordpress/api-fetch`. We therefore only type
 * the success branch here.
 */
interface RunQueryResponse {
  success: true;
  run: RunStatusSerialized;
}

/**
 * Status values that keep the poll running. `awaiting_pull` is the
 * webhook-delivery fallback's parked state — the cloud finished but couldn't
 * push to this site, so the plugin's poller is pulling the post. We MUST keep
 * polling through it so the drawer flips to `succeeded` once the pull lands
 * (and it's excluded from the auto-cancel, which only fires on `queued`).
 */
const NON_TERMINAL_STATUSES = new Set(["queued", "running", "awaiting_pull"]);

/**
 * Status values that freeze the query and stop polling. `succeeded_with_warnings`
 * (added in run-detail-view.md §3) is terminal-success with a partial-failure
 * annotation — same polling behaviour as `succeeded`; the drawer branches on
 * it separately for the "published with warnings" receipt variant.
 */
const TERMINAL_STATUSES = new Set([
  "succeeded",
  "succeeded_with_warnings",
  "failed",
  "cancelled",
]);

/**
 * Polling interval (ms) during the first minute of a run.
 *
 * Spec §7.3: "Polls every 1000ms while status is non-terminal. Exponential
 * back-off to 5s after 60s of no status change." We implement the
 * back-off as a simple cutover at the 60s mark rather than an actual
 * exponential curve — the spec's intent is to stop hammering the cloud
 * once a run is clearly taking longer than usual, and a 5x multiplier
 * on a single tier does that without the complexity of a ramp.
 */
const POLL_FAST_MS = 1000;
const POLL_SLOW_MS = 5000;
const POLL_BACKOFF_AFTER_MS = 60_000;

/**
 * Max attempts at 5s polling before we give up and auto-cancel.
 * At 5s per poll, 30 attempts = 150 seconds total wait after the
 * backoff threshold (60s + 90s = 150s total from start). If a run
 * hasn't started within 150s, it's stuck and we cancel it.
 */
const MAX_POLL_ATTEMPTS_BEFORE_GIVEUP = 30;

/**
 * React Query hook that polls the progress-stream read surface for one
 * run. Enabled only when a non-empty `runId` is passed — allows the
 * caller to mount the hook unconditionally and flip it on via the runId
 * prop from the Generate-Now mutation response.
 *
 * Polling cadence (spec §7.3):
 *   - 1s while the run is non-terminal and has changed status in the
 *     last 60s,
 *   - 5s after 60s of no status change,
 *   - stopped on terminal status; the last value is shown indefinitely
 *     until the caller dismisses the drawer.
 *
 * Polling cap (run-cancellation infrastructure):
 *   - After 30 attempts at slow polling (150s total wait), if the run
 *     hasn't started, auto-cancel it as stuck.
 *
 * 404 handling: the plugin returns HTTP 404 both when the doc has
 * TTL'd / the feature flag is kill-switched, and transiently during
 * the Action Scheduler jitter window before the cloud dispatcher
 * primes the run doc. All three surface here as a thrown error from
 * apiFetch. Consumers read through `isError` — the inline
 * `CampaignRunProgress` strip keeps its "Starting…" placeholder on
 * screen while errors come back (so the user sees SOMETHING during
 * jitter) and switches to the real run once a poll succeeds. We
 * deliberately set `retry: false` — TTL and kill-switch will never
 * recover, and the `refetchInterval` keeps firing fresh attempts
 * anyway, so a transient 404 during the jitter window retries
 * implicitly on the next tick without burning through the React Query
 * retry budget.
 */
export const useCampaignRunQuery = (runId: string | null) => {
  // Phase 1.8 PR8 — anonymous shadow workspaces (None tier) CAN run
  // single-post generation, so they CAN have run docs to poll. Gating
  // on `hasUsableLicense` left the SPA frozen on "Setting up your run"
  // even after the cloud delivered the post (Yurii incident 2026-05-10).
  // `hasWorkspace` accepts both licensed and anonymous installs.
  const { hasWorkspace } = useLicense();
  let slowPollAttemptCount = 0;

  return useQuery<RunQueryResponse>({
    queryKey: runId ? progressKeys.run(runId) : progressKeys.all,
    enabled: hasWorkspace === true && Boolean(runId),
    // Opt out of the global QueryCache `onError` toast. The progress
    // poll is expected to 404 in two normal cases: (a) the brief window
    // between Generate-Now returning a runId and Action Scheduler firing
    // the cloud dispatcher (up to ~10s while the async job is queued),
    // and (b) after the 24h run-doc TTL. In both cases the inline
    // `CampaignRunProgress` strip already handles the missing data
    // gracefully — showing "Starting…" during (a) and silently
    // disappearing after (b) — so the global red "Data Fetch Error:
    // run_not_found" toast is pure noise and used to storm the screen
    // with one toast per 1s poll. Silencing here keeps the strip's own
    // placeholder / receipt as the single source of truth.
    meta: { silentError: true },
    queryFn: async () => {
      if (!runId) {
        // Unreachable — `enabled: false` prevents execution — but TS
        // narrowing + a defensive check keeps the next maintainer from
        // accidentally calling this without a runId.
        throw new Error("useCampaignRunQuery called without a runId");
      }
      return apiFetch<RunQueryResponse>({
        path: `/structura/v1/runs/${encodeURIComponent(runId)}`,
      });
    },
    // Terminal status freezes the query — return false to stop polling.
    // Non-terminal status keeps polling at 1s, slowing to 5s after 60s
    // of no status change (spec §7.3 back-off). After 30 slow attempts
    // (150s total) AT THE QUEUED STAGE, auto-cancel — the dispatch
    // never reached the cloud and the user shouldn't watch a phantom
    // run forever.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data?.run) {
        // No data yet — either 404 from jitter window or a fresh fetch.
        // Keep trying at fast rate to detect when the doc appears.
        return POLL_FAST_MS;
      }

      const status = data.run.status;
      if (TERMINAL_STATUSES.has(status)) return false;
      if (!NON_TERMINAL_STATUSES.has(status)) return false;

      // `updatedAt` is a serialized ISO 8601 string. If it's older than
      // 60s we slow the poll cadence per spec §7.3 — but we DON'T treat
      // staleness alone as "stuck". A run on a slow step (image gen on
      // gemini-3-pro-image-preview can take 5+ minutes) writes nothing
      // to `updatedAt` between the step's start and end, and that's
      // not a bug — it's the cloud not heartbeat-ing during AI calls.
      // Auto-cancelling those runs caused real user-visible breakage
      // (the 2026-04-29 image-gen incident).
      //
      // The auto-cancel only fires when the run is still in `queued`
      // status — i.e. the dispatch genuinely never started running on
      // the cloud. Any non-queued status means generation is in flight
      // and we should let it finish (or fail naturally on a real cloud
      // error) rather than killing it from the SPA side.
      const updatedAt = Date.parse(data.run.updatedAt);
      const isStale =
        Number.isFinite(updatedAt) &&
        Date.now() - updatedAt > POLL_BACKOFF_AFTER_MS;

      if (isStale && status === "queued") {
        slowPollAttemptCount++;
        if (slowPollAttemptCount >= MAX_POLL_ATTEMPTS_BEFORE_GIVEUP) {
          void apiFetch({
            path: "/structura/v1/scheduler/runs/cancel",
            method: "POST",
            data: {
              run_id: runId,
              cancelled_by: "system",
              cancel_reason: "Run did not start within 150 seconds",
            },
          }).catch(() => {
            // Fire-and-forget: if the cancel call fails, we've already
            // stopped polling so the UI will show the last-good state.
          });
          return false;
        }
        return POLL_SLOW_MS;
      }

      // Slow-tier polling for non-queued staleness too (no point
      // hammering once the cloud is silent), but we DO NOT count it
      // toward the auto-cancel budget. The user can still hit Stop
      // Run manually if they think it's truly stuck.
      if (isStale) return POLL_SLOW_MS;

      return POLL_FAST_MS;
    },
    // 404 from TTL / kill-switch is a terminal condition — no point
    // retrying. Other transport errors get one retry on the 2-second
    // poll cadence anyway.
    retry: false,
    // Keep the last-good value visible after status becomes terminal
    // so the drawer can show the receipt indefinitely until dismissed.
    staleTime: Infinity,
  });
};
