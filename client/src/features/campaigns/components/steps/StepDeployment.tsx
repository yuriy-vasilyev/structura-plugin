import { __ } from "@wordpress/i18n";
import { ScheduleBuilder } from "../ScheduleBuilder";
import { useCampaignForm } from "@/features/campaigns/context/CampaignContext";
import { cn } from "@structura/ui";

export const StepDeployment = () => {
  const { formData, updateForm } = useCampaignForm();

  // Extract specific cluster for clean mapping
  const { schedule } = formData;
  const { endCondition } = schedule;

  /**
   * Updates the termination mode and resets value if necessary
   */
  const handleModeChange = (mode: "infinite" | "quota" | "date") => {
    updateForm("schedule", {
      endCondition: {
        type: mode,
        // Reset to sensible defaults based on mode
        value: mode === "quota" ? 10 : mode === "date" ? "" : "infinite",
      },
    });
  };

  return (
    <div className="animate-in slide-in-from-right-4 space-y-8 duration-normal">
      <div className="space-y-6">
        {/* 2. Recurrence (The Cron Builder) */}
        {/* Ensure ScheduleBuilder is updated to handle formData.schedule.cron */}
        <ScheduleBuilder />

        {/* 3. Termination Logic (End Condition) */}
        <div className="space-y-4 rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
          <label className="text-[10px] font-black tracking-widest text-neutral-400 uppercase">
            {__("Lifecycle Termination", "structura")}
          </label>

          <div className="grid grid-cols-3 gap-2 rounded-lg bg-neutral-50 p-1 dark:bg-neutral-900">
            {(["infinite", "quota", "date"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleModeChange(mode)}
                className={cn(
                  "cursor-pointer rounded-lg py-2.5 text-[10px] font-black uppercase transition-all duration-fast",
                  endCondition.type === mode
                    ? "bg-white text-brand-600 shadow-sm ring-1 ring-black/5 dark:bg-neutral-800 dark:text-brand-400 dark:ring-white/10"
                    : "text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-400"
                )}
              >
                {__(mode, "structura")}
              </button>
            ))}
          </div>

          {/* Dynamic Termination Inputs */}
          <div className="min-h-[60px]">
            {endCondition.type === "quota" && (
              <div className="animate-in fade-in slide-in-from-top-2 flex items-center gap-3 pt-2 duration-fast">
                <input
                  type="number"
                  min={1}
                  value={endCondition.value as number}
                  onChange={(e) =>
                    updateForm("schedule", {
                      endCondition: { ...endCondition, value: parseInt(e.target.value) },
                    })
                  }
                  className="w-24 rounded-lg border-none bg-neutral-100 p-2 text-center font-bold text-neutral-900 focus:ring-2 focus:ring-brand-500 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:ring-brand-400"
                />
                <span className="text-xs font-bold tracking-widest text-neutral-400 uppercase">
                  {__("Total Blueprints then Archiving", "structura")}
                </span>
              </div>
            )}

            {endCondition.type === "date" && (
              <div className="animate-in fade-in slide-in-from-top-2 pt-2 duration-fast">
                <input
                  type="date"
                  value={endCondition.value as string}
                  onChange={(e) =>
                    updateForm("schedule", {
                      endCondition: { ...endCondition, value: e.target.value },
                    })
                  }
                  className="w-full rounded-lg border-none bg-neutral-100 p-2 font-bold text-neutral-900 focus:ring-2 focus:ring-brand-500 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:ring-brand-400"
                />
              </div>
            )}

            {endCondition.type === "infinite" && (
              <p className="animate-in fade-in pt-4 text-center text-[11px] font-medium text-neutral-400 italic">
                {__(
                  "This roadmap will continue producing content until manually paused.",
                  "structura"
                )}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
