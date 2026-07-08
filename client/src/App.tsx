import { useEffect } from "@wordpress/element";
import { HashRouter, Navigate, Route, Routes } from "react-router";
import Header from "@/components/Layout/Header";
import { usePrivacyConsent } from "@/lib/consent";
import { setConsented as setPostHogConsented } from "@/lib/posthog";
import { DashboardPage } from "@/features/dashboard";
import { CampaignsPage } from "@/features/campaigns";
import { PersonasPage } from "@/features/personas";
import { SettingsPage, useLicense, VisualsPage } from "@/features/settings";
import { Account } from "@/features/account";
import { AiEngine } from "@/features/ai-engine";
import {
  ChannelsActivityPage,
  ChannelsConnectionsPage,
  ChannelsStorePage,
  useChannelsVisibility,
  resolveChannelsRouteState,
} from "@/features/channels";
import { Notices } from "@/features/notices";
import {
  OnboardingAutoRedirectBridge,
  OnboardingPage,
} from "@/features/onboarding";
import {
  SiteCompetitorsTab,
  SiteInfoTab,
  SiteReferralsTab,
  SiteSettingsTab,
} from "@/features/site";
import { LicenseStatusBanner } from "@/components/Shared/LicenseStatusBanner";
import { SiteNotConnectedBanner } from "@/components/Shared/SiteNotConnectedBanner";
import { DisconnectedProvidersBanner } from "@/components/Shared/DisconnectedProvidersBanner";
import { CycleQuotaBanner } from "@/components/Shared/CycleQuotaBanner";
import { DomainMismatchAdvisory } from "@/components/Shared/DomainMismatchAdvisory";
import { ExpiredConnectionsBanner } from "@/components/Shared/ExpiredConnectionsBanner";
import { WpCronDisabledBanner } from "@/components/Shared/WpCronDisabledBanner";
import { CloudUnreachableBanner } from "@/components/Shared/CloudUnreachableBanner";
import AppErrorBoundary from "@/components/Layout/AppErrorBoundary";
import CreateCampaignPage from "@/features/campaigns/routes/CreateCampaignPage";
import EditCampaignPage from "@/features/campaigns/routes/EditCampaignPage";
import CampaignViewPage from "@/features/campaigns/routes/CampaignViewPage";
import GeneratePostPage from "@/features/campaigns/routes/GeneratePostPage";
import SinglePostRunDetailPage from "@/features/campaigns/routes/SinglePostRunDetailPage";
import { RunDetailPage, RunsProvider, RunStatusToastHost } from "@/features/progress";

