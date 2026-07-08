import { ReactNode } from "react";
import { cn } from "@structura/ui";

interface SummaryCardProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}

export const SummaryCard = ({ title, icon, children, className }: SummaryCardProps) => (
  <div
    className={cn("flex flex-col rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm transition-all hover:border-brand-100 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-brand-900/30", className)}
  >
    <div className="mb-3 flex items-center gap-2">
      <div className="flex size-6 items-center justify-center rounded-lg bg-neutral-50 text-brand-600 dark:bg-neutral-800 dark:text-brand-400">
        {icon}
      </div>
      <h4 className="m-0! text-[10px] font-black tracking-widest text-neutral-400 dark:text-neutral-500 uppercase">
        {title}
      </h4>
    </div>
    <div className="space-y-1">{children}</div>
  </div>
);
