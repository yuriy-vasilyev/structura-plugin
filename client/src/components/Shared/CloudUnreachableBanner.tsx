import { FC } from "react";
import { __ } from "@wordpress/i18n";
import { Alert } from "@structura/ui";
import { AlertOctagon, ExternalLink } from "lucide-react";
import { docsUrl } from "@/utils/docsUrl";

/**
 * In-SPA banner shown on every Structura page when the cloud could not
 * reach this site's blueprint webhook on the last handshake probe.
 *
 * Pairs with the global cross-wp-admin banner
 * `Structura\Ui\Site_Unreachable_Notice` (PHP) exactly like
 * {@link WpCronDisabledBanner} pairs with the WP-Cron notice. The global
 * one runs on every admin page so the operator can't miss it; this one
 * runs *inside* Structura so a user who dismissed the global banner still
 * sees the consequence on the plugin's own turf. Unlike the global
 * banner this one is NOT dismissible — an unreachable site loses every
 * scheduled post, and silencing it on the plugin page itself would strand
 * the next operator.
 *
 * The flag is server-resolved (the cached `Site_Reachability` verdict)
 * and passed via `window.structuraConfig.cloud_unreachable`, inline-booted
 * by `Admin_Dashboard::enqueue_scripts()`. We read it directly rather than
 * via a hook because it's a static boolean for the page's lifetime and a
 * REST round-trip would flash the banner in/out on refresh.
 */
export const CloudUnreachableBanner: FC = () => {
  const triggered =
    typeof window !== "undefined"
      ? !!window.structuraConfig?.cloud_unreachable
      : false;

  if (!triggered) return null;

  return (
    <div className="mb-6">
      <Alert variant="error">
        <AlertOctagon />
        <Alert.Title>
          {__("Structura Cloud can't reach this site", "structura")}
        </Alert.Title>
        <Alert.Description>
          <p className="m-0! mb-2!">
            {__(
              "Every Structura post is generated in the cloud and delivered back to your site over a secure webhook. The last connection check couldn't reach this site, so generated posts have nowhere to land — campaigns will run but no post will ever appear.",
              "structura"
            )}
          </p>
          <p className="m-0!">
            {__(
              "This usually means the site is on a local or staging URL (localhost, *.local, *.test), a private network address, or behind HTTP password protection or a firewall that blocks incoming requests. Run a connection check from Settings once the site is publicly reachable.",
              "structura"
            )}
          </p>
        </Alert.Description>
        <Alert.Action>
          <a
            href={docsUrl("troubleshooting/cloud-unreachable")}
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
