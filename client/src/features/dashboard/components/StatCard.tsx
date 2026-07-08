import { Card, cn } from "@structura/ui";

interface StatCardProps {
  label: string;
  value: string | number;
  subtext: string;
  variant: "brand" | "emerald" | "purple";
  trend?: string;
}

export const StatCard = ({ label, value, subtext, variant, trend }: StatCardProps) => {
  const borderColors = {
    brand: "border-l-brand-600",
    emerald: "border-l-emerald-500",
    purple: "border-l-purple-500",
  };

  return (
    <Card className={cn("rounded-lg border-l-4 p-6! shadow-sm", borderColors[variant])}>
      <p className="mt-0! mb-1! text-[10px] font-bold tracking-widest text-gray-400 uppercase">
        {label}
      </p>
      <div className="flex items-baseline gap-2">
        <h2 className="m-0! text-3xl! font-black! text-neutral-900 dark:text-white">{value}</h2>
        {trend && (
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
            {trend}
          </span>
        )}
      </div>
      <p className="mt-4! mb-0! font-mono text-xs text-gray-500 dark:text-gray-400">{subtext}</p>
    </Card>
  );
};
