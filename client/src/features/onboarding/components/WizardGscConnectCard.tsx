/**
 * Google Search Console connect card for the wizard's SEO step.
 *
 * Design handoff: marketing/design_handoff_gsc_wizard_dashboard/README.md,
 * Board 01. An inset section inside the step's existing Competitors Card —
 * never a second Card, never a restructure of the step — offered at the
 * moment of maximum motivation but strictly Optional: step validity NEVER
 * depends on any state here, and the footer's Continue stays enabled
 * throughout (this component deliberately has no access to setStepValid).
 *
 * State machine (handoff "State Management"), derived from the channel
 * connections query + two persisted wizard-store flags:
 *
 *   not_connected → connecting → connected   (happy path across the OAuth
 *                                             round-trip)
 *   not_connected ⇄ skipped                  (local, reversible via Undo)
 *
 * Connect kicks off the standard channels OAuth init with
 * `returnHash: "#/onboarding"` so the cloud callback bounces the user back
 * INTO the wizard rather than onto the Channels page. The redirect unloads
 * the SPA, so "we were mid-connect" is persisted in the wizard store
 * (`gscConnectPending`, localStorage per-activation) — re-entry renders the
 * connecting state until the connections query resolves, then lands on
 * connected (or back on not_connected if the user cancelled at Google).
 *
 * EXTENSION state beyond the handoff's four (per the formulafoundry.io
 * 2026-07-18 incident class): a connection can exist with NO property
 * chosen (OAuth done, auto-match found nothing). The card then renders a
 * non-tinted "one step left" row deep-linking the channels Configure
 * modal's property picker — never re-offering OAuth.
 */

import { useEffect, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import { Button, cn, toast } from "@structura/ui";
import { CircleCheck, Plug } from "lucide-react";

import { useChannelConnectionMutations } from "@/features/channels/api/useChannelConnectionMutations";
import { useChannelConnectionsQuery } from "@/features/channels/api/useChannelConnectionsQuery";
import { GoogleGGlyph } from "@/features/channels/components/GscConnectFlow";
import { GSC_INTEGRATION_ID } from "@/features/channels/types";
import type { GoogleSearchConsoleMeta } from "@/features/channels/types";

import { useWizardStore } from "../state/wizardStore";

type CardState =
  | "not_connected"
  | "connecting"
  | "connected"
  | "property_pending"
  | "skipped";

export const WizardGscConnectCard = () => {
  const gscSkipped = useWizardStore((s) => s.gscSkipped);
  const setGscSkipped = useWizardStore((s) => s.setGscSkipped);
  const gscConnectPending = useWizardStore((s) => s.gscConnectPending);
  const setGscConnectPending = useWizardStore((s) => s.setGscConnectPending);

  const connectionsQuery = useChannelConnectionsQuery();
  const { initOAuth } = useChannelConnectionMutations();

  // Local "OAuth init call in flight / redirect unloading" flag — the store
  // flag only flips once we actually have an authorize URL to leave for.
  const [connecting, setConnecting] = useState(false);

  const gscConnection = connectionsQuery.data?.find(
    (c) => c.integrationId === GSC_INTEGRATION_ID,
  );
  const meta = (gscConnection?.externalAccountMeta ??
    {}) as GoogleSearchConsoleMeta;
  const property = meta.property ?? gscConnection?.externalAccountId ?? null;

  // "The connections query has an answer": resolved (success/error) or it
  // will never fetch (license-disabled → fetchStatus idle while pending).
  // Without the disabled branch a pending gscConnectPending flag would
  // spin forever on unlicensed installs.
  const connectionsSettled =
    connectionsQuery.isSuccess ||
    connectionsQuery.isError ||
    (connectionsQuery.isPending && connectionsQuery.fetchStatus === "idle");

  // Post-bounce cleanup: once the query resolves, the round-trip is over —
  // whatever it found (connection or not) is the state to show. Clearing
  // here (not at render) keeps the user who cancelled Google's consent
  // screen out of a permanent spinner.
  useEffect(() => {
    if (gscConnectPending && connectionsSettled && !connecting) {
      setGscConnectPending(false);
    }
  }, [gscConnectPending, connectionsSettled, connecting, setGscConnectPending]);

  const state: CardState = gscConnection
    ? property
      ? "connected"
      : "property_pending"
    : connecting || (gscConnectPending && !connectionsSettled)
      ? "connecting"
      : gscSkipped
        ? "skipped"
        : "not_connected";

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const result = await initOAuth({
        integrationId: GSC_INTEGRATION_ID,
        // Land the OAuth bounce back INSIDE the wizard (the WP proxy
        // whitelists hash-route shapes; default would be the Channels page).
        returnHash: "#/onboarding",
      });
      if (result.authorizeUrl) {
        // Persist "mid-connect" BEFORE the redirect unloads the SPA so
        // re-entry renders the connecting state (see docblock).
        setGscConnectPending(true);
        window.location.href = result.authorizeUrl;
        return; // Keep the spinner while the page unloads.
      }
      setConnecting(false);
      toast.error(
        __("Failed to get authorization URL. Please try again.", "structura"),
      );
    } catch (err) {
      setConnecting(false);
      toast.error(
        err instanceof Error
          ? err.message
          : __("Connection failed.", "structura"),
      );
    }
  };

  // Skipped collapses to a single dismissable row — no header (Board 01).
  if (state === "skipped") {
    return (
      <CardShell>
        <div className="flex items-center justify-between gap-3">
          <p className="m-0! flex! min-w-0 items-center gap-2 text-[13px] text-neutral-400 dark:text-neutral-500">
            <GoogleGGlyph size={13} className="shrink-0" />
            <span className="truncate">
              {__(
                "Search Console skipped — connect anytime from Channels.",
                "structura",
              )}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setGscSkipped(false)}
            className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-xs font-bold text-brand-600 hover:underline dark:text-brand-300"
          >
            {__("Undo", "structura")}
          </button>
        </div>
      </CardShell>
    );
  }

  if (state === "connected") {
    return (
      <CardShell done>
        <CardHeader
          right={
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold leading-none text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              <CircleCheck size={10} aria-hidden />
              {__("Connected", "structura")}
            </span>
          }
        />
        <ConnectedCopy property={property as string} />
      </CardShell>
    );
  }

  if (state === "property_pending") {
    // EXTENSION state — see docblock. Non-tinted shell: the job isn't done
    // yet, so no emerald "done" celebration.
    const configureHref = `#/channels/connections?configure=${encodeURIComponent(
      gscConnection?.connectionId ?? gscConnection?.integrationId ?? "",
    )}`;
    return (
      <CardShell>
        <CardHeader />
        <p className="m-0! mt-1.5! text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {__(
            "One step left — choose your Search Console property.",
            "structura",
          )}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Button variant="secondary" size="sm" href={configureHref}>
            {__("Choose property", "structura")}
          </Button>
        </div>
      </CardShell>
    );
  }

  if (state === "connecting") {
    return (
      <CardShell>
        <CardHeader />
        <div className="mt-2.5 flex items-center gap-2.5">
          {/* Spinner ring; under prefers-reduced-motion the spin stops but
              the two-tone ring remains as a static in-progress indicator
              (handoff "Reduced motion"). */}
          <span
            aria-hidden
            className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-neutral-200 border-t-brand-600 motion-reduce:animate-none dark:border-neutral-700 dark:border-t-brand-400"
          />
          <p className="m-0! text-[13px] text-neutral-500 dark:text-neutral-400">
            {__(
              "Finishing up with Google… you can keep going — we'll confirm here.",
              "structura",
            )}
          </p>
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell>
      <CardHeader />
      <p className="m-0! mt-1.5! text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        {__(
          "See what each post earns from Google Search — connect now and your first posts report from day one.",
          "structura",
        )}
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleConnect}
          disabled={connecting}
        >
          <Plug size={14} aria-hidden className="mr-1.5" />
          {__("Connect", "structura")}
        </Button>
        <button
          type="button"
          onClick={() => setGscSkipped(true)}
          className="cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-neutral-400 transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
        >
          {__("Skip for now", "structura")}
        </button>
        <span className="ml-auto text-[11px] text-neutral-400 dark:text-neutral-500">
          {__("Free · read-only", "structura")}
        </span>
      </div>
    </CardShell>
  );
};

