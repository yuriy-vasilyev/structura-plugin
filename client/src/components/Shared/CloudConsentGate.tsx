/**
 * One-time cloud opt-in screen — wp.org guidelines 7 & 9 (review of
 * 2026-08-27).
 *
 * A fresh install used to bootstrap an anonymous Structura Cloud
 * workspace on the first wp-admin page load, sending a persistent
 * install ID, host, site title, WP version, and site identity without
 * the admin ever being asked. That is "phoning home" in wp.org's book.
 * PHP now refuses every outbound cloud request until
 * `structura_cloud_consent` is on record, and this screen is the only
 * place a wp.org install can put it there (entering a license key is
 * the other path, handled server-side in `License_Manager::activate`).
 *
 * Rendered INSTEAD of `<App/>` (see `index.tsx`) while
 * `structuraConfig.cloud_consent === false`, so no query in the app can
 * fire before the decision. On success we hard-reload: `structuraConfig`
 * is a page-render snapshot and the freshly minted `has_workspace` /
 * `is_anonymous` flags only exist in the next render.
 *
 * Deliberately plain: no marketing, no dark patterns, the decline path
 * is spelled out (deactivate — nothing has been sent).
 */

import { useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import { Button, Card } from "@structura/ui";
import { ExternalLink, ShieldCheck } from "lucide-react";

import { useGrantCloudConsent } from "@/lib/consent";

const PRIVACY_URL = "https://www.structurawp.com/privacy";
const TERMS_URL = "https://www.structurawp.com/terms";

/**
 * True only when PHP explicitly says consent is missing. `undefined`
 * (plugin builds predating the flag) must NOT show the gate — those
 * builds bootstrapped already and the screen would be a lie.
 */
export function needsCloudConsent(
  config: { cloud_consent?: boolean } | null | undefined,
): boolean {
  return config?.cloud_consent === false;
}

interface CloudConsentGateProps {
  /** Injected for tests; defaults to a full page reload. */
  onGranted?: () => void;
}

export const CloudConsentGate = ({ onGranted }: CloudConsentGateProps) => {
  const grant = useGrantCloudConsent();
  const [failed, setFailed] = useState(false);

  const handleConnect = async () => {
    setFailed(false);
    try {
      await grant.mutateAsync();
      if (onGranted) {
        onGranted();
      } else {
        window.location.reload();
      }
    } catch {
      setFailed(true);
    }
  };

  const shared = [
    __("A random install ID, generated on this site by WordPress", "structura"),
    __("Your site's address (host name) and site title", "structura"),
    __("Your WordPress version and the plugin version", "structura"),
    __(
      "Your site's branding details: title, tagline, language, logo URL, and active theme name",
      "structura",
    ),
  ];

  return (
    <div className="structura-app-wrapper -ml-2.5 min-h-screen bg-[#f0f0f1] sm:-ml-5 dark:bg-gray-950">
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
        <Card className="p-8!" data-testid="cloud-consent-gate">
          <div className="mb-6 flex items-center gap-3">
            <ShieldCheck className="text-brand-500 h-6 w-6" aria-hidden="true" />
            <h1 className="m-0! text-xl font-bold text-gray-900 dark:text-white">
              {__("Connect this site to Structura Cloud", "structura")}
            </h1>
          </div>

          <p className="m-0! mb-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
            {__(
              "Structura writes and formats your posts on Structura Cloud, a service run by the plugin author. Nothing has been sent yet. When you continue, the plugin creates an anonymous workspace for this site and shares:",
              "structura",
            )}
          </p>

          <ul className="m-0! mb-4 list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
            {shared.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <p className="m-0! mb-6 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            {__(
              "No post content, prompts, or visitor data are included. You can disconnect at any time from Account & License. If you would rather not connect, simply deactivate the plugin — nothing has been sent.",
              "structura",
            )}
          </p>

          <div className="mb-6 flex flex-wrap gap-4 text-sm">
            <a
              href={PRIVACY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 inline-flex items-center gap-1 font-medium hover:underline"
            >
              {__("Privacy policy", "structura")}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <a
              href={TERMS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 inline-flex items-center gap-1 font-medium hover:underline"
            >
              {__("Terms of service", "structura")}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>

          {failed && (
            <p
              role="alert"
              className="m-0! mb-4 text-sm font-medium text-red-600 dark:text-red-400"
            >
              {__(
                "We couldn't save your choice. Please try again in a moment.",
                "structura",
              )}
            </p>
          )}

          <Button onClick={handleConnect} loading={grant.isPending} size="lg">
            {__("Connect to Structura Cloud", "structura")}
          </Button>
        </Card>
      </main>
    </div>
  );
};
