import { useState } from "react";
import { useNavigate } from "react-router";
import { __, sprintf } from "@wordpress/i18n";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Crown,
  FileText,
  Infinity,
  Layers,
  Plus,
  RefreshCw,
  Target,
  TrendingUp,
  User,
  Zap,
} from "lucide-react";
import { useCampaignsQuery } from "@/features/campaigns/api/useCampaignsQuery";
import { useAcknowledgeRunMutation } from "@/features/dashboard/api/useNeedsAttentionQuery";
import { usePersonasQuery } from "@/features/personas";
import { Badge, Button, cn, EmptyState as UiEmptyState, PageLoader } from "@structura/ui";
import { PageTitle } from "@/components/Layout/PageTitle";
import { PageDescription } from "@/components/Layout/PageSubtitle";
import { useAiConnections, useLicense } from "@/features/settings";
import { buildPortalSignupUrl } from "@/utils/portalLinks";
import { getBadgeIntentByCampaignStatus } from "@/utils/helpers";
import { Campaign } from "@/features/campaigns";
import { campaignStatusLabel } from "@/features/campaigns/labels";
import { getProviderVisual } from "@/features/campaigns/constants";
import { StockSummaryChip } from "@/features/campaigns/components/StockSummaryChip";
import { CampaignDraftBanner } from "@/features/campaigns/components/CampaignDraftBanner";
import { cronToHuman } from "@/utils/cronUtils";
import { CampaignRunProgress } from "@/features/progress";

import { getCampaignModeMeta } from "@/utils/campaignModeMeta";
import dayjs from "@/libs/dayjs";
import { isManagedPlan, type PlanId } from "@structura/types";

/**
 * Spec §1.0l — first-pass UX when a user is at their per-tier
 * campaign cap is a "Contact us" CTA. Phase 2 may add a Stripe
 * "extra campaigns" add-on, at which point this URL flips to a
 * billing-portal link. Mirrored in
 * `useCampaignMutations.ts::SUPPORT_URL`.
 */
const SUPPORT_URL = "https://www.structurawp.com/support";

// ─── Mode icons ───────────────────────────────────────────────────────

const MODE_ICONS: Record<string, typeof TrendingUp> = {
  traffic_magnet: TrendingUp,
  quick_wins: Zap,
  conversion: Target,
  authority: Crown,
};

// Provider icons — delegates to shared PROVIDER_VISUALS via getProviderVisual()

// ─── Page ─────────────────────────────────────────────────────────────

