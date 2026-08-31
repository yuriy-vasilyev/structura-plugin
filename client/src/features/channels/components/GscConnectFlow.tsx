/**
 * Google Search Console connect flow — the four-state modal that follows
 * the OAuth bounce (`?configure=<connectionId>` on the Connections page).
 *
 * Design handoff: marketing/design_handoff_gsc_connect_flow/README.md
 * (Boards 02–05); spec: specs/gsc-integration.md §4.1–4.2. One state at a
 * time, derived by `deriveGscConnectView` in ../gscConnect.ts:
 *
 *   - `auto_matched` (Board 02) — matched-property panel + one Confirm.
 *   - `picker` (Board 03)       — radio list with type explainers,
 *     permission badges, and a "Best match" pre-selection.
 *   - `no_property` (Board 04)  — numbered verify-with-Google steps and an
 *     "I've verified — check again" retry on the stored token.
 *   - `insufficient_permission` (Board 05) — amber panel naming the
 *     account + property and the exact Restricted-user ask, with a
 *     copyable request for the property owner.
 *
 * Retries go through POST `/gsc/refresh-properties` (no OAuth round-trip);
 * "Switch account" restarts OAuth via the standard init flow — the server
 * always forces Google's account chooser for GSC. Saving a property uses
 * the existing `selected_gsc_property` settings path; the cloud REJECTS
 * unverified selections with a user-facing message, which renders inline
 * here (amber, never red — nothing in this flow is the user's fault).
 *
 * ConfigureConnectionModal delegates to this component for
 * `integrationId === "google-search-console"`, so both entry points (the
 * post-OAuth bounce and the row's Configure button) share it unchanged.
 */

import type { ReactNode } from "react";
import { Fragment, useState } from "react";
import { __, _n, sprintf } from "@wordpress/i18n";
import {
  Check,
  CircleCheck,
  Copy,
  ExternalLink,
  Eye,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import { Alert, Badge, Button, cn, Dialog, Spinner, toast } from "@structura/ui";
import { useChannelConnectionMutations } from "../api/useChannelConnectionMutations";
import { useGscRefreshProperties } from "../api/useGscRefreshProperties";
import type { GscConnectView } from "../gscConnect";
import {
  bestGscPropertyMatch,
  deriveGscConnectView,
  gscPropertyKind,
  gscPropertyToRequest,
  usableGscProperties,
} from "../gscConnect";
import type { ConnectionSummary, GoogleSearchConsoleMeta, GoogleSearchConsoleProperty, } from "../types";
import { GSC_INTEGRATION_ID } from "../types";

/**
 * Google's "add a property" welcome flow — the "Open Search Console"
 * target in the no-property guidance (handoff Board 04).
 */
export const GSC_WELCOME_URL = "https://search.google.com/search-console/welcome";

/**
 * Official four-color Google "G" (48-viewBox mark) — the one
 * non-monochrome glyph exception in the channel system, matching the
 * Google connect CTAs elsewhere. Never recolor it and never run it
 * through a currentColor treatment (handoff "Assets"). Also used by
 * `IntegrationIcon` for the catalog card / connection row tile.
 */
export const GoogleGGlyph = ({ size = 20, className }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className={className}>
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);

/**
 * sprintf for React nodes: replaces `%s` / `%1$s` tokens in a translated
 * format string with JSX values (mono emails, mono property ids, bold
 * spans) that plain `sprintf` would flatten to text. Property ids, emails,
 * and GSC strings render verbatim in mono and are never translated
 * (handoff i18n rule) — this keeps them as styled nodes inside otherwise
 * translatable sentences.
 */
function sprintfNodes(format: string, ...values: ReactNode[]): ReactNode {
  const out: ReactNode[] = [];
  const re = /%(?:(\d+)\$)?s/g;
  let last = 0;
  let auto = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(format)) !== null) {
    if (match.index > last) out.push(format.slice(last, match.index));
    const idx = match[1] ? Number(match[1]) - 1 : auto++;
    out.push(<Fragment key={key++}>{values[idx]}</Fragment>);
    last = match.index + match[0].length;
  }
  if (last < format.length) out.push(format.slice(last));
  return out;
}

/** Verbatim-data span: emails, property ids, hosts — mono, untranslated. */
const Mono = ({ children }: { children: ReactNode }) => (
  <span className="font-mono">{children}</span>
);

