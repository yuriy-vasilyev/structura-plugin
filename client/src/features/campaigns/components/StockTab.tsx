import { FC, useState } from "react";
import { __, sprintf } from "@wordpress/i18n";
import {
  AlertTriangle,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  PackageOpen,
  RefreshCw,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { Badge, Button, Card, cn, ConfirmDialog, PageLoader } from "@structura/ui";

import dayjs from "@/libs/dayjs";
import { useDefaultProviders } from "@/features/settings";
import type { Campaign, CampaignFormData } from "@/features/campaigns/types";
import { useCampaignMutations } from "@/features/campaigns/api/useCampaignMutations";
import { type StockEntryView, useStockListQuery } from "@/features/campaigns/api/useStockListQuery";
import { useStockMutations } from "@/features/campaigns/api/useStockMutations";
import { normalizePostStatus } from "@/features/campaigns/helpers";
import { buildPortalStockPreviewUrl } from "@/utils/portalLinks";

/**
 * Stock tab — visibility + control over the campaign's pre-generated
 * post buffer (2026-06-05).
 *
 * Until this tab, stock was a black box: the only surface was the
 * "Pre-generating" chip, and a wedged provider batch looked identical
 * to a healthy one (the 2026-06-04 incident took admin scripts to
 * diagnose). The tab shows each buffered post as a card, how long the
 * current batch has been generating, and gives the user the controls
 * support would otherwise exercise by hand: discard a post, empty the
 * stock, or cancel a stuck batch and regenerate.
 *
 * Pre-generation is always-on for managed plans (the cloud runs it on
 * master keys); BYOK users can have it off, in which case the tab
 * becomes the upsell surface — the explainer banner recommends
 * enabling it for the ~50% batch-tier discount.
 */

// ─── Status presentation ────────────────────────────────────────────

const ENTRY_STATUS_INTENT: Record<
  StockEntryView["entryStatus"],
  "success" | "warning" | "destructive" | "default"
> = {
  ready: "success",
  pending: "warning",
  failed: "destructive",
};

const entryStatusLabel = (status: StockEntryView["entryStatus"]): string => {
  switch (status) {
    case "ready":
      return __("Ready", "structura");
    case "pending":
      return __("Preparing", "structura");
    case "failed":
      return __("Failed", "structura");
  }
};

/** "26 min" / "9 h" style age of an in-flight batch. */
const batchAge = (submittedAtIso: string | null): string | null => {
  if (!submittedAtIso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(submittedAtIso).getTime()) / 60_000));
  if (mins < 60) return sprintf(__("%d min", "structura"), mins);
  return sprintf(__("%s h", "structura"), (mins / 60).toFixed(1));
};

// ─── Explainer banner ───────────────────────────────────────────────

const StockBanner: FC<{ campaign: Campaign }> = ({ campaign }) => {
  const { isCloud } = useDefaultProviders();
  const { updateCampaign, isUpdating } = useCampaignMutations();
  const pregenEnabled = campaign.schedule.pregenerationEnabled ?? true;

  // Enable CTA — same Campaign → CampaignFormData mapping the edit
  // page uses, with only the pre-generation flag flipped. Going
  // through the full update mutation (rather than a bespoke endpoint)
  // keeps validation + cache invalidation on the one proven path.
  const enablePregeneration = async () => {
    const data: CampaignFormData = {
      identity: campaign.identity,
      intelligence: campaign.intelligence,
      structure: {
        ...campaign.structure,
        // Normalize legacy "pending" (removed 2026-07-09) → "draft".
        postStatus: normalizePostStatus(campaign.structure.postStatus ?? "publish"),
      },
      taxonomy: campaign.taxonomy,
      schedule: { ...campaign.schedule, pregenerationEnabled: true },
      authority: campaign.authority,
      keywords: campaign.keywords,
    };
    await updateCampaign({ id: campaign.id, data });
  };

  if (!pregenEnabled && !isCloud) {
    // BYOK with pre-generation off — explain + recommend.
    return (
      <Card className="border-amber-200/60 bg-amber-50/40 p-5 dark:border-amber-900/30 dark:bg-amber-950/10">
        <div className="flex items-start gap-3">
          <Zap size={18} className="mt-0.5 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="m-0! text-sm font-bold text-neutral-800 dark:text-neutral-200">
              {__("Preparing ahead is off for this campaign", "structura")}
            </p>
            <p className="mt-1! mb-0! text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
              {__(
                "Preparing ahead writes posts before their scheduled run, on your AI provider's discounted batch tier. With it on, scheduled posts cost up to 50% less and publish in under a second. Without it, every run writes a fresh post at full price. We highly recommend turning it on.",
                "structura"
              )}
            </p>
            <Button size="sm" className="mt-3" onClick={enablePregeneration} disabled={isUpdating}>
              {isUpdating ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <Zap size={14} className="mr-1.5" />
              )}
              {__("Turn on preparing ahead", "structura")}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-neutral-200/60 p-5">
      <div className="flex items-start gap-3">
        <Sparkles size={18} className="text-brand-500 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="m-0! text-sm font-bold text-neutral-800 dark:text-neutral-200">
            {__("What are prepared posts?", "structura")}
          </p>
          <p className="mt-1! mb-0! text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
            {__(
              "Prepared posts are written ahead of your schedule on the AI provider's discounted batch tier. The campaign keeps a few ready. When a scheduled run starts, it publishes one instantly and a replacement is prepared in the background. Prepared posts are drafts held in the cloud and only become real posts on your site when their scheduled run uses them. You can read and edit them in the customer portal before then. Editing the campaign discards outdated prepared posts automatically but keeps edited ones, unless you change the language.",
              "structura"
            )}
            {isCloud ? " " + __("Preparing ahead is always on for managed plans.", "structura") : ""}
          </p>
        </div>
      </div>
    </Card>
  );
};

