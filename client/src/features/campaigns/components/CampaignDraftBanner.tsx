import { __, sprintf } from "@wordpress/i18n";
import { useNavigate } from "react-router";
import { ArrowRight, FileEdit, Trash2 } from "lucide-react";
import { Button } from "@structura/ui";
import { useCampaignDraftStore } from "@/features/campaigns/context/draftStore";
import dayjs from "@/libs/dayjs";

/**
 * Step-id → human label. Kept in sync with `ALL_STEPS` in
 * CreateCampaignPage.tsx; the banner only needs the label, not the icon
 * or the full definition, so we resolve it locally rather than coupling
 * to the route module.
 */
const STEP_LABEL: Record<string, string> = {
  interview: __("Interview", "structura"),
  strategy: __("Strategy", "structura"),
  keywords: __("Keywords", "structura"),
  authority: __("Authority", "structura"),
  rhythm: __("Rhythm", "structura"),
  summary: __("Summary", "structura"),
};

/**
 * Banner shown on /campaigns when a partially-filled new-campaign draft
 * is sitting in localStorage. Lets the user pick the wizard back up
 * exactly where they left off, or wipe the draft and start fresh.
 *
 * Returns `null` (renders nothing) when there's no draft, so the banner
 * can be unconditionally placed in the page tree without flicker.
 */
export const CampaignDraftBanner = () => {
  const navigate = useNavigate();
  const lastUpdatedAt = useCampaignDraftStore((s) => s.lastUpdatedAt);
  const formData = useCampaignDraftStore((s) => s.formData);
  const activeStep = useCampaignDraftStore((s) => s.activeStep);
  const discardDraft = useCampaignDraftStore((s) => s.discardDraft);

  if (lastUpdatedAt === null) return null;

  const name = formData.identity.name?.trim();
  const displayName = name && name.length > 0 ? name : __("Untitled draft", "structura");
  const stepLabel = STEP_LABEL[activeStep] ?? activeStep;
  const relative = dayjs(lastUpdatedAt).fromNow();

  return (
    <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-brand-200/70 bg-gradient-to-r from-brand-50/70 to-purple-50/50 px-5 py-4 sm:flex-row sm:items-center dark:border-brand-900/40 dark:from-brand-950/20 dark:to-purple-950/20">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
          <FileEdit size={16} />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="m-0! truncate text-sm font-semibold text-neutral-900 dark:text-white">
            {sprintf(
              /* translators: %s: draft campaign name (or "Untitled draft") */
              __("You have a draft campaign: %s", "structura"),
              displayName
            )}
          </p>
          <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
            {sprintf(
              /* translators: 1: step label (e.g. "Keywords"), 2: relative time (e.g. "5 minutes ago") */
              __("Stopped at %1$s · last edited %2$s", "structura"),
              stepLabel,
              relative
            )}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          variant="transparent"
          onClick={discardDraft}
          aria-label={__("Discard draft", "structura")}
        >
          <Trash2 size={14} className="mr-1.5" />
          {__("Discard", "structura")}
        </Button>
        <Button size="sm" onClick={() => navigate("/campaigns/new")}>
          {__("Resume", "structura")}
          <ArrowRight size={14} className="ml-1.5" />
        </Button>
      </div>
    </div>
  );
};
