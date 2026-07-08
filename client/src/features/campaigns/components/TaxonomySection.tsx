import { Info, OctagonX } from "lucide-react";
import { __ } from "@wordpress/i18n";
import { cn } from "@structura/ui";

type TaxonomyMode = "auto" | "restricted" | "disabled";

interface TaxonomySectionProps {
  title: string;
  icon: React.ReactNode;
  mode: TaxonomyMode;
  setMode: (mode: TaxonomyMode) => void;
  items: any[];
  selected: number[];
  setSelected: (ids: number[]) => void;
}

/**
 * TAXONOMY CONTROL COMPONENT
 */
export const TaxonomySection = ({
  title,
  icon,
  mode,
  setMode,
  items,
  selected,
  setSelected,
}: TaxonomySectionProps) => (
  <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
        {icon}
        <span className="text-xs font-black tracking-widest text-neutral-900 uppercase dark:text-white">
          {title}
        </span>
      </div>
      <div className="flex rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
        <button
          onClick={() => setMode("auto")}
          className={cn(
            "rounded-lg px-3 py-1 text-[10px] font-black transition-all",
            mode === "auto" ? "bg-white text-brand-600 shadow-sm dark:bg-neutral-700 dark:text-brand-400" : "cursor-pointer text-neutral-400"
          )}
        >
          {__("Autonomous", "structura")}
        </button>
        <button
          onClick={() => setMode("restricted")}
          className={cn(
            "rounded-lg px-3 py-1 text-[10px] font-black transition-all",
            mode === "restricted" ? "bg-white text-brand-600 shadow-sm dark:bg-neutral-700 dark:text-brand-400" : "cursor-pointer text-neutral-400"
          )}
        >
          {__("Restricted", "structura")}
        </button>
        <button
          onClick={() => setMode("disabled")}
          className={cn(
            "rounded-lg px-3 py-1 text-[10px] font-black transition-all",
            mode === "disabled" ? "bg-white text-rose-500 shadow-sm dark:bg-neutral-700 dark:text-rose-400" : "cursor-pointer text-neutral-400"
          )}
        >
          {__("Disabled", "structura")}
        </button>
      </div>
    </div>

    {mode === "restricted" && (
      <div className="animate-in fade-in mt-4 grid max-h-32 grid-cols-2 gap-2 overflow-y-auto duration-300">
        {items.map((item: any) => (
          <label
            key={item.id}
            className={cn("flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-50 p-2 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800")}
          >
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...selected, item.id]
                  : selected.filter((id: number) => id !== item.id);
                setSelected(next);
              }}
              className="rounded border-neutral-300 text-brand-600 dark:border-neutral-600 dark:bg-neutral-800"
            />
            <span className="truncate text-[11px] font-bold text-neutral-600">{item.name}</span>
          </label>
        ))}
      </div>
    )}

    {mode === "auto" && (
      <div className="mt-2 flex items-start gap-3 rounded-xl bg-brand-50/50 p-4 dark:bg-brand-950/20">
        <Info size={16} className="mt-0.5 shrink-0 text-brand-400 dark:text-brand-400" />
        <p className="m-0! text-[11px] leading-relaxed font-medium text-brand-700 dark:text-brand-300">
          {__(
            "The AI will scan your current site taxonomy and autonomously choose or create relevant terms based on the article context.",
            "structura"
          )}
        </p>
      </div>
    )}

    {mode === "disabled" && (
      <div className="animate-in fade-in mt-2 flex items-start gap-3 rounded-xl bg-neutral-50 p-4 duration-300">
        <OctagonX size={16} className="mt-0.5 shrink-0 text-neutral-400" />
        <p className="m-0! text-[11px] leading-relaxed font-medium text-neutral-500">
          {__(
            "No terms will be assigned automatically. You can set them manually on each post after publishing.",
            "structura"
          )}
        </p>
      </div>
    )}
  </div>
);
