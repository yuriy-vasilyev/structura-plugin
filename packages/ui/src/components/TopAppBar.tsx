import React from "react";
import { cn } from "../utils";

/**
 * TopAppBar — the persistent identity + global-actions bar.
 *
 * Three composable slots, left-to-right:
 *   - `Start`   — logo, sidebar toggle on mobile, brand context.
 *   - `Context` — workspace switcher / tenant identity.
 *   - `End`     — global actions (language switcher, notifications, user menu).
 *
 * Renders at the top of the app on every breakpoint. Mobile collapses
 * the bar visually but keeps the same slot structure — `Context` and
 * `End` items shrink rather than disappear.
 *
 * Design guide reference: §5 Surfaces — surface chrome shares the
 * subtle frosted-glass + bottom border treatment we use elsewhere on
 * sticky chrome.
 */

interface TopAppBarProps {
  children: React.ReactNode;
  className?: string;
}

const Root: React.FC<TopAppBarProps> = ({ children, className }) => (
  <header
    className={cn(
      "sticky top-0 z-20 flex h-16 shrink-0 items-center gap-x-4 px-4 sm:px-6",
      "border-b border-neutral-200/80 bg-white/80 backdrop-blur-md",
      "dark:border-neutral-800/80 dark:bg-neutral-950/70",
      className
    )}
  >
    {children}
  </header>
);
Root.displayName = "TopAppBar.Root";

const Start: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => <div className={cn("flex items-center gap-3", className)}>{children}</div>;
Start.displayName = "TopAppBar.Start";

const Context: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div className={cn("flex min-w-0 flex-1 items-center", className)}>{children}</div>
);
Context.displayName = "TopAppBar.Context";

const End: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div className={cn("ml-auto flex items-center gap-1 sm:gap-2", className)}>
    {children}
  </div>
);
End.displayName = "TopAppBar.End";

export const TopAppBar = Object.assign(Root, {
  Start,
  Context,
  End,
});
