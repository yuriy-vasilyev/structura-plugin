import { __ } from "@wordpress/i18n";
import { Activity, AlertTriangle, Bug, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button, Card, cn, toast } from "@structura/ui";
import { usePulseCheck } from "../api/usePulseCheck";
import { useLicense } from "@/features/settings/api/useLicense";
import apiFetch from "@wordpress/api-fetch";
import { useEffect, useRef, useState } from "react";

interface PulseDiagnosticsProps {
  /**
   * Fire the pulse check automatically once on mount. Set when the user
   * arrived from the "Run a connection check" admin notice
   * (`#/settings?run=connection-check`) so the check actually runs instead
   * of just landing them here. The pulse endpoint re-probes cloud→site
   * reachability, so a success clears the unreachable banner.
   */
  autoRun?: boolean;
}

export const PulseDiagnostics = ({ autoRun = false }: PulseDiagnosticsProps) => {
  // Gate on workspace presence, not a license key: anonymous/"none"
  // installs run cloud generation over the same handshake and must be
  // able to verify it too (Yurii wp.org testing 2026-07-08). `hasWorkspace`
  // is true for both a licensed activation and a bootstrapped anonymous
  // workspace; a truly unconfigured install (no bearer) has nothing to
  // probe, so the buttons stay disabled there.
  const { hasWorkspace } = useLicense();
  const canDiagnose = hasWorkspace === true;
  const { mutate: handleTest, isPending, status } = usePulseCheck();
  const [isTestingError, setIsTestingError] = useState(false);

  // Auto-run once when deep-linked from the unreachable-site notice.
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current || !autoRun) return;
    if (!canDiagnose || isPending) return;
    autoRanRef.current = true;
    handleTest();
  }, [autoRun, canDiagnose, isPending, handleTest]);

  const handleTestError = async () => {
    setIsTestingError(true);
    try {
      await apiFetch({ path: "/structura/v1/pulse/test-error", method: "POST" });
      toast.success(__("Simulation triggered. Check Notifications in a moment.", "structura"));
    } catch (e) {
      toast.error(__("Failed to trigger simulation.", "structura"));
    } finally {
      setIsTestingError(false);
    }
  };

  return (
    <Card className="overflow-hidden p-0! shadow-sm">
      <div className="flex flex-col items-start justify-between gap-6 p-6 md:flex-row md:items-center md:p-8">
        {/* LEFT: ICON & BRANDING */}
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "rounded-xl p-3 transition-colors duration-normal",
              isPending || isTestingError
                ? "animate-pulse bg-brand-100"
                : "bg-brand-50 dark:bg-brand-950/30",
              "text-brand-600 ring-1 ring-brand-100 dark:text-brand-400 dark:ring-brand-900/50"
            )}
          >
            {isPending || isTestingError ? (
              <Loader2 size={24} className="animate-spin" />
            ) : (
              <Activity size={24} />
            )}
          </div>
          <div>
            <h3 className="m-0! text-sm font-bold tracking-wider text-gray-900 uppercase dark:text-white">
              {__("Bridge Diagnostics", "structura")}
            </h3>
            <p className="mt-1! mb-0! text-sm text-gray-500 dark:text-gray-400">
              {__("Test the secure handshake with Structura Cloud nodes.", "structura")}
            </p>
          </div>
        </div>

        {/* RIGHT: ACTION BUTTONS (Matching HTML File Classes) */}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleTest()}
            disabled={isPending || isTestingError || !canDiagnose}
            className="text-emerald-700! dark:text-emerald-400!"
          >
            {isPending ? (
              <Loader2 size={14} className="mr-2 animate-spin" />
            ) : (
              <CheckCircle2 size={14} className="mr-2" />
            )}
            {isPending ? __("Handshaking...", "structura") : __("Run Pulse Check", "structura")}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleTestError}
            disabled={isPending || isTestingError || !canDiagnose}
            className="text-red-700! dark:text-red-400!"
          >
            {isTestingError ? (
              <Loader2 size={14} className="mr-2 animate-spin" />
            ) : (
              <Bug size={14} className="mr-2" />
            )}
            {isTestingError
              ? __("Simulating...", "structura")
              : __("Simulate Failure", "structura")}
          </Button>
        </div>
      </div>

      {/* FOOTER: LIVE FEEDBACK SECTION */}
      {(status === "success" || status === "error") && (
        <div
          className={cn(
            "flex items-center gap-2 border-t px-6 py-3 text-[11px] font-bold",
            status === "success"
              ? "border-emerald-100 bg-emerald-50/50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/10 dark:text-emerald-400"
              : "border-red-100 bg-red-50/50 text-red-700 dark:border-red-900/30 dark:bg-red-950/10 dark:text-red-400"
          )}
        >
          {status === "success" ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}
          {status === "success"
            ? __("Handshake Verified: Bi-directional trust active.", "structura")
            : __("Bridge Interrupted: Verify your firewall/REST API.", "structura")}
        </div>
      )}
    </Card>
  );
};
