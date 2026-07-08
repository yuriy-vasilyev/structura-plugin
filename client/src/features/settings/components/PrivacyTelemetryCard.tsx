import { __, sprintf } from "@wordpress/i18n";
import { Loader2, Shield } from "lucide-react";
import { Card, Checkbox, toast } from "@structura/ui";
import { usePrivacyConsent, useUpdatePrivacyConsent } from "@/lib/consent";
import { capture } from "@/lib/posthog";

/**
 * Settings → Privacy & Telemetry card. The single opt-in switch for
 * anonymous plugin-usage analytics; off by default, persists to the
 * `structura_privacy_consent` WP option via the Phase-1 REST endpoint.
 *
 * Auto-saves on toggle (no global Save button). This matches how
 * PostHog opt-in/out is typically wired in apps — flipping the switch
 * means immediately starting (or stopping) capture, not "queue a
 * pending change until the user clicks Save." It also keeps the card
 * self-contained, independent of `useSettingsMutations` which manages
 * the rest of the Settings page draft state.
 *
 * Mounted in `SettingsPage.tsx` between Log Retention and the temporary
 * Migration Tools card.
 */
export const PrivacyTelemetryCard = () => {
  const { data, isLoading } = usePrivacyConsent();
  const updateConsent = useUpdatePrivacyConsent();

  const telemetryEnabled = data?.telemetryEnabled ?? false;
  const choseAt = data?.choseAt ?? null;
  const isUpdating = updateConsent.isPending;

  const handleToggle = async (next: boolean) => {
    try {
      await updateConsent.mutateAsync(next);
      // Fire AFTER the consent.ts mutation onSuccess has run — that
      // path calls into `setConsented()` which loads (or opts out)
      // posthog-js. The order matters: capture() is a no-op until
      // PostHog has been opted in for the first time, so an opt-in
      // event placed before the consent write would be dropped.
      capture("privacy_consent_changed", { telemetry_enabled: next });
      toast.success(
        next
          ? __(
              "Anonymous usage data sharing enabled. Thanks for helping us improve Structura.",
              "structura"
            )
          : __("Anonymous usage data sharing disabled.", "structura")
      );
    } catch {
      toast.error(
        __("Could not save your privacy preference. Please try again.", "structura")
      );
    }
  };

  if (isLoading) {
    return (
      <Card className="p-8!">
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {__("Loading privacy preferences...", "structura")}
          </span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-8!">
      <div className="mb-8 flex items-center gap-3">
        <Shield className="text-brand-500 h-5 w-5" />
        <h3 className="m-0! text-sm font-bold tracking-wider text-gray-900 uppercase dark:text-white">
          {__("Privacy & Telemetry", "structura")}
        </h3>
      </div>

      <p className="m-0! mb-6 max-w-2xl text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        {__(
          "Help us improve Structura by sharing anonymous usage data. We use PostHog (United States) to understand which features you actually reach for and where the plugin trips users up. No content from your campaigns or from your site visitors' browsers is sent.",
          "structura"
        )}
      </p>

      <div className="flex items-start gap-4">
        <Checkbox
          label={__("Share anonymous usage data", "structura")}
          hiddenLabel
          id="telemetry-enabled"
          checked={telemetryEnabled}
          onChange={(val) => handleToggle(val)}
          className="mt-1"
          disabled={isUpdating}
        />
        <div
          className={`flex flex-col gap-1 ${isUpdating ? "" : "cursor-pointer"}`}
          onClick={() => {
            if (!isUpdating) handleToggle(!telemetryEnabled);
          }}
        >
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {__("Share anonymous usage data", "structura")}
          </span>
          <span className="max-w-2xl text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {__(
              "Records anonymous events about plugin features (campaign runs, channel publishes, settings changes). Tied to your license activation, never to your site visitors. Off by default; you can toggle this any time.",
              "structura"
            )}
          </span>
          {choseAt && (
            <span className="text-brand-600 dark:text-brand-400 mt-1 text-xs font-medium">
              {sprintf(
                // translators: %s is a localized date when the admin recorded their choice.
                __("Your choice was recorded on %s.", "structura"),
                new Date(choseAt * 1000).toLocaleDateString()
              )}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
};
