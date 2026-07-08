import { __, sprintf } from "@wordpress/i18n";
import { useMemo } from "react";
import {
  Bot,
  CalendarClock,
  Check,
  Lock,
  PenTool,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useCampaignForm } from "../../context/CampaignContext";
import { SummaryCard } from "../SummaryCard";
import { cronToHuman } from "@/utils/cronUtils";
import { parseSimpleFrequency } from "@/features/campaigns/utils/humanizedSchedule";
import { useLicense } from "@/features/settings";
import { usePersonasQuery } from "@/features/personas";
import { cn } from "@structura/ui";
// ─── Schedule Summary Sub-component ─────────────────────────────────────────
import { CampaignSchedule } from "@/features/campaigns/types";

// ─── Plan tier definitions ─────────────────────────────────────────────────
// Each tier has a color scheme and label for UI badges.
const PLAN_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  free: { label: "Free", bg: "bg-emerald-50", text: "text-emerald-600" },
  pro: { label: "Pro", bg: "bg-brand-50", text: "text-brand-600" },
  cloud: { label: "Cloud", bg: "bg-violet-50", text: "text-violet-600" },
};

/**
 * Compact row used in the summary cards to show a feature's status.
 *
 * States:
 * - enabled + unlocked: green ON
 * - disabled + unlocked: neutral OFF
 * - locked: lock icon + plan badge (e.g. "Pro") + dimmed row
 */
const FeatureRow = ({
  label,
  enabled,
  locked,
  requiredPlan,
}: {
  label: string;
  enabled: boolean;
  locked?: boolean;
  requiredPlan?: string;
}) => {
  const badge = requiredPlan ? PLAN_BADGES[requiredPlan] : undefined;

  return (
    <div className={cn("flex items-center justify-between py-1", locked && "opacity-70")}>
      <span
        className={cn(
          "text-[10px] font-bold uppercase",
          locked ? "text-neutral-400 line-through decoration-neutral-300" : "text-neutral-500"
        )}
      >
        {label}
      </span>

      {locked ? (
        <span className="flex items-center gap-1">
          <Lock size={9} className="text-neutral-300" />
          {badge && (
            <span
              className={cn(
                "rounded-lg px-1.5 py-0.5 text-[8px] font-black uppercase",
                badge.bg,
                badge.text
              )}
            >
              {badge.label}
            </span>
          )}
        </span>
      ) : (
        <span className="flex items-center gap-1">
          {enabled ? (
            <>
              <Check size={10} className="text-emerald-500" />
              <span className="text-[10px] font-black text-emerald-600 uppercase">
                {__("ON", "structura")}
              </span>
            </>
          ) : (
            <>
              <X size={10} className="text-neutral-300" />
              <span className="text-[10px] font-black text-neutral-300 uppercase">
                {__("OFF", "structura")}
              </span>
            </>
          )}
        </span>
      )}
    </div>
  );
};

// ─── Schedule Summary Sub-component ─────────────────────────────────────────

const ScheduleSummaryCard = ({
  schedule,
  postLength,
  isSimpleMode,
}: {
  schedule: CampaignSchedule;
  postLength: number;
  isSimpleMode: boolean;
}) => {
  const freq = parseSimpleFrequency(schedule.cron);

  // In simple mode with a detectable humanized pattern, show friendly summary
  const isHumanized = isSimpleMode && freq !== null;

  const lifecycleLabel =
    schedule.endCondition.type === "infinite"
      ? __("Infinite", "structura")
      : schedule.endCondition.type === "quota"
        ? sprintf(__("%s posts", "structura"), String(schedule.endCondition.value))
        : String(schedule.endCondition.value);

  return (
    <SummaryCard
      title={__("Schedule", "structura")}
      icon={<CalendarClock size={12} />}
      className="md:col-span-2"
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="space-y-0.5">
            <span className="text-[9px] font-black text-neutral-400 uppercase">
              {__("Rhythm", "structura")}
            </span>
            <div className="text-[11px] font-bold text-brand-600 dark:text-brand-400">
              {isHumanized
                ? sprintf(
                    __("%d %s per %s", "structura"),
                    freq.count,
                    freq.count === 1 ? __("post", "structura") : __("posts", "structura"),
                    freq.unit === "week" ? __("week", "structura") : __("month", "structura")
                  )
                : cronToHuman(schedule.cron)}
            </div>
          </div>
          <div className="space-y-0.5">
            <span className="text-[9px] font-black text-neutral-400 uppercase">
              {__("Post Length", "structura")}
            </span>
            <div className="text-[11px] font-bold text-neutral-700">
              ~{postLength} {__("words", "structura")}
            </div>
          </div>
          <div className="space-y-0.5">
            <span className="text-[9px] font-black text-neutral-400 uppercase">
              {__("Lifecycle", "structura")}
            </span>
            <div className="text-[11px] font-bold text-emerald-600">{lifecycleLabel}</div>
          </div>
        </div>

        {isHumanized && (
          <p className="m-0! text-[10px] leading-relaxed text-neutral-400 italic">
            {__(
              "Publishing days and times are randomized to create a natural, human-like rhythm.",
              "structura"
            )}
          </p>
        )}
      </div>
    </SummaryCard>
  );
};

