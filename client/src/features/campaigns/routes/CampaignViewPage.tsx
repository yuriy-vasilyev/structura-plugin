import { useState } from "react";
import apiFetch from "@wordpress/api-fetch";
import { useNavigate, useParams } from "react-router";
import { __, sprintf } from "@wordpress/i18n";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  FileText,
  Globe,
  Key,
  LayoutDashboard,
  Loader2,
  Package,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Share2,
  Trash2,
  Zap,
} from "lucide-react";
import { Badge, Button, Card, cn, ConfirmDialog, PageLoader } from "@structura/ui";
import { PageDescription } from "@/components/Layout/PageSubtitle";
import { PageContainer } from "@/components/Layout/PageContainer";
import { useCampaignQuery } from "@/features/campaigns/api/useCampaignQuery";
import { useCampaignMutations } from "@/features/campaigns/api/useCampaignMutations";
import { useJobMutations } from "@/features/campaigns/api/useJobMutations";
import { useCampaignPostsQuery } from "@/features/campaigns/api/useCampaignPostsQuery";
import { ChannelsTab } from "@/features/campaigns/components/ChannelsTab";
import { CampaignRunsTab } from "@/features/campaigns/components/CampaignRunsTab";
import { StockTab } from "@/features/campaigns/components/StockTab";
import { useStockSummaryQuery } from "@/features/campaigns/api/useStockSummaryQuery";
import { useChannelsVisibility } from "@/features/channels";
import type { ArchitectedPost } from "@/features/dashboard/api/useRecentPostsQuery";
import { Campaign } from "@/features/campaigns";
import { campaignStatusLabel, postStatusLabel } from "@/features/campaigns/labels";
import { getProviderVisual } from "@/features/campaigns/constants";
import { useAvailableModelsQuery } from "@/features/ai-engine/api/useAvailableModelsQuery";
import dayjs from "@/libs/dayjs";
import { cronToHuman } from "@/utils/cronUtils";
import { getBadgeIntentByCampaignStatus } from "@/utils/helpers";
import { CampaignRunProgress } from "@/features/progress";
import { useRuns } from "@/features/progress/context/RunsContext";
import { useCampaignRunQuery } from "@/features/progress/api/useCampaignRunQuery";

// ─── Types ─────────────────────────────────────────────────────────────

interface TabDef {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  /**
   * Optional count chip rendered after the label (Stock tab: number of
   * ready pre-generated posts). Hidden when 0/undefined — an empty
   * "0" chip reads as a problem where there is none.
   */
  chip?: number;
}

// Tabs render left→right in array order. The Channels tab sits after Posts
// because its content answers "what fires when this publishes?" — a natural
// follow-on from the Posts list. Gated through `useChannelsVisibility`:
// rollout flag + plan + entitlement, so a non-entitled viewer (Free, or
// Pro/Cloud without the Channels add-on SKU) doesn't see a tab that would
// just render an empty connections list forever.
//
// The Runs tab is the historical receipt view — "what happened with this
// campaign?" across every run. Lives last in the tab row on purpose: the
// primary user lane is Overview → Posts (the stream of output). Runs is
// the triage surface a user reaches for when something looks off, which
// is a lower-traffic path than day-to-day review. Distinct from the
// inline live-run strip on Overview (`CampaignRunProgress`): the strip
// is the single-in-flight signal; this tab is the full receipt shelf.
//
// The per-campaign Logs tab was removed under `specs/plugin-quiet-mode.md`
// §5.2. The progress drawer (+ Needs Attention widget + this Runs tab)
// is now the primary surface for "what's happening with this run"; the
// System Logs page, gated behind Settings → Advanced → Debug mode,
// covers the power-user / support case for full log tables.
// The Stock tab sits between Posts and Channels: it's "posts that
// don't exist yet", the natural continuation of the Posts stream.
// Always visible — when pre-generation is off (BYOK), the tab body
// renders the explainer banner with the enable CTA, which is how the
// feature gets discovered. The chip carries the ready count from the
// same summary query the campaign-card chip uses.
const buildTabs = (channelsVisible: boolean, stockReadyCount: number): TabDef[] => [
  { id: "overview", label: __("Overview", "structura"), icon: LayoutDashboard },
  { id: "posts", label: __("Posts", "structura"), icon: FileText },
  {
    id: "stock",
    label: __("Stock", "structura"),
    icon: Package,
    chip: stockReadyCount,
  },
  ...(channelsVisible
    ? [
        {
          id: "channels",
          label: __("Channels", "structura"),
          icon: Share2,
        } as TabDef,
      ]
    : []),
  { id: "runs", label: __("Runs", "structura"), icon: Activity },
];

