import { __, sprintf } from "@wordpress/i18n";
import { Bot, CalendarClock, FolderOpen, PenTool, ShieldCheck } from "lucide-react";
import { useCampaignForm } from "../../context/CampaignContext";
import { SummaryCard } from "../SummaryCard";
import { LocalTimeDisplay } from "../LocalTimeDisplay";
import { cronToHuman, parseCronForUi } from "@/utils/cronUtils";
import { useMemo } from "react";
import { useSeoRules } from "@/features/settings";
import { usePersonasQuery } from "@/features/personas";
import { taxonomyModeLabel } from "@/features/campaigns/labels";

export const StepSummary = () => {
  const { formData, mode } = useCampaignForm();
  const { rules } = useSeoRules();
  const { data: personas } = usePersonasQuery();

  const { identity, intelligence, taxonomy, structure, schedule } = formData;

  const personaName =
    intelligence.personaId === "random"
      ? "Random"
      : personas?.find((p) => p.id === intelligence.personaId)?.name || "Unknown";

  const ui = useMemo(() => parseCronForUi(schedule.cron), [schedule.cron]);

  const activeRulesCount = Object.values(intelligence.seoRules || {}).filter(Boolean).length;
  const totalRulesCount = Object.keys(rules ?? {}).length || 1;
  const intelligenceScore = Math.round((activeRulesCount / totalRulesCount) * 100);

  return (
    <div className="animate-in slide-in-from-right-4 space-y-4 duration-normal">
      <div className="text-center">
        <h3 className="m-0! text-xl font-black tracking-tight text-neutral-900 uppercase">
          {__("Blueprint Review", "structura")}
        </h3>
        <p className="m-0! text-[11px] font-medium text-neutral-500">
          {mode === "single"
            ? __("Verify your generation parameters before launching.", "structura")
            : __("Verify your autonomous parameters before deployment.", "structura")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* ARCHITECTURE CLUSTER */}
        <SummaryCard
          title={__("Architecture", "structura")}
          icon={<PenTool size={12} />}
          className="md:col-span-2"
        >
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="space-y-2">
              {mode !== "single" && (
                <div className="text-sm font-bold text-neutral-900">{identity.name}</div>
              )}
              <div className="flex items-center gap-1">
                <Bot size={12} className="text-brand-500" />
                <span className="text-neutral-900">{intelligence.textProvider}</span>
              </div>
              <div className="flex flex-col text-[10px] font-bold text-neutral-400 uppercase">
                {intelligence.textModel && <div>• {intelligence.textModel}</div>}
                {intelligence.imageModel && <div>• {intelligence.imageModel}</div>}
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex flex-col items-end gap-1 border-t border-neutral-50 pt-3 sm:border-0 sm:pt-0">
                <div className="text-[9px] font-black tracking-widest text-neutral-400 uppercase">
                  {__("Intelligence Score", "structura")}
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-1000"
                      style={{ width: `${intelligenceScore}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600">
                    {intelligenceScore}%
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-black tracking-widest text-neutral-400 uppercase">
                  {__("Persona", "structura")}
                </div>
                <div className="text-[11px] font-bold text-emerald-600">{personaName}</div>
              </div>
            </div>
          </div>
        </SummaryCard>

        {/* MAPPING & VISUALS */}
        <SummaryCard title={__("Mapping", "structura")} icon={<FolderOpen size={12} />}>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-[10px] font-bold uppercase">
              <span className="text-neutral-400">{__("Taxonomy", "structura")}</span>
              <span className="text-brand-600">{taxonomyModeLabel(taxonomy.categories.mode)}</span>
            </div>
            {/* Split Visual Status */}
            <div className="flex justify-between text-[10px] font-bold uppercase">
              <span className="text-neutral-400">{__("Featured Image", "structura")}</span>
              <span className={structure.featuredImage ? "text-emerald-600" : "text-neutral-300"}>
                {structure.featuredImage ? __("ON", "structura") : __("OFF", "structura")}
              </span>
            </div>
            <div className="flex justify-between text-[10px] font-bold uppercase">
              <span className="text-neutral-400">{__("Body Images", "structura")}</span>
              <span className={structure.bodyImages ? "text-emerald-600" : "text-neutral-300"}>
                {structure.bodyImages ? __("ON", "structura") : __("OFF", "structura")}
              </span>
            </div>
          </div>
        </SummaryCard>

        {/* SCHEDULE CLUSTER */}
        {mode !== "single" && (
          <SummaryCard
            title={__("Pulse Timing", "structura")}
            icon={<CalendarClock size={12} />}
            className="md:col-span-3"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <span className="text-[9px] font-black text-neutral-400 uppercase">
                  {__("Schedule", "structura")}
                </span>
                <div className="text-[11px] font-bold text-brand-600 uppercase">
                  {cronToHuman(schedule.cron)}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-black text-neutral-400 uppercase">
                  {__("Local Time", "structura")}
                </span>
                <div className="text-[11px] font-bold text-neutral-900">
                  <LocalTimeDisplay utcTime={ui?.time || "00:00"} />
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-black text-neutral-400 uppercase">
                  {__("System Cron", "structura")}
                </span>
                <code className="block text-[10px] text-neutral-500">{schedule.cron}</code>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-black text-neutral-400 uppercase">
                  {__("Termination", "structura")}
                </span>
                <div className="text-[11px] font-bold text-emerald-600">
                  {schedule.endCondition.type === "infinite"
                    ? __("Infinite", "structura")
                    : schedule.endCondition.type === "quota"
                      ? sprintf(
                          __("%s Blueprints", "structura"),
                          schedule.endCondition.value as string
                        )
                      : schedule.endCondition.value}
                </div>
              </div>
            </div>
          </SummaryCard>
        )}
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-brand-100/50 bg-brand-50/50 p-3 text-[10px] font-medium text-brand-700 italic dark:border-brand-900/50 dark:bg-brand-950/50 dark:text-brand-300">
        <ShieldCheck size={14} className="shrink-0 text-brand-400 dark:text-brand-600" />
        {mode === "single"
          ? __(
              "Your post will be queued for generation immediately via the WordPress background pulse.",
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
