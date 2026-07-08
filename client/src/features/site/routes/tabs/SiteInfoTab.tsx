/**
 * `/site/info` — public-site identity for this WordPress install.
 *
 * Spec: `specs/seo-intelligence-plan.md` §4.2.
 *
 * The Headless Mode toggle + public-site profile previously lived under
 * Settings (`features/settings/components/PublicSiteCard.tsx`). They
 * move here because "site identity" is a separable concept from
 * general preferences (uninstall toggle, privacy telemetry) — keeping
 * them together let the Settings page balloon while making the
 * site-identity controls hard to find.
 *
 * On paid tiers, this tab also surfaces the workspace's auto-detected
 * niche/categories and authority score after a "Detect" run (shares
 * the analyze endpoint with the Keywords tab — one call populates
 * both caches).
 */

import { __ } from "@wordpress/i18n";
import { Badge, Button, Card, Tooltip } from "@structura/ui";
import { Award, Loader2, RefreshCw, Sparkles, Tag } from "lucide-react";
import { PublicSiteCard } from "@/features/settings/components/PublicSiteCard";
import { PositioningCard } from "@/features/onboarding";
import { useLicense } from "@/features/settings";
import { SitePageLayout } from "../SitePageLayout";
import { SitePanelHeader } from "../../components/SitePanelHeader";
import {
  useAnalyzeSiteMutation,
  useSiteAnalysisQuery,
} from "../../api/useSiteAnalysis";

/**
 * Niche / authority detection card. Paid tiers only — free tiers see
 * the unchanged PublicSiteCard plus no detection panel.
 */
const SiteIntelligencePanel = () => {
  const query = useSiteAnalysisQuery();
  const analyze = useAnalyzeSiteMutation();
  const domain = query.data?.domain;
  const capturedAt = query.data?.capturedAt ?? null;
  // An analysis ran when capturedAt is set. The domain field may still
  // be empty (provider returned no data for this URL) — that's the
  // "ran but empty" state, distinct from "never analyzed".
  const ranAnalysis = capturedAt !== null;
  // We render the grid when there's at least one meaningful signal —
  // a named (non-numeric) category, a niche string, or any organic
  // footprint metric. Pure numeric category IDs don't count as
  // "meaningful" until we have an ID→name lookup.
  const hasNamedCategory = !!domain?.categories.some((c) => !/^\d+$/.test(c));
  const hasNicheData =
    !!domain &&
    (hasNamedCategory ||
      domain.niche.length > 0 ||
      domain.rankingKeywordCount !== undefined ||
      domain.topRankingCount !== undefined ||
      domain.estimatedTrafficValue !== undefined ||
      domain.authorityScore !== undefined);

  return (
    <Card className="flex flex-col gap-6 p-6">
      <SitePanelHeader
        title={__("Site intelligence", "structura")}
        description={
          ranAnalysis
            ? __(
                "Detected niche + authority signals. Refreshed monthly.",
                "structura",
              )
            : __(
                "Detect your site's niche and authority baseline.",
                "structura",
              )
        }
        action={
          <Button
            variant={ranAnalysis ? "transparent" : "primary"}
            size="sm"
            onClick={() => analyze.mutate()}
            disabled={analyze.isPending}
          >
            {analyze.isPending ? (
              <Loader2 size={14} className="mr-2 animate-spin" />
            ) : ranAnalysis ? (
              <RefreshCw size={14} className="mr-2" />
            ) : (
              <Sparkles size={14} className="mr-2" />
            )}
            {analyze.isPending
              ? __("Analyzing…", "structura")
              : ranAnalysis
              ? __("Refresh", "structura")
              : __("Analyze my site", "structura")}
          </Button>
        }
      />

      {ranAnalysis && domain && hasNicheData ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <dt className="m-0! text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              {__("Detected niche", "structura")}
            </dt>
            <dd className="m-0! mt-1! flex items-center gap-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">
              <Tag size={14} className="text-brand-500" />
              {domain.niche || __("Unclassified", "structura")}
            </dd>
            {/* Hide raw Google Product Category IDs — they render as
                meaningless numbers ("10012", "10004") with no
                ID→name lookup in place yet. Filter to entries that
                contain at least one non-digit. Once the taxonomy
                mapping or AI-derived niche lands, this filter drops. */}
            {(() => {
              const named = domain.categories.filter((c) => !/^\d+$/.test(c));
              if (named.length === 0) return null;
              return (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {named.slice(0, 3).map((cat) => (
                    <Badge key={cat} intent="info">
                      {cat}
                    </Badge>
                  ))}
                  {named.length > 3 ? (
                    <Tooltip title={named.slice(3).join(", ")}>
                      <Badge intent="default">+{named.length - 3}</Badge>
                    </Tooltip>
                  ) : null}
                </div>
              );
            })()}
          </div>
          {domain.authorityScore !== undefined ? (
            <div>
              <dt className="m-0! text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {__("Authority score", "structura")}
              </dt>
              <dd className="m-0! mt-1! flex items-center gap-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
                <Award size={16} className="text-brand-500" />
                {domain.authorityScore}
              </dd>
            </div>
          ) : domain.rankingKeywordCount !== undefined ? (
            <div>
              <dt className="m-0! text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {__("Ranking keywords", "structura")}
              </dt>
              <dd className="m-0! mt-1! flex items-center gap-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
                <Award size={16} className="text-brand-500" />
                {domain.rankingKeywordCount.toLocaleString()}
              </dd>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* "Ran analysis but no data exists" — important to distinguish
          from "never analyzed" so users don't think the action failed.
          DataForSEO returns this for sites Google doesn't track yet
          (new domains, ngrok tunnels, no organic traffic). */}
      {ranAnalysis && !hasNicheData ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="m-0! text-xs text-amber-700 dark:text-amber-300">
            {__(
              "Analysis ran, but no public search data is available for this domain yet. Common for new sites, low-traffic domains, or sites Google hasn't indexed recently.",
              "structura",
            )}
          </p>
          {query.data?.analyzedUrl ? (
            <p className="m-0! mt-2! text-xs text-amber-700 dark:text-amber-300">
              {__("Analyzed:", "structura")}{" "}
              <code className="font-mono">{query.data.analyzedUrl}</code>
              {query.data.analyzedUrlSource === "publicUrl"
                ? " " + __("(headless override from Site → Info)", "structura")
                : query.data.analyzedUrlSource === "homeUrl"
                ? " " + __("(WordPress home URL)", "structura")
                : null}
            </p>
          ) : null}
        </div>
      ) : null}

      {query.data?.reason === "unsupported_locale" && !ranAnalysis ? (
        <p className="m-0! text-xs text-amber-600 dark:text-amber-400">
          {__(
            "Enhanced data isn't available for this site's language yet.",
            "structura",
          )}
        </p>
      ) : null}
    </Card>
  );
};

export const SiteInfoTab = () => {
  const { isPaidLicense } = useLicense();

  return (
    <SitePageLayout>
      <div className="space-y-6">
        <PublicSiteCard />
        {isPaidLicense ? <PositioningCard /> : null}
        {isPaidLicense ? <SiteIntelligencePanel /> : null}
      </div>
    </SitePageLayout>
  );
};