// ─── Wrapper ───────────────────────────────────────────────────────────

const CampaignViewPage = () => {
  const { id: campaignId } = useParams<{ id: string }>();
  // Cloud campaign IDs are opaque strings (Firestore auto-IDs, e.g.
  // "8SJgX4TrqOC0tYXJk-Crn"). Number() coercion would yield NaN and the
  // query never fires. Pass the raw string through.
  const { data: campaign, isLoading } = useCampaignQuery(campaignId);

  if (isLoading) {
    return <PageLoader label={__("Loading campaign…", "structura")} size="lg" padding="lg" />;
  }

  if (!campaign) {
    return (
      <div className="py-20 text-center text-neutral-500">
        {__("Campaign not found.", "structura")}
      </div>
    );
  }

  return <CampaignViewInner campaign={campaign} />;
};

export default CampaignViewPage;

// ─── Tab bar ───────────────────────────────────────────────────────────

const TabBar = ({
  tabs,
  activeTab,
  onTabClick,
}: {
  tabs: TabDef[];
  activeTab: string;
  onTabClick: (tab: string) => void;
}) => (
  <nav className="flex gap-1 overflow-x-auto rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
    {tabs.map((tab) => {
      const isActive = activeTab === tab.id;
      const Icon = tab.icon;
      return (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabClick(tab.id)}
          className={cn(
            "flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all",
            isActive
              ? "text-brand-700 dark:text-brand-300 bg-white shadow-sm dark:bg-neutral-700"
              : "text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
          )}
        >
          <Icon size={14} />
          {tab.label}
          {typeof tab.chip === "number" && tab.chip > 0 && (
            <span
              className={cn(
                "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-black",
                isActive
                  ? "bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300"
                  : "bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400"
              )}
            >
              {tab.chip}
            </span>
          )}
        </button>
      );
    })}
  </nav>
);

// ─── Inner ─────────────────────────────────────────────────────────────

