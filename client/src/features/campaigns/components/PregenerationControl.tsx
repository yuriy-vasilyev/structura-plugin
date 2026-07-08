import { FC } from "react";
import { __ } from "@wordpress/i18n";
import { Lock, Sparkles, Zap } from "lucide-react";
import { isManagedPlan, type PlanId } from "@structura/types";
import { Switch, cn } from "@structura/ui";

import { useLicense } from "@/features/settings";

/**
 * Schedule-step affordance for the Phase 1.6 pre-generation feature.
 *
 * Three surfaces depending on tier:
 *
 * - **Pro / BYOK** — render a toggle. Users self-select into
 *   pre-generation; default ON for new Pro campaigns (see
 *   `DEFAULT_CAMPAIGN_FORM_DATA.schedule.pregenerationEnabled`). The
 *   value is bound to `formData.schedule.pregenerationEnabled` via
 *   the `onChange` prop.
 *
 * - **Free** — render a locked Pro-pill surface with no toggle. Pre-
 *   generation depends on the keyword bank (also Pro-locked) — every
 *   refill on a Free campaign skips with `keyword_bank_empty`, so a
 *   live toggle would be a UX trap (user enables it, nothing visibly
 *   happens). `getCampaignFormDataForLicense` defaults Free to
 *   `pregenerationEnabled: false` so form state matches what's
 *   rendered here.
 *
 * - **Managed (Cloud / Agency)** — render an info banner with no
 *   toggle. The pricing pages already promise instant publishes on
 *   managed tiers, so we don't expose an opt-out here. The cloud's
 *   `onCampaignCreated` trigger silently seeds stock; the banner just
 *   explains *why* their scheduled posts publish in <1s while Run Now
 *   still takes the usual 30-60s.
 *
 * The decision tree lives at this layer rather than in the schedule
 * step because the schedule step doesn't otherwise need to know about
 * plan tier — keeping the branch local makes it trivial to swap or
 * A/B-test the surface later.
 */
interface PregenerationControlProps {
  enabled: boolean;
  onChange: (next: boolean) => void;
  className?: string;
}

export const PregenerationControl: FC<PregenerationControlProps> = ({
  enabled,
  onChange,
  className,
}) => {
  const { plan, isPaidLicense } = useLicense();
  const isManaged = isManagedPlan(plan as PlanId);

  if (isManaged) {
    return <ManagedTierBanner className={className} />;
  }
  if (!isPaidLicense) {
    return <FreeTierLock className={className} />;
  }
  return <ByokToggle enabled={enabled} onChange={onChange} className={className} />;
};

const ByokToggle: FC<PregenerationControlProps> = ({ enabled, onChange, className }) => (
  <div
    className={cn(
      "flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900",
      className,
    )}
  >
    <div className="bg-brand-50 dark:bg-brand-950/40 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
      <Zap size={14} className="text-brand-600 dark:text-brand-400" />
    </div>
    <Switch
      className="flex-1"
      label={__("Pre-generate posts ahead of schedule", "structura")}
      description={__(
        "Save up to 50% on AI costs and publish in under a second. Scheduled posts are written ahead of time; Run Now still generates fresh on demand.",
        "structura",
      )}
      checked={enabled}
      onChange={onChange}
    />
  </div>
);

const FreeTierLock: FC<{ className?: string }> = ({ className }) => (
  <div
    className={cn(
      "flex items-start gap-3 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/40 p-4 dark:border-neutral-700 dark:bg-neutral-900/40",
      className,
    )}
  >
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
      <Lock size={14} className="text-neutral-400 dark:text-neutral-500" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <p className="m-0! text-sm font-bold text-neutral-600 dark:text-neutral-300">
          {__("Pre-generate posts ahead of schedule", "structura")}
        </p>
        <span className="from-brand-500 inline-flex items-center gap-1 rounded-full bg-gradient-to-r to-purple-500 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white uppercase">
          <Sparkles size={9} />
          {__("Pro", "structura")}
        </span>
      </div>
      <p className="m-0! mt-1 text-xs leading-relaxed text-neutral-400 dark:text-neutral-500">
        {__(
          "Upgrade to Pro to pre-generate scheduled posts ahead of time. Scheduled posts publish in under a second instead of waiting on AI synthesis.",
          "structura",
        )}
      </p>
    </div>
  </div>
);

const ManagedTierBanner: FC<{ className?: string }> = ({ className }) => (
  <div
    className={cn(
      "border-brand-200 bg-brand-50/50 dark:border-brand-800 dark:bg-brand-950/30 flex items-start gap-3 rounded-xl border px-4 py-3",
      className,
    )}
  >
    <div className="from-brand-500 shadow-brand-500/20 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br to-purple-500 shadow-sm">
      <Sparkles size={13} className="text-white" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="m-0! text-xs font-bold text-brand-700 dark:text-brand-300">
        {__("Instant publishes are on", "structura")}
      </p>
      <p className="m-0! mt-1 text-xs leading-relaxed text-brand-600/80 dark:text-brand-400/80">
        {__(
          "Your scheduled posts are pre-generated so they publish instantly. Run Now still generates fresh on demand for one-off posts.",
          "structura",
        )}
      </p>
    </div>
  </div>
);