// ─── In-flight batch strip ──────────────────────────────────────────

const GeneratingStrip: FC<{
  entries: StockEntryView[];
  onRestock: () => void;
  isRestocking: boolean;
}> = ({ entries, onRestock, isRestocking }) => {
  const inFlight = entries.filter((e) => e.entryStatus === "pending");
  if (inFlight.length === 0) return null;

  // All slots of one refill share a submission; the oldest age is the
  // honest one to surface when they somehow differ.
  const oldest = inFlight.reduce<string | null>((acc, e) => {
    if (!e.batchSubmittedAt) return acc;
    return !acc || e.batchSubmittedAt < acc ? e.batchSubmittedAt : acc;
  }, null);
  const age = batchAge(oldest);
  // Batch-tier scheduling is minutes on a good day, hours on a bad
  // one. Past 60 min we switch the strip to a "looks stuck" tone so
  // the Cancel & regenerate CTA suggests itself — exactly the signal
  // that was invisible during the 2026-06-04 wedged-batch incident.
  const looksStuck = !!oldest && Date.now() - new Date(oldest).getTime() > 60 * 60_000;

  return (
    <Card
      className={cn(
        "p-4",
        looksStuck
          ? "border-amber-200/60 bg-amber-50/40 dark:border-amber-900/30 dark:bg-amber-950/10"
          : "border-neutral-200/60"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <RefreshCw
            size={16}
            className={cn(
              "shrink-0 animate-spin",
              looksStuck ? "text-amber-500" : "text-brand-500"
            )}
            style={{ animationDuration: "2.5s" }}
          />
          <div>
            <p className="m-0! text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              {sprintf(
                /* translators: %d: number of posts being prepared. */
                __("Preparing %d post(s)…", "structura"),
                inFlight.length
              )}
              {age
                ? " " +
                  sprintf(
                    /* translators: %s: elapsed time like "26 min". */
                    __("(started %s ago)", "structura"),
                    age
                  )
                : ""}
            </p>
            {looksStuck && (
              <p className="mt-0.5! mb-0! text-xs text-amber-700 dark:text-amber-400">
                {__(
                  "This is taking longer than usual: the provider's batch queue may be slow. To cancel and start over, use Replace all.",
                  "structura"
                )}
              </p>
            )}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onRestock} disabled={isRestocking}>
          {isRestocking ? (
            <Loader2 size={13} className="mr-1.5 animate-spin" />
          ) : (
            <RefreshCw size={13} className="mr-1.5" />
          )}
          {__("Replace all", "structura")}
        </Button>
      </div>
    </Card>
  );
};

// ─── Entry card ─────────────────────────────────────────────────────