const CampaignViewInner = ({ campaign }: { campaign: Campaign }) => {
  const navigate = useNavigate();
  const {
    toggleCampaign,
    isToggling,
    deleteCampaign,
    isDeleting,
    duplicateCampaign,
    isDuplicating,
  } = useCampaignMutations();
  const { runNow, isRunningNow } = useJobMutations();
  const { activeRunId, activeCampaignId, dismiss } = useRuns();
  const [isCancelling, setIsCancelling] = useState(false);

  // Read the active run's status so the action button can distinguish
  // "run is genuinely in flight" from "run reached a terminal state but
  // the activeRunId hasn't been dismissed yet". Without this, the
  // "Generation stopped" failure card and the "Stop Run" action button
  // render simultaneously after a failed dispatch — the user sees a
  // contradictory UI ("it stopped — but I can stop it again?"). 2026-04-30
  // user report (cms.xerx.io) was exactly this state.
  //
  // Scoping to `activeCampaignId === campaign.id`: the RunsContext is
  // GLOBAL (one activeRunId across the whole app), so without this
  // gate every campaign view shows Stop Run whenever ANY campaign is
  // running. 2026-04-30 follow-up — user reported "I have 2 campaigns,
  // one is running and the other ALSO shows Stop Run".
  //
  // The query is cheap when activeRunId is null OR doesn't belong to
  // this campaign (we don't even fire it then). When set + matching,
  // it's the same query the inline strip uses, so we share its cache
  // entry rather than spinning up a duplicate poll.
  const isThisCampaignsRun = !!activeRunId && activeCampaignId === campaign.id;
  const activeRunQuery = useCampaignRunQuery(isThisCampaignsRun ? activeRunId : null);
  const activeRunStatus = activeRunQuery.data?.run?.status;
  const TERMINAL_RUN_STATUSES = new Set([
    "succeeded",
    "succeeded_with_warnings",
    "failed",
    "cancelled",
  ]);
  const hasLiveRun =
    isThisCampaignsRun && (!activeRunStatus || !TERMINAL_RUN_STATUSES.has(activeRunStatus));
  const channelsVisible = useChannelsVisibility();
  // Ready-count chip for the Stock tab — same summary query the
  // campaign-card chip polls, so the cache entry is shared. Gated on
  // pre-generation so opted-out campaigns don't fetch.
  const { data: stockSummary } = useStockSummaryQuery(campaign.id, {
    enabled: campaign.schedule.pregenerationEnabled ?? true,
  });
  const tabs = buildTabs(channelsVisible, stockSummary?.ready ?? 0);
  const [activeTab, setActiveTab] = useState("overview");

  const [confirmAction, setConfirmAction] = useState<{
    type: "delete" | "pause" | "resume" | "duplicate" | "run_now" | "stop_run";
  } | null>(null);

  const handleConfirm = async () => {
    if (!confirmAction) return;
    try {
      if (confirmAction.type === "delete") {
        await deleteCampaign(campaign.id);
        // Navigation happens AFTER the delete resolves so the user doesn't
        // see a flash of the soon-to-be-404'd detail page.
        navigate("/campaigns");
      } else if (confirmAction.type === "duplicate") {
        await duplicateCampaign({ id: campaign.id });
      } else if (confirmAction.type === "run_now") {
        await runNow(campaign.id);
      } else if (confirmAction.type === "stop_run") {
        if (!activeRunId) {
          setConfirmAction(null);
          return;
        }
        setIsCancelling(true);
        try {
          await apiFetch({
            path: "/structura/v1/scheduler/runs/cancel",
            method: "POST",
            data: {
              run_id: activeRunId,
              cancelled_by: "user",
              cancel_reason: "User cancelled from campaign view",
            },
          });
          // Cloud writes (or upserts) the run as 'cancelled' synchronously.
          // Clear the active-run state so the inline strip + the page button
          // both transition back to the no-run resting state immediately,
          // rather than waiting for the next poll tick to notice.
          dismiss();
        } catch (error) {
          console.error("Failed to cancel run:", error);
        } finally {
          setIsCancelling(false);
        }
      } else {
        // pause / resume — the toggle endpoint returns the new status, and
        // the mutation's `onSuccess` invalidates `campaignKeys.all` so
        // every detail/list query refetches before this awaits resolves.
        await toggleCampaign(campaign.id);
      }
    } catch (error) {
      // Mutation errors already surface as toasts via the mutation's
      // onError; we still close the dialog so the user can retry rather
      // than being stuck looking at a spinner forever.
      console.error("Confirm action failed:", error);
    }
    setConfirmAction(null);
  };

  // Combined loading flag for the ConfirmDialog — whichever mutation the
  // current confirmAction maps to. The dialog stays open with a spinner
  // until the round-trip completes, then auto-closes via setConfirmAction
  // above. Previously the dialog closed instantly and gave the user no
  // visual feedback that the request was even in flight.
  const isConfirmLoading = (() => {
    if (!confirmAction) return false;
    switch (confirmAction.type) {
      case "pause":
      case "resume":
        return isToggling;
      case "duplicate":
        return isDuplicating;
      case "delete":
        return isDeleting;
      case "run_now":
        return isRunningNow;
      case "stop_run":
        return isCancelling;
      default:
        return false;
    }
  })();

  const confirmContent = confirmAction ? getDialogContent(confirmAction.type) : null;

  return (
    <PageContainer variant="narrow" className="space-y-6 pb-8">
      {/* ── Page header ───────────────────────────────────────── */}
      <header className="space-y-3">
        {/* Row 1: back + campaign name + objective */}
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate("/campaigns")}
            className="mt-1.5 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-400 transition-colors hover:border-neutral-300 hover:text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:border-neutral-600 dark:hover:text-neutral-300"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="m-0! text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl dark:text-white">
              {campaign.identity.name}
            </h1>
            <PageDescription>
              {campaign.identity.objective.length > 120
                ? campaign.identity.objective.slice(0, 120) + "…"
                : campaign.identity.objective}
            </PageDescription>
          </div>
        </div>

        {/* Row 2: status badge (left) + actions (right) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="solid" intent={getBadgeIntentByCampaignStatus(campaign.status)}>
            {campaignStatusLabel(campaign.status)}
          </Badge>

          <div className="flex items-center gap-2">
            {campaign.status === "active" && (
              <>
                {hasLiveRun ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmAction({ type: "stop_run" })}
                    // Outlined-danger look. Reuses the secondary chassis
                    // (white + bordered) and recolours the text/border red.
                    // TODO: replace with a proper `intent="danger"
                    // variant="outline"` once the Button props are split
                    // along intent/variant axes (currently single `variant`
                    // prop conflates the two — see button.ts).
                    className="border-red-200! text-red-600! hover:border-red-300! hover:bg-red-50! hover:text-red-700! dark:border-red-900/40! dark:text-red-400! dark:hover:border-red-900/60! dark:hover:bg-red-950/40! dark:hover:text-red-300!"
                  >
                    <Pause size={14} className="mr-1.5" />
                    {__("Stop Run", "structura")}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmAction({ type: "run_now" })}
                  >
                    <Zap size={14} className="mr-1.5" />
                    {__("Run Now", "structura")}
                  </Button>
                )}

                <div className="mx-0.5 h-6 w-px bg-neutral-200 dark:bg-neutral-700" />
              </>
            )}

            <button
              type="button"
              onClick={() => setConfirmAction({ type: "duplicate" })}
              title={__("Duplicate", "structura")}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-400 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:border-emerald-900/30 dark:hover:bg-emerald-950/20 dark:hover:text-emerald-400"
            >
              <Copy size={15} />
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction({ type: "delete" })}
              title={__("Delete", "structura")}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:border-red-900/30 dark:hover:bg-red-950/20 dark:hover:text-red-400"
            >
              <Trash2 size={15} />
            </button>

            <div className="mx-0.5 h-6 w-px bg-neutral-200 dark:bg-neutral-700" />

            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setConfirmAction({
                  type: campaign.status === "active" ? "pause" : "resume",
                })
              }
            >
              {campaign.status === "active" ? (
                <>
                  <Pause size={14} className="mr-1.5" />
                  {__("Pause", "structura")}
                </>
              ) : (
                <>
                  <Play size={14} className="mr-1.5" />
                  {__("Resume", "structura")}
                </>
              )}
            </Button>
            <Button size="sm" onClick={() => navigate(`/campaigns/${campaign.id}/edit`)}>
              <Pencil size={14} className="mr-1.5" />
              {__("Edit", "structura")}
            </Button>
          </div>
        </div>
      </header>

      {/* ── Tab bar ───────────────────────────────────────────── */}
      <TabBar tabs={tabs} activeTab={activeTab} onTabClick={setActiveTab} />

      {/* ── Tab content ───────────────────────────────────────── */}
      {activeTab === "overview" && <OverviewTab campaign={campaign} />}
      {activeTab === "posts" && <PostsTab campaignId={campaign.id} />}
      {activeTab === "stock" && <StockTab campaign={campaign} />}
      {activeTab === "channels" && channelsVisible && <ChannelsTab campaignId={campaign.id} />}
      {activeTab === "runs" && <CampaignRunsTab campaignId={campaign.id} />}

      {/* ── Confirm dialog ─────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirm}
        loading={isConfirmLoading}
        title={confirmContent?.title ?? ""}
        description={confirmContent?.description ?? ""}
        variant={confirmContent?.variant ?? "primary"}
        confirmButtonProps={{
          label: confirmContent?.confirmLabel ?? __("Confirm", "structura"),
        }}
      />
    </PageContainer>
  );
};

// ─── Dialog content helper ─────────────────────────────────────────────

const getDialogContent = (
  type: "delete" | "pause" | "resume" | "duplicate" | "run_now" | "stop_run"
) => {
  switch (type) {
    case "delete":
      return {
        title: __("Delete Campaign?", "structura"),
        description: __(
          "This action cannot be undone. All scheduled jobs will be cancelled.",
          "structura"
        ),
        variant: "danger" as const,
        confirmLabel: __("Delete", "structura"),
      };
    case "pause":
      return {
        title: __("Pause Campaign?", "structura"),
        description: __(
          "Pausing will temporarily halt all scheduled executions. You can resume at any time.",
          "structura"
        ),
        variant: "primary" as const,
        confirmLabel: __("Pause", "structura"),
      };
    case "resume":
      return {
        title: __("Resume Campaign?", "structura"),
        description: __(
          "Resuming will reactivate the campaign and scheduled executions will continue.",
          "structura"
        ),
        variant: "primary" as const,
        confirmLabel: __("Resume", "structura"),
      };
    case "run_now":
      return {
        title: __("Run Now?", "structura"),
        description: __(
          "This will generate an extra post from this campaign right away, outside of the regular schedule.",
          "structura"
        ),
        variant: "primary" as const,
        confirmLabel: __("Run Now", "structura"),
      };
    case "stop_run":
      return {
        title: __("Stop this run?", "structura"),
        description: __(
          "The current generation will be cancelled. Any work in progress will be discarded.",
          "structura"
        ),
        variant: "danger" as const,
        confirmLabel: __("Stop Run", "structura"),
      };
    case "duplicate":
      return {
        title: __("Duplicate Campaign?", "structura"),
        description: __("A copy of this campaign will be created in a paused state.", "structura"),
        variant: "primary" as const,
        confirmLabel: __("Duplicate", "structura"),
      };
  }
};

// ─── Overview Tab ──────────────────────────────────────────────────────

const OverviewTab = ({ campaign }: { campaign: Campaign }) => {
  const navigate = useNavigate();
  const { identity, intelligence, schedule, stats, keywords, authority } = campaign;
  const isQuota = schedule.endCondition.type === "quota";
  const isDate = schedule.endCondition.type === "date";

  const keywordCount = keywords?.bank?.length ?? 0;
  const domainCount = authority?.domains?.length ?? 0;

  const progress = isQuota
    ? Math.min(
        Math.round((stats.postsPublished / (schedule.endCondition.value as number)) * 100),
        100
      )
    : 0;

  return (
    <div className="space-y-6">
      {/*
        Live-run progress strip — page-variant hero. Sits above the
        stat cards so a user who arrives on the page while a run is
        in flight sees the live activity before the static numbers.
        Self-gates on `activeRunId` + matching campaign; collapses to
        nothing when no run is running, so the static overview layout
        is untouched the rest of the time.

        `expandable` opens a RunTimeline reveal underneath the strip on
        click — for the user who wants the "big picture with every
        step visible" on the campaign detail page. The reveal auto-
        collapses on terminal statuses so the surface stays calm and
        the canonical static receipt remains the `RunDetailPage`.
      */}
      <CampaignRunProgress campaignId={campaign.id} variant="page" expandable />

      {/* ── Date end-condition banner ───────────────────────── */}
      {isDate && (
        <div className="flex items-center gap-4 rounded-2xl border border-neutral-200/60 bg-white px-5 py-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800">
            <Calendar size={20} className="text-neutral-400 dark:text-neutral-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="m-0! text-[10px] font-bold tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
              {__("Ends On", "structura")}
            </p>
            <p className="m-0! mt-0.5 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              {dayjs(schedule.endCondition.value as string).format("LL")}
            </p>
          </div>
        </div>
      )}

      {/* ── Stats row ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={__("Posts Published", "structura")}
          value={stats.postsPublished.toString()}
          icon={<FileText size={16} />}
          accent="brand"
          // Muted "N created" subline surfaces posts generated but not yet
          // live (drafts awaiting review). Only shown when it adds info —
          // i.e. more created than published. Falls back gracefully on
          // older data where postsCreated is absent.
          detail={
            (stats.postsCreated ?? stats.postsPublished) > stats.postsPublished
              ? sprintf(
                  __("%s created", "structura"),
                  (stats.postsCreated ?? stats.postsPublished).toString(),
                )
              : undefined
          }
        />
        <StatCard
          label={__("Next Run", "structura")}
          value={stats.nextRun || "—"}
          icon={<Clock size={16} />}
          accent="amber"
          small
        />
        <StatCard
          label={__("Keywords", "structura")}
          value={keywordCount.toString()}
          icon={<Key size={16} />}
          accent="emerald"
          detail={
            domainCount > 0
              ? sprintf(__("+ %s authority domains", "structura"), domainCount.toString())
              : undefined
          }
        />
        <StatCard
          label={__("Schedule", "structura")}
          value={cronToHuman(schedule.cron)}
          icon={<Activity size={16} />}
          accent="violet"
          small
        />
      </div>

      {/* ── Progress bar for quota mode ─────────────────────── */}
      {isQuota && (
        <div className="rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between text-[10px] font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
            <span>{__("Output Progress", "structura")}</span>
            <span className="text-neutral-900 dark:text-white">
              {stats.postsPublished} / {schedule.endCondition.value}
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700">
            <div
              className="bg-brand-600 dark:bg-brand-500 h-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Needs approval widget ───────────────────────────── */}
      <NeedsApprovalWidget campaignId={campaign.id} />

      {/* ── Campaign info card ──────────────────────────────── */}
      <div className="rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm sm:p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <h3 className="mt-0! mb-4! text-xs font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
          {__("Campaign Configuration", "structura")}
        </h3>

        <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          {/* Created date — guarded because older plugin builds (and the
              legacy WP-meta read path) don't carry `createdAt`. dayjs of an
              undefined value would render today's date, so only show the row
              when the timestamp is actually present. */}
          {campaign.createdAt && (
            <InfoRow
              label={__("Created", "structura")}
              value={dayjs(campaign.createdAt).format("LL")}
            />
          )}
          <InfoRow label={__("Mode", "structura")} value={formatMode(identity.campaignMode)} />
          <InfoRow
            label={__("AI Providers", "structura")}
            value={
              <div className="space-y-1.5">
                <ProviderLine
                  providerId={intelligence.textProvider}
                  model={intelligence.textModel}
                  kind="text"
                />
                <ProviderLine
                  providerId={intelligence.imageProvider}
                  model={intelligence.imageModel}
                  kind="image"
                />
              </div>
            }
          />
          <InfoRow
            label={__("Language", "structura")}
            value={
              intelligence.language === "default"
                ? __("System Default", "structura")
                : intelligence.language
            }
          />
          <InfoRow
            label={__("Post Length", "structura")}
            value={sprintf(__("%s words", "structura"), intelligence.postLength.toString())}
          />
          <InfoRow
            label={__("Post Status", "structura")}
            value={formatPostStatus(campaign.structure.postStatus)}
          />
          <InfoRow
            label={__("Featured Image", "structura")}
            value={
              campaign.structure.featuredImage
                ? __("Enabled", "structura")
                : __("Disabled", "structura")
            }
          />
          <InfoRow
            label={__("AI Disclosure", "structura")}
            value={
              campaign.structure.disclosure.enabled
                ? __("Enabled", "structura")
                : __("Disabled", "structura")
            }
          />
        </div>
      </div>

      {/* ── Recent posts widget ─────────────────────────────── */}
      <RecentPostsWidget campaignId={campaign.id} onViewAll={() => navigate(`#posts`)} />
    </div>
  );
};

// ─── Stat card ─────────────────────────────────────────────────────────

const ACCENT_MAP = {
  brand: {
    bg: "bg-brand-50 dark:bg-brand-950/30",
    icon: "text-brand-500 dark:text-brand-400",
  },
  amber: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    icon: "text-amber-500 dark:text-amber-400",
  },
  emerald: {
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    icon: "text-emerald-500 dark:text-emerald-400",
  },
  violet: {
    bg: "bg-violet-50 dark:bg-violet-950/30",
    icon: "text-violet-500 dark:text-violet-400",
  },
} as const;