export const CampaignsPage = () => {
  const navigate = useNavigate();
  const [hideCompleted, setHideCompleted] = useState(true);
  const { data: campaigns = [], isLoading, isFetching } = useCampaignsQuery();
  const { isLicensed, isPaidLicense, plan, maxCampaigns } = useLicense();
  const { activeProviders } = useAiConnections();
  const { data: personas = [] } = usePersonasQuery();

  const isManagedAiPlan = isManagedPlan(plan as PlanId);
  const hasApiKey = activeProviders.length > 0;
  // Personas are auto-seeded on license activation (License_Manager::
  // seed_default_persona_if_needed), so an empty-personas state is no
  // longer a hard block here. The "Random persona" option in the
  // generator falls back to a generic voice when zero personas exist.
  //
  // Engine-ready gate: managed-AI plans (Cloud / Cloud Pro) never need
  // a user-supplied key — the cloud handles credentials. Every other
  // tier (None / Free / BYOK) needs at least one connected provider.
  // The previous `!isPaidLicense` short-circuit was lying — it claimed
  // None / Free were "ready" even with zero providers, which contradicts
  // the `DisconnectedProvidersBanner`'s "Without one, post generation
  // and image creation are disabled" copy. Result: the button stayed
  // enabled, the user clicked it, the cloud rejected with "Unauthorized"
  // (no resolvable key), and the System Logs filled with
  // CLOUD_DELEGATION errors. Match the banner's logic exactly.
  const isEngineReady = isManagedAiPlan || hasApiKey;

  // Per-activation campaign cap. Sourced from `useLicense` which
  // already resolved cloud heartbeat → PHP cache → tier fallback;
  // `null` = unlimited (Cloud, Cloud Pro, or any paid plan whose
  // Stripe product omits the `max_campaigns` metadata). A finite cap
  // drives the "X of Y" chip and disables the "New Campaign" CTA
  // at-cap. We count against the full campaigns list (including
  // paused / completed) to mirror the cloud's count semantics —
  // paused campaigns still hold a slot because they can be
  // re-activated.
  const campaignCap = maxCampaigns;
  const usedCampaigns = campaigns.length;
  const atCampaignCap = campaignCap !== null && usedCampaigns >= campaignCap;

  const engineBlockedReason =
    !hasApiKey && !isManagedAiPlan
      ? __("Connect an AI provider in the AI Engine settings first.", "structura")
      : undefined;
  const newCampaignBlockedReason = atCampaignCap
    ? campaignCap !== null
      ? sprintf(
          /* translators: 1: campaigns currently used, 2: plan limit */
          __(
            "You're using %1$d of %2$d campaigns on your plan. Pause or delete one, or contact us for more.",
            "structura",
          ),
          usedCampaigns,
          campaignCap,
        )
      : undefined
    : engineBlockedReason;

  // Build persona lookup map
  const personaMap = new Map(personas.map((p) => [p.id, p.name]));

  // Sort: active first, then paused, then completed
  const STATUS_ORDER: Record<string, number> = { active: 0, paused: 1, completed: 2 };
  const sorted = [...campaigns].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
  );
  const completedCount = campaigns.filter((c) => c.status === "completed").length;
  const visibleCampaigns = hideCompleted ? sorted.filter((c) => c.status !== "completed") : sorted;

  if (isLoading) {
    return <PageLoader label={__("Loading campaigns…", "structura")} size="lg" padding="lg" />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <PageTitle>{__("Campaigns", "structura")}</PageTitle>
            {isFetching && !isLoading && (
              <RefreshCw size={14} className="animate-spin text-neutral-400" />
            )}
          </div>
          <PageDescription>
            {__("Create and manage your content campaigns.", "structura")}
          </PageDescription>
        </div>
        <div className="flex items-center gap-3">
          {/* Per-tier campaign-quota chip (spec §1.0l). Hidden for
              unlimited tiers and for unlicensed installs (the
              UnlicensedTeaser handles that case below). */}
          {isLicensed && campaignCap !== null && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums",
                atCampaignCap
                  ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/60"
                  : "bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200/60 dark:bg-neutral-800 dark:text-neutral-400 dark:ring-neutral-700/60"
              )}
              title={
                atCampaignCap
                  ? sprintf(
                      /* translators: 1: campaigns used, 2: plan cap */
                      __(
                        "You're using %1$d of %2$d campaigns on your plan. Pause or delete one to free up a slot, or contact us for more.",
                        "structura"
                      ),
                      usedCampaigns,
                      campaignCap
                    )
                  : sprintf(
                      /* translators: 1: campaigns used, 2: plan cap */
                      __("%1$d of %2$d campaigns used on your plan.", "structura"),
                      usedCampaigns,
                      campaignCap
                    )
              }
            >
              {sprintf(
                /* translators: 1: campaigns used, 2: plan cap */
                __("%1$d / %2$d campaigns", "structura"),
                usedCampaigns,
                campaignCap
              )}
            </span>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => navigate("/generate")}
            disabled={!isEngineReady}
            title={engineBlockedReason}
          >
            <Zap size={14} className="mr-1.5" />
            {__("Generate Post", "structura")}
          </Button>
          <Button
            size="sm"
            onClick={() => navigate("/campaigns/new")}
            disabled={!isEngineReady || !isLicensed || atCampaignCap}
            title={newCampaignBlockedReason}
          >
            <Plus size={16} className="mr-1.5" />
            {__("New Campaign", "structura")}
          </Button>
        </div>
      </div>

      {/* Resume-draft banner — shows when /campaigns/new has a partially
          filled draft sitting in localStorage. Rendered before the cap
          advisory because resuming an in-flight draft is a higher-intent
          action than reading the cap-reached copy; renders nothing when
          there's no draft. */}
      <CampaignDraftBanner />

      {/* Per-tier cap reached — inline advisory with the Contact Us
          escape hatch (spec §1.0l). Sits above the campaigns list so a
          user staring at a disabled "New Campaign" button immediately
          sees why and what to do. Free tier is suppressed (`1/1` is a
          marketing limit, not a workload constraint — the bottom Free
          upgrade teaser and the header's `1/1 campaigns` chip already
          tell that story without a yellow warning band); BYOK and other
          paid finite-cap plans still get the banner because hitting
          their cap usually means an agency really did burn through
          their licensed sites. Managed-AI tiers never see it because
          their cap is unlimited. */}
      {isLicensed && isPaidLicense && atCampaignCap && campaignCap !== null && (
        <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/60 px-5 py-4 sm:flex-row sm:items-center dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="space-y-1">
            <p className="m-0! text-sm font-semibold text-amber-800 dark:text-amber-200">
              {__("You've reached your plan's campaign limit.", "structura")}
            </p>
            <p className="m-0! text-xs text-amber-700/80 dark:text-amber-300/80">
              {sprintf(
                /* translators: 1: campaigns used, 2: plan cap */
                __(
                  "You're using %1$d of %2$d campaigns. Pause or delete one to free up a slot, or contact us if you need more.",
                  "structura"
                ),
                usedCampaigns,
                campaignCap
              )}
            </p>
          </div>
          <Button asChild size="sm" variant="secondary">
            <a href={SUPPORT_URL} target="_blank" rel="noreferrer">
              {__("Contact us", "structura")}
              <ArrowRight size={14} className="ml-1.5" />
            </a>
          </Button>
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────── */}
      {!isLicensed ? (
        <UnlicensedTeaser
          isEngineReady={isEngineReady}
          engineBlockedReason={engineBlockedReason}
          onGenerate={() => navigate("/generate")}
        />
      ) : campaigns.length === 0 ? (
        <EmptyState
          isEngineReady={isEngineReady}
          engineBlockedReason={engineBlockedReason}
          onNew={() => navigate("/campaigns/new")}
        />
      ) : (
        <div className="space-y-4">
          {/* Filter bar */}
          {completedCount > 0 && (
            <div className="flex items-center justify-end">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-400 select-none dark:text-neutral-500">
                <button
                  type="button"
                  onClick={() => setHideCompleted((v) => !v)}
                  className={cn(
                    "flex size-4 cursor-pointer items-center justify-center rounded border transition-colors",
                    hideCompleted
                      ? "border-brand-500 bg-brand-500 dark:border-brand-400 dark:bg-brand-500 text-white"
                      : "border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800"
                  )}
                >
                  {hideCompleted && <Check size={10} strokeWidth={3} />}
                </button>
                {sprintf(__("Hide completed (%s)", "structura"), completedCount.toString())}
              </label>
            </div>
          )}

          {visibleCampaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              personaName={getPersonaLabel(campaign.intelligence.personaId, personaMap)}
              onClick={() => navigate(`/campaigns/${campaign.id}`)}
            />
          ))}
        </div>
      )}

      {/* ── Free plan teaser ───────────────────────────────────── */}
      {isLicensed && !isPaidLicense && (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50/50 px-6 py-5 text-center dark:border-neutral-700 dark:bg-neutral-900/30">
          <p className="m-0! text-sm font-semibold text-neutral-600 dark:text-neutral-400">
            {__("Want more from your campaigns?", "structura")}
          </p>
          <p className="m-0! mt-1 text-xs text-neutral-400 dark:text-neutral-500">
            {__(
              "Upgrade to Pro for keyword research, authority domains, pre-generated publishes, more active campaigns, and more.",
              "structura"
            )}
          </p>
          {/*
           * Free users have an account on our end already (otherwise they
           * wouldn't have a Free *license*), so we deep-link directly to
           * the customer portal rather than the marketing pricing page.
           * The portal's `RootIndexRedirect` recognises
           * `intent=general_upgrade` and lands the user on /billing,
           * which auto-renders the pricing/upgrade view for accounts
           * without a paid subscription. Skipping the marketing detour
           * removes one click between "I want more" and "I can pay."
           */}
          <Button asChild variant="secondary" size="sm" className="mt-3">
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
            >
              {__("See Plans", "structura")}
              <ArrowRight size={14} className="ml-1.5" />
            </a>
          </Button>
        </div>
      )}
    </div>
  );
};

