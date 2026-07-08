import { useNavigate } from "react-router";
import { __, sprintf } from "@wordpress/i18n";
import { Plus, Zap } from "lucide-react";
import { useStatsQuery } from "../api/useDashboardQueries";
import { Button, PageLoader } from "@structura/ui";
import { useJobsQuery } from "@/features/campaigns/api/useJobsQuery";

// Local Dashboard Components
import { StatCard } from "../components/StatCard";
import { IntelligenceUsage } from "../components/IntelligenceUsage";
import { ActiveQueue } from "../components/ActiveQueue";
import { RecentBlueprints } from "../components/RecentBlueprints";
import { RecentSinglePostRuns } from "../components/RecentSinglePostRuns";
import { PageTitle } from "@/components/Layout/PageTitle";
import { PageDescription } from "@/components/Layout/PageSubtitle";
import { useAiConnections, useLicense } from "@/features/settings";
import { usePersonasQuery } from "@/features/personas";
import { UpgradeCard } from "../components/UpgradeCard";
import { OnboardingResumeTile } from "@/features/onboarding";
import { isManagedPlan, type PlanId } from "@structura/types";
export const DashboardPage = () => {
  const navigate = useNavigate();
  const { data: stats, isLoading: loadingStats } = useStatsQuery();
  const { isLicensed, isPaidLicense, plan } = useLicense();
  const { activeProviders } = useAiConnections();
  const { data: personas = [] } = usePersonasQuery();
  const { data: jobsResponse, isLoading: loadingJobs } = useJobsQuery("pending", 1, "");

  const isManagedAiPlan = isManagedPlan(plan as PlanId);
  const hasPersona = personas.length > 0;
  const hasApiKey = activeProviders.length > 0;
  // Match `CampaignsPage` and `GeneratePostPage`: managed-AI plans
  // never need a user-supplied key (cloud handles credentials);
  // every other tier (None / Free / BYOK) needs at least one
  // connected provider. The previous `!isPaidLicense` short-circuit
  // claimed None / Free were "ready" with zero providers, but the
  // cloud rejects those handovers as Unauthorized — see the
  // CampaignsPage `isEngineReady` comment for the full rationale.
  const isEngineReady = hasPersona && (isManagedAiPlan || hasApiKey);

  // Active Generation Queue surfaces scheduled-campaign work, which
  // None-tier (anonymous) installs can't create. Hiding the empty
  // table for them removes a meaningless "Queue is currently empty"
  // row + the loading flicker from `useJobsQuery` firing for nothing.
  const isGlobalLoading = loadingStats || (isLicensed && loadingJobs);

  if (isGlobalLoading) {
    return <PageLoader label={__("Loading dashboard…", "structura")} size="lg" padding="lg" />;
  }

  return (
      <div className="space-y-10">
        <header className="flex items-start justify-between gap-4">
          <div>
            <PageTitle>{__("Overview", "structura")}</PageTitle>
            <PageDescription>{__("Your content at a glance.", "structura")}</PageDescription>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate("/generate")}
              disabled={!isEngineReady}
            >
              <Zap size={14} className="mr-1.5" />
              {__("Generate Post", "structura")}
            </Button>
            {isLicensed && (
              <Button
                size="sm"
                onClick={() => navigate("/campaigns/new")}
                disabled={!isEngineReady}
              >
                <Plus size={16} className="mr-1.5" />
                {__("New Campaign", "structura")}
              </Button>
            )}
          </div>
        </header>

        {/* Setup wizard resume tile — self-gates on `isPaidLicense`
            and `wizardState.completedAt === null`. Dismissible per-
            session via sessionStorage. Renders nothing for free/none
            tiers and completed setups, so the slot collapses entirely
            in the steady state. */}
        <OnboardingResumeTile />

        {/* TOP STATS ROW */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <StatCard
            label={__("Posts Created", "structura")}
            value={stats?.content.posts ?? 0}
            subtext={sprintf(__("%d content blocks", "structura"), stats?.content.blocks ?? 0)}
            variant="brand"
          />
          <StatCard
            label={__("Images Generated", "structura")}
            value={stats?.visual.optimized ?? 0}
            subtext={sprintf(
              __("%s storage reclaimed", "structura"),
              stats?.visual.space_saved ?? "0MB"
            )}
            variant="emerald"
          />
          {/* Third column: usage telemetry for paid tiers, a conversion
              CTA for everyone else. Keeping the slot filled stops the
              stat row from looking lopsided on None/Free (it used to be
              empty), and gives Free — which has no upgrade banner of its
              own — a persistent Pro upsell. */}
          {isPaidLicense ? <IntelligenceUsage /> : <UpgradeCard />}
        </div>

        {/*
         * Queue + recent blueprints, full-width. The Architectural Logs
         * ticker that used to sit in a 1/3 column was retired under
         * `specs/plugin-quiet-mode.md` §5.3 — live visibility now comes
         * through the progress drawer and the Needs Attention widget
         * above, so the Overview shouldn't surface a log stream at all.
         * Full-run history (when Debug mode is on) still lives on the
         * System Logs page.
         */}
        <div className="space-y-8">
          {/* Campaigns-only widget — None tier never has scheduled
              jobs, so hide the empty-state shell instead of showing
              "Queue is currently empty" forever. */}
          {isLicensed && <ActiveQueue jobs={jobsResponse?.data ?? []} />}
          {/*
           * Persistent receipts for one-off `/generate` submissions.
           * Self-hides on an empty list so a user who has never used
           * the Generate-Post form sees no chrome, and Power users
           * who use it daily get a quick "is mine done yet?" surface
           * without leaving the Overview. Cap is 5 rows; the
           * underlying list is the cloud-side `listSinglePostRuns`
           * query filtered to `isEphemeral === true`.
           */}
          <RecentSinglePostRuns />
          <RecentBlueprints />
        </div>
      </div>
  );
};
