import { FC } from "react";
import { __ } from "@wordpress/i18n";
import { Alert } from "@structura/ui";
import { AlertOctagon, ExternalLink } from "lucide-react";
import { docsUrl } from "@/utils/docsUrl";

/**
 * In-SPA banner shown on every Structura page when
 * `DISABLE_WP_CRON` is set in the host's `wp-config.php`.
 *
 * Pairs with the global cross-wp-admin banner
 * `Structura\Ui\Wp_Cron_Disabled_Notice` (PHP). The global one runs
 * on every admin page so the operator can't miss it; this one runs
 * *inside* Structura so a user who already dismissed the global
 * banner (intending "yes I have system cron") still sees an
 * unambiguous reminder of the consequences on the plugin's own
 * turf. Unlike the global banner, this one is NOT dismissible —
 * the concern affects every Structura surface, and silencing it on
 * the plugin page itself would strand future operators who inherit
 * the site.
 *
 * The flag is server-resolved and passed via
 * `window.structuraConfig.wp_cron_disabled`, inline-booted by
 * `Admin_Dashboard::enqueue_scripts()`. We read it directly instead
 * of a hook because:
 *   - it's a static boolean for the lifetime of the page,
 *   - a REST round-trip would flash the banner in/out on refresh,
 *   - the PHP side already guarantees the value reflects the site's
 *     current wp-config state.
 */
export const WpCronDisabledBanner: FC = () => {
  const triggered =
    typeof window !== "undefined"
      ? !!window.structuraConfig?.wp_cron_disabled
      : false;

  if (!triggered) return null;

  return (
    <div className="mb-6">
      <Alert variant="error">
        <AlertOctagon />
        <Alert.Title>
          {__("WordPress cron is disabled on this site", "structura")}
        </Alert.Title>
        <Alert.Description>
          <p className="m-0! mb-2!">
            {__(
              "Your wp-config.php sets DISABLE_WP_CRON to true. Every Structura task — scheduled campaigns, image generation, channel dispatches — runs through Action Scheduler, which only fires when WP-Cron runs OR a system cron is hitting wp-cron.php. Without one of those, queued work stalls silently and your posts never get generated.",
              "structura"
            )}
          </p>
          <p className="m-0!">
            {__(
              "If you already have a system cron configured, nothing is broken — the condition just cannot be verified from PHP. If you don't, set one up before relying on scheduled campaigns.",
              "structura"
            )}
          </p>
        </Alert.Description>
        <Alert.Action>
          <a
            href={docsUrl("troubleshooting/wp-cron-disabled")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm"
          >
            {__("Read the setup guide", "structura")}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Alert.Action>
      </Alert>
    </div>
  );
};
