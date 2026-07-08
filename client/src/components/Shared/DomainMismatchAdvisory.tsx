/**
 * Global advisory shown when the cloud heartbeat (`checkLicenseStatus`)
 * reports that `window.location.hostname` isn't a registered activation
 * of this license. Typical cause: a site was activated under one host
 * (e.g. `structura-core.ddev.site`) and is now being accessed through
 * another (e.g. `prefeudal-fickly-nana.ngrok-free.dev` from `ddev share`,
 * or a staging → prod hostname flip).
 *
 * Why it's a global banner and not a blocking modal / error toast:
 *   - The rest of the plugin (Campaigns, Dashboard, AI settings) still
 *     works fine on the unrecognized host; only features that rely on
 *     the activation-secret handshake with the cloud (the Channels
 *     catalog / connections / bindings — see integrations-store-spec §5)
 *     are affected. Blocking the whole UI would be far too aggressive.
 *   - The global "Data Fetch Error: Security check failed." toast that
 *     used to fire from `QueryCache.onError` on every cloud call was
 *     noisy and uninformative. Hoisting the detection to `useLicense`
 *     (one heartbeat on load, see `isActivationValid`) lets us explain
 *     exactly what's wrong and what the customer can do about it.
 *   - Rendered globally (not per-route) so the customer sees it
 *     wherever they land, not only when they happen to click into
 *     Channels.
 *
 * Self-gating: the component reads `useLicense()` itself and returns
 * `null` unless `isActivationValid === false`. Mount it once in
 * `App.tsx` and forget about it.
 *
 * The CTA routes to the Account page because that's where the
 * reconnect flow lives (deactivate + paste the key again to register
 * the current host). We deliberately don't try to re-activate silently
 * on the user's behalf — seat budgets matter, and the customer may
 * actually want to stop paying for the old host.
 */

import { FC } from "react";
import { __ } from "@wordpress/i18n";
import { Alert, Button } from "@structura/ui";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Link } from "react-router";
import { useLicense } from "@/features/settings/api/useLicense";

/**
 * Current hostname for the copy line. Defensive wrapper around
 * `window.location.hostname` so the advisory can render in jsdom /
 * future cowork contexts without blowing up when `window` is undefined.
 */
function currentHostname(): string {
  return typeof window !== "undefined" ? window.location.hostname : "";
}

export interface DomainMismatchAdvisoryProps {
  /**
   * Optional override used by tests. Production callers should leave
   * this blank and let the component derive the hostname from
   * `window.location`.
   */
  hostname?: string;
}

export const DomainMismatchAdvisory: FC<DomainMismatchAdvisoryProps> = ({ hostname }) => {
  const { isActivationValid } = useLicense();
  // `null` = pending or unpaid (no heartbeat) — stay out of the way.
  // `true` = fine. `false` = mismatch confirmed, render the banner.
  if (isActivationValid !== false) return null;

  const host = hostname ?? currentHostname();
  return (
    <div className="mb-6" data-testid="domain-mismatch-advisory">
      <Alert variant="warning">
        <AlertTriangle />
        <Alert.Title>
          {__("This site isn't registered to your license", "structura")}
        </Alert.Title>
        <Alert.Description>
          <p className="mt-2! mb-0!">
            {__(
              "You're viewing Structura on a host that isn't one of your license's activations, so we can't verify cloud requests from here. The rest of the plugin still works — but channel connections, the Store, and cloud-backed automations can't load until you reconnect this host.",
              "structura",
            )}
          </p>
          {host && (
            <p className="mt-2! mb-0! font-mono text-xs break-all opacity-80">
              {host}
            </p>
          )}
        </Alert.Description>
        <Alert.Action>
          <Button asChild variant="secondary" size="sm">
            <Link to="/account">
              {__("Reconnect from Account", "structura")}
              <ExternalLink className="ml-1.5 size-3.5" strokeWidth={2.5} />
            </Link>
          </Button>
        </Alert.Action>
      </Alert>
    </div>
  );
};
