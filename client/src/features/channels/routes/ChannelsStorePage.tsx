/**
 * Channels Store page — Firebase-Extensions-Hub-style catalog of all
 * integrations Structura offers, with per-caller entitlement badges.
 *
 * Data flow:
 *   - `useChannelCatalogQuery` pulls the full catalog + entitlement overlay
 *     from the cloud. Cached for 5 minutes to keep tab-switching snappy.
 *   - The card grid renders every catalog entry regardless of tier so
 *     Free-plan users can see what's on offer (with the appropriate
 *     upgrade CTA), not just what they can install right now.
 *
 * Intentional non-features (MVP):
 *   - No search or filters. The catalog is <10 entries, grouping by category
 *     is enough signal — surfaced as a colored pill on each card, not as a
 *     separate section per category. One flat grid reads faster and doesn't
 *     create ghostly "one-card sections".
 *   - No single-extension detail page. The card surface + install modal
 *     carry everything users need at this catalog size.
 *   - The install modal itself is a later slice — this file just renders
 *     the grid and wires the "Install" / "Upgrade" affordances. Clicking
 *     them today surfaces a toast-like stub.
 *
 * Spec: specs/integrations-store-spec.md §10 (Phase 3 addition)
 */

import { __ } from "@wordpress/i18n";
import { Store as StoreIcon } from "lucide-react";
import { Card, Skeleton } from "@structura/ui";
import { useChannelCatalogQuery } from "../api/useChannelCatalogQuery";
import { CatalogEntryCard } from "../components/CatalogEntryCard";
import { ChannelsSubNav } from "../components/ChannelsSubNav";
import { PageContainer } from "@/components/Layout/PageContainer";

export const ChannelsStorePage = () => {
  // Host-mismatch handling: the catalog query self-short-circuits via
  // `enabled: isActivationValid !== false`, and the global
  // <DomainMismatchAdvisory /> in App.tsx explains the state. The page
  // falls through to its normal empty/loading render in that case.
  const { data, isLoading, isError, error } = useChannelCatalogQuery();

  return (
    <PageContainer variant="narrow" className="space-y-6">
      <ChannelsSubNav />

      <header>
        <h2 className="m-0! text-xl font-bold tracking-tight text-neutral-900">
          {__("Store", "structura")}
        </h2>
        <p className="mt-1! mb-0! text-sm text-neutral-500">
          {__(
            "Browse integrations and connect the ones you need. Items available on your current plan show an Install button; the rest link out to upgrade.",
            "structura",
          )}
        </p>
      </header>

      {isLoading && (
        // Six skeleton cards mirror the six-ish catalog entries typical for
        // MVP so the grid doesn't reflow when the real response arrives. Card
        // shape copies CatalogEntryCard: icon + title + pill + three-line
        // description + bottom CTA row.
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          aria-label={__("Loading the integration catalog", "structura")}
          aria-busy
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 shrink-0 rounded-xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16 rounded-full" />
                  </div>
                </div>
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-11/12" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-20 rounded-md" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {isError && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {__("We couldn't load the integration catalog.", "structura")}
          {error instanceof Error && (
            <p className="mt-1! mb-0! text-xs text-red-700">{error.message}</p>
          )}
        </div>
      )}

      {!isLoading && !isError && data && data.entries.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-neutral-200 bg-neutral-50 px-8 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
            <StoreIcon size={22} />
          </div>
          <h3 className="m-0! text-base font-bold tracking-tight text-neutral-900">
            {__("The catalog is empty right now", "structura")}
          </h3>
        </div>
      )}

      {!isLoading && !isError && data && data.entries.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {data.entries.map((entry) => (
            <CatalogEntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </PageContainer>
  );
};
