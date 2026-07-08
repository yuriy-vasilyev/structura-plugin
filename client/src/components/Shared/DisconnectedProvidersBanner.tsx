import { FC } from "react";
import { __, sprintf } from "@wordpress/i18n";
import { Alert, Button } from "@structura/ui";
import { AlertTriangle, ArrowRight, XCircle } from "lucide-react";
import { useNavigate } from "react-router";
import { useAiConnections, useLicense } from "@/features/settings";
import { useCampaignsQuery } from "@/features/campaigns/api/useCampaignsQuery";
import { isManagedPlan, type PlanId } from "@structura/types";

/**
 * Global banner shown on ALL pages when the user is on a BYOK-style
 * plan (None / Free / BYOK) and has no AI providers connected.
 *
 * Two severity levels:
 *   1. ERROR   — active campaigns exist → generation is silently failing
 *   2. WARNING — no active campaigns → "Connect an engine to start"
 *
 * Replaces the old 3-step OnboardingGuide on the Dashboard (Phase 1.8
 * follow-up — the default persona is now auto-seeded for both
 * licensed AND anonymous workspaces, so the only setup step that's
 * left for the user is connecting an AI provider). The old guide
 * pre-dated the seeder + the cap-restricted None tier and made the
 * warning surface inconsistent — Dashboard had a 3-step grid, every
 * other page had a banner. One banner across all pages keeps the
 * "what do I need to do?" answer in the same spot regardless of
 * where the user lands.
 */
export const DisconnectedProvidersBanner: FC = () => {
  const navigate = useNavigate();
  const { plan, hasWorkspace } = useLicense();
  const {
    activeProviders,
    isLoading: loadingAi,
    isFetching: fetchingAi,
  } = useAiConnections();
  const { data: campaigns, isLoading: loadingCampaigns } = useCampaignsQuery();

  // Cloud/Agency users don't manage their own keys — not relevant
  if (isManagedPlan(plan as PlanId)) return null;

  // No workspace bearer yet (fresh install before the key is bound, or
  // anonymous bootstrap failed): connecting a provider isn't the next
  // step — connecting the ACCOUNT is, and the wizard's license gate
  // owns that ask. Nagging about AI providers here was the second hit
  // of the old broken first-run (after the error toast).
  if (hasWorkspace !== true) return null;

  // Hide while either the settings query is loading OR a background
  // revalidation is in flight. The wp_localize bootstrap that seeds
  // `useSettingsQuery` deliberately omits the cloud-derived
  // `connected` / `masked_key` fields (PHP can't synchronously fetch
  // them during page render — see `useSettingsQuery.ts`), so on
  // first paint the SPA sees `activeProviders.length === 0` even
  // when the cloud has providers bound. The background fetch lands
  // ~500ms later with real flags. Without the `fetchingAi` gate
  // here, the banner flashes for that ~500ms window and then
  // disappears the moment fresh data arrives.
  if (loadingAi || fetchingAi || loadingCampaigns) return null;

  const hasProviders = activeProviders.length > 0;
  if (hasProviders) return null;

  const activeCampaigns = (campaigns ?? []).filter((c) => c.status === "active");
  const hasActiveCampaigns = activeCampaigns.length > 0;

  // ── Critical: active campaigns are blocked ──────────────────────────
  if (hasActiveCampaigns) {
    return (
      <div className="mb-6">
        <Alert variant="error">
          <XCircle />
          <Alert.Title>{__("Campaign Generation Blocked", "structura")}</Alert.Title>
          <Alert.Description>
            {sprintf(
              __(
                "You have %d active campaign(s) but no AI providers connected. Scheduled posts cannot be generated until you reconnect at least one provider.",
                "structura"
              ),
              activeCampaigns.length
            )}
          </Alert.Description>
          <Alert.Action>
            <Button size="sm" variant="secondary" onClick={() => navigate("/ai-engine")}>
              {__("Reconnect Now", "structura")}
              <ArrowRight size={14} className="ml-2" strokeWidth={2} />
            </Button>
          </Alert.Action>
        </Alert>
      </div>
    );
  }

  // ── Warning: no provider connected (covers brand-new + returning) ──
  return (
    <div className="mb-6">
      <Alert variant="warning">
        <AlertTriangle />
        <Alert.Title>{__("Connect Your AI Engine", "structura")}</Alert.Title>
        <Alert.Description>
          {__(
            "Add an AI provider to start generating content. Without one, post generation and image creation are disabled.",
            "structura"
          )}
        </Alert.Description>
        <Alert.Action>
          <Button size="sm" variant="secondary" onClick={() => navigate("/ai-engine")}>
            {__("Connect Provider", "structura")}
            <ArrowRight size={14} />
          </Button>
        </Alert.Action>
      </Alert>
    </div>
  );
};
