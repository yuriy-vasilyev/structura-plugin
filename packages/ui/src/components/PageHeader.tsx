import React from "react";
import { cn } from "../utils";

/**
 * PageHeader — page-level hero used as the first block on every
 * primary route in the app.
 *
 * Three composable areas:
 *   - `Kicker`      — small uppercase label or breadcrumb above the title
 *                     (e.g. "Workspace · Acme").
 *   - `Title`       — H1, page-defining.
 *   - `Description` — one-line subtitle.
 *   - `Actions`     — right-aligned CTAs (Get Pro, Manage subscription…).
 *
 * Mobile stacks the actions below the text block; on `md` and up they
 * align right of the title row.
 *
 * Design guide: §3.5 Typography — H1 36–40px display weight. §3.6
 * Color — neutral-900 / neutral-400 description in light; neutral-50
 * / neutral-400 in dark.
 */

interface RootProps {
  children: React.ReactNode;
  className?: string;
}

const Root: React.FC<RootProps> = ({ children, className }) => (
  <header
    className={cn(
      "flex flex-col gap-6 md:flex-row md:items-end md:justify-between",
      className
    )}
  >
    {children}
  </header>
);
Root.displayName = "PageHeader.Root";

const Group: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => <div className={cn("min-w-0 space-y-2", className)}>{children}</div>;
Group.displayName = "PageHeader.Group";

const Kicker: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div
    className={cn(
      "flex items-center gap-1.5 text-xs font-bold tracking-wide text-neutral-500 uppercase",
      "dark:text-neutral-400",
      className
    )}
  >
    {children}
  </div>
);
Kicker.displayName = "PageHeader.Kicker";

const Title: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <h1
    className={cn(
      "text-3xl font-bold tracking-tight text-neutral-900 dark:text-white",
      className
    )}
  >
    {children}
  </h1>
);
Title.displayName = "PageHeader.Title";

const Description: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <p
    className={cn(
      "max-w-2xl text-sm text-neutral-500 dark:text-neutral-400",
      className
    )}
  >
    {children}
  </p>
);
Description.displayName = "PageHeader.Description";

const Actions: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div className={cn("flex flex-wrap items-center gap-3", className)}>{children}</div>
);
Actions.displayName = "PageHeader.Actions";

export const PageHeader = Object.assign(Root, {
  Group,
  Kicker,
  Title,
  Description,
  Actions,
});