const StatCard = ({
  label,
  value,
  icon,
  accent,
  small,
  detail,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: keyof typeof ACCENT_MAP;
  small?: boolean;
  detail?: string;
}) => (
  <div className="rounded-2xl border border-neutral-200/60 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <div className="mb-2 flex items-center gap-2">
      <div
        className={cn("flex h-7 w-7 items-center justify-center rounded-lg", ACCENT_MAP[accent].bg)}
      >
        <span className={ACCENT_MAP[accent].icon}>{icon}</span>
      </div>
      <span className="text-[10px] font-bold tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
        {label}
      </span>
    </div>
    <p
      className={cn(
        "m-0! font-black tracking-tight text-neutral-900 dark:text-white",
        small ? "text-sm leading-snug" : "text-2xl"
      )}
    >
      {value}
    </p>
    {detail && (
      <p className="m-0! mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">{detail}</p>
    )}
  </div>
);

// ─── Info row ──────────────────────────────────────────────────────────

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4 border-b border-neutral-50 py-2.5 last:border-0 dark:border-neutral-800/50">
    <span className="text-xs font-bold text-neutral-400 dark:text-neutral-500">{label}</span>
    <span className="text-right text-xs font-semibold text-neutral-700 dark:text-neutral-300">
      {value}
    </span>
  </div>
);

