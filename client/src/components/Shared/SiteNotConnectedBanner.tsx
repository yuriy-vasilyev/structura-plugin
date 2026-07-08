import { FC, FormEvent, useState } from "react";
import { Link } from "react-router";
import { __ } from "@wordpress/i18n";
import apiFetch from "@wordpress/api-fetch";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Dialog, InputField, toast } from "@structura/ui";
import { LinkIcon } from "lucide-react";
import { useLicense } from "@/features/settings";

/**
 * Inline advisory rendered at the top of the wp-admin SPA when the site
 * USED to be connected to a license but currently isn't — e.g. the
 * operator clicked "Disconnect" in `Account`, the license expired, or
 * the site was migrated to a new host. The advisory's purpose is to
 * point them back at `/account` to reconnect.
 *
 * Why it exists
 * -------------
 * Pre-2026-05-03 a disconnected install fired ~10 cloud-backed queries
 * on every page load — campaigns / personas / runs / channels / stock
 * summaries — and every one of them 403'd at the plugin's REST proxy
 * with `"Active license required."`. The global query-error toast
 * handler at `client/src/index.tsx:39` then stacked one toast per
 * rejected query. The user reported a "toast storm on every refresh"
 * after clicking Disconnect.
 *
 * The fix is two-pronged:
 *   1. Every cloud-backed query hook now self-gates on
 *      `useLicense().hasUsableLicense === true` — so disconnected
 *      installs fire zero requests, produce zero toasts.
 *   2. This banner anchors the resulting empty state with a single
 *      visible affordance: "this site isn't connected; here's what
 *      to do." Routes a click straight to `/account` where the
 *      activation form lives.
 *
 * Fresh-install suppression
 * -------------------------
 * On a true wp.org-fresh install — never activated, no prior license —
 * we deliberately do NOT render this banner. There's nothing to
 * "reconnect" to; the dashboard's "Get started" panel already covers
 * onboarding. We gate on `window.structuraConfig.had_prior_activation`,
 * which the plugin sets after the first successful activation (and
 * the wipe-all uninstall branch clears, so a full wipe → reinstall
 * returns to fresh-install state).
 *
 * Older plugin builds predating the flag don't emit it; treat
 * `undefined` as "assume prior activation" so we don't silently
 * suppress the banner on existing installs that genuinely need to
 * reconnect — better to over-show on legacy plugin builds than to
 * leave them stranded.
 *
 * Self-gating: renders nothing while `hasUsableLicense` is `null`
 * (settings still loading on first paint) or `true` (license bound).
 * Renders the banner only when we've confirmed disconnect AND the
 * site has prior-activation history.
 */
export const SiteNotConnectedBanner: FC = () => {
  const { hasUsableLicense } = useLicense();
  const queryClient = useQueryClient();
  const [forgetOpen, setForgetOpen] = useState(false);
  const [forgetKey, setForgetKey] = useState("");
  const [forgetting, setForgetting] = useState(false);

  if (hasUsableLicense !== false) return null;

  // Treat `undefined` as `true` for back-compat with plugin builds
  // predating the flag — they can't tell us either way, so default
  // to the legacy "show on every disconnect" behavior.
  const hadPriorActivation =
    typeof window !== "undefined" ? (window.structuraConfig?.had_prior_activation ?? true) : true;

  if (!hadPriorActivation) return null;

  /**
   * "Forget this site" — hard-deletes the cloud activation doc so the
   * install can be re-bound from scratch (or handed off to a different
   * account). Auth is the user re-typing their license key into this
   * dialog: by the time the banner is visible, the local bearer is
   * already gone (Disconnect cleared `wp_options.structura_license_data`
   * synchronously), so the cloud has no other way to confirm the caller
   * owns the activation. Same auth boundary `activateLicense` uses.
   *
   * On success we invalidate every query the SPA might be holding —
   * cheaper than hand-listing the affected keys and there's nothing
   * meaningful to retain after the activation is gone. The next paint
   * reads fresh state and `had_prior_activation` is `false`, which
   * unmounts this banner via the early-return above.
   */
  const handleForgetSite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!forgetKey.trim() || forgetting) return;

    setForgetting(true);
    try {
      await apiFetch({
        path: "/structura/v1/license/forget-site",
        method: "POST",
        data: { key: forgetKey.trim() },
      });
      // The plugin already cleared `had_prior_activation` server-side,
      // but `structuraConfig` is read from a snapshot at first paint —
      // mutate it so the banner self-hides immediately without a hard
      // reload.
      if (typeof window !== "undefined" && window.structuraConfig) {
        window.structuraConfig.had_prior_activation = false;
      }
      toast.success(__("Site removed from your activations.", "structura"));
      setForgetOpen(false);
      setForgetKey("");
      queryClient.invalidateQueries();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : __("Could not remove this site. Please try again.", "structura");
      toast.error(message);
    } finally {
      setForgetting(false);
    }
  };

  return (
    <>
      <div className="mb-6">
        <Alert variant="warning">
          <LinkIcon />
          <Alert.Title>{__("This site isn't connected", "structura")}</Alert.Title>
          <Alert.Description>
            {__(
              "Structura needs an active license to fetch campaigns, runs, personas, and integrations. Connect this site from the Account page to bring everything back.",
              "structura"
            )}
          </Alert.Description>
          <Alert.Action>
            <Button size="sm" variant="secondary" asChild>
              <Link to="/account">{__("Connect this site", "structura")}</Link>
            </Button>
            <Button
              size="sm"
              variant="transparent"
              onClick={() => setForgetOpen(true)}
            >
              {__("Forget this site", "structura")}
            </Button>
          </Alert.Action>
        </Alert>
      </div>
      <Dialog.Root open={forgetOpen} onClose={() => (forgetting ? undefined : setForgetOpen(false))}>
        <Dialog.Content>
          <form onSubmit={handleForgetSite}>
            <Dialog.Header>
              <Dialog.Title>{__("Forget this site?", "structura")}</Dialog.Title>
              <Dialog.Description>
                {__(
                  "This permanently removes this site's activation from your Structura account, including its campaigns, runs, and connection secrets. Re-enter your license key to confirm.",
                  "structura"
                )}
              </Dialog.Description>
            </Dialog.Header>
            <Dialog.Body>
              <InputField
                label={__("License key", "structura")}
                value={forgetKey}
                onChange={(e) => setForgetKey(e.target.value)}
                autoComplete="off"
                autoFocus
                required
                disabled={forgetting}
              />
            </Dialog.Body>
            <Dialog.Footer>
              <Button
                type="button"
                variant="transparent"
                onClick={() => setForgetOpen(false)}
                disabled={forgetting}
              >
                {__("Cancel", "structura")}
              </Button>
              <Button type="submit" variant="danger" disabled={forgetting || !forgetKey.trim()}>
                {forgetting
                  ? __("Removing…", "structura")
                  : __("Forget this site", "structura")}
              </Button>
            </Dialog.Footer>
          </form>
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
};
