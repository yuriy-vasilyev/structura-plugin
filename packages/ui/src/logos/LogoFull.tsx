import type { FC } from "react";
import { cn } from "../utils";
import { LogoIcon } from "./LogoIcon";

interface LogoFullProps {
  className?: string;
  variant?: "dark" | "white" | "mono";
  /** Enable gradient + shadow rendering on the icon (use at sizes >= 48px). */
  gradient?: boolean;
}

/**
 * Full Structura logo — icon mark + "STRUCTURA" wordmark.
 *
 * The wordmark uses Inter Black (font-weight 900), tracking-[0.18em], uppercase
 * to match the "overline" label pattern used throughout the Structura UI.
 */
export const LogoFull: FC<LogoFullProps> = ({ className, variant = "dark", gradient = true }) => {
  return (
    <div className={cn("flex w-fit shrink-0 items-center gap-3", className)}>
      <LogoIcon className="h-9 w-9" variant={variant} gradient={gradient} />

      <span
        className={cn(
          "font-sans text-sm leading-none font-black tracking-[0.18em] uppercase",
          // White wordmark for both the dark-bg (`white`) and colored-bg
          // (`mono`) marks; neutral/adaptive only for the standard `dark`.
          variant === "dark" ? "text-neutral-900 dark:text-white" : "text-white"
        )}
      >
        Structura
      </span>
    </div>
  );
};
