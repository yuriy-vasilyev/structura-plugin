import { useEffect, useState } from "react";
import { __ } from "@wordpress/i18n";
import { ArrowUpRight, CalendarClock, Check, Lock } from "lucide-react";
import { useCampaignForm } from "@/features/campaigns/context/CampaignContext";
import { useLicense } from "@/features/settings";
import { buildPortalSignupUrl } from "@/utils/portalLinks";
import { cronToHuman, parseCronForUi } from "@/utils/cronUtils";
import { LocalTimeDisplay } from "./LocalTimeDisplay";
import { InputField, cn } from "@structura/ui";

export const ScheduleBuilder = () => {
  const { formData, updateForm, isCreate } = useCampaignForm();
  const { isPaidLicense, plan } = useLicense();

  // Free / unlicensed plans publish at most once a week
  // (MAX_POSTS_PER_WEEK_FOR_TIER). We lock the sub-weekly options in the
  // CREATE flow only — editing an existing campaign defers to the
  // grandfather-aware server gate so a current daily campaign isn't
  // silently rewritten just by opening the editor.
  const lockCadence = !isPaidLicense && isCreate;

  const upgradeUrl = buildPortalSignupUrl({
    intent: "unlock_cadence",
    domain: typeof window !== "undefined" ? window.location.hostname : undefined,
    plan,
  });

  // Access the nested schedule cluster.
  // Note: pregenerationEnabled lives on schedule semantically (it
  // governs how scheduled posts are produced) but its UI control
  // (<PregenerationControl />) is rendered inside the AI Engine
  // section because that's where users go to pick provider, model,
  // and fallback — pre-generation belongs in the same conceptual
  // group. See CampaignAiEngineSection.tsx.
  const { cron: currentCron } = formData.schedule;

  // 1. Local UI State (Decoupled from context to prevent input lag)
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [time, setTime] = useState("09:00");
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [dayOfMonth, setDayOfMonth] = useState(1);

  const dayLabels = [
    { label: __("Mon", "structura"), val: 1 },
    { label: __("Tue", "structura"), val: 2 },
    { label: __("Wed", "structura"), val: 3 },
    { label: __("Thu", "structura"), val: 4 },
    { label: __("Fri", "structura"), val: 5 },
    { label: __("Sat", "structura"), val: 6 },
    { label: __("Sun", "structura"), val: 0 },
  ];

  /**
   * 2. Hydrate from Context (Edit Mode)
   * Pulls from the nested schedule.cron path
   */
  useEffect(() => {
    if (currentCron) {
      const parsed = parseCronForUi(currentCron);
      if (parsed) {
        setFrequency(parsed.frequency);
        setTime(parsed.time);
        setDays(parsed.days);
        setDayOfMonth(parsed.dayOfMonth);
      }
    }
  }, []); // Run once on mount

  /**
   * 3. Sync to Context
   * Compiles local UI state into a valid CRON and saves to the 'schedule' cluster
   */
  useEffect(() => {
    const [hours, minutes] = time.split(":").map(Number);
    let cron = "";

    switch (frequency) {
      case "daily":
        cron = `${minutes} ${hours} * * *`;
        break;
      case "weekly":
        cron = `${minutes} ${hours} * * ${days.length ? days.sort().join(",") : "*"}`;
        break;
      case "monthly":
        cron = `${minutes} ${hours} ${dayOfMonth} * *`;
        break;
    }

    // Only update if the string has actually changed to prevent loop
    if (cron !== currentCron) {
      updateForm("schedule", { cron });
    }
  }, [frequency, time, days, dayOfMonth, currentCron, updateForm]);

  /**
   * Enforce the Free weekly cap in the picker: no daily cadence, exactly
   * one publishing weekday. Kept as an effect (not just initial state)
   * because `isPaidLicense` can flip false→true mid-flow once the cloud
   * heartbeat resolves, and because the hydrate-from-cron effect above
   * may have seeded a multi-day default before the lock was known.
   */
  useEffect(() => {
    if (!lockCadence) return;
    if (frequency === "daily") setFrequency("weekly");
    if (days.length > 1) setDays((prev) => [[...prev].sort((a, b) => a - b)[0]]);
  }, [lockCadence, frequency, days]);

  const toggleDay = (val: number) => {
    if (lockCadence) {
      // Free: a single publishing day per week. Picking a day replaces
      // the current selection instead of adding to it.
      setDays([val]);
      return;
    }
    setDays((prev) => (prev.includes(val) ? prev.filter((d) => d !== val) : [...prev, val]));
  };

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-6 py-3 dark:border-neutral-700 dark:bg-neutral-800">
        <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
          <CalendarClock size={16} />
          <span className="text-[10px] font-black tracking-widest text-neutral-900 dark:text-white uppercase">
            {__("Deployment Pulse", "structura")}
          </span>
        </div>
      </div>

      <div className="space-y-6 p-6">
        {/* Frequency Navigation */}
        <div className="grid grid-cols-3 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
          {(["daily", "weekly", "monthly"] as const).map((f) => {
            // Daily is >1 post/week, so it's locked on capped plans.
            const locked = lockCadence && f === "daily";
            return (
              <button
                key={f}
                type="button"
                disabled={locked}
                aria-disabled={locked}
                onClick={() => {
                  if (!locked) setFrequency(f);
                }}
                title={
                  locked
                    ? __("Daily publishing is available on paid plans.", "structura")
                    : undefined
                }
                className={cn(
                  "flex items-center justify-center gap-1 rounded-lg py-2 text-[10px] font-black uppercase transition-all duration-fast",
                  locked
                    ? "cursor-not-allowed text-neutral-300 dark:text-neutral-600"
                    : "cursor-pointer",
                  !locked && frequency === f
                    ? "bg-white text-brand-600 shadow-sm dark:bg-neutral-700 dark:text-brand-400"
                    : !locked &&
                        "text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-400"
                )}
              >
                {locked && <Lock size={9} />}
                {__(f, "structura")}
              </button>
            );
          })}
        </div>

        {/* Free-plan cadence cap — Go Pro CTA */}
        {lockCadence && (
          <a
            href={upgradeUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-xl border border-brand-100 bg-brand-50/50 px-3 py-2.5 text-[11px] font-medium text-brand-700 transition-colors hover:bg-brand-50 dark:border-brand-900/30 dark:bg-brand-950/20 dark:text-brand-300 dark:hover:bg-brand-950/40"
          >
            <Lock size={12} className="shrink-0" />
            <span className="flex-1">
              {__(
                "Free plans publish one post a week. Go Pro for daily and Smart scheduling.",
                "structura"
              )}
            </span>
            <ArrowUpRight size={14} className="shrink-0" />
          </a>
        )}

        {/* Weekly Day Picker */}
        {frequency === "weekly" && (
          <div className="animate-in fade-in slide-in-from-top-1 space-y-3 duration-300">
            <div className="flex justify-between gap-1.5">
              {dayLabels.map((d) => (
                <button
                  key={d.val}
                  type="button"
                  onClick={() => toggleDay(d.val)}
                  className={cn(
                    "h-10 flex-1 cursor-pointer rounded-lg border text-[11px] font-bold transition-all",
                    days.includes(d.val)
                      ? "border-brand-600 bg-brand-600/10 text-brand-600 dark:border-brand-400 dark:bg-brand-950/20 dark:text-brand-400"
                      : "border-neutral-200 bg-white text-neutral-500 hover:border-brand-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-brand-400"
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Monthly Input */}
        {frequency === "monthly" && (
          <div className="animate-in fade-in slide-in-from-top-1 space-y-3 duration-300">
            <InputField
              label={__("Specific Day of Month", "structura")}
              type="number"
              min="1"
              max="31"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(parseInt(e.target.value))}
              className="max-w-xs"
              inputClassName="font-mono font-bold text-brand-600 dark:text-brand-400"
              rightAdornment={
                <span className="text-[9px] font-black text-neutral-400 uppercase">
                  {__("Day", "structura")}
                </span>
              }
            />
          </div>
        )}

        {/* Time Integration */}
        <div className="flex items-center justify-between border-t border-neutral-100 pt-6">
          <div className="flex flex-col">
            <span className="text-[9px] font-black tracking-widest text-neutral-400 uppercase">
              {__("Execution Window", "structura")}
            </span>
            <LocalTimeDisplay utcTime={time} />
          </div>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-bold text-neutral-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:border-brand-400 dark:focus:ring-brand-400"
          />
        </div>
      </div>

      {/* Summary Footer */}
      <div className="border-t border-neutral-100 bg-brand-50/30 p-4 dark:border-neutral-700 dark:bg-brand-950/10">
        <div className="flex items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-600">
            <Check size={16} />
          </div>
          <div className="overflow-hidden">
            <p className="text-[9px] font-black tracking-widest text-neutral-400 uppercase">
              {__("Parsed Autonomous Rhythm", "structura")}
            </p>
            <p className="truncate text-xs font-bold text-brand-900 dark:text-brand-300">{cronToHuman(currentCron)}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
