/**
 * Single row inside the Connections list.
 *
 * Pure presentational — receives a `ConnectionSummary` plus a delete
 * callback, renders the integration logo + name + destination + notification
 * language + last error (if any) + a Disconnect button. Status pills come
 * from the wire-side `status` field, never derived from absence of error so a
 * "connected but failing silently" connection still gets the red treatment.
 *
 * The catalog entry is optional — the row falls back to a generic icon + the
 * raw integration id if the catalog query hasn't loaded (or resolved an id
 * that was removed from the catalog in a prior release). The row never
 * *blocks* on catalog data: showing the destination + disconnect button is
 * the critical path and must keep working even if the Store response is
 * degraded.
 *
 * Disconnect uses a ConfirmDialog so users can't accidentally sever a live
 * Slack channel with a stray click — the action deletes cloud state and
 * requires reconnecting from scratch afterwards. The confirmation text names
 * the specific destination so someone with multiple Slack webhooks knows
 * which one they're about to cut.
 */

import { useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
import {
  AlertCircle,
  CheckCircle2,
  Pencil,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Trash2,
} from "lucide-react";
import { Badge, Button, ConfirmDialog, QuotaMeter, toast } from "@structura/ui";
import type {
  BoundVisualPresetSummary,
  ConnectionSummary,
  ConnectionStatus,
  IndexNowMeta,
  IntegrationCatalogEntry,
  VideoQuota,
} from "../types";
import { connectionStatusLabel } from "../labels";
import { useVerifyIndexNowKeyfile } from "../api/useIndexNow";
import { IntegrationIcon } from "./IntegrationIcon";
import { buildMarketingPricingUrl } from "@/utils/portalLinks";
import {
  VIDEO_INTEGRATION_ID,
  videoStyleById,
  videoVoiceById,
} from "../videoChannel";

interface ChannelConnectionRowProps {
  connection: ConnectionSummary;
  /** Matching catalog entry (by integrationId). Optional — row degrades gracefully. */
  catalogEntry?: IntegrationCatalogEntry;
  /**
   * Called with the stable connection key — `connectionId` when the cloud
   * returned one (post-migration UUID), otherwise `integrationId` so legacy
   * rows that never got rewritten still delete correctly. The parent forwards
   * this directly to the REST proxy, which accepts either form.
   */
  onDelete: (connectionKey: string) => void;
  /**
   * Fires when the user clicks Edit. The parent is responsible for opening
   * the install modal in edit mode with this `connection` prefilled. We
   * don't open the modal from inside the row because the modal needs the
   * catalog entry to resolve auth type + icon, which the page already has.
   *
   * Optional — when omitted, the row hides the Edit button entirely. Legacy
   * pre-UUID rows (without `connectionId`) also hide Edit, because the
   * current save-in-place path requires a UUID to target.
   */
  onEdit?: (connection: ConnectionSummary) => void;
  isDeleting?: boolean;
  /**
   * Monthly video-render quota (top-level on `channelsListConnections`).
   * Only rendered on video rows — the ambient meter + the exhausted
   * treatment (handoff §5). Other integrations ignore it.
   */
  videoQuota?: VideoQuota;
  /**
   * Bound-visual-preset digest (top-level on `channelsListConnections`).
   * Once present (object OR null), the preset owns video styling and the
   * meta line reads the style from it — the connection's own `videoStyle`
   * is frozen at its pre-migration value. Absent (older cloud) keeps the
   * legacy per-connection read for one release window; `null` = no preset
   * bound, which renders the stock Clean style.
   */
  boundVisualPreset?: BoundVisualPresetSummary | null;
}

const statusBadgeIntent = (
  status: ConnectionStatus,
): "success" | "warning" | "destructive" => {
  switch (status) {
    case "connected":
      return "success";
    case "expired":
      return "warning";
    case "revoked":
    case "error":
    default:
      return "destructive";
  }
};

/**
 * Render the per-connection notification locale as a short human label. We
 * key off the stored code and fall back to "System language" when the field
 * is missing (pre-1.x connections) or unrecognized — the cloud normalizes
 * unknown values to `"system"` at dispatch time so this matches the actual
 * runtime behavior rather than inventing a second interpretation.
 */
const notificationLocaleLabel = (code: string | undefined): string => {
  switch (code) {
    case "en":
      return "English";
    case "de":
      return "Deutsch";
    case "es":
      return "Español";
    case "fr":
      return "Français";
    case "system":
    case undefined:
    case "":
    default:
      return __("System language", "structura");
  }
};

export const ChannelConnectionRow = ({
  connection,
  catalogEntry,
  onDelete,
  onEdit,
  isDeleting = false,
  videoQuota,
  boundVisualPreset,
}: ChannelConnectionRowProps) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isVideo = connection.integrationId === VIDEO_INTEGRATION_ID;
  // Effective video style for the meta line — the bound preset's once the
  // digest is on the wire (`null` → unbound → stock Clean via the helper's
  // fallback), the legacy per-connection field before that.
  const effectiveVideoStyle =
    boundVisualPreset !== undefined
      ? boundVisualPreset?.videoStyle
      : connection.videoStyle;
  // Exhausted quota flips the row into its amber treatment (handoff §5):
  // warning badge + inline explainer. The channel stays connected —
  // renders resume on reset — so this never overrides a real error status.
  const quotaExhausted =
    isVideo && !!videoQuota && videoQuota.used >= videoQuota.cap;
  const intent = statusBadgeIntent(connection.status);
  const StatusIcon =
    connection.status === "connected" && !quotaExhausted
      ? CheckCircle2
      : AlertCircle;

  // Prefer the user-typed display name (e.g. "#deploys") over the integration
  // id so the row reads as "this Slack webhook points at #deploys" rather
  // than "this thing is a slack-webhook" — we show both, with the user input
  // as the primary header.
  const primaryLabel = connection.displayName?.trim() || catalogEntry?.name || connection.integrationId;
  const providerLabel = catalogEntry?.name || connection.integrationId;

  return (
    <>
      <li className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
        {/* Logo — IntegrationIcon handles the full resolution chain:
            hardcoded monogram for brands missing from simple-icons
            (Slack / LinkedIn / IndexNow / Bing) → catalog iconUrl → generic
            Plug fallback. Keeping this single component on every icon surface
            (row + card + modal) means the three render identically. */}
        <IntegrationIcon
          integrationId={connection.integrationId}
          iconUrl={catalogEntry?.iconUrl}
          sizeClassName="size-9"
          className="mt-0.5"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {primaryLabel}
                </p>
                {/* Always surface the provider so a row like "#deploys" is
                    unambiguously labelled as a Slack destination. */}
                <span className="shrink-0 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                  {providerLabel}
                </span>
              </div>
              {connection.externalAccountId && (
                <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {connection.externalAccountId}
                </p>
              )}
              {/* Meta line. For notifiers: the per-connection notification
                  locale ("why is this Slack posting in Spanish?"). For the
                  video channel: the settings summary (voice · preset ·
                  cadence) since video has no notification language —
                  voiceover follows each post's own language. */}
              <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                <StatusIcon
                  size={12}
                  className={
                    quotaExhausted
                      ? "text-amber-500"
                      : intent === "success"
                        ? "text-emerald-500"
                        : "text-red-500"
                  }
                  aria-hidden
                />
                <span>
                  {isVideo ? (
                    sprintf(
                      /* translators: %1$s = voice name (e.g. "Ava"), %2$s = visual preset name (e.g. "Clean"), %3$s = cadence ("every post" / "every 3th post"). */
                      __("Voice %1$s · %2$s preset · %3$s", "structura"),
                      videoVoiceById(connection.videoVoice).name,
                      videoStyleById(effectiveVideoStyle).name,
                      (connection.postCadenceN ?? 1) <= 1
                        ? __("every post", "structura")
                        : sprintf(
                            /* translators: %d = "every Nth" cadence number, e.g. 3. */
                            __("every %dth post", "structura"),
                            connection.postCadenceN ?? 1,
                          ),
                    )
                  ) : (
                    <>
                      {__("Notifications in", "structura")}{" "}
                      <span className="font-medium text-neutral-700 dark:text-neutral-200">
                        {notificationLocaleLabel(connection.notificationLocale)}
                      </span>
                    </>
                  )}
                </span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {quotaExhausted && connection.status === "connected" ? (
                // The exhausted state outranks the green "Connected" pill —
                // the row's most useful fact is now "why did my post get
                // skipped". Real error statuses still win over quota.
                <Badge intent="warning" variant="solid">
                  {__("Quota reached", "structura")}
                </Badge>
              ) : (
                <Badge intent={intent} variant="solid">
                  {connectionStatusLabel(connection.status)}
                </Badge>
              )}
              {/* Edit — only shown for UUID-bearing rows and only when the
                  parent actually wired up a handler. Pre-migration rows don't
                  have a connectionId so the save-in-place path can't target
                  them, and rendering a non-functional button would be worse
                  than not offering the affordance. */}
              {onEdit && connection.connectionId && (
                <Button
                  variant="transparent"
                  size="sm"
                  onClick={() => onEdit(connection)}
                  disabled={isDeleting}
                  aria-label={__("Edit", "structura")}
                >
                  <Pencil size={14} />
                  <span className="ml-1">{__("Edit", "structura")}</span>
                </Button>
              )}
              <Button
                variant="transparent"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={isDeleting}
                aria-label={__("Disconnect", "structura")}
              >
                <Trash2 size={14} />
                <span className="ml-1">{__("Disconnect", "structura")}</span>
              </Button>
            </div>
          </div>
          {connection.lastError && (
            <p
              role="alert"
              className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300"
            >
              {connection.lastError.message}
            </p>
          )}
          {/* Ambient monthly quota — video rows only. The config-modal
              footer carries the full meter; this is the at-a-glance bar
              (handoff §5 "both places"). */}
          {isVideo && videoQuota && (
            <QuotaMeter
              className="mt-4 max-w-xs"
              used={videoQuota.used}
              total={videoQuota.cap}
              label={sprintf(
                /* translators: %1$d = videos used, %2$d = monthly cap. */
                __("%1$d of %2$d videos this month", "structura"),
                videoQuota.used,
                videoQuota.cap,
              )}
            />
          )}
          {quotaExhausted && (
            <p className="mt-2! mb-0! rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {__(
                "New posts are skipped until your quota resets.",
                "structura",
              )}{" "}
              <a
                href={buildMarketingPricingUrl({
                  intent: "unlock_video",
                  domain:
                    typeof window !== "undefined"
                      ? window.location.hostname
                      : undefined,
                })}
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100"
              >
                {__("Upgrade for more videos", "structura")}
              </a>
            </p>
          )}
          {connection.integrationId === "indexnow" && (
            <IndexNowVerifyRow connection={connection} />
          )}
        </div>
      </li>

      {/* (IndexNow verify section is rendered above, inline with the row.) */}

      {/* Confirmation modal. Lives in a sibling portal via ConfirmDialog so
          it isn't constrained by the row's layout flow. */}
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          // Prefer the UUID when present so a row amongst siblings is
          // targeted precisely; fall back to integrationId only for
          // pre-migration docs where the cloud still uses that as the key.
          onDelete(connection.connectionId ?? connection.integrationId);
        }}
        title={__("Disconnect this channel?", "structura")}
        description={__(
          // Named with the destination so multi-connection setups
          // (e.g. a Slack to #deploys and another to #alerts) disambiguate.
          /* translators: %1$s is the provider (Slack, Discord…), %2$s is the destination name */
          "This will remove your %1$s connection to %2$s. Structura will stop posting notifications to this channel until you reconnect.",
          "structura",
        )
          .replace("%1$s", providerLabel)
          .replace("%2$s", primaryLabel)}
        variant="danger"
        loading={isDeleting}
        confirmButtonProps={{
          label: __("Disconnect", "structura"),
          icon: <Trash2 size={14} />,
        }}
        cancelButtonProps={{
          label: __("Keep connected", "structura"),
        }}
      />
    </>
  );
};