const App = () => {
  // Rollout + plan + entitlement gate. Drives both the unhealthy-connection
  // banner and the `/channels/*` route mount so a user who lost entitlement
  // (downgrade, add-on expiry) stops landing on a page whose primary actions
  // require access they no longer have.
  const channelsVisible = useChannelsVisibility();

  // License-query loading state. We need this distinct from
  // `channelsVisible` because the visibility hook can't represent
  // "loading" — it returns `false` while the query is in flight, which
  // would let the `/channels/*` catch-all redirect fire on every cold
  // load. A user landing on `#/channels/connections` (e.g. via the
  // portal's `returnTo` redirect after the add-on launch hand-off) would
  // get bounced to `/` before the heartbeat resolved. Holding the route
  // tree empty during loading is the safest middle ground: a brief
  // blank pane is preferable to a spurious redirect that loses the URL.
  //
  // We OR in `entitlementsLoading` because `loading` alone only tracks the
  // fast PHP settings query — but `channelsVisible` reads `entitlements`,
  // which arrives only on the slower cloud heartbeat. Without this, the
  // settings query resolves, `loading` flips false while entitlements are
  // still `{}`, `channelsVisible` is (wrongly) false, and the redirect
  // fires + `replace`s away the URL before the heartbeat can confirm the
  // entitlement. `entitlementsLoading` is false for Free/anonymous (their
  // heartbeat is disabled), so this never hangs the route for them.
  const { loading: licenseLoading, entitlementsLoading } = useLicense();

  // Tri-state: "pending" while either loading signal is open (hold the
  // route tree empty — no redirect), "mounted" once entitled, "redirect"
  // once entitlement is confirmed absent. See `resolveChannelsRouteState`.
  const channelsRouteState = resolveChannelsRouteState(
    licenseLoading,
    entitlementsLoading,
    channelsVisible,
  );

  // PostHog opt-in (analytics rollout Phase 2). Lazy-load posthog-js
  // only when the admin has flipped Settings → Privacy & Telemetry on.
  // The toggle itself also fires `notifyConsumers()` in
  // `lib/consent.ts` so the running session reflects the change
  // without a reload, but this effect handles the cold-load path
  // (signed-in admin who consented in a prior session).
  const { data: privacyConsent } = usePrivacyConsent();
  useEffect(() => {
    if (!privacyConsent) return;
    void setPostHogConsented(privacyConsent.telemetryEnabled);
  }, [privacyConsent?.telemetryEnabled, privacyConsent?.choseAt]);

  return (
    <HashRouter>
      {/* RunsProvider wraps everything under the router so the active-
          run handle survives route transitions. The inline
          `CampaignRunProgress` strip reads it on `/campaigns` and
          `/campaigns/:id`; `RunStatusToastHost` reads it anywhere in
          the app so terminal-status toasts broadcast even when the
          user has navigated away from the campaign card they fired
          the run from. */}
      <RunsProvider>
        {/* Headless mount of the wizard auto-redirect — fires once
            per session when a paid user lands on the dashboard for
            the first time after activation. Must live INSIDE
            HashRouter so useLocation/useNavigate work; renders
            nothing itself. */}
        <OnboardingAutoRedirectBridge />
        <div className="structura-app-wrapper -ml-2.5 bg-[#f0f0f1] sm:-ml-5">
          <Header />
          <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <AppErrorBoundary resetOnNavigation>
              {/* Host-level config issue: DISABLE_WP_CRON in
                  wp-config.php stalls every Action Scheduler task
                  this plugin relies on. Rendered at the very top of
                  the banner stack because it gates the *cause* of
                  every other "why did my campaign not run?" issue
                  the banners below surface. Self-gates on a config
                  flag bootstrapped into `window.structuraConfig`, so
                  zero network cost and it's a silent no-op on healthy
                  sites. */}
              <WpCronDisabledBanner />
              {/* Cloud → plugin reachability advisory. Same zero-network
                  pattern as the WP-Cron banner above: self-gates on the
                  `cloud_unreachable` flag bootstrapped into
                  `window.structuraConfig` (the cached handshake verdict),
                  so it's a silent no-op on reachable sites and only fires
                  on the localhost/private/firewalled case where generated
                  posts can never be delivered back. */}
              <CloudUnreachableBanner />
              {/* Disconnected-install advisory. Self-gates on
                  `useLicense().hasUsableLicense === false` — only renders when
                  settings have loaded AND no license key is bound to the site,
                  the same condition that prevents every cloud-backed query
                  hook from firing. Anchors the empty state with a "Connect
                  this site" CTA so the user has somewhere to go instead of
                  staring at a deserted SPA. */}
              <SiteNotConnectedBanner />
              <LicenseStatusBanner />
              {/* Global host-mismatch advisory. Self-gates on
                  `useLicense().isActivationValid` — renders nothing unless the
                  cloud heartbeat confirms this hostname isn't a registered
                  activation (e.g. DDEV install now served through ngrok, or a
                  staging → prod host flip). Mounted here rather than per-route
                  because the rest of the plugin keeps working on the
                  unrecognized host; only activation-secret gated Channels
                  calls fail, and we'd rather the customer see the advisory
                  wherever they land than discover the mismatch only when they
                  click into Channels. */}
              <DomainMismatchAdvisory />
              <DisconnectedProvidersBanner />
              {/* Phase 4.4 Cycle Usage banner — site-wide 80%/100%
                  warning for managed-tier customers. Self-gates on
                  `useUsageAnalytics().cycleUsage` so BYOK / Free /
                  disconnected installs never even fire the network
                  fetch. Mounted after the disconnect/credentials
                  banners so the connection-related signals (which
                  block generation) outrank the cycle warning (which
                  is informational). */}
              <CycleQuotaBanner />
              {channelsVisible && <ExpiredConnectionsBanner />}
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/generate" element={<GeneratePostPage />} />
                <Route path="/generate/runs/:runId" element={<SinglePostRunDetailPage />} />
                <Route path="/campaigns" element={<CampaignsPage />} />
                <Route path="/campaigns/new" element={<CreateCampaignPage />} />
                <Route path="/campaigns/:id" element={<CampaignViewPage />} />
                <Route path="/campaigns/:id/edit" element={<EditCampaignPage />} />
                <Route path="/personas" element={<PersonasPage />} />
                <Route path="/ai-engine" element={<AiEngine />} />
                {/*
                  Channels routing rationale:
                  - `/channels` → Connections is now the primary landing page.
                    Previously this was Activity, but Activity was confusing
                    when the user had no connections yet ("why is this page
                    empty?"). Connections with an actionable empty state is
                    a clearer default.
                  - `/channels/store` is the Firebase-Extensions-Hub-style
                    marketplace where users discover integrations.
                  - `/channels/activity` still exists for the per-post
                    dispatch log, just one click away instead of front-and-
                    center.
                */}
                {/* `/channels` → `/channels/connections` so the SubNav's
                    active-tab highlight works cleanly off prefix-match
                    against the canonical path. `replace` keeps the back
                    button sane. */}
                {/* Channels surface is rollout-gated + plan-gated +
                    entitlement-gated (see `useChannelsVisibility`). When the
                    user isn't entitled — rollout off, wrong plan, missing
                    add-on — the Header nav entry and per-campaign tab are
                    hidden; we also redirect `/channels/*` away so a bookmarked
                    URL (e.g. from a lapsed Agency → Free downgrade, or a
                    flag-flip session) doesn't land on a page whose primary
                    actions require access the user no longer has. */}
                {channelsRouteState === "pending" ? null : channelsRouteState === "mounted" ? (
                  <>
                    <Route
                      path="/channels"
                      element={<Navigate to="/channels/connections" replace />}
                    />
                    {/* Channels is bundled into every paid plan (one seat per
                        site, auto-granted by the Stripe webhook), so
                        license-wide entitlement — checked by
                        `useChannelsVisibility` / `resolveChannelsRouteState`
                        above — is the only gate. There's no per-site seat to
                        claim, so the routes mount their real content
                        directly. */}
                    <Route path="/channels/connections" element={<ChannelsConnectionsPage />} />
                    <Route path="/channels/store" element={<ChannelsStorePage />} />
                    <Route path="/channels/activity" element={<ChannelsActivityPage />} />
                  </>
                ) : (
                  <Route path="/channels/*" element={<Navigate to="/" replace />} />
                )}
                <Route path="/visuals" element={<VisualsPage />} />
                {/*
                  `/site` — public-site identity + SEO intelligence
                  (spec/seo-intelligence-plan.md §4). Five sibling
                  routes under one tab strip; the bare `/site` redirects
                  to `/site/info` so the user always lands on the
                  always-available identity tab regardless of tier.
                  Headless Mode toggle relocates here from Settings —
                  see `SiteInfoTab`.
                */}
                <Route path="/site" element={<Navigate to="/site/info" replace />} />
                <Route path="/site/info" element={<SiteInfoTab />} />
                <Route path="/site/competitors" element={<SiteCompetitorsTab />} />
                <Route path="/site/referrals" element={<SiteReferralsTab />} />
                <Route path="/site/settings" element={<SiteSettingsTab />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/account" element={<Account />} />
                {/*
                  User-facing Notification Center (spec/v2/notification-center.md).
                  Replaces the user-facing role of System Logs — runs already
                  carry the per-generation truth, and notices surface the
                  account/billing/connection class of issues that DON'T
                  belong inside a run.
                */}
                <Route path="/notices" element={<Notices />} />
                {/* Stale-bookmark redirect for the retired System Logs page. */}
                <Route path="/logs" element={<Navigate to="/notices" replace />} />
                {/*
                  Per-run receipt view. Entry points (spec
                  specs/run-detail-view.md §5.1):
                    - progress drawer post-terminal "View details" button
                    - campaign card "View last run" (Phase 3)
                    - Needs Attention widget row (Phase 2)
                  Reached via hash URL (e.g. #/runs/abc-123-def) so
                  support conversations can paste a shareable link that
                  lands directly on the receipt.
                */}
                <Route path="/runs/:runId" element={<RunDetailPage />} />
                {/*
                  Setup wizard — first-run coordinator across site info,
                  AI engine, SEO intelligence, visuals, persona. W-A
                  scope: skeleton + steps 1 and 6. The wizard renders
                  full-screen via its own `fixed inset-0 z-50` overlay
                  so it covers the wp-admin chrome without requiring
                  App.tsx to refactor its layout. Plan:
                  `valiant-juggling-kazoo.md`.
                */}
                <Route path="/onboarding" element={<OnboardingPage />} />
              </Routes>
            </AppErrorBoundary>
          </main>
          {/*
            Invisible host that fires a global toast when the active run
            terminates. Replaces the old floating ProgressDrawer: we keep
            the per-card inline strip (CampaignRunProgress) for the
            originating surface and use the app's own toast provider for
            off-screen broadcast. Self-gates internally on activeRunId +
            terminal status, so it costs nothing when no run is active.
          */}
          <RunStatusToastHost />
        </div>
      </RunsProvider>
    </HashRouter>
  );
};

export default App;
