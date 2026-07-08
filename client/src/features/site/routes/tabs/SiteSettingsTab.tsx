/**
 * `/site/settings` — SEO intelligence preferences.
 *
 * Spec: `specs/seo-intelligence-plan.md` §4.2, §6.
 *
 * Live toggles + the inline refresh trigger. Budget remaining is a
 * placeholder until per-workspace usage tracking lands.
 */

import { __ } from "@wordpress/i18n";
import { Card, Switch } from "@structura/ui";
import { Button } from "@structura/ui";
import { Loader2, RefreshCw } from "lucide-react";
import { useLicense } from "@/features/settings";
import { RestartWizardCard } from "@/features/onboarding";
import { SitePageLayout } from "../SitePageLayout";
import { LockedPanel } from "../../components/LockedPanel";
import {
  useAnalyzeSiteMutation,
  useSiteAnalysisQuery,
  useUpdateSiteSeoSettingsMutation,
} from "../../api/useSiteAnalysis";

const SettingsPreview = () => (
  <div className="flex flex-col gap-6">
    <Card className="flex flex-col gap-3 p-6">
      <h3 className="m-0! text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
        {__("Monthly digest", "structura")}
      </h3>
      <p className="m-0! text-sm text-neutral-500 dark:text-neutral-400">
        {__(
          "Get a once-a-month summary of new keyword opportunities Structura found for your site. Off by default — opt in below.",
          "structura",
        )}
      </p>
    </Card>
    <Card className="flex flex-col gap-3 p-6">
      <h3 className="m-0! text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
        {__("Budget remaining", "structura")}
      </h3>
      <p className="m-0! text-sm text-neutral-500 dark:text-neutral-400">
        {__(
          "Live data and refreshes consume your workspace's monthly SEO budget. We'll surface usage here once your first refresh runs.",
          "structura",
        )}
      </p>
    </Card>
  </div>
);

const SettingsLive = () => {
  const query = useSiteAnalysisQuery();
  const analyze = useAnalyzeSiteMutation();
  const update = useUpdateSiteSeoSettingsMutation();
  const settings = query.data?.seoIntelSettings;
  const capturedAt = query.data?.capturedAt ?? null;
  const digestOn = settings?.emailDigestOptIn ?? false;

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 p-6">
        <Switch
          label={__("Monthly digest email", "structura")}
          description={__(
            "Once-a-month email summarising new keyword opportunities Structura found for your site. Off by default.",
            "structura",
          )}
          checked={digestOn}
          onChange={(checked) => {
            update.mutate({ emailDigestOptIn: checked });
          }}
          disabled={update.isPending}
        />
      </Card>

      <Card className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="m-0! text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              {__("Last refresh", "structura")}
            </h3>
            <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
              {capturedAt
                ? __("Most recent SEO intelligence run for this site.", "structura")
                : __("This site hasn't been analyzed yet.", "structura")}
            </p>
            {capturedAt ? (
              <p className="m-0! text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {new Date(capturedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
          <Button
            variant="transparent"
            size="sm"
            onClick={() => analyze.mutate()}
            disabled={analyze.isPending}
          >
            {analyze.isPending ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <RefreshCw size={14} className="mr-1.5" />
            )}
            {capturedAt
              ? __("Refresh now", "structura")
              : __("Run now", "structura")}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-6">
        <h3 className="m-0! text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
          {__("Budget remaining", "structura")}
        </h3>
        <p className="m-0! text-sm text-neutral-500 dark:text-neutral-400">
          {__(
            "Live data and refreshes consume your workspace's monthly SEO budget. Per-workspace usage tracking lands in the next release.",
            "structura",
          )}
        </p>
      </Card>
    </div>
  );
};

export const SiteSettingsTab = () => {
  const { isPaidLicense } = useLicense();

  return (
    <SitePageLayout>
      {/* Restart sits OUTSIDE the SEO-refresh tier gate: free tiers run
          the setup wizard too (site info, AI engine, visuals, personas),
          so they need a way to re-run it. Only the SEO-refresh
          preferences below are paid. */}
      <div className="flex flex-col gap-6">
        {isPaidLicense ? (
          <SettingsLive />
        ) : (
          <LockedPanel
            valueStatement={__(
              "Tune your SEO intelligence refresh.",
              "structura",
            )}
            detail={__(
              "Opt in to the monthly digest, control refresh cadence, and watch your workspace budget — all from one place.",
              "structura",
            )}
            intent="unlock_keyword_bank"
          >
            <SettingsPreview />
          </LockedPanel>
        )}

        <RestartWizardCard />
      </div>
    </SitePageLayout>
  );
};
