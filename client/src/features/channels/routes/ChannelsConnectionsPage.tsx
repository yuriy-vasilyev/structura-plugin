/**
 * Channels Connections page — manages the activation's saved channel
 * connections. Read-only surface for the installed list; adding new
 * connections happens in the Store's install flow (webhook URL form for
 * webhook integrations, OAuth for OAuth ones, etc.), not here.
 *
 * Composition:
 *   - List of <ChannelConnectionRow /> for existing connections
 *   - Empty state when nothing's connected yet — CTAs route to Store
 *
 * The query hook owns the cache (channelKeys.connections); the delete
 * mutation invalidates that key on success, so the list refetches
 * automatically without manual cache surgery.
 *
 * Spec: specs/integrations-store-spec.md §10
 */

import { useEffect, useMemo, useState } from "react";
import { __ } from "@wordpress/i18n";
import { Plug, Store } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { Button, EmptyState, Skeleton } from "@structura/ui";
import { useChannelConnectionsQuery } from "../api/useChannelConnectionsQuery";
import { useChannelConnectionMutations } from "../api/useChannelConnectionMutations";
import { useChannelCatalogQuery } from "../api/useChannelCatalogQuery";
import { ChannelConnectionRow } from "../components/ChannelConnectionRow";
import { ChannelsSubNav } from "../components/ChannelsSubNav";
import { ConfigureConnectionModal } from "../components/ConfigureConnectionModal";
import { InstallModal } from "../components/InstallModal";
import { VideoUpgradeGate } from "../components/VideoGates";
import { VIDEO_INTEGRATION_ID } from "../videoChannel";
import { PageContainer } from "@/components/Layout/PageContainer";
import type { ConnectionSummary, IntegrationCatalogEntry } from "../types";

