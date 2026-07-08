import React from "react";
import { X } from "lucide-react";
import { cn } from "../utils";
import { Badge, type BadgeProps } from "./Badge";

export interface TagProps extends BadgeProps {
  /** Called when the user clicks the remove button. Renders an X icon when provided. */
  onRemove?: () => void;
  /** Disables the remove button interaction. */
  disabled?: boolean;
}

/**
 * Tag — a removable Badge.
 *
 * Extends Badge with an optional dismiss button. When `onRemove` is
 * provided, right padding is tightened so the X icon sits flush inside
 * the pill shape.
 */
export const Tag: React.FC<TagProps> = ({
  children,
  className,
  onRemove,
  disabled,
  ...badgeProps
}) => {
  return (
    <Badge
      className={cn(
        "group/tag gap-1",
        // Tighten right padding when the remove button is present
        onRemove && "pr-1",
        className
      )}
      {...badgeProps}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          aria-label="Remove tag"
          onClick={onRemove}
          disabled={disabled}
          className={cn(
            "cursor-pointer rounded-full p-0.5 outline-none",
            // Transition with spring easing (design guide 6.4)
            "transition-all duration-normal ease-spring",
            // Opacity-based hover reveal
            "text-inherit opacity-60 hover:opacity-100",
            // Tactile hover surface
            "hover:bg-black/5 dark:hover:bg-white/10",
            // Focus — soft glow pattern (design guide 6.5)
            "focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.15)]",
            // Disabled
            "disabled:cursor-not-allowed disabled:opacity-40"
          )}
        >
          <X className="size-3 stroke-[3px]" />
        </button>
      )}
    </Badge>
  );
};