// ─── Campaign card ────────────────────────────────────────────────────

// Exported for unit testing — the card owns the unacknowledged-failure
// indicator logic (spec: plugin-quiet-mode.md §5.6) and benefits from
// isolated render-branch coverage. Consumers outside this module should
// still prefer composing via CampaignsPage; this is an escape hatch for
// tests only.
export const CampaignCard = ({
  campaign,
  personaName,
  onClick,
}: {
  campaign: Campaign;
  personaName: string;
  onClick: () => void;
}) => {
  const { identity, intelligence, schedule, stats, lastRun } = campaign;
  const isQuota = schedule.endCondition.type === "quota";
  const isDate = schedule.endCondition.type === "date";

  // Acknowledge-on-click for the "Needs attention" pill. The pill
  // otherwise only clears when the user dismisses the run via the
  // Needs Attention widget / admin notice / 30-day TTL, which gave
  // the surface a "flickers then disappears by itself" feel on the
  // Campaigns list. Firing the mutation AND navigating in one click
  // keeps the pill's lifecycle aligned with user intent: clicking
  // the pill means "I know about this failure, show me the detail".
  // Mutation is fire-and-forget — if the cloud rejects the ack the
  // pill simply stays (the optimistic-rollback inside the mutation
  // restores the cache) and the user can still dismiss from the
  // widget. Spec: `specs/run-detail-view.md` §6.5.
  const acknowledgeRun = useAcknowledgeRunMutation();

  const progress = isQuota
    ? Math.min(
        Math.round((stats.postsPublished / (schedule.endCondition.value as number)) * 100),
        100
      )
    : 0;

  const isActive = campaign.status === "active";
  const modeMeta = getCampaignModeMeta(identity.campaignMode);
  const providerVis = getProviderVisual(intelligence.textProvider);
  const ModeIcon = MODE_ICONS[identity.campaignMode ?? ""] ?? Layers;
  const ProviderIcon = providerVis.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full cursor-pointer rounded-2xl border bg-white text-left shadow-sm transition-all dark:bg-neutral-900",
        isActive
          ? cn(providerVis.border, providerVis.glow, "hover:shadow-md")
          : "border-neutral-200/60 hover:border-neutral-300 hover:shadow-md dark:border-neutral-800 dark:hover:border-neutral-700"
      )}
    >
      <div className="flex items-start gap-5 px-6 py-5">
        {/* ── Mode icon ─────────────────────────────────────── */}
        <div
          className={cn(
            "mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-xl",
            isActive ? modeMeta.bg : "bg-neutral-100 dark:bg-neutral-800"
          )}
        >
          <ModeIcon
            size={20}
            className={isActive ? modeMeta.text : "text-neutral-400 dark:text-neutral-500"}
          />
        </div>

        {/* ── Main content ──────────────────────────────────── */}
        <div className="min-w-0 flex-1 space-y-3">
          {/* Title row */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <h3 className="m-0! truncate text-base font-bold text-neutral-900 dark:text-white">
                  {identity.name}
                </h3>
                <Badge
                  variant="solid"
                  intent={getBadgeIntentByCampaignStatus(campaign.status)}
                  className="shrink-0"
                >
                  {campaignStatusLabel(campaign.status)}
                </Badge>
                {/*
                  Unacknowledged-failure pill. Failure-only by design — warnings
                  go to the progress drawer's calmer "Review run" receipt, not
                  here. The card itself is a <button>, so this inline indicator
                  uses role="link" + keyboard handlers instead of nesting a
                  second interactive element (nested buttons = invalid HTML).
                  `stopPropagation` prevents the card's own navigation from
                  hijacking the click.
                */}
                {lastRun?.status === "failed" && lastRun.runId && (
                  <span
                    role="link"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Fire-and-forget ack. The mutation's
                      // optimistic update clears the cached cards'
                      // `lastRun` the moment the click lands, so the
                      // pill vanishes without waiting for the cloud
                      // round-trip or the 30 s campaigns-list poll.
                      acknowledgeRun.mutate(lastRun.runId);
                      window.location.hash = `#/runs/${lastRun.runId}`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        acknowledgeRun.mutate(lastRun.runId);
                        window.location.hash = `#/runs/${lastRun.runId}`;
                      }
                    }}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200/60 transition-colors hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/60 dark:hover:bg-red-950/60"
                    aria-label={
                      lastRun.errorMessage
                        ? sprintf(
                            // translators: %s is the failure reason.
                            __("Last run failed — %s. View details.", "structura"),
                            lastRun.errorMessage
                          )
                        : __("Last run failed — view details.", "structura")
                    }
                    title={
                      lastRun.errorMessage ||
                      lastRun.headline ||
                      __("Last run failed — view details.", "structura")
                    }
                  >
                    <AlertTriangle size={11} strokeWidth={2.5} />
                    {__("Needs attention", "structura")}
                  </span>
                )}
              </div>
              {identity.objective && (
                <p className="m-0! mt-1 line-clamp-1 text-[13px] text-neutral-400 dark:text-neutral-500">
                  {identity.objective}
                </p>
              )}
            </div>
            <ChevronRight
              size={18}
              className="mt-1 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5 dark:text-neutral-600"
            />
          </div>

          {/* Meta pills row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-neutral-400 dark:text-neutral-500">
            {/* Provider */}
            <span className="flex items-center gap-1.5">
              <ProviderIcon
                size={14}
                className={isActive ? providerVis.color : "text-neutral-400 dark:text-neutral-500"}
              />
              <span className="font-semibold">{providerVis.label}</span>
              {intelligence.textModel && (
                <>
                  <span className="text-neutral-300 dark:text-neutral-700">·</span>
                  <span className="text-neutral-400 dark:text-neutral-500">
                    {intelligence.textModel}
                  </span>
                </>
              )}
            </span>

            <span className="text-neutral-200 dark:text-neutral-700">|</span>

            {/* Persona */}
            <span className="flex items-center gap-1.5">
              <User size={11} className="text-neutral-300 dark:text-neutral-600" />
              <span>{personaName}</span>
            </span>

            <span className="text-neutral-200 dark:text-neutral-700">|</span>

            {/* Schedule */}
            <span className="flex items-center gap-1.5">
              <Clock size={11} className="text-neutral-300 dark:text-neutral-600" />
              <span>{cronToHuman(schedule.cron)}</span>
            </span>

            <span className="text-neutral-200 dark:text-neutral-700">|</span>

            {/* Mode */}
            <span className="flex items-center gap-1.5">
              <ModeIcon
                size={11}
                className={isActive ? modeMeta.text : "text-neutral-400 dark:text-neutral-500"}
              />
              <span>{modeMeta.label}</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── Footer stats bar ──────────────────────────────────── */}
      <div className="flex items-center gap-6 border-t border-neutral-100 px-6 py-3 dark:border-neutral-800/60">
        {/* Published count */}
        <div className="flex items-center gap-1.5 text-[11px]">
          <FileText size={12} className="text-neutral-300 dark:text-neutral-600" />
          <span className="font-bold text-neutral-600 tabular-nums dark:text-neutral-400">
            {stats.postsPublished}
          </span>
          <span className="text-neutral-400 dark:text-neutral-500">
            {__("published", "structura")}
          </span>
        </div>

        {/* Phase 1.6 follow-up — stock state. Hidden when pregen is off
            or when the campaign has no stock entries yet. The chip
            polls the cloud's stock-summary endpoint with a 30s stale
            time, so it doesn't fire on every render. */}
        {schedule.pregenerationEnabled && (
          <StockSummaryChip
            campaignId={campaign.id}
            pregenerationEnabled={schedule.pregenerationEnabled}
          />
        )}

        {/* Next run */}
        {stats.nextRun && campaign.status === "active" && (
          <>
            <span className="text-neutral-200 dark:text-neutral-700">·</span>
            <div className="flex items-center gap-1.5 text-[11px]">
              <Clock size={12} className="text-neutral-300 dark:text-neutral-600" />
              <span className="text-neutral-400 dark:text-neutral-500">
                {__("Next run", "structura")}
              </span>
              <span className="font-semibold text-neutral-600 dark:text-neutral-400">
                {stats.nextRun}
              </span>
            </div>
          </>
        )}

        {/* Progress bar for quota campaigns */}
        {isQuota && (
          <>
            <span className="text-neutral-200 dark:text-neutral-700">·</span>
            <div className="flex flex-1 items-center gap-2">
              <div className="h-1.5 w-full max-w-32 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700">
                <div
                  className="bg-brand-600 dark:bg-brand-500 h-full transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[11px] font-bold text-neutral-500 tabular-nums dark:text-neutral-400">
                {stats.postsPublished}/{schedule.endCondition.value}
              </span>
            </div>
          </>
        )}

        {/* End date */}
        {isDate && (
          <>
            <span className="text-neutral-200 dark:text-neutral-700">·</span>
            <div className="flex items-center gap-1.5 text-[11px]">
              <Calendar size={12} className="text-neutral-300 dark:text-neutral-600" />
              <span className="text-neutral-400 dark:text-neutral-500">
                {__("Ends", "structura")}
              </span>
              <span className="font-semibold text-neutral-600 dark:text-neutral-400">
                {dayjs(schedule.endCondition.value as string).format("ll")}
              </span>
            </div>
          </>
        )}

        {/* Ongoing badge */}
        {!isQuota && !isDate && (
          <>
            <span className="text-neutral-200 dark:text-neutral-700">·</span>
            <div className="flex items-center gap-1.5 text-[11px]">
              <Infinity size={14} className="text-neutral-300 dark:text-neutral-600" />
              <span className="text-neutral-400 dark:text-neutral-500">
                {__("Ongoing", "structura")}
              </span>
            </div>
          </>
        )}
      </div>

      {/*
        Live-run progress strip. Self-gates on `activeRunId` + matching
        `campaignId` — the 99% of cards without an in-flight run render
        nothing and cost nothing. The strip flushes into the card's
        bottom edge (`rounded-b-2xl` mirrors the card's own `rounded-2xl`)
        so when it lights up it looks like the card itself is breathing,
        not like a separate panel was bolted on.
      */}
      <CampaignRunProgress campaignId={campaign.id} variant="card" className="rounded-b-2xl" />
    </button>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────

