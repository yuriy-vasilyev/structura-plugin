/**
 * Pre-step-1 license gate — shown when the wizard opens on an install
 * with no license key bound (`hasUsableLicense === false`).
 *
 * Why this exists (2026-06-06): there is no wp.org distribution yet,
 * so every install comes from the portal WITH a key — free or paid.
 * The old first-run experience never asked for it: the wizard
 * couldn't even open without an activation bearer, the only key
 * input hid behind the top-right badge menu (Account & License), and
 * the dashboard greeted fresh installs with an error toast plus a
 * "connect your AI engine" warning. The gate makes the key ask THE
 * first thing a new install sees, right inside the wizard funnel.
 *
 * Once a key activates, `useLicense().activate` invalidates the whole
 * query cache; the settings refetch flips `hasUsableLicense` to true
 * and OnboardingPage swaps this gate for step 1 reactively — no
 * navigation or reload needed. Cloud keys then skip the AI-engine
 * step entirely.
 *
 * Anonymous escape hatch: when the install already has an anonymous
 * workspace (PHP's admin_init bootstrap succeeded), a quiet
 * "continue without an account" link drops into the none-tier
 * locked-preview wizard. Without a workspace the link is omitted —
 * nothing cloud-backed can work, so the key (or the portal) is the
 * only way forward.
 */

import { useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import { Button, InputField } from "@structura/ui";
import { CheckCircle2, ExternalLink, KeyRound, Loader2, Zap } from "lucide-react";

import { useLicense } from "@/features/settings";
import { buildPortalSignupUrl } from "@/utils/portalLinks";

interface WizardLicenseGateProps {
  /**
   * Whether the install has an anonymous workspace to fall back to.
   * Controls the "continue without an account" link — pointless (and
   * broken) when there's no workspace bearer at all.
   */
  canContinueWithoutKey: boolean;
  /** User chose the anonymous path — parent records the skip. */
  onContinueWithoutKey: () => void;
}

export const WizardLicenseGate = ({
  canContinueWithoutKey,
  onContinueWithoutKey,
}: WizardLicenseGateProps) => {
  const { activate, processing, plan } = useLicense();
  const [licenseKey, setLicenseKey] = useState("");
  // Activation succeeded but the gate hasn't unmounted yet: the swap
  // to step 1 rides on the settings REFETCH that activate()'s
  // cache-wide invalidation kicks off, which takes a few seconds.
  // Without an explicit state the form just emptied and sat there —
  // reading as "nothing happened" right after the user's key worked.
  const [connected, setConnected] = useState(false);

  const handleConnect = async () => {
    if (!licenseKey.trim() || processing) return;
    try {
      await activate(licenseKey.trim());
      // No navigation or reload needed: activate() invalidates the
      // whole query cache, the settings refetch flips every tier gate
      // (`plan`, `isPaidLicense`, `provider_count_cap`,
      // `is_anonymous` — all carried on the settings payload since
      // 2026-06-06), and OnboardingPage swaps this gate for step 1
      // reactively. `connected` bridges the refetch window with a
      // success state so the wait reads as progress, not a stall.
      setConnected(true);
      setLicenseKey("");
    } catch {
      // The global MutationCache handler already toasts the error
      // ("Action Failed: …"); the input keeps its value for a retry.
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col items-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg shadow-brand-500/30">
          <KeyRound size={24} />
        </span>
        <h1 className="m-0! text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-4xl">
          {__("Welcome to Structura", "structura")}
        </h1>
        <p className="m-0! max-w-xl text-base text-neutral-600 dark:text-neutral-400">
          {__(
            "Connect your account to get started — paste the license key from your purchase or sign-up email and we'll take it from there.",
            "structura",
          )}
        </p>
      </header>

      {connected ? (
        /* Post-activation bridge — the gate unmounts once the settings
           refetch lands; until then, say so instead of going blank. */
        <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 size={32} className="text-emerald-500" />
          <p className="m-0! text-base font-semibold text-neutral-900 dark:text-neutral-50">
            {__("License connected!", "structura")}
          </p>
          <p className="m-0! flex! items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
            <Loader2 size={14} className="animate-spin" />
            {__("Starting the wizard…", "structura")}
          </p>
        </div>
      ) : (
        /* Submit-on-Enter without a visible form chrome. Centered as a
           block — the row hugs the content width so the input + button
           sit visually under the headline instead of off to a side. */
        <form
          className="mx-auto flex w-full max-w-xl flex-col items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleConnect();
          }}
        >
          <div className="flex w-full flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-end">
            <InputField
              label={__("License Key", "structura")}
              placeholder="ST-XXXX-XXXX-XXXX"
              className="flex-1 font-mono tracking-tighter"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
            />
            <Button
              type="submit"
              disabled={processing || !licenseKey.trim()}
              loading={processing}
            >
              <Zap className="size-4" />
              <span className="ml-2">{__("Connect", "structura")}</span>
            </Button>
          </div>
          <p className="m-0! text-center text-xs text-neutral-500 dark:text-neutral-400">
            {__("Don't have a key yet?", "structura")}{" "}
            <a
              href={buildPortalSignupUrl({
                intent: "general_upgrade",
                domain:
                  typeof window !== "undefined"
                    ? window.location.hostname
                    : undefined,
                plan,
              })}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-brand-600! hover:text-brand-700! dark:text-brand-400! dark:hover:text-brand-300!"
            >
              {__("Create your free account", "structura")}
              <ExternalLink size={12} />
            </a>
          </p>
        </form>
      )}

      {!connected && canContinueWithoutKey ? (
        <div className="flex justify-center border-t border-neutral-100 pt-6 dark:border-neutral-800">
          <button
            type="button"
            onClick={onContinueWithoutKey}
            className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            {__("Continue without an account for now", "structura")}
          </button>
        </div>
      ) : null}
    </div>
  );
};
