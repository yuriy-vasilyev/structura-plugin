/**
 * Shown inside step 2 when the AI connection test fails. Renders
 * a clear status block + the path to resolution that matches the
 * failure cause and the workspace's tier.
 *
 * Plan: `valiant-juggling-kazoo.md` §"AI provider connection test".
 *
 *   - BYOK: surface the provider's error verbatim with a "Try
 *     again" button. The user fixes their key in the existing
 *     ProviderSetupWizard dialog (opened separately) and retests.
 *   - Managed (cloud / cloud_pro): managed tier means OUR master
 *     key broke or the provider is degraded — both are ops issues
 *     the user can't fix. One-button "Notify support" posts a
 *     structured email with auto-attached context (workspace,
 *     license, plan, provider, model, raw error). After the user
 *     clicks Notify, the button flips to a success state and the
 *     wizard stays blocked at step 2 (state is preserved
 *     server-side) until the user retests.
 */

import { __ } from "@wordpress/i18n";
import { Button } from "@structura/ui";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
} from "lucide-react";
import { useState } from "@wordpress/element";

import type {
  AiConnectionTestResponse,
  ConnectionTestErrorCode,
} from "../api/types";
import { useNotifyWizardSupportMutation } from "../api/useOnboardingState";

/**
 * Map each error code to a user-facing one-liner. Verbatim provider
 * messages still appear underneath for power users / support-ticket
 * copy-paste, but the user-visible bullet uses these stable strings.
 */
function explainError(code: ConnectionTestErrorCode | undefined): string {
  switch (code) {
    case "auth":
      return __(
        "Authentication failed — the API key was rejected by the provider.",
        "structura",
      );
    case "rate_limit":
      return __(
        "The provider returned a rate-limit error. Wait a moment, then retry.",
        "structura",
      );
    case "model_unavailable":
      return __(
        "The selected model wasn't available for this account.",
        "structura",
      );
    case "timeout":
      return __(
        "The provider didn't respond in time. The connection may be slow or the model warming up.",
        "structura",
      );
    case "network":
      return __(
        "Couldn't reach the provider. Check the network and retry.",
        "structura",
      );
    default:
      return __(
        "The connection test failed before completing.",
        "structura",
      );
  }
}

interface AiConnectionBlockerProps {
  result: AiConnectionTestResponse;
  provider: string;
  model: string;
  /** Re-run the test. */
  onRetry: () => void;
  /** True when the test mutation is mid-flight. */
  isRetrying: boolean;
  /**
   * For BYOK only — opens the existing ProviderSetupWizard dialog
   * so the user can fix their saved key without leaving the
   * onboarding wizard. Null for managed tier (no dialog to open).
   */
  onFixKey?: (() => void) | null;
}

export const AiConnectionBlocker = ({
  result,
  provider,
  model,
  onRetry,
  isRetrying,
  onFixKey,
}: AiConnectionBlockerProps) => {
  const isManaged = result.keySource === "managed";
  const notifyMutation = useNotifyWizardSupportMutation();
  const [notified, setNotified] = useState(false);

  const handleNotify = async () => {
    try {
      await notifyMutation.mutateAsync({
        provider,
        model,
        errorCode: result.errorCode ?? "unknown",
        errorMessage: result.errorMessage ?? "",
      });
      setNotified(true);
    } catch {
      // Mutation surfaces its own error toast; nothing else to do.
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-rose-200 bg-rose-50 p-6 dark:border-rose-900/40 dark:bg-rose-950/20">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
          <AlertTriangle size={14} />
        </span>
        <div className="flex flex-col gap-2">
          <p className="m-0! text-sm font-semibold text-rose-900 dark:text-rose-100">
            {__("Couldn't connect to the AI provider", "structura")}
          </p>
          <p className="m-0! text-sm text-rose-800 dark:text-rose-200">
            {explainError(result.errorCode)}
          </p>
          {result.errorMessage ? (
            <details className="text-xs text-rose-700 dark:text-rose-300">
              <summary className="cursor-pointer select-none">
                {__("Show provider error", "structura")}
              </summary>
              <pre className="m-0! mt-2! whitespace-pre-wrap break-words font-mono text-xs">
                {result.errorMessage}
              </pre>
            </details>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-rose-200 pt-4 dark:border-rose-900/40">
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          disabled={isRetrying}
        >
          {isRetrying ? (
            <Loader2 size={14} className="mr-1.5 animate-spin" />
          ) : (
            <RefreshCw size={14} className="mr-1.5" />
          )}
          {__("Try again", "structura")}
        </Button>

        {isManaged ? (
          notified ? (
            <span className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 size={14} />
              {__(
                "Our team has been notified. Your setup progress is saved — you can resume once we confirm.",
                "structura",
              )}
            </span>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleNotify}
              disabled={notifyMutation.isPending}
            >
              {notifyMutation.isPending ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <Mail size={14} className="mr-1.5" />
              )}
              {__("Notify support", "structura")}
            </Button>
          )
        ) : onFixKey ? (
          <Button variant="primary" size="sm" onClick={onFixKey}>
            {__("Fix API key", "structura")}
          </Button>
        ) : null}
      </div>
    </div>
  );
};