const getPersonaLabel = (
  // 2026-05-01 — cloud personas use nanoid string ids; legacy WP
  // personas use numeric ids. Accept both shapes here so the lookup
  // doesn't drop nanoids on the floor (the symptom would be every
  // campaign card showing "Unknown persona" post-cloud-migration).
  personaId: string | number | "random",
  personaMap: Map<string | number, string>,
): string => {
  if (personaId === "random") return __("Random persona", "structura");
  return personaMap.get(personaId) ?? __("Unknown persona", "structura");
};

// ─── Unlicensed teaser (anonymous / "none" plan) ──────────────────────

const UnlicensedTeaser = ({
  isEngineReady,
  engineBlockedReason,
  onGenerate,
}: {
  isEngineReady: boolean;
  engineBlockedReason?: string;
  onGenerate: () => void;
}) => {
  const { plan } = useLicense();
  const domain =
    typeof window !== "undefined" ? window.location.hostname : undefined;
  return (
  // Lower-key than the previous full-page locked card. Anonymous users
  // CAN generate posts one-off via the AI Engine; campaigns (scheduling)
  // are the gated bit. So the primary CTA is "Generate Post" (an action
  // they can do right now) and "Get Free License" sits behind it as the
  // upgrade path, instead of fronting a giant Lock icon that reads as
  // "you can't use this app yet."
  <div className="flex flex-col items-start justify-between gap-5 rounded-2xl border border-neutral-200 bg-white px-6 py-6 sm:flex-row sm:items-center dark:border-neutral-700 dark:bg-neutral-900/30">
    <div className="flex items-start gap-4">
      <div className="bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400 flex size-10 shrink-0 items-center justify-center rounded-xl">
        <Zap size={18} />
      </div>
      <div className="space-y-1">
        <h3 className="m-0! text-sm font-bold text-neutral-900 dark:text-white">
          {__("Generate a post now — automate later", "structura")}
        </h3>
        <p className="m-0! max-w-xl text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
          {__(
            "Anonymous installs can generate posts one at a time. Claim a free license to unlock campaigns that publish on a schedule.",
            "structura"
          )}
        </p>
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      <Button
        size="sm"
        onClick={onGenerate}
        disabled={!isEngineReady}
        title={engineBlockedReason}
      >
        <Zap size={14} className="mr-1.5" />
        {__("Generate Post", "structura")}
      </Button>
      <Button asChild size="sm" variant="secondary">
        <a
          href={buildPortalSignupUrl({
            intent: "general_upgrade",
            domain,
            plan,
          })}
          target="_blank"
          rel="noreferrer"
        >
          {__("Get Free License", "structura")}
          <ArrowRight size={14} className="ml-1.5" />
        </a>
      </Button>
    </div>
  </div>
  );
};

// ─── Empty state (licensed but no campaigns yet) ──────────────────────

const EmptyState = ({
  isEngineReady,
  engineBlockedReason,
  onNew,
}: {
  isEngineReady: boolean;
  engineBlockedReason?: string;
  onNew: () => void;
}) => (
  <UiEmptyState
    icon={<RefreshCw size={24} />}
    title={__("No campaigns yet", "structura")}
    description={__(
      "Create your first campaign to start generating content automatically.",
      "structura"
    )}
    action={
      <Button onClick={onNew} disabled={!isEngineReady} title={engineBlockedReason}>
        <Plus size={16} className="mr-1.5" />
        {__("Create Campaign", "structura")}
      </Button>
    }
  />
);
