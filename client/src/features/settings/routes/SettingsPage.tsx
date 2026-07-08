import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { __ } from "@wordpress/i18n";
import { Loader2, Save, ShieldAlert } from "lucide-react";
import { Button, Card, Checkbox, PageLoader } from "@structura/ui";

// Hooks & Logic
import { useSettingsMutations, useSettingsQuery } from "@/features/settings";
import { GeneralSettings } from "../types";
import { PulseDiagnostics } from "@/features/campaigns/components/PulseDiagnostics";
import { PageTitle } from "@/components/Layout/PageTitle";
import { PageDescription } from "@/components/Layout/PageSubtitle";
import { PageContainer } from "@/components/Layout/PageContainer";
import { PrivacyTelemetryCard } from "../components/PrivacyTelemetryCard";
import { DiagnosticsCard } from "@/features/diagnostics";

export const SettingsPage = () => {
  const { data: initialData, isLoading } = useSettingsQuery((s) => s.general);
  const { updateSettings, isUpdating } = useSettingsMutations();

  // Deep-link from the "cloud can't reach this site" admin notice
  // (#/settings?run=connection-check) → auto-run the Bridge Diagnostics
  // pulse and scroll it into view, so the notice's button actually runs a
  // check instead of just dropping the user on this page.
  const [searchParams] = useSearchParams();
  const autoRunCheck = searchParams.get("run") === "connection-check";
  const pulseRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoRunCheck) {
      pulseRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [autoRunCheck]);

  const [draft, setDraft] = useState<GeneralSettings>({
    delete_data_on_uninstall: false,
  });

  useEffect(() => {
    if (initialData) {
      setDraft({
        delete_data_on_uninstall: initialData.delete_data_on_uninstall,
      });
    }
  }, [initialData]);

  const handleChange = <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    await updateSettings({ slice: "general", data: draft });
  };

  if (isLoading) {
    return <PageLoader label={__("Syncing preferences…", "structura")} size="lg" padding="lg" />;
  }

  return (
    <PageContainer variant="narrow" className="space-y-10">
      {/* NEW HEADER DESIGN */}
      <header className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-center">
        <div>
          <PageTitle>{__("General Settings", "structura")}</PageTitle>
          <PageDescription>{__("Global Architecture Control.", "structura")}</PageDescription>
        </div>

        <Button onClick={handleSave} disabled={isUpdating}>
          {isUpdating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {isUpdating ? __("Syncing...", "structura") : __("Save Changes", "structura")}
        </Button>
      </header>

      {/* Bridge Diagnostics is all-tier: cloud generation now runs for
        * every plan (was paid-only pre-2026-06), so every site needs to be
        * able to verify the cloud↔plugin handshake. */}
      <div ref={pulseRef}>
        <PulseDiagnostics autoRun={autoRunCheck} />
      </div>

      {/* DATA PERSISTENCE */}
      <Card variant="danger" className="p-8!">
        <div className="mb-8 flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-red-500" />
          <h3 className="m-0! text-sm font-bold tracking-wider text-gray-900 uppercase dark:text-white">
            {__("Data Persistence", "structura")}
          </h3>
        </div>

        <div className="flex items-start gap-4">
          <Checkbox
            label={__("Wipe all data on uninstall", "structura")}
            hiddenLabel
            id="wipe-data"
            checked={draft.delete_data_on_uninstall}
            onChange={(val) => handleChange("delete_data_on_uninstall", val)}
            className="mt-1"
          />
          <div
            className="flex cursor-pointer flex-col gap-1"
            onClick={() =>
              handleChange("delete_data_on_uninstall", !draft.delete_data_on_uninstall)
            }
          >
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {__("Wipe all data on uninstall", "structura")}
            </span>
            <span className="max-w-2xl text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {__(
                "If enabled, deleting the plugin will permanently remove all Campaigns and Personas from your WordPress database. Keep this disabled if you plan to reinstall later or migrate.",
                "structura"
              )}
            </span>
          </div>
        </div>
      </Card>

      {/* Log Retention card retired in Phase 3b — see
        * spec/v2/notification-center.md §8.1. The `wp_structura_logs`
        * table and the daily prune cron are both gone; the user-facing
        * "what happened" surface is the Notification Center now. */}

      {/*
       * PRIVACY & TELEMETRY — opt-in for anonymous plugin-usage analytics.
       * No banner inside wp-admin (plugin admins are paid customers, not
       * anonymous visitors); the choice lives on the Settings page where
       * admins already manage other site-wide preferences. Off by default;
       * toggling auto-saves through the /privacy/consent REST endpoint.
       */}
      <PrivacyTelemetryCard />

      {/* Diagnostics — user-triggered WP-environment health
        * probes (DISABLE_WP_CRON, outdated plugin version, future
        * compat checks). Findings show up in the Notification
        * Center bell + page; the card itself is just the entry
        * point. Spec: v2/notification-center.md §11.2. */}
      <DiagnosticsCard />

      {/* Advanced/Debug mode card retired alongside the System Logs
        * page — admin incidents + the Notification Center + per-
        * failure emails cover every observability case the toggle
        * previously gated, and the Download logs button pointed at
        * a REST endpoint that no longer exists. */}
    </PageContainer>
  );
};
