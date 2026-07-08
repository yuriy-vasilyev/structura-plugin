import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRehydrateActiveRun } from "../useRehydrateActiveRun";

/**
 * Shared handle between the Generate-Now mutation (pushes a new
 * `{runId, campaignId}` pair) and the inline `CampaignRunProgress`
 * strip (reads which campaign's card should light up). Kept minimal —
 * a single active run in v1. Multi-run visualization is explicitly out
 * of scope per `specs/progress-stream.md` §3 ("Multi-run queue
 * visualisation … If three runs are in flight, the UI shows '3 posts
 * generating' and opens the first one's drawer on click"). That list-
 * level banner is Phase 4; today we just show the latest.
 *
 * Why store `campaignId` alongside `runId`: the strip wants to render
 * "Starting…" on the originating card *before* the first poll lands —
 * which is the whole AS-jitter window where the Firestore run doc
 * doesn't exist yet and every `GET /v1/runs/{runId}` returns 404. We
 * can't derive the campaign from the (non-existent) run doc during
 * that window, but we DO know it at mutation time because the user
 * clicked "Generate now" on a specific card. Threading the campaignId
 * through the context removes the dependency on the first poll
 * succeeding and makes the card light up on the same tick the
 * mutation resolves.
 *
 * Why a context instead of React Query cache alone: the runId +
 * campaignId aren't server resources — they're UI state ("which
 * campaign card should show the inline strip right now"). Threading
 * them through TanStack Query muddies cache semantics (every call
 * site would key off the same pair anyway) and the mutation-to-strip
 * hand-off is clearer as an explicit "push this run" call.
 */

interface ActiveRun {
  runId: string;
  campaignId: string | number;
}

interface RunsContextValue {
  /** The run the inline strip should currently follow. `null` = no strip. */
  activeRunId: string | null;
  /**
   * The campaign the active run belongs to. Populated synchronously at
   * Generate-Now time (we already know which campaign the user clicked)
   * so the inline strip on that specific card can self-gate and show a
   * "Starting…" state immediately, without waiting for the first poll
   * to return a campaignId from the cloud. `null` when no run is active.
   */
  activeCampaignId: string | number | null;
  /**
   * Called by the Generate-Now mutation when the REST reply returns a
   * `campaign_run_id`. Replaces any previous active run — the previous
   * run's last-good state stays in the React Query cache and reopens if
   * the user passes it back via `setActiveRun`.
   *
   * Pass `null` to clear (semantically equivalent to `dismiss()` — kept
   * separate only so a future "keep receipt pinned" feature has a
   * branch point).
   */
  setActiveRun: (run: ActiveRun | null) => void;
  /**
   * Convenience wrapper for strip dismiss actions. Semantically distinct
   * from `setActiveRun(null)` only in intent — the strip/toast handlers
   * call `dismiss()` when the receipt closes; the mutation calls
   * `setActiveRun` on a new run.
   */
  dismiss: () => void;
}

const RunsContext = createContext<RunsContextValue | null>(null);

export const RunsProvider = ({ children }: { children: ReactNode }) => {
  const [active, setActive] = useState<ActiveRun | null>(null);

  const setActiveRun = useCallback(
    (run: ActiveRun | null) => setActive(run),
    [],
  );
  const dismiss = useCallback(() => setActive(null), []);

  const value = useMemo<RunsContextValue>(
    () => ({
      activeRunId: active?.runId ?? null,
      activeCampaignId: active?.campaignId ?? null,
      setActiveRun,
      dismiss,
    }),
    [active, setActiveRun, dismiss],
  );

  return (
    <RunsContext.Provider value={value}>
      <RehydrationGate />
      {children}
    </RunsContext.Provider>
  );
};

/**
 * Internal child that fires the refresh-recovery query AFTER the
 * context value is in place. Mounted as a sibling of `{children}` so
 * its `useRuns()` lookup resolves against this provider's value, not
 * the `NOOP_RUNS_VALUE` fallback (which is what it'd see if the hook
 * ran before the `<Provider>` wrapped it). Isolated into its own
 * component so the rehydration's `useQuery` call doesn't force a
 * re-render of `RunsProvider` on every poll tick — only this tiny
 * leaf re-renders, and since it returns `null`, there's no DOM cost.
 */
const RehydrationGate = () => {
  useRehydrateActiveRun();
  return null;
};

/**
 * Stable no-op fallback returned when `useRuns()` is called outside a
 * `<RunsProvider>`. We used to throw here — the argument was "silent
 * fallback masks mounting bugs". In practice it did the opposite: the
 * moment `CampaignRunProgress` got embedded into `CampaignCard`, every
 * CampaignCard unit test (which has no business knowing about the
 * progress feature) blew up because rendering the card now transitively
 * touched `useRuns()`. The fix is to let progress-aware components
 * degrade gracefully: without a provider, `activeRunId` is null and
 * the strip self-gates to `return null`, so the test sees the same
 * "no run" surface a production user does before any Generate-Now
 * fires. Production still wires `<RunsProvider>` in App.tsx — if that
 * goes missing, the inline strip itself surfaces the bug by never
 * appearing.
 *
 * The fallback is frozen at module scope so referential identity is
 * stable across renders (no unnecessary effect re-runs in consumers
 * that depend on `setActiveRun` / `dismiss`).
 */
const NOOP_RUNS_VALUE: RunsContextValue = Object.freeze({
  activeRunId: null,
  activeCampaignId: null,
  setActiveRun: () => {},
  dismiss: () => {},
});

/**
 * Hook accessor. Returns a stable no-op fallback when used outside
 * `<RunsProvider>` so progress-aware components can be mounted inside
 * isolated component tests (e.g. CampaignCard unit tests) without every
 * downstream test having to opt into the progress feature's context.
 * See `NOOP_RUNS_VALUE` above for the full rationale.
 */
export const useRuns = (): RunsContextValue => {
  return useContext(RunsContext) ?? NOOP_RUNS_VALUE;
};
