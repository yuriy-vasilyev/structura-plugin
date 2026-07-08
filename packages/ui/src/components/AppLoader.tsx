import { cn } from "../utils";

interface AppLoaderProps {
  text?: string;
  variant?: "white" | "dark";
}

/**
 * Full-page brand loader — shown during app bootstrap.
 *
 * Uses the "Ascending Overlap" logo mark with staggered pulse
 * animations on each layer (foundation → structure → peak).
 *
 * Logo layer fills use the logo-* tokens from theme.css.
 */
export const AppLoader = ({ text = "Initializing core...", variant = "white" }: AppLoaderProps) => {
  return (
    <div
      className={cn(
        "flex min-h-dvh flex-col items-center justify-center transition-colors duration-300",
        variant === "dark"
          ? "bg-neutral-950 text-neutral-200"
          : "bg-white text-neutral-900"
      )}
    >
      {/* Animated Logo SVG — Ascending Overlap */}
      <div className="relative mb-8 h-24 w-24">
        <svg width="100%" height="100%" viewBox="0 0 100 100" fill="none">
          {/* Layer 1: Foundation — bottom-left, widest, darkest */}
          <rect
            x="8"
            y="54"
            width="54"
            height="24"
            rx="6"
            className="animate-[pulse_1.5s_ease-in-out_infinite] fill-logo-foundation dark:fill-brand-400"
          />

          {/* Layer 2: Structure — offset right + up */}
          <rect
            x="24"
            y="34"
            width="48"
            height="24"
            rx="6"
            className="animate-[pulse_1.5s_ease-in-out_infinite] fill-logo-structure dark:fill-brand-300"
            style={{ animationDelay: "0.2s" }}
          />

          {/* Layer 3: Peak — top-right, smallest, brightest */}
          <rect
            x="40"
            y="14"
            width="42"
            height="24"
            rx="6"
            className="animate-[pulse_1.5s_ease-in-out_infinite] fill-logo-peak dark:fill-brand-200"
            style={{ animationDelay: "0.4s" }}
          />
        </svg>
      </div>

      {/* Text & Progress */}
      <div className="flex flex-col items-center gap-2">
        <span className="text-sm font-black tracking-[0.18em] uppercase text-neutral-900 dark:text-neutral-100">
          Structura
        </span>

        <div className="h-1 w-24 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div className="animate-shimmer h-full w-1/3 bg-brand-600 dark:bg-brand-400" />
        </div>

        <span className="mt-1 font-mono text-xs text-neutral-400 dark:text-neutral-500">{text}</span>
      </div>
    </div>
  );
};
