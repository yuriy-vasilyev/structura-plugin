import { useEffect, useRef } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { toast } from "@structura/ui";
import { useRuns } from "./context/RunsContext";
import { useCampaignRunQuery } from "./api/useCampaignRunQuery";

/**
 * Broadcasts terminal run-status transitions via the global `@structura/ui`
 * toast API so the user hears about a run's outcome regardless of which
 * page they're looking at when it terminates.
 *
 * Why this hook exists (and why it's separate from the inline
 * `CampaignRunProgress` strip):
 *
 *   - The inline strip is great when the user is looking at the
 *     originating campaign card. But an admin who kicked off a run on
 *     `/campaigns` and then navigated to `/settings` or `/channels`
 *     will never see the strip's success/failure frame — the strip is
 *     scoped to its own card, not a floating surface.
 *   - The project's existing `toast` provider (top-right, app-wide,
 *     already used by every mutation success/error path) is the
 *     natural home for "something that was happening in the
 *     background just finished" announcements. It survives route
 *     changes, auto-dismisses, and matches the visual language the
 *     user is already primed for.
 *
 * Previous implementation lived inside `ProgressDrawer.tsx` and fired
 * a *custom* in-portal toast via `useToast().showToast`. That drawer
 * has been removed (spec `plugin-quiet-mode.md` §5.6 + user feedback
 * after repeated "that drawer is broken" reports during the
 * run_not_found storm); the hook lifted the toast responsibility out
 * of the drawer so we could delete the drawer entirely without losing
 * the terminal notification.
 *
 * Scope:
 *   - `failed` → error toast with "View details" action. 12s duration
 *     (long enough to read the campaign name + error, short enough not
 *     to be sticky).
 *   - `succeeded` → success toast with "View post" action when the
 *     post has a resolvable URL. Default duration — the inline strip
 *     already holds the success for 4s on the originating card, so
 *     we're mostly covering the off-screen case.
 *   - `succeeded_with_warnings` → warning toast. Separate tone because
 *     a run that *did* publish shouldn't surface as red; the warning
 *     color says "done, but take a look".
 *   - `cancelled` → no toast. User-initiated cancel is already
 *     acknowledged by the UI flow that triggered it.
 *
 * De-duping: tracks the set of runIds we've already toasted on a ref'd
 * Set so the hook's every-second poll tick doesn't re-fire the same
 * toast as long as the run stays terminal. Bounded by runs-per-session
 * (tiny in practice).
 */
export const useRunStatusToasts = () => {
  const { activeRunId } = useRuns();
  const { data } = useCampaignRunQuery(activeRunId);

  // Primitive deps so the effect doesn't re-run on every React Query
  // poll tick. The effect body re-reads `data` to pick up the latest
  // campaignName / error message at fire time.
  const runIdForToast = data?.run?.runId ?? null;
  const statusForToast = data?.run?.status ?? null;

  const toastedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!runIdForToast || !statusForToast) return;
    // Only the three terminal states that warrant a broadcast — see
    // docblock for rationale on why `cancelled` opts out.
    if (
      statusForToast !== "failed" &&
      statusForToast !== "succeeded" &&
      statusForToast !== "succeeded_with_warnings"
    ) {
      return;
    }

    // Key de-dup on runId+status so a run that flips between states
    // (e.g. a warnings→failed re-classification, rare but legal)
    // still gets a fresh toast for the latter. Most runs hit one
    // terminal state and stop; those fire exactly once.
    const dedupeKey = `${runIdForToast}:${statusForToast}`;
    if (toastedRef.current.has(dedupeKey)) return;
    toastedRef.current.add(dedupeKey);

    const run = data?.run;
    const campaignName = run?.campaignName ?? "";

    if (statusForToast === "failed") {
      const userMessage =
        run?.error?.userMessage ?? __("Generation stopped.", "structura");
      const title = campaignName
        ? // translators: %s is a campaign name
          sprintf(__("%s failed", "structura"), campaignName)
        : __("Campaign run failed", "structura");
      toast.error(userMessage, {
        title,
        duration: 12_000,
        action: {
          label: __("View details", "structura"),
          onClick: () => {
            // HashRouter-based nav — the SPA lives under `#/…`, so a
            // direct hash mutation is the most defensive way to land
            // on the run-detail page from outside Router context.
            window.location.hash = `#/runs/${encodeURIComponent(runIdForToast)}`;
          },
        },
      });
      return;
    }

    if (statusForToast === "succeeded") {
      const title = campaignName
        ? // translators: %s is a campaign name
          sprintf(__("%s — post published", "structura"), campaignName)
        : __("Post published", "structura");
      toast.success(
        __("Your new post is live.", "structura"),
        {
          title,
          action: run?.resultPostUrl
            ? {
                label: __("View post", "structura"),
                onClick: () => {
                  window.open(run.resultPostUrl!, "_blank", "noopener");
                },
              }
            : {
                label: __("View details", "structura"),
                onClick: () => {
                  window.location.hash = `#/runs/${encodeURIComponent(runIdForToast)}`;
                },
              },
        },
      );
      return;
    }

    if (statusForToast === "succeeded_with_warnings") {
      const title = campaignName
        ? // translators: %s is a campaign name
          sprintf(__("%s — published with warnings", "structura"), campaignName)
        : __("Post published with warnings", "structura");
      toast.warning(
        __(
          "The post went live, but one or more steps reported a problem.",
          "structura",
        ),
        {
          title,
          duration: 10_000,
          action: {
            label: __("View details", "structura"),
            onClick: () => {
              window.location.hash = `#/runs/${encodeURIComponent(runIdForToast)}`;
            },
          },
        },
      );
      return;
    }
    // Primitive-only deps — we deliberately read `data` fresh inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runIdForToast, statusForToast]);
};