const StockEntryRow: FC<{
  entry: StockEntryView;
  onDelete: () => void;
  onRetry: () => void;
  isRestocking: boolean;
  /** Managed plans never see the model name (specs/managed-ai-lineup.md §3.3). */
  hideModel: boolean;
  /** The portal preview of this entry, or null when the site's activation id is unknown. */
  previewHref: string | null;
}> = ({ entry, onDelete, onRetry, isRestocking, hideModel, previewHref }) => (
  <div className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-neutral-50/50 sm:px-6 dark:hover:bg-neutral-800/30">
    {/* Thumbnail — placeholder when images are off / not ready */}
    {entry.featuredImageUrl ? (
      <div className="size-14 shrink-0 overflow-hidden rounded-lg border border-neutral-200 shadow-sm dark:border-neutral-700">
        <img src={entry.featuredImageUrl} alt="" className="h-full w-full object-cover" />
      </div>
    ) : (
      <div className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
        <ImageIcon size={18} className="text-neutral-300 dark:text-neutral-600" />
      </div>
    )}

    {/* Content */}
    <div className="min-w-0 flex-1">
      <p className="m-0! truncate text-sm font-semibold text-neutral-800 dark:text-neutral-200">
        {entry.title ??
          (entry.entryStatus === "failed"
            ? __("Generation failed", "structura")
            : __("Writing this post…", "structura"))}
      </p>
      {entry.excerpt && (
        <p className="mt-0.5!line-clamp-2 mb-0! text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
          {entry.excerpt}
        </p>
      )}
      {entry.entryStatus === "failed" && entry.failureReason && (
        <p className="mt-0.5!flex mb-0! items-start gap-1 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>{entry.failureReason}</span>
        </p>
      )}
      <p className="mt-1! mb-0! text-[11px] text-neutral-400 dark:text-neutral-500">
        {entry.createdAt ? dayjs(entry.createdAt).fromNow() : null}
        {entry.textModel && !hideModel ? <span> · {entry.textModel}</span> : null}
        {entry.entryStatus === "ready" && previewHref && (
          <>
            {entry.createdAt || (entry.textModel && !hideModel) ? <span aria-hidden> · </span> : null}
            {/* A text link: as a grey icon beside Discard it was missed (2026-11-17). */}
            <a
              href={previewHref}
              target="_blank"
              rel="noopener noreferrer"
              title={
                entry.title
                  ? sprintf(
                      /* translators: %s: title of the prepared post. */
                      __("Preview “%s” in the customer portal", "structura"),
                      entry.title
                    )
                  : undefined
              }
              // Colors carry `!`: wp-admin's global `a` color rules win over Tailwind's otherwise.
              className="text-brand-600! dark:text-brand-400! inline-flex items-center gap-1 font-semibold hover:underline"
            >
              {__("Preview in customer portal", "structura")}
              <ExternalLink size={11} aria-hidden />
            </a>
          </>
        )}
      </p>
    </div>

    {/* Status */}
    <Badge
      variant="solid"
      intent={ENTRY_STATUS_INTENT[entry.entryStatus] ?? "default"}
      className="mt-0.5 shrink-0"
    >
      {entryStatusLabel(entry.entryStatus)}
    </Badge>

    {/* Actions */}
    <div className="flex shrink-0 items-center gap-1">
      {entry.entryStatus === "failed" && (
        <button
          type="button"
          onClick={onRetry}
          disabled={isRestocking}
          title={__("Retry", "structura")}
          className="hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-950/20 dark:hover:text-brand-400 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-neutral-300 transition-colors disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-600"
        >
          <RefreshCw size={14} />
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        title={__("Discard", "structura")}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-neutral-300 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-neutral-600 dark:hover:bg-red-950/20 dark:hover:text-red-400"
      >
        <Trash2 size={14} />
      </button>
    </div>
  </div>
);

// ─── Tab ────────────────────────────────────────────────────────────

export const StockTab: FC<{ campaign: Campaign }> = ({ campaign }) => {
  const pregenEnabled = campaign.schedule.pregenerationEnabled ?? true;
  const { isCloud } = useDefaultProviders();
  const { data, isLoading } = useStockListQuery(campaign.id, {
    enabled: pregenEnabled,
  });
  const entries = data?.entries ?? [];
  const pregen = data?.pregen ?? null;
  const { deleteEntry, isDeletingEntry, clearStock, isClearing, restock, isRestocking } =
    useStockMutations(campaign.id);

  const [confirm, setConfirm] = useState<
    { type: "delete"; stockId: string } | { type: "clear" } | null
  >(null);

  const readyCount = entries.filter((e) => e.entryStatus === "ready").length;

  // The portal's preview route takes the cloud's ids. `campaign.id` is the
  // cloud campaign id the list call above already sends; the activation id
  // comes from the plugin config and is empty before the site is connected.
  const activationId =
    typeof window !== "undefined" ? window.structuraConfig?.activation_id : undefined;

  const handleConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm.type === "delete") {
        await deleteEntry(confirm.stockId);
      } else {
        await clearStock();
      }
    } catch {
      /* mutation toasts cover the error */
    }
    setConfirm(null);
  };

  return (
    <div className="space-y-4">
      <StockBanner campaign={campaign} />

      {pregen?.paused && (
        <Card className="border-amber-200/60 bg-amber-50/40 p-5 dark:border-amber-900/30 dark:bg-amber-950/10">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="m-0! text-sm font-bold text-neutral-800 dark:text-neutral-200">
                {__("Preparing ahead is paused", "structura")}
              </p>
              <p className="mt-1! mb-0! text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                {sprintf(
                  /* translators: %d: number of failed generation attempts today. */
                  __(
                    "%d attempts failed today, so we stopped preparing posts ahead to save your credits. Scheduled posts still go out: they're written when the run starts.",
                    "structura"
                  ),
                  pregen.failureCount
                )}
                {pregen.resetsAt
                  ? " " +
                    sprintf(
                      /* translators: %s: date/time when preparing ahead starts again. */
                      __("It starts again around %s.", "structura"),
                      dayjs(pregen.resetsAt).format("MMM D, HH:mm")
                    )
                  : ""}
              </p>
              {/* Managed plans have no provider to switch. */}
              {!isCloud && (
                <p className="mt-1! mb-0! text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                  {__(
                    "If this keeps happening, try switching this campaign's AI provider in AI Engine settings.",
                    "structura"
                  )}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {pregenEnabled && (
        <>
          <GeneratingStrip
            entries={entries}
            onRestock={() => void restock()}
            isRestocking={isRestocking}
          />

          <Card className="overflow-hidden border-neutral-200/60 p-0!">
            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50/50 px-5 py-3 sm:px-6 dark:border-neutral-800 dark:bg-neutral-950/30">
              <span className="text-xs font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
                {sprintf(
                  /* translators: %d: number of prepared posts ready to publish. */
                  __("%d prepared", "structura"),
                  readyCount
                )}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void restock()}
                  disabled={isRestocking}
                  title={__("Discard all prepared posts and prepare new ones", "structura")}
                >
                  {isRestocking ? (
                    <Loader2 size={13} className="mr-1.5 animate-spin" />
                  ) : (
                    <RefreshCw size={13} className="mr-1.5" />
                  )}
                  {__("Replace all", "structura")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirm({ type: "clear" })}
                  disabled={isClearing || entries.length === 0}
                >
                  <Trash2 size={13} className="mr-1.5" />
                  {__("Discard all", "structura")}
                </Button>
              </div>
            </div>

            {/* Body */}
            {isLoading ? (
              <PageLoader label={__("Loading prepared posts…", "structura")} size="lg" padding="lg" />
            ) : entries.length === 0 ? (
              <div className="py-16 text-center">
                <PackageOpen
                  size={32}
                  className="mx-auto mb-3 text-neutral-200 dark:text-neutral-700"
                />
                <p className="text-sm text-neutral-400 dark:text-neutral-500">
                  {__(
                    "No prepared posts yet. The next ones appear here as soon as they're ready.",
                    "structura"
                  )}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                  onClick={() => void restock()}
                  disabled={isRestocking}
                >
                  {isRestocking ? (
                    <Loader2 size={13} className="mr-1.5 animate-spin" />
                  ) : (
                    <Zap size={13} className="mr-1.5" />
                  )}
                  {__("Prepare now", "structura")}
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {entries.map((entry) => (
                  <StockEntryRow
                    key={entry.stockId}
                    entry={entry}
                    onDelete={() => setConfirm({ type: "delete", stockId: entry.stockId })}
                    onRetry={() => void restock()}
                    isRestocking={isRestocking}
                    hideModel={isCloud}
                    previewHref={
                      activationId
                        ? buildPortalStockPreviewUrl(activationId, String(campaign.id), entry.stockId)
                        : null
                    }
                  />
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      <ConfirmDialog
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={handleConfirm}
        loading={confirm?.type === "clear" ? isClearing : isDeletingEntry}
        variant="danger"
        title={
          confirm?.type === "clear"
            ? __("Discard all prepared posts?", "structura")
            : __("Discard this post?", "structura")
        }
        description={
          confirm?.type === "clear"
            ? __(
                "Every prepared post for this campaign is discarded, including any still being prepared. While preparing ahead stays on, new ones are prepared automatically.",
                "structura"
              )
            : __(
                "Another post is prepared to take its place.",
                "structura"
              )
        }
        confirmButtonProps={{
          label:
            confirm?.type === "clear" ? __("Discard all", "structura") : __("Discard", "structura"),
        }}
      />
    </div>
  );
};
