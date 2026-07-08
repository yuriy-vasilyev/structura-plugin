import { useEffect, useState } from "react";
import { __ } from "@wordpress/i18n";
import { CalendarClock, Check, Clock, Infinity, Lock, Shuffle, SlidersHorizontal } from "lucide-react";
import dayjs from "@/libs/dayjs";

import { useCampaignForm } from "@/features/campaigns/context/CampaignContext";
import { useLicense } from "@/features/settings";
import { InputField, cn } from "@structura/ui";
import { cronToHuman } from "@/utils/cronUtils";
import {
  generateHumanizedSchedule,
  parseSimpleFrequency,
} from "@/features/campaigns/utils/humanizedSchedule";
import { ScheduleBuilder } from "../ScheduleBuilder";

type FrequencyUnit = "week" | "month";
type ScheduleMode = "humanized" | "manual";

const END_CONDITION_OPTIONS = [
  { value: "infinite", label: __("Run forever", "structura") },
  { value: "quota", label: __("Stop after N posts", "structura") },
  { value: "date", label: __("Stop on a date", "structura") },
];

/**
 * Simple Mode — Step 2: Publishing Rhythm
 *
 * Replaces the complex cron builder with a simple "how many posts per
 * week/month?" interface. The cron is generated automatically with
 * humanized jitter. Users can switch to manual mode to pick exact
 * days and times.
 */