/* ─── Board 01 building blocks ────────────────────────────────────── */

/**
 * Inset shell (`wzCard`): bordered rounded-xl section inside the step's
 * Card — the connected "done" variant tints emerald.
 */
const CardShell = ({
  done,
  children,
}: {
  done?: boolean;
  children: React.ReactNode;
}) => (
  <div
    data-testid="gsc-connect-card"
    className={cn(
      "rounded-xl border p-4",
      done
        ? "border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-500/25 dark:bg-emerald-500/[.06]"
        : "border-neutral-200 dark:border-neutral-700",
    )}
  >
    {children}
  </div>
);

/** Header row (`wzHead`): G glyph + title + Optional pill (+ status slot). */
const CardHeader = ({ right }: { right?: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3">
    <h3 className="m-0! flex! items-center gap-2 text-sm font-bold text-neutral-900 dark:text-white">
      <GoogleGGlyph size={15} className="shrink-0" />
      {__("Google Search Console", "structura")}
      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wide text-neutral-500 dark:bg-white/[.08] dark:text-neutral-400">
        {__("Optional", "structura")}
      </span>
    </h3>
    {right}
  </div>
);

/**
 * Connected copy with the property id inline in mono. The property is a
 * verbatim GSC string — mono, never translated (handoff i18n rule) — so
 * the translatable sentence carries a `%s` slot we fill with a styled
 * span instead of flattening through `sprintf`.
 */
const ConnectedCopy = ({ property }: { property: string }) => {
  const format = __(
    // translators: %s is a Search Console property id, e.g. "sc-domain:example.com". It renders as-is.
    "Reading %s — search stats will appear on each post once Google records data.",
    "structura",
  );
  const [before, after = ""] = format.split("%s");
  return (
    <p className="m-0! mt-1.5! text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
      {before}
      <span className="font-mono text-xs text-neutral-600 dark:text-neutral-300">
        {property}
      </span>
      {after}
    </p>
  );
};