export const ChannelsConnectionsPage = () => {
  // Host-mismatch handling: the connections query self-short-circuits
  // via `enabled: isActivationValid !== false`, and the global
  // <DomainMismatchAdvisory /> in App.tsx explains the state. The page
  // falls through to its normal empty/loading render in that case — no
  // extra local gating needed here.
  const {
    data: connections,
    videoQuota,
    boundVisualPreset,
    isLoading,
    isError,
    error,
  } = useChannelConnectionsQuery();
  const { deleteConnection, isDeleting } = useChannelConnectionMutations();
  // Catalog is cached at 5 min in its own query — the row pulls logo + display
  // name from here. We don't block the page on it: if catalog is slow or
  // degraded, each row falls back to a generic icon + the raw integration id.
  const { data: catalog } = useChannelCatalogQuery();
  const catalogById = useMemo(() => {
    const map = new Map<string, IntegrationCatalogEntry>();
    catalog?.entries.forEach((entry) => map.set(entry.id, entry));
    return map;
  }, [catalog]);

  // Edit flow lives on this page (not the Store) because the user comes here
  // when they want to *manage* an existing connection — change its display
  // name, rotate a webhook signing secret, or update credentials. The
  // InstallModal is the same component used for fresh installs; passing
  // `editingConnection` flips it into update mode (title becomes "Edit X",
  // form pre-fills, save targets the existing UUID).
  //
  // We hold both the connection and its catalog entry in state so the modal
  // has the full context it needs (icon, description, auth type) without a
  // stale-closure risk if the catalog refetches while the modal is open.
  const [editingState, setEditingState] = useState<{
    connection: ConnectionSummary;
    entry: IntegrationCatalogEntry;
  } | null>(null);

  // Settings-only edit modal — works across every auth type, including
  // OAuth (whose install path has no other "save settings" hop and
  // whose row deliberately lacks an InstallModal-style edit affordance
  // because there's no webhook URL / credential to re-enter). Used by:
  //   - The post-OAuth landing redirect: the cloud callback appends
  //     `?configure=<connectionId>` so we can target the just-created
  //     row.
  //   - The per-row Configure button for OAuth connections.
  const [configuringConnection, setConfiguringConnection] =
    useState<ConnectionSummary | null>(null);

  // Deep-link gate (video): a `?configure=` link targeting a video
  // connection while the caller's plan no longer includes the channel
  // (installed on Cloud Pro, then downgraded). Instead of a settings
  // modal for something that can't render, show the upgrade gate
  // (handoff §4) with the `unlock_video` pricing intent.
  const [showVideoGate, setShowVideoGate] = useState(false);

  // Post-OAuth landing: pop the settings modal for the just-created
  // row so the user sees their bindings + cadence options
  // immediately. The connection is already saved with defaults
  // (all campaigns, every post; video: voice Ava, style Clean — its
  // install flow reuses this same hand-off), so closing the modal
  // without touching anything keeps the wiring functional.
  //
  // Strip the query param after consuming it so a refresh doesn't
  // re-pop the modal indefinitely. Wait until `connections` has
  // landed — otherwise the lookup falls through to `null` and
  // we'd lose the auto-open intent.
  const [searchParams, setSearchParams] = useSearchParams();
  const configureParam = searchParams.get("configure");
  useEffect(() => {
    if (!configureParam || !connections) return;
    const target = connections.find(
      (c) => c.connectionId === configureParam,
    );
    if (target?.integrationId === VIDEO_INTEGRATION_ID) {
      // Entitlement is cloud-computed on the catalog entry. Hold off on
      // consuming the param until the catalog lands so we can tell
      // "still entitled" from "plan lost access" — a degraded catalog
      // (error) falls through to the modal, the safer default.
      if (catalog === undefined) return;
      const videoEntry = catalogById.get(VIDEO_INTEGRATION_ID);
      if (videoEntry?.entitlement.blocker === "upgrade_plan") {
        setShowVideoGate(true);
      } else {
        setConfiguringConnection(target);
      }
    } else if (target) {
      setConfiguringConnection(target);
    }
    // Always clear the param so a refresh / accidental back-button
    // doesn't re-fire the side effect. We do this even when the
    // target isn't found (stale link) — the cleanup is the same.
    const next = new URLSearchParams(searchParams);
    next.delete("configure");
    setSearchParams(next, { replace: true });
  }, [
    configureParam,
    connections,
    catalog,
    catalogById,
    searchParams,
    setSearchParams,
  ]);

  return (
    <PageContainer variant="narrow" className="space-y-6">
      <ChannelsSubNav />

      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="m-0! text-xl font-bold tracking-tight text-neutral-900">
            {__("Channel Connections", "structura")}
          </h2>
          <p className="mt-1! mb-0! text-sm text-neutral-500">
            {__(
              "Your installed integrations. Browse the Store to add more — Structura supports Slack, Discord, LinkedIn, IndexNow, and email notifications.",
              "structura",
            )}
          </p>
        </div>
        {/* Primary way into the Store from the landing page — keeps
            discovery one click away without cluttering the empty state. */}
        <Button asChild variant="secondary" size="sm">
          <Link to="/channels/store">
            <Store size={14} className="mr-1.5" />
            {__("Browse Store", "structura")}
          </Link>
        </Button>
      </header>

      {/* Deep-link gate replaces the page body — the row list would only
          restate what the gate already explains, and "Back to Store" is
          the intended exit. */}
      {showVideoGate && <VideoUpgradeGate />}

      {!showVideoGate && isLoading && (
        // Three skeleton rows whose layout mirrors ChannelConnectionRow so
        // the real rows slot in without a layout jump when the query lands.
        // Three is a compromise: one feels like a "nothing is happening"
        // stub, five looks busy when the user has two connections. Most
        // activations end up with 1–3 channels.
        <ul
          className="m-0! list-none space-y-3 p-0!"
          aria-label={__("Loading connected channels", "structura")}
          aria-busy
        >
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-800"
            >
              <Skeleton className="mt-0.5 size-9 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-7 w-24 rounded-full" />
            </li>
          ))}
        </ul>
      )}

      {!showVideoGate && isError && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {__("We couldn't load your channel connections.", "structura")}
          {error instanceof Error && (
            <p className="mt-1! mb-0! text-xs text-red-700">{error.message}</p>
          )}
        </div>
      )}

      {!showVideoGate && !isLoading && !isError && (connections?.length ?? 0) === 0 && (
        <EmptyState
          icon={<Plug size={22} />}
          title={__("No channels connected yet", "structura")}
          description={__(
            "Head to the Store to pick an integration — email, WhatsApp, Slack, Discord, LinkedIn, and more.",
            "structura",
          )}
          action={
            <Button asChild variant="primary" size="sm">
              <Link to="/channels/store">
                <Store size={14} className="mr-1.5" />
                {__("Browse Store", "structura")}
              </Link>
            </Button>
          }
        />
      )}

      {!showVideoGate && !isLoading && !isError && (connections?.length ?? 0) > 0 && (
        <ul className="m-0! list-none space-y-3 p-0!">
          {connections!.map((connection) => {
            const catalogEntry = catalogById.get(connection.integrationId);
            // Edit is only meaningful for auth types we know how to re-render
            // a form for: webhook (URL + optional signing secret) and
            // apikey/none (credential fields). OAuth2 rows are reconnected
            // by uninstalling + reinstalling, not edited in place — so we
            // hide the button rather than launch a modal that can't submit.
            //
            // `connectionId` is also required — the save-in-place flow
            // targets the UUID, and pre-migration rows without one would
            // silently create a sibling doc instead of updating. The row
            // already guards on that, but we also gate it here so the
            // catalog-lookup / modal-state machinery doesn't wire up at all
            // for rows that can't use it.
            // Edit is now available for OAuth rows too — they open
            // ConfigureConnectionModal (settings-only) rather than
            // InstallModal (which expects a URL / credentials shape
            // OAuth doesn't have). All edits still require a UUID
            // doc id so the save-in-place flow has a target.
            const canEdit = !!catalogEntry && !!connection.connectionId;
            const isOAuthEdit = catalogEntry?.authType === "oauth2";

            return (
              // Key on connectionId (UUID) when present so two Slack webhooks
              // pointing at different channels render as two rows; fall back
              // to integrationId for legacy 1-per-integration docs that
              // haven't been rewritten yet — their summaries have no UUID
              // but are unique anyway because the old invariant held.
              <ChannelConnectionRow
                key={connection.connectionId ?? connection.integrationId}
                connection={connection}
                catalogEntry={catalogEntry}
                videoQuota={videoQuota}
                boundVisualPreset={boundVisualPreset}
                onDelete={(connectionKey) => {
                  // Mutation hook surfaces toasts on success/failure, so we
                  // don't need to handle either case here. `connectionKey`
                  // is whatever stable id the row picked (UUID when
                  // available, integrationId otherwise) — the REST proxy
                  // handles both.
                  void deleteConnection(connectionKey).catch(() => {});
                }}
                onEdit={
                  canEdit
                    ? (conn) => {
                        if (isOAuthEdit) {
                          // OAuth edits go through the settings-only
                          // modal: bindings + locale + cadence, no
                          // token round-trip. The InstallModal can't
                          // serve this surface because its OAuth
                          // branch is purely the "Connect …" CTA.
                          setConfiguringConnection(conn);
                        } else {
                          setEditingState({
                            connection: conn,
                            entry: catalogEntry,
                          });
                        }
                      }
                    : undefined
                }
                isDeleting={isDeleting}
              />
            );
          })}
        </ul>
      )}

      {/* Edit modal — mounted outside the list so closing doesn't re-render
          the row it was launched from. We don't pre-mount it (as the Store
          does per card) because the Connections page may have N rows and
          only ever one is being edited at a time; lazy-mounting keeps the
          page's initial render tight. */}
      {editingState && (
        <InstallModal
          entry={editingState.entry}
          editingConnection={editingState.connection}
          open={true}
          onClose={() => setEditingState(null)}
        />
      )}

      {/* Settings-only modal — used by OAuth edit + post-OAuth landing.
          Mounted at the page level so it survives the parent row
          re-rendering after a save (which would otherwise unmount the
          dialog mid-animation). */}
      {configuringConnection && (
        <ConfigureConnectionModal
          connection={configuringConnection}
          videoQuota={videoQuota}
          boundVisualPreset={boundVisualPreset}
          open={true}
          onClose={() => setConfiguringConnection(null)}
        />
      )}
    </PageContainer>
  );
};