/** Compact provider + model line: [icon] model  (kind label) */
const ProviderLine = ({
  providerId,
  model,
  kind,
}: {
  providerId?: string;
  model?: string;
  kind: "text" | "image";
}) => {
  // Resolve the raw model slug (e.g. "gemini-3.1-pro-preview") to its
  // human-readable catalog name ("Gemini 3.1 Pro"). React Query dedupes the
  // shared ["models"] key, so the two ProviderLines share one fetch.
  const { data: models } = useAvailableModelsQuery();
  const modelLabel = model
    ? ([...(models?.text ?? []), ...(models?.image ?? [])].find(
        (m) => m.id === model,
      )?.name ?? model)
    : undefined;

  if (!providerId) {
    return (
      <span className="flex items-center justify-end gap-1.5 text-neutral-400">
        <span className="text-[9px] font-bold uppercase">{kind}</span>
        {__("Not set", "structura")}
      </span>
    );
  }
  const v = getProviderVisual(providerId);
  const Icon = v.icon;
  return (
    <span className="flex items-center justify-end gap-1.5">
      <Icon size={13} className={v.color} />
      {modelLabel && <span>{modelLabel}</span>}
      <span className="text-[9px] font-bold text-neutral-300 uppercase dark:text-neutral-600">
        {kind}
      </span>
    </span>
  );
};