export const SimpleStepRhythm = () => {
  const { formData, updateForm, isCreate } = useCampaignForm();
  const { isPaidLicense } = useLicense();

  // Smart scheduling can emit up to 7 posts/week, so it's a paid feature.
  // Lock it (and default to Manual) for Free in the create flow only —
  // editing an existing campaign defers to the server cadence gate.
  const lockSmart = !isPaidLicense && isCreate;

  // ── Local state ──────────────────────────────────────────────────────────
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(
    lockSmart ? "manual" : "humanized"
  );
  const [postsCount, setPostsCount] = useState(3);
  const [unit, setUnit] = useState<FrequencyUnit>("week");

  // Force Manual if the lock resolves after mount (the cloud heartbeat can
  // flip isPaidLicense once it lands). Manual mode is where the Free
  // weekly-cadence picker (single day, daily locked) lives.
  useEffect(() => {
    if (lockSmart && scheduleMode !== "manual") setScheduleMode("manual");
  }, [lockSmart, scheduleMode]);

  // Note: the pre-generation toggle (formData.schedule.pregenerationEnabled)
  // is rendered inside <CampaignAiEngineSection /> in the AI Engine
  // advanced-settings block — see CampaignAiEngineSection.tsx. The schedule
  // step intentionally doesn't surface it: pre-generation modifies the
  // engine, not the schedule, and pinning it next to the provider/model
  // pickers makes the relationship obvious.

  // ── Hydrate from existing cron (edit mode) ─────────────────────────────
  useEffect(() => {
    const parsed = parseSimpleFrequency(formData.schedule.cron);
    if (parsed) {
      setPostsCount(parsed.count);
      setUnit(parsed.unit);
    }
  }, []);

  // ── Generate humanized cron when frequency changes ─────────────────────
  useEffect(() => {
    if (scheduleMode !== "humanized") return;
    const { cron } = generateHumanizedSchedule(postsCount, unit);
    updateForm("schedule", { cron });
  }, [postsCount, unit, scheduleMode]);

  const endType = formData.schedule.endCondition.type;

  return (
    <div className="animate-in slide-in-from-right-4 space-y-6 duration-500">
      {/* ── SCHEDULE MODE TOGGLE ──────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-5 py-3 dark:border-neutral-800 dark:bg-neutral-800/50">
          <div className="flex items-center gap-2">
            <CalendarClock size={15} className="text-brand-600 dark:text-brand-400" />
            <span className="text-[10px] font-black tracking-widest text-neutral-900 uppercase dark:text-white">
              {__("Publishing Frequency", "structura")}
            </span>
          </div>

          {/* Humanized / Manual toggle */}
          <div className="flex gap-1 rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-800">
            <button
              type="button"
              disabled={lockSmart}
              aria-disabled={lockSmart}
              onClick={() => {
                if (!lockSmart) setScheduleMode("humanized");
              }}
              title={
                lockSmart
                  ? __("Smart scheduling is available on paid plans.", "structura")
                  : undefined
              }
              className={cn(
                "flex items-center gap-1 rounded-lg px-2.5 py-1 text-[9px] font-black uppercase transition-all duration-fast ease-out",
                lockSmart
                  ? "cursor-not-allowed text-neutral-300 dark:text-neutral-600"
                  : "cursor-pointer",
                !lockSmart && scheduleMode === "humanized"
                  ? "bg-white text-brand-600 shadow-sm dark:bg-neutral-700 dark:text-brand-400"
                  : !lockSmart &&
                      "text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
              )}
            >
              {lockSmart ? <Lock size={10} /> : <Shuffle size={10} />}
              {__("Smart", "structura")}
            </button>
            <button
              type="button"
              onClick={() => setScheduleMode("manual")}
              className={cn(
                "flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-[9px] font-black uppercase transition-all duration-fast ease-out",
                scheduleMode === "manual"
                  ? "bg-white text-brand-600 shadow-sm dark:bg-neutral-700 dark:text-brand-400"
                  : "text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
              )}
            >
              <SlidersHorizontal size={10} />
              {__("Manual", "structura")}
            </button>
          </div>
        </div>

        {/* ── HUMANIZED MODE ────────────────────────────────────────────── */}
        {scheduleMode === "humanized" && (
          <div className="space-y-5 p-5">
            {/* "How many posts per..." */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {__("Publish", "structura")}
              </span>

              {/* Count: 1 through 7 */}
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPostsCount(n)}
                    className={cn(
                      "flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border text-sm font-bold transition-all duration-fast ease-out",
                      postsCount === n
                        ? "border-brand-600 bg-brand-600/10 text-brand-600 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-400"
                        : "border-neutral-200 bg-white text-neutral-500 hover:border-brand-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-brand-500/40"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {postsCount === 1 ? __("post per", "structura") : __("posts per", "structura")}
              </span>

              {/* Unit selector */}
              <div className="flex gap-1.5">
                {(["week", "month"] as FrequencyUnit[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={cn(
                      "cursor-pointer rounded-lg border px-3 py-1.5 text-[10px] font-black uppercase transition-all duration-fast ease-out",
                      unit === u
                        ? "border-brand-600 bg-brand-600/10 text-brand-600 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-400"
                        : "border-neutral-200 bg-white text-neutral-500 hover:border-brand-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:border-brand-500/40"
                    )}
                  >
                    {u === "week" ? __("week", "structura") : __("month", "structura")}
                  </button>
                ))}
              </div>
            </div>

            {/* Info about humanized scheduling */}
            <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 dark:border-emerald-900/30 dark:bg-emerald-950/20">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                <Shuffle size={14} />
              </div>
              <div>
                <p className="m-0! text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                  {__("Humanized schedule active", "structura")}
                </p>
                <p className="m-0! text-[10px] leading-relaxed text-emerald-600/80 dark:text-emerald-400/70">
                  {__(
                    "Publishing days and times are randomized to create a natural rhythm. Posts will land at varied but reasonable hours across the period.",
                    "structura"
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── MANUAL MODE ───────────────────────────────────────────────── */}
        {scheduleMode === "manual" && (
          <div className="p-0">
            <ScheduleBuilder />
          </div>
        )}
      </div>

      {/* ── LIFECYCLE ─────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-5 py-3 dark:border-neutral-800 dark:bg-neutral-800/50">
          <Clock size={15} className="text-brand-600 dark:text-brand-400" />
          <span className="text-[10px] font-black tracking-widest text-neutral-900 uppercase dark:text-white">
            {__("Lifecycle", "structura")}
          </span>
        </div>

        <div className="space-y-4 p-5">
          {/* End condition type selector */}
          <div className="grid grid-cols-3 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
            {END_CONDITION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  updateForm("schedule", {
                    endCondition: {
                      type: opt.value as "infinite" | "quota" | "date",
                      value:
                        opt.value === "quota"
                          ? 30
                          : opt.value === "date"
                            ? dayjs().add(1, "month").format("YYYY-MM-DD")
                            : "",
                    },
                  })
                }
                className={cn(
                  "cursor-pointer rounded-lg py-2 text-[10px] font-black uppercase transition-all duration-fast ease-out",
                  endType === opt.value
                    ? "bg-white text-brand-600 shadow-sm dark:bg-neutral-700 dark:text-brand-400"
                    : "text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {endType === "quota" && (
            <div className="animate-in fade-in slide-in-from-top-1">
              <InputField
                label={__("Total posts to publish", "structura")}
                type="number"
                min="1"
                max="10000"
                value={formData.schedule.endCondition.value as number}
                onChange={(e) =>
                  updateForm("schedule", {
                    endCondition: { type: "quota", value: parseInt(e.target.value) || 1 },
                  })
                }
                rightAdornment={
                  <span className="text-[9px] font-black text-neutral-400 uppercase">
                    {__("posts", "structura")}
                  </span>
                }
              />
            </div>
          )}

          {endType === "date" && (
            <div className="animate-in fade-in slide-in-from-top-1">
              <InputField
                label={__("End date", "structura")}
                type="date"
                value={formData.schedule.endCondition.value as string}
                onChange={(e) =>
                  updateForm("schedule", {
                    endCondition: { type: "date", value: e.target.value },
                  })
                }
              />
            </div>
          )}

          {endType === "infinite" && (
            <div className="animate-in fade-in slide-in-from-top-1 flex items-center gap-2 rounded-lg border border-neutral-100 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-800/30">
              <Infinity size={14} className="text-neutral-400 dark:text-neutral-500" />
              <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
                {__("The campaign will run continuously until you pause or stop it.", "structura")}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
