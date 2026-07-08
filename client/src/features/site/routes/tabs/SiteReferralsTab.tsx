/**
 * `/site/referrals` — site-level referral / partner links.
 *
 * The seed every new campaign on this site inherits. Its own tab (peer of
 * Competitors) rather than stacked under it — the two are unrelated concepts
 * and each carries its own Save. Uses the shared `ReferralLinksEditor` with
 * `binding="site"`, saved through the same site SEO-settings mutation.
 */
import { useEffect, useState } from "react";
import { __ } from "@wordpress/i18n";
import type { ReferralLink } from "@structura/types";
import { Button, Card, ReferralLinksEditor } from "@structura/ui";
import { Save } from "lucide-react";

import { useLicense } from "@/features/settings";
import { buildReferralLabels } from "@/utils/referralLabels";
import {
  useSiteAnalysisQuery,
  useUpdateSiteSeoSettingsMutation,
} from "@/features/site/api/useSiteAnalysis";
import { SitePageLayout } from "../SitePageLayout";
import { LockedPanel } from "../../components/LockedPanel";

const ReferralLinksEditorSection = () => {
  const query = useSiteAnalysisQuery();
  const update = useUpdateSiteSeoSettingsMutation();
  const saved = query.data?.seoIntelSettings?.referralLinks ?? [];
  const savedKey = JSON.stringify(saved);
  const [value, setValue] = useState<ReferralLink[]>(saved);
  // Reseed from the server whenever the persisted value changes (initial load,
  // post-save cache update). No refetch happens mid-edit, so this can't clobber
  // in-progress edits — same assumption the competitors draft relies on.
  useEffect(() => {
    setValue(query.data?.seoIntelSettings?.referralLinks ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);
  const dirty = JSON.stringify(value) !== savedKey;

  return (
    <Card className="flex flex-col gap-4 p-6">
      <ReferralLinksEditor
        binding="site"
        value={value}
        onChange={setValue}
        labels={buildReferralLabels()}
      />
      <div className="flex items-center justify-end gap-3">
        {dirty && (
          <span className="text-xs text-neutral-400">
            {__("Unsaved changes", "structura")}
          </span>
        )}
        <Button
          size="sm"
          onClick={() => update.mutate({ referralLinks: value })}
          disabled={!dirty}
          loading={update.isPending}
        >
          <Save size={14} />
          {__("Save", "structura")}
        </Button>
      </div>
    </Card>
  );
};

/**
 * Faded sample shown behind the free-tier lock — placeholder rows only, never
 * the user's real links (which stay editable-then-hidden for paid). Mirrors the
 * peer Competitors tab's `CompetitorsPreview`.
 */
const ReferralsPreview = () => (
  <Card className="flex flex-col gap-4 p-6">
    <h3 className="m-0! text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
      {__("Referral links", "structura")}
    </h3>
    <p className="m-0! text-sm text-neutral-500 dark:text-neutral-400">
      {__(
        "Your tracking links, woven into topically-relevant posts with AI-written anchor text.",
        "structura",
      )}
    </p>
    <ul className="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
      <li className="flex items-center justify-between gap-4 border-b border-neutral-100 pb-2 dark:border-neutral-800">
        <span>{__("TrailPass Pro", "structura")}</span>
        <span className="text-xs text-neutral-400">trailpass.example/ref</span>
      </li>
      <li className="flex items-center justify-between gap-4 pb-2">
        <span>{__("Summit Gear", "structura")}</span>
        <span className="text-xs text-neutral-400">summitgear.example/aff</span>
      </li>
    </ul>
  </Card>
);

export const SiteReferralsTab = () => {
  // Referral links are a paid feature — the cloud drops them from generation on
  // free tiers (`isPaidTier` guard). Gate the editor to match, exactly like the
  // peer Competitors/Settings tabs; before this the editor + Save rendered raw
  // for every tier, presenting a paid feature as fully usable.
  const { isPaidLicense } = useLicense();

  if (!isPaidLicense) {
    return (
      <SitePageLayout>
        <LockedPanel
          valueStatement={__(
            "Weave your affiliate and partner links into every relevant post.",
            "structura",
          )}
          detail={__(
            "Add your tracking URLs once and Structura places the right one into topically-matched posts — with AI-written anchor text.",
            "structura",
          )}
        >
          <ReferralsPreview />
        </LockedPanel>
      </SitePageLayout>
    );
  }

  return (
    <SitePageLayout>
      <ReferralLinksEditorSection />
    </SitePageLayout>
  );
};