// ─── Needs Approval widget (Overview) ──────────────────────────────────

const NeedsApprovalWidget = ({ campaignId }: { campaignId: string | number }) => {
  const { data, isLoading } = useCampaignPostsQuery(campaignId, 1, 50);
  const drafts = (data?.data ?? []).filter((p) => p.status === "draft" || p.status === "pending");

  if (isLoading) return null;
  if (drafts.length === 0) return null;

  return (
    <Card className="overflow-hidden border-amber-200/60 p-0! dark:border-amber-900/30">
      <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50/50 px-5 py-3 sm:px-6 dark:border-amber-900/30 dark:bg-amber-950/20">
        <div className="flex items-center gap-2">
          <AlertCircle size={14} className="text-amber-500 dark:text-amber-400" />
          <h3 className="text-xs font-black tracking-widest text-amber-600 uppercase dark:text-amber-400">
            {__("Needs Approval", "structura")}
          </h3>
        </div>
        <Badge variant="solid" intent="warning">
          {drafts.length.toString()}
        </Badge>
      </div>
      <div className="divide-y divide-amber-100/50 dark:divide-amber-900/20">
        {drafts.slice(0, 5).map((post) => (
          <PostRow key={post.id} post={post} compact />
        ))}
        {drafts.length > 5 && (
          <div className="px-5 py-2.5 text-center text-[11px] font-semibold text-amber-600 sm:px-6 dark:text-amber-400">
            {sprintf(
              __("+ %s more drafts awaiting review", "structura"),
              (drafts.length - 5).toString()
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

// ─── Recent posts widget (Overview) ────────────────────────────────────

const RecentPostsWidget = ({
  campaignId,
  onViewAll,
}: {
  campaignId: string | number;
  onViewAll: () => void;
}) => {
  const { data, isLoading } = useCampaignPostsQuery(campaignId, 1, 5);
  const posts = data?.data ?? [];

  return (
    <Card className="overflow-hidden border-neutral-200/60 p-0!">
      <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3 sm:px-6 dark:border-neutral-800">
        <h3 className="text-xs font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
          {__("Recent Posts", "structura")}
        </h3>
        {posts.length > 0 && (
          <Button
            variant="transparent"
            size="sm"
            onClick={onViewAll}
            className="text-brand-600 dark:text-brand-400"
          >
            {__("View all", "structura")}
            <ChevronRight size={14} className="ml-1" />
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-neutral-300 dark:text-neutral-600" />
        </div>
      ) : posts.length === 0 ? (
        <div className="py-12 text-center">
          <FileText size={28} className="mx-auto mb-2 text-neutral-200 dark:text-neutral-700" />
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            {__("No posts generated yet.", "structura")}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {posts.map((post) => (
            <PostRow key={post.id} post={post} compact />
          ))}
        </div>
      )}
    </Card>
  );
};

// ─── Post row (shared between widget + table) ──────────────────────────

const POST_STATUS_INTENT: Record<string, "success" | "warning" | "info" | "default"> = {
  publish: "success",
  future: "info",
  draft: "warning",
  pending: "warning",
};

const PostRow = ({ post, compact }: { post: ArchitectedPost; compact?: boolean }) => (
  <div
    className={cn(
      "group flex items-center gap-4 transition-colors hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30",
      compact ? "px-5 py-3 sm:px-6" : "px-6 py-3.5"
    )}
  >
    {/* Thumbnail */}
    {post.thumbnail ? (
      <div className="size-10 shrink-0 overflow-hidden rounded-lg border border-neutral-200 shadow-sm dark:border-neutral-700">
        <img src={post.thumbnail} alt="" className="h-full w-full object-cover" />
      </div>
    ) : (
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
        <FileText size={16} className="text-neutral-300 dark:text-neutral-600" />
      </div>
    )}

    {/* Content */}
    <div className="min-w-0 flex-1">
      <p className="m-0! truncate text-sm font-semibold text-neutral-800 dark:text-neutral-200">
        {post.title || __("Untitled", "structura")}
      </p>
      <p className="m-0! mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">
        {post.date}
        {!compact && post.author && <span> · {post.author}</span>}
      </p>
    </div>

    {/* Status */}
    <Badge
      variant="solid"
      intent={POST_STATUS_INTENT[post.status] ?? "default"}
      className="shrink-0"
    >
      {postStatusLabel(post.status)}
    </Badge>

    {/* Actions */}
    <div className="flex shrink-0 items-center gap-1">
      {post.status === "publish" && post.permalink && (
        <a
          href={post.permalink}
          target="_blank"
          rel="noreferrer"
          title={__("View post", "structura")}
          className="hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-950/20 dark:hover:text-brand-400 flex h-8 w-8 items-center justify-center rounded-lg text-neutral-300 transition-colors dark:text-neutral-600"
        >
          <Globe size={14} />
        </a>
      )}
      {(post.status === "draft" || post.status === "pending") && post.edit_link && (
        <a
          href={post.edit_link}
          target="_blank"
          rel="noreferrer"
          title={__("Review post", "structura")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-300 transition-colors hover:bg-amber-50 hover:text-amber-600 dark:text-neutral-600 dark:hover:bg-amber-950/20 dark:hover:text-amber-400"
        >
          <Eye size={14} />
        </a>
      )}
      {post.edit_link && (
        <a
          href={post.edit_link}
          target="_blank"
          rel="noreferrer"
          title={__("Edit in WordPress", "structura")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
        >
          <Pencil size={13} />
        </a>
      )}
    </div>
  </div>
);

// ─── Posts Tab ──────────────────────────────────────────────────────────

export const PostsTab = ({ campaignId }: { campaignId: string | number }) => {
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, refetch } = useCampaignPostsQuery(campaignId, page, 15);

  const posts = data?.data ?? [];
  const pagination = data?.pagination;
  // Spin the toolbar icon only for *background* refetches (manual refresh, or
  // paging with cached data via keepPreviousData). The full-body loader below
  // owns the initial load, so the icon and the loader never spin at once —
  // that simultaneous pair was the double-spinner this tab used to ship.
  const isRefreshing = isFetching && !isLoading;

  return (
    <Card className="overflow-hidden border-neutral-200/60 p-0!">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50/50 px-5 py-3 sm:px-6 dark:border-neutral-800 dark:bg-neutral-950/30">
        <span className="text-xs font-black tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
          {pagination
            ? sprintf(__("%s posts", "structura"), pagination.total_items.toString())
            : __("Posts", "structura")}
        </span>
        <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} />
        </Button>
      </div>

      {/* Body. On the initial load show a single centered loader sized to the
          card (mirrors the Runs tab); once data exists, keepPreviousData holds
          the list on screen across pages while the toolbar icon spins. */}
      {isLoading ? (
        <PageLoader label={__("Loading posts…", "structura")} size="lg" padding="lg" />
      ) : posts.length === 0 ? (
        <div className="py-16 text-center">
          <FileText size={32} className="mx-auto mb-3 text-neutral-200 dark:text-neutral-700" />
          <p className="text-sm text-neutral-400 dark:text-neutral-500">
            {__("No posts generated yet.", "structura")}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {posts.map((post) => (
            <PostRow key={post.id} post={post} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/50 px-5 py-3 sm:px-6 dark:border-neutral-800 dark:bg-neutral-950/30">
          <span className="text-xs font-medium text-neutral-500">
            {__("Page", "structura")} {pagination.current_page} {__("of", "structura")}{" "}
            {pagination.total_pages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= pagination.total_pages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};

// ─── Helpers ───────────────────────────────────────────────────────────

const formatMode = (mode?: string) => {
  switch (mode) {
    case "traffic_magnet":
      return __("Traffic Magnet", "structura");
    case "quick_wins":
      return __("Quick Wins", "structura");
    case "conversion":
      return __("Conversion", "structura");
    case "authority":
      return __("Authority", "structura");
    default:
      return __("Default", "structura");
  }
};

// Mirrors POST_STATUS_OPTIONS in CoreContentSettings — fall back to the raw
// value if the campaign was created before postStatus was persisted so old
// records stay visible rather than rendering an empty cell.
const formatPostStatus = (status?: string) => {
  switch (status) {
    case "publish":
      return __("Publish immediately", "structura");
    case "draft":
    // "pending" was removed 2026-07-09; legacy values read as a draft.
    case "pending":
      return __("Save as draft", "structura");
    default:
      // Pre-postStatus campaigns (no persisted value) genuinely used the
      // historical publish default, so keep that here.
      return __("Publish immediately", "structura");
  }
};