// ─── Props ──────────────────────────────────────────────────────────────────

interface SimpleStepSummaryProps {
  /** When true, show the "smart defaults applied" helper text. */
  isSimpleMode?: boolean;
}

/**
 * Unified Summary Step — used in both Simple and Advanced modes.
 *
 * Shows:
 * - Strategy recap (objective, mode, provider, persona)
 * - Feature & SEO overview with premium teasing per plan tier
 * - Schedule recap (campaign mode only) — no raw cron string
 */
export const SimpleStepSummary = ({ isSimpleMode = false }: SimpleStepSummaryProps) => {
  const { formData, mode } = useCampaignForm();
  const { data: personas } = usePersonasQuery();
  const { isPaidLicense, isLicensed } = useLicense();

  const { identity, intelligence, structure, schedule } = formData;
  const isSingle = mode === "single";

  const personaName =
    intelligence.personaId === "random"
      ? __("Random persona", "structura")
      : personas?.find((p) => p.id === intelligence.personaId)?.name || __("Unknown", "structura");

  // Intelligence score — count against the form's own keys to avoid
  // mismatches between the client schema and the PHP registry.
  const seoEntries = Object.values(intelligence.seoRules || {});
  const activeRulesCount = seoEntries.filter(Boolean).length;
  const totalRulesCount = seoEntries.length || 1;
  const intelligenceScore = Math.min(100, Math.round((activeRulesCount / totalRulesCount) * 100));

  // Plan access flags
  const hasPro = isPaidLicense ?? false;
  const hasFree = isLicensed;

  /**
   * Feature list with correct plan gating.
   *
   * Two kinds of features:
   *
   *   1. **Always-on tier features** — readability, keyphrase optimisation,
   *      SERP analysis, meta generation, link validation. These are applied
   *      automatically server-side based on plan tier (see
   *      `ALWAYS_ON_RULES_BY_TIER` in
   *      `functions/src/ai/instruction-builder.ts`). They're shown as
   *      "enabled" whenever the user's tier covers them.
   *   2. **User-toggleable features** — structural choices like FAQ, Action
   *      Steps, statistics, number-in-title, internal/outbound links. These
   *      reflect `intelligence.seoRules` state.
   *
   * Pro and Cloud share the full feature set; the tier difference is managed
   * AI/credits, not SEO coverage.
   */
  const featureGroups = useMemo(() => {
    const features = [
      // ── Structure features ──────────────────────────────────────
      {
        label: __("Featured Images", "structura"),
        enabled: structure.featuredImage,
        locked: !hasFree && !hasPro,
        requiredPlan: "free",
      },
      {
        label: __("Body Images", "structura"),
        enabled: structure.bodyImages,
        locked: !hasPro,
        requiredPlan: "byok",
      },
      // ── Always-on (free tier) ───────────────────────────────────
      {
        label: __("Meta Title & Slug", "structura"),
        enabled: hasFree || hasPro,
        locked: !hasFree && !hasPro,
        requiredPlan: "free",
      },
      {
        label: __("Meta Description", "structura"),
        enabled: hasFree || hasPro,
        locked: !hasFree && !hasPro,
        requiredPlan: "free",
      },
      {
        label: __("Target Keyphrase", "structura"),
        enabled: hasFree || hasPro,
        locked: !hasFree && !hasPro,
        requiredPlan: "free",
      },
      // ── Always-on (Pro tier) ────────────────────────────────────
      {
        label: __("Keyphrase Optimization", "structura"),
        enabled: hasPro,
        locked: !hasPro,
        requiredPlan: "byok",
      },
      {
        label: __("Readability Rules", "structura"),
        enabled: hasPro,
        locked: !hasPro,
        requiredPlan: "byok",
      },
      {
        label: __("Competitor Gap Analysis", "structura"),
        enabled: hasPro,
        locked: !hasPro,
        requiredPlan: "byok",
      },
      {
        label: __("Semantic / LSI Optimization", "structura"),
        enabled: hasPro,
        locked: !hasPro,
        requiredPlan: "byok",
      },
      {
        label: __("Link Validation", "structura"),
        enabled: hasPro,
        locked: !hasPro,
        requiredPlan: "byok",
      },
      // ── User-toggleable structural features (Pro) ──────────────
      {
        label: __("Internal Linking", "structura"),
        enabled: intelligence.seoRules.internal_link_optimization,
        locked: !hasPro,
        requiredPlan: "byok",
      },
      {
        label: __("Authority Links", "structura"),
        enabled: intelligence.seoRules.outbound_link_authority,
        locked: !hasPro,
        requiredPlan: "byok",
      },
      {
        label: __("FAQ & Schema Markup", "structura"),
        enabled:
          intelligence.seoRules.include_faq_section && intelligence.seoRules.include_action_steps,
        locked: !hasPro,
        requiredPlan: "byok",
      },
    ];

    // Only show "locked" for features the user doesn't have access to
    return features.map((f) => ({
      ...f,
      // If user has access, never show as locked even if the feature is off
      locked: f.locked,
    }));
  }, [structure, intelligence.seoRules, hasPro, hasFree]);

  return (
    <div className="animate-in slide-in-from-right-4 space-y-4 duration-300">
      <div className="text-center">
        <h3 className="m-0! text-xl font-black tracking-tight text-neutral-900 dark:text-white uppercase">
          {__("Blueprint Review", "structura")}
        </h3>
        <p className="m-0! text-[11px] font-medium text-neutral-500">
          {isSimpleMode
            ? __(
                "Smart defaults have been applied. Switch to Advanced mode to customize every detail.",
                "structura"
              )
            : isSingle
              ? __("Verify your generation parameters before launching.", "structura")
              : __("Verify your autonomous parameters before deployment.", "structura")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* STRATEGY CARD */}
        <SummaryCard title={__("Strategy", "structura")} icon={<PenTool size={12} />}>
          <div className="space-y-3">
            {!isSingle && identity.name && (
              <div className="text-sm font-bold text-neutral-900">{identity.name}</div>
            )}
            <p className="m-0! line-clamp-3 text-[11px] leading-relaxed text-neutral-600">
              {identity.objective || __("No objective set", "structura")}
            </p>
            <div className="mt-3">
              <span className="text-[9px] font-black tracking-widest text-neutral-400 uppercase">
                {isSingle ? __("Content Goal", "structura") : __("Campaign Mode", "structura")}
              </span>
              <div className="mt-1">
                <span className="inline-block rounded-lg bg-brand-50 px-2 py-0.5 text-[9px] font-black text-brand-600 dark:bg-brand-950/30 dark:text-brand-400 uppercase">
                  {identity.campaignMode?.replace("_", " ") || "traffic magnet"}
                </span>
              </div>
            </div>
          </div>
        </SummaryCard>

        {/* ENGINE CARD */}
        <SummaryCard title={__("Engine", "structura")} icon={<Bot size={12} />}>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {intelligence.textProvider === "gemini" ? (
                <Sparkles size={12} className="text-brand-500 dark:text-brand-400" />
              ) : (
                <Bot size={12} className="text-brand-500 dark:text-brand-400" />
              )}
              <span className="text-xs font-bold text-neutral-900 uppercase">
                {intelligence.textProvider}
              </span>
            </div>
            {intelligence.textModel && (
              <div className="text-[10px] font-bold text-neutral-400">
                {intelligence.textModel}
                {intelligence.imageModel && ` · ${intelligence.imageModel}`}
              </div>
            )}
            <div className="flex items-center gap-1 pt-1">
              <span className="text-[9px] font-black text-neutral-400 uppercase">
                {__("Persona:", "structura")}
              </span>
              <span className="text-[10px] font-bold text-brand-600 dark:text-brand-400">{personaName}</span>
            </div>
          </div>
        </SummaryCard>

        {/* SEO & FEATURES CARD */}
        <SummaryCard
          title={__("Features & SEO", "structura")}
          icon={<Search size={12} />}
          className="md:col-span-2"
        >
          <div className="space-y-2">
            {/* Intelligence score bar */}
            <div className="flex items-center justify-between pb-1">
              <span className="text-[9px] font-black tracking-widest text-neutral-400 uppercase">
                {__("Intelligence Score", "structura")}
              </span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-1000"
                    style={{ width: `${intelligenceScore}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold text-emerald-600">{intelligenceScore}%</span>
              </div>
            </div>

            {/* Feature rows with plan-specific teasing */}
            <div className="grid grid-cols-2 gap-x-4">
              {featureGroups.map((feat) => (
                <FeatureRow
                  key={feat.label}
                  label={feat.label}
                  enabled={feat.enabled}
                  locked={feat.locked}
                  requiredPlan={feat.locked ? feat.requiredPlan : undefined}
                />
              ))}
            </div>
          </div>
        </SummaryCard>

        {/* SCHEDULE CARD (campaign only) */}
        {!isSingle && (
          <ScheduleSummaryCard
            schedule={schedule}
            postLength={intelligence.postLength}
            isSimpleMode={isSimpleMode}
          />
        )}
      </div>

      {/* FOOTER NOTE */}
      <div className="flex items-center gap-2 rounded-xl border border-brand-100/50 bg-brand-50/50 p-3 text-[10px] font-medium text-brand-700 dark:border-brand-900/30 dark:bg-brand-950/20 dark:text-brand-400 italic">
        <ShieldCheck size={14} className="shrink-0 text-brand-400 dark:text-brand-500" />
        {isSingle
          ? __(
              "Your post will be queued for generation immediately via the WordPress background pulse.",
              "structura"
            )
          : isSimpleMode
            ? __(
                "Smart defaults applied: all available blocks enabled, optimal post length, auto taxonomy. Switch to Advanced mode to customize.",
                "structura"
              )
            : __(
                "This roadmap will execute autonomously via the WordPress background pulse using the specified model logic.",
                "structura"
              )}
      </div>
    </div>
  );
};
