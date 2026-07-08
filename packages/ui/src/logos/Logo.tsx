import type { FC } from "react";
import { LogoFull } from "./LogoFull";
import { LogoIcon } from "./LogoIcon";

interface LogoProps {
  className?: string;
  view?: "full" | "icon";
  /**
   * `dark` — standard indigo mark for light/neutral surfaces.
   * `white` — inverted palette for dark (near-black) backgrounds.
   * `mono` — single white ink at stepped opacity for mid-tone/colored
   *   backgrounds (e.g. the brand-indigo auth panel); see design-guide §2.2.
   */
  variant?: "dark" | "white" | "mono";
}

export const Logo: FC<LogoProps> = ({ className, view = "full", variant = "dark" }) => {
  if (view === "icon") {
    return <LogoIcon className={className} variant={variant} />;
  }

  return <LogoFull className={className} variant={variant} />;
};