/**
 * The plain-language property-type explainer (bold lead-in + one plain
 * sentence). `withMatch` appends the "It matches your site …" sentence
 * used by the auto-matched panel (Board 02); the picker rows (Board 03)
 * omit it.
 */
function PropertyTypeLine({
  siteUrl,
  siteHost,
  withMatch = false,
}: {
  siteUrl: string;
  siteHost: string;
  withMatch?: boolean;
}) {
  const kind = gscPropertyKind(siteUrl);
  return (
    <>
      <strong className="font-semibold text-neutral-600 dark:text-neutral-300">
        {kind === "domain"
          ? __("Domain property.", "structura")
          : __("URL-prefix property.", "structura")}
      </strong>{" "}
      {kind === "domain"
        ? __("Covers the whole domain — every subdomain and protocol.", "structura")
        : __("Covers only pages under this exact address.", "structura")}
      {withMatch && siteHost ? (
        <>
          {" "}
          {sprintfNodes(
            /* translators: %s = the site's host name (e.g. "acme-blog.com"), rendered verbatim. */
            __("It matches your site %s.", "structura"),
            <Mono>{siteHost}</Mono>
          )}
        </>
      ) : null}
    </>
  );
}

/**
 * Permission badge (Board 03 row line 3). Owner / Full access read as
 * success; Restricted is deliberately neutral AND explicitly labeled
 * "enough for Structura" — read-only is all we ever need, so the UI must
 * never push users toward asking for Owner. Any unknown Google level
 * degrades to the neutral Restricted framing (it can read data, or it
 * wouldn't be in the usable list).
 */
function GscPermissionBadge({ level }: { level: string }) {
  if (level === "siteOwner") {
    return (
      <Badge intent="success">
        <ShieldCheck size={10} aria-hidden />
        {__("Owner", "structura")}
      </Badge>
    );
  }
  if (level === "siteFullUser") {
    return (
      <Badge intent="success">
        <Check size={10} aria-hidden />
        {__("Full access", "structura")}
      </Badge>
    );
  }
  return (
    <Badge intent="default">
      <Eye size={10} aria-hidden />
      {__("Restricted — read-only, enough for Structura", "structura")}
    </Badge>
  );
}

/**
 * Google-account context row: email only, no avatar — the read-only scope
 * set carries the address but no profile photo, and a placeholder avatar
 * reads as a bug (handoff key decision). "Switch account" restarts OAuth;
 * the server forces Google's account chooser.
 */
function GscAccountRow({
  email,
  onSwitch,
  disabled,
}: {
  email: string;
  onSwitch: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-neutral-50 px-3.5 py-2.5 ring-1 ring-neutral-200/60 dark:bg-white/[.04] dark:ring-white/[.06]">
      <div className="flex min-w-0 items-center gap-2.5">
        <UserRound
          size={14}
          className="shrink-0 text-neutral-400 dark:text-neutral-500"
          aria-hidden
        />
        {/* The email is data, not copy — verbatim, mono, truncating. */}
        <span className="truncate font-mono text-[11px] text-neutral-600 dark:text-neutral-300">
          {email}
        </span>
      </div>
      {/* m-0!/p-0!/bg-transparent strip wp-admin's default button chrome —
          this must read as an inline link, not a WP button. */}
      <button
        type="button"
        onClick={onSwitch}
        disabled={disabled}
        className="text-brand-600 focus-visible:ring-brand-400 dark:text-brand-300 m-0! shrink-0 cursor-pointer border-0 bg-transparent p-0! text-[11px] font-bold hover:underline focus:outline-none focus-visible:ring-2 disabled:cursor-default disabled:opacity-60"
      >
        {__("Switch account", "structura")}
      </button>
    </div>
  );
}

interface GscConnectModalProps {
  connection: ConnectionSummary;
  open: boolean;
  onClose: () => void;
}

/** Data the modal renders from — seeded by the connection summary, then
 * replaced wholesale by each refresh-proxy response. */
interface GscFlowData {
  googleEmail: string;
  property: string | null;
  properties: GoogleSearchConsoleProperty[];
}