/**
 * Inline verify-status block rendered beneath an IndexNow connection.
 * Three states drive the UI:
 *
 *   - `verifiedAt` set → green badge with the timestamp (and a quiet
 *     "Re-verify" link in case the keyfile gets removed later).
 *   - `verifyError` set → red badge with the typed error code + the
 *     "Verify" button so a recovery is one click away.
 *   - Neither set → "Pending" pill + "Verify" button.
 *
 * The verify mutation invalidates the connection list on success, so
 * the row re-renders into the next state without manual prop juggling.
 *
 * Spec: `specs/site-identity-headless.md` §6.
 */
function IndexNowVerifyRow({ connection }: { connection: ConnectionSummary }) {
  const meta = (connection.externalAccountMeta ?? {}) as IndexNowMeta;
  const connectionId = connection.connectionId ?? "";
  const verify = useVerifyIndexNowKeyfile();

  const handleVerify = async () => {
    if (!connectionId) {
      toast.error(
        __("This connection is missing its id. Reconnect IndexNow.", "structura"),
      );
      return;
    }
    try {
      const result = await verify.mutateAsync(connectionId);
      if (result.verified) {
        toast.success(__("IndexNow keyfile verified.", "structura"));
      } else {
        toast.error(
          result.error?.message ??
            __("Could not verify the IndexNow keyfile.", "structura"),
        );
      }
    } catch (err) {
      const message =
        (err as { message?: string })?.message ??
        __("Verification request failed.", "structura");
      toast.error(message);
    }
  };

  const verifiedAt =
    typeof meta.verifiedAt === "string" && meta.verifiedAt ? meta.verifiedAt : null;
  const verifyError =
    meta.verifyError && typeof meta.verifyError === "object"
      ? meta.verifyError
      : null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900/40">
      {verifiedAt && (
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
          <ShieldCheck size={14} aria-hidden />
          {sprintf(
            // translators: %s is a localized date/time
            __("Keyfile verified %s", "structura"),
            new Date(verifiedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          )}
        </span>
      )}
      {!verifiedAt && verifyError && (
        <span className="inline-flex items-center gap-1.5 text-xs text-red-700 dark:text-red-400">
          <ShieldAlert size={14} aria-hidden />
          {__("Keyfile not reachable", "structura")}
          <span className="ml-1 font-mono text-[10px] text-red-600/70 dark:text-red-300/70">
            {verifyError.code}
          </span>
        </span>
      )}
      {!verifiedAt && !verifyError && (
        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
          <ShieldAlert size={14} aria-hidden />
          {__("Keyfile not yet verified", "structura")}
        </span>
      )}
      <Button
        type="button"
        variant="transparent"
        size="sm"
        onClick={handleVerify}
        disabled={verify.isPending || !connectionId}
        className="ml-auto"
      >
        {verify.isPending ? (
          <Loader2 size={12} className="mr-1 animate-spin" aria-hidden />
        ) : null}
        {verifiedAt ? __("Re-verify", "structura") : __("Verify", "structura")}
      </Button>
    </div>
  );
}
