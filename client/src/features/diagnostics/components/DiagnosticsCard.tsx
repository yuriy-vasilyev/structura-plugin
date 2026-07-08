/**
 * Settings → Diagnostics card.
 *
 * Spec: `specs/v2/notification-center.md` §11.2.
 *
 * User-triggered only — clicking "Run diagnostics" gathers the
 * WP-side probes (DISABLE_WP_CRON, plugin version vs cloud floor,
 * compat) and pushes any findings into the Notification Center as
 * `plugin-health` notices. Replaces the bootstrap-time probe path
 * the spec deliberately rejected (§11.2 decision).
 *
 * The card stays compact: a description + a button + a toast. The
 * actual findings render in the bell popover / Notices page rather
 * than inline here — the diagnostic surface is "I want to know if
 * anything's wrong," the Notice surface is "here's what's wrong
 * and what to do about it." Keeping them separate avoids
 * duplicating the per-notice UI.
 */

import { useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { Activity, Loader2 } from "lucide-react";
import { Button, Card, toast } from "@structura/ui";

import { useRunDiagnostics } from "../api/useRunDiagnostics";

export const DiagnosticsCard = () => {
  const runDiagnostics = useRunDiagnostics();
  const [lastRun, setLastRun] = useState<{ checksRun: number; findingsCount: number } | null>(null);

  const onRun = async () => {
    try {
      const result = await runDiagnostics.mutateAsync();
      const findingsCount = result.findings.length;
      setLastRun({ checksRun: result.checksRun, findingsCount });

      if (findingsCount === 0) {
        toast.success(
          __("Diagnostics complete — no issues found.", "structura"),
        );
      } else {
        toast.success(
          sprintf(
            // translators: %d is the number of issues found by the diagnostics run.
            __(
              "Diagnostics complete — %d issue(s) reported to Notifications.",
              "structura",
            ),
            findingsCount,
          ),
        );
      }
    } catch (err: any) {
      toast.error(
        err?.message ||
          __("Diagnostics failed — please try again.", "structura"),
      );
    }
  };

  return (
    <Card className="p-8!">
      <div className="mb-8 flex items-center gap-3">
        <Activity className="text-brand-500 h-5 w-5" />
        <h3 className="m-0! text-sm font-bold tracking-wider text-gray-900 uppercase dark:text-white">
          {__("Diagnostics", "structura")}
        </h3>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <p className="m-0! text-sm font-semibold text-gray-700 dark:text-gray-300">
            {__("Run a health check on this site", "structura")}
          </p>
          <p className="mt-1! mb-0! text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {__(
              "Looks for WP-Cron problems, an outdated plugin version, and known compatibility issues. Any findings are reported to your Notifications so you can act on them from one place.",
              "structura",
            )}
          </p>
          {lastRun ? (
            <p className="mt-3! mb-0! text-xs text-gray-500 dark:text-gray-400">
              {lastRun.findingsCount === 0
                ? sprintf(
                    // translators: %d is the number of checks that ran.
                    __("Last run: %d checks, no issues.", "structura"),
                    lastRun.checksRun,
                  )
                : sprintf(
                    // translators: %1$d checks run, %2$d issues found.
                    __(
                      "Last run: %1$d checks, %2$d issue(s) reported.",
                      "structura",
                    ),
                    lastRun.checksRun,
                    lastRun.findingsCount,
                  )}
            </p>
          ) : null}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRun}
          disabled={runDiagnostics.isPending}
        >
          {runDiagnostics.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Activity className="mr-1.5 h-4 w-4" aria-hidden />
          )}
          {runDiagnostics.isPending
            ? __("Running…", "structura")
            : __("Run diagnostics", "structura")}
        </Button>
      </div>
    </Card>
  );
};