export const GscConnectModal = ({ connection, open, onClose }: GscConnectModalProps) => {
  // The wp-admin SPA knows its own host via the bootstrap config —
  // `wp_parse_url(get_site_url(), PHP_URL_HOST)` on the PHP side. Fall
  // back to the browser host (same origin as wp-admin) defensively.
  const siteHost =
    typeof window === "undefined"
      ? ""
      : (window.structuraConfig?.domain ?? window.location.hostname);

  const meta = (connection.externalAccountMeta ?? {}) as GoogleSearchConsoleMeta;
  const [flow, setFlow] = useState<GscFlowData>(() => ({
    // displayName is set to the Google email at connect, so it covers the
    // (rare) case where the userinfo lookup failed and the meta is null.
    googleEmail: meta.googleEmail || connection.displayName || "",
    // Older clouds mirrored the active property only into
    // externalAccountId — read both so back-compat rows still confirm.
    property: meta.property || connection.externalAccountId || null,
    properties: meta.availableProperties ?? [],
  }));

  const usable = usableGscProperties(flow.properties);
  const best = bestGscPropertyMatch(siteHost, flow.properties);

  const [view, setView] = useState<GscConnectView>(() =>
    deriveGscConnectView(flow.property, flow.properties)
  );
  // Picker radio value — seeded with the confirmed/auto-matched property
  // when one exists, else the best-match pre-selection (spec §4.2 order).
  const [selected, setSelected] = useState<string>(
    () => flow.property || best?.siteUrl || usable[0]?.siteUrl || ""
  );
  // Amber inline error — server rejects (unverified selection), refresh
  // failures, OAuth-init failures. Never a red toast: nothing in this
  // flow is the user's fault (handoff "Design Tokens").
  const [inlineError, setInlineError] = useState<string | null>(null);
  // Set after a retry that STILL found no property — Google verification
  // can take a few minutes to propagate, and the UI must say so instead
  // of silently re-rendering the same guidance (Board 04 retry rule).
  const [notFoundYet, setNotFoundYet] = useState(false);
  // True when the picker was entered from the confirm view, so Cancel can
  // return there instead of closing (handoff: "back-link returns to
  // confirm").
  const [pickerFromConfirm, setPickerFromConfirm] = useState(false);

  const { updateSettings, initOAuth, isSaving } = useChannelConnectionMutations();
  const { refreshProperties, isRefreshing } = useGscRefreshProperties();
  const busy = isSaving || isRefreshing;

  const fallbackError = __(
    "Something went wrong talking to Google. Please try again.",
    "structura"
  );

  const saveProperty = async (siteUrl: string) => {
    // connectionId is optional on the wire for pre-migration rows; the
    // modal is only opened for rows with a real UUID, but TS doesn't know.
    if (!connection.connectionId || !siteUrl) return;
    setInlineError(null);
    try {
      await updateSettings({
        connection_id: connection.connectionId,
        selected_gsc_property: siteUrl,
      });
      // Success toast comes from the mutation hook; the connection row
      // now shows the property and the Search-performance page unlocks.
      onClose();
    } catch (err) {
      // The cloud's user-facing reject (e.g. an unverified selection)
      // surfaces inline right here — the modal stays open for a retry.
      setInlineError(err instanceof Error ? err.message : fallbackError);
    }
  };

  const refresh = async () => {
    setInlineError(null);
    setNotFoundYet(false);
    let response;
    try {
      response = await refreshProperties();
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : fallbackError);
      return;
    }
    if (!response.ok) {
      setInlineError(response.error || fallbackError);
      return;
    }
    const properties = response.properties ?? [];
    const property = response.selected ?? null;
    setFlow((prev) => ({
      googleEmail: response.googleEmail || prev.googleEmail,
      property,
      properties,
    }));
    const next = deriveGscConnectView(property, properties);
    setView(next);
    setPickerFromConfirm(false);
    if (next === "picker") {
      const freshBest = bestGscPropertyMatch(siteHost, properties);
      setSelected(freshBest?.siteUrl ?? usableGscProperties(properties)[0]?.siteUrl ?? "");
    }
    if (next === "no_property") setNotFoundYet(true);
  };

  const switchAccount = async () => {
    setInlineError(null);
    try {
      const result = await initOAuth({ integrationId: GSC_INTEGRATION_ID });
      // Full-page redirect into Google's consent screen — the server
      // forces the account chooser, and the callback bounces back to the
      // Connections page with a fresh `?configure=`.
      window.location.href = result.authorizeUrl;
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : fallbackError);
    }
  };

  const copyOwnerRequest = async () => {
    const property = gscPropertyToRequest(siteHost, flow.properties) ?? "";
    const request = sprintf(
      /* translators: %1$s = the Search Console property id (e.g. "sc-domain:acme-blog.com"), %2$s = the requester's Google account email. "Search Console" and "Restricted" are Google product terms. */
      __(
        'Hi! Could you add me as a user on the Search Console property %1$s? My Google account is %2$s. "Restricted" permission is enough — I only need read access to search stats. You can add me in Search Console under Settings → Users and permissions. Thanks!',
        "structura"
      ),
      property,
      flow.googleEmail
    );
    try {
      await navigator.clipboard.writeText(request);
      toast.success(__("Request copied to your clipboard.", "structura"));
    } catch {
      toast.error(__("Couldn't copy to the clipboard — please try again.", "structura"));
    }
  };

  // ---- Per-view header copy -------------------------------------------------

  const title =
    view === "auto_matched"
      ? __("Connect Search Console", "structura")
      : view === "picker"
        ? __("Choose your property", "structura")
        : view === "no_property"
          ? __("One step first: verify your site with Google", "structura")
          : __("You need more access to this property", "structura");

  const description: ReactNode =
    view === "auto_matched"
      ? __("We found the Search Console property for this site.", "structura")
      : view === "picker"
        ? sprintfNodes(
            sprintf(
              /* translators: %2$s stays a literal placeholder for the site host (styled separately); %1$d = number of candidate properties. */
              _n(
                "Your Google account has %1$d property that could match %2$s. Pick the one Structura should read.",
                "Your Google account has %1$d properties that could match %2$s. Pick the one Structura should read.",
                usable.length,
                "structura"
              ),
              usable.length,
              "%s"
            ),
            <Mono>{siteHost}</Mono>
          )
        : view === "no_property"
          ? sprintfNodes(
              /* translators: %1$s = the connected Google account email, %2$s = the site's host name — both rendered verbatim. */
              __(
                "%1$s has no verified Search Console property for %2$s. Verification is Google's proof you own the site — it takes about 5 minutes, and only Google can do it.",
                "structura"
              ),
              <Mono>{flow.googleEmail}</Mono>,
              <Mono>{siteHost}</Mono>
            )
          : __("This property exists, but your account can't read its data yet.", "structura");

  // ---- Bodies ---------------------------------------------------------------

  const errorAlert = inlineError ? (
    <Alert variant="warning">
      <TriangleAlert aria-hidden />
      <Alert.Description>{inlineError}</Alert.Description>
    </Alert>
  ) : null;

  const accountRow = flow.googleEmail ? (
    <GscAccountRow email={flow.googleEmail} onSwitch={() => void switchAccount()} disabled={busy} />
  ) : null;

  const spinnerBody = (
    <div className="flex flex-col items-center gap-3 py-10" role="status">
      <Spinner size="md" />
      <p className="m-0! text-sm text-neutral-500 dark:text-neutral-400">
        {__("Checking your Search Console properties…", "structura")}
      </p>
    </div>
  );

  const confirmBody = (
    <div className="flex flex-col gap-3">
      {accountRow}
      <div className="rounded-xl border border-neutral-200 px-3.5 py-3 dark:border-neutral-700">
        <div className="flex items-center gap-2">
          <CircleCheck
            size={15}
            className="shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden
          />
          <span className="font-mono text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            {flow.property}
          </span>
        </div>
        <p className="m-0! mt-1! pl-[23px] text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {flow.property && (
            <PropertyTypeLine siteUrl={flow.property} siteHost={siteHost} withMatch />
          )}
        </p>
      </div>
      {errorAlert}
      <p className="m-0! text-[11px] leading-relaxed text-neutral-400 dark:text-neutral-500">
        {__(
          "Read-only — Structura can see search stats, and nothing else. Disconnect anytime.",
          "structura"
        )}
      </p>
    </div>
  );

  const pickerBody = (
    <div className="flex flex-col gap-3">
      {accountRow}
      {/* Accounts with many verified properties (agencies especially) blew
          past the viewport — the dialog grew unbounded and the list ran off
          the bottom of the screen with no way to reach the lower options or
          the footer. Cap the list and let it scroll inside the dialog; the
          account row above and the error/footer below stay pinned. `pr-1`
          keeps each row's focus ring / border off the scrollbar. */}
      <div
        role="radiogroup"
        aria-label={__("Search Console property", "structura")}
        className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto pr-1"
      >
        {usable.map((property) => {
          const checked = property.siteUrl === selected;
          const isBest = best?.covers === true && best.siteUrl === property.siteUrl;
          return (
            <label
              key={property.siteUrl}
              className={cn(
                "m-0! flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-all",
                checked
                  ? "border-brand-300 bg-brand-50/50 ring-brand-300 dark:border-brand-500/50 dark:bg-brand-500/[.08] dark:ring-brand-500/50 ring-1"
                  : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
              )}
            >
              {/* appearance-none overrides wp-admin's native radio styling;
                  m-0! resets the WP global input margin. Mirrors the
                  LinkedIn posting-target radios in InstallModal. */}
              <input
                type="radio"
                name="gsc-connect-property"
                checked={checked}
                onChange={() => setSelected(property.siteUrl)}
                className="mt-0.5!size-4 checked:border-brand-600 checked:bg-brand-600 focus-visible:ring-brand-500 dark:checked:border-brand-400 dark:checked:bg-brand-400 mb-0! shrink-0 appearance-none rounded-full border-2 border-neutral-300 bg-white focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none dark:border-neutral-600 dark:bg-neutral-800"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  {/* Property ids render verbatim in mono — including
                      Google's sc-domain: prefix — so what the user sees
                      here is exactly what Search Console shows them. */}
                  <span className="font-mono text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                    {property.siteUrl}
                  </span>
                  {isBest && <Badge intent="indigo">{__("Best match", "structura")}</Badge>}
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                  <PropertyTypeLine siteUrl={property.siteUrl} siteHost={siteHost} />
                </span>
                <span className="mt-1.5 block">
                  <GscPermissionBadge level={property.permissionLevel} />
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {errorAlert}
    </div>
  );

  const noPropertyBody = (
    <div className="flex flex-col gap-3">
      <ol className="m-0! flex list-none flex-col gap-2.5 rounded-xl bg-neutral-50 p-4! ring-1 ring-neutral-200/60 dark:bg-white/[.04] dark:ring-white/[.06]">
        {[
          sprintfNodes(
            /* translators: %1$s = "Google Search Console" (product name, bolded), %2$s = the site's host name, rendered verbatim. */
            __("Open %1$s and add %2$s as a property.", "structura"),
            <strong className="font-semibold">Google Search Console</strong>,
            <span className="font-mono text-[11px]">{siteHost}</span>
          ),
          __(
            "Follow Google's steps to verify — for most sites, adding one DNS record where you bought your domain.",
            "structura"
          ),
          __("Come back here — we'll find it automatically.", "structura"),
        ].map((step, index) => (
          <li key={index} className="m-0! flex items-start gap-3">
            <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 font-mono text-[10px] font-bold text-neutral-600 dark:bg-white/[.08] dark:text-neutral-300">
              {index + 1}
            </span>
            <span className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
              {step}
            </span>
          </li>
        ))}
      </ol>
      {notFoundYet && (
        <p className="m-0! text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
          {__(
            "Not found yet — Google verification can take a few minutes to propagate.",
            "structura"
          )}
        </p>
      )}
      {errorAlert}
      <p className="m-0! text-[11px] leading-relaxed text-neutral-400 dark:text-neutral-500">
        {__(
          "Wrong Google account? Properties belong to accounts — verify with this one, or switch.",
          "structura"
        )}
      </p>
      {accountRow}
    </div>
  );

  const insufficientProperty = gscPropertyToRequest(siteHost, flow.properties) ?? "";
  const insufficientBody = (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/30">
        <ShieldAlert
          size={16}
          className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <p className="m-0! text-xs leading-relaxed text-amber-900 dark:text-amber-200">
          {sprintfNodes(
            /* translators: %1$s = the connected Google account email, %2$s = the Search Console property id — both rendered verbatim; %3$s = the bolded "'Restricted' is enough" phrase; %4$s = the bolded "Settings → Users and permissions" menu path. */
            __(
              "%1$s doesn't have permission on %2$s. Ask the property owner to add you as a user — %3$s — in Search Console under %4$s.",
              "structura"
            ),
            <span className="font-mono text-[11px]">{flow.googleEmail}</span>,
            <span className="font-mono text-[11px]">{insufficientProperty}</span>,
            <strong className="font-semibold">{__("“Restricted” is enough", "structura")}</strong>,
            <span className="font-semibold">
              {__("Settings → Users and permissions", "structura")}
            </span>
          )}
        </p>
      </div>
      {errorAlert}
      <p className="m-0! text-[11px] leading-relaxed text-neutral-400 dark:text-neutral-500">
        {__("Or connect with a Google account that already has access.", "structura")}
      </p>
      {accountRow}
    </div>
  );

  const body = busy
    ? spinnerBody
    : view === "auto_matched"
      ? confirmBody
      : view === "picker"
        ? pickerBody
        : view === "no_property"
          ? noPropertyBody
          : insufficientBody;

  // ---- Footers --------------------------------------------------------------

  const footer =
    view === "auto_matched" ? (
      <Dialog.Footer className="sm:justify-between">
        <Button
          variant="transparent"
          size="sm"
          disabled={busy}
          onClick={() => {
            setInlineError(null);
            setSelected(flow.property || best?.siteUrl || "");
            setPickerFromConfirm(true);
            setView("picker");
          }}
        >
          {__("Choose a different property", "structura")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={busy}
          onClick={() => void saveProperty(flow.property ?? "")}
        >
          <Check size={14} aria-hidden />
          {__("Confirm & connect", "structura")}
        </Button>
      </Dialog.Footer>
    ) : view === "picker" ? (
      <Dialog.Footer>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => {
            setInlineError(null);
            // Entered via "Choose a different property" → back to the
            // confirm view; opened directly in the picker state → close.
            if (pickerFromConfirm) {
              setPickerFromConfirm(false);
              setView("auto_matched");
            } else {
              onClose();
            }
          }}
        >
          {__("Cancel", "structura")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={busy || selected === ""}
          onClick={() => void saveProperty(selected)}
        >
          <Check size={14} aria-hidden />
          {__("Connect property", "structura")}
        </Button>
      </Dialog.Footer>
    ) : view === "no_property" ? (
      <Dialog.Footer className="sm:justify-between">
        <Button
          variant="secondary"
          size="sm"
          href={GSC_WELCOME_URL}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={14} aria-hidden />
          {__("Open Search Console", "structura")}
        </Button>
        <Button variant="primary" size="sm" disabled={busy} onClick={() => void refresh()}>
          <RefreshCw size={14} aria-hidden />
          {__("I've verified — check again", "structura")}
        </Button>
      </Dialog.Footer>
    ) : (
      <Dialog.Footer className="sm:justify-between">
        <Button
          variant="transparent"
          size="sm"
          disabled={busy}
          onClick={() => void copyOwnerRequest()}
        >
          <Copy size={14} aria-hidden />
          {__("Copy request for the owner", "structura")}
        </Button>
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            {__("Cancel", "structura")}
          </Button>
          <Button variant="primary" size="sm" disabled={busy} onClick={() => void refresh()}>
            <RefreshCw size={14} aria-hidden />
            {__("Try again", "structura")}
          </Button>
        </div>
      </Dialog.Footer>
    );

  return (
    <Dialog.Root open={open} onClose={onClose} size="md">
      <Dialog.Content>
        <button
          type="button"
          onClick={onClose}
          aria-label={__("Close", "structura")}
          className="focus-visible:ring-brand-400 absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus:outline-none focus-visible:ring-2 dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-200"
        >
          <X size={16} />
        </button>
        <Dialog.Header>
          {/* Handoff modal header: 20px "G" + text-base title. `text-base!`
              overrides Dialog.Title's default text-xl against wp-admin's
              heading CSS. */}
          <Dialog.Title className="flex items-center gap-2 text-base!">
            <GoogleGGlyph size={20} className="shrink-0" />
            {title}
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[13px] leading-relaxed">
            {description}
          </Dialog.Description>
        </Dialog.Header>
        <Dialog.Body>{body}</Dialog.Body>
        {footer}
      </Dialog.Content>
    </Dialog.Root>
  );
};
