import {
  Popover as HeadlessPopover,
  PopoverButton,
  PopoverPanel,
  PopoverBackdrop,
} from "@headlessui/react";
import React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../utils";

/**
 * Popover — generic floating panel anchored to a trigger.
 *
 * Used wherever the contents aren't a simple action menu (workspace
 * switcher, user-card detail, info panels). For action-list dropdowns
 * prefer DropdownMenu — it ships keyboard semantics, focus rings, and
 * roving tab-index out of the box.
 *
 * Mirrors the Select content surface (rounded-xl, frosted dark glass
 * edge) so a popover dropped next to a Select reads as part of the
 * same family.
 */

type RootProps = Omit<React.ComponentProps<typeof HeadlessPopover>, "children"> & {
  /**
   * When true, dims the rest of the page while the popover is open.
   * Off by default — popovers are usually a lightweight peek, not a
   * modal context. Turn on for popovers that own user attention (e.g.
   * a workspace switcher's full list with a "Create workspace" CTA).
   */
  withBackdrop?: boolean;
  children: React.ReactNode;
};

const Root: React.FC<RootProps> = ({ withBackdrop, children, className, ...props }) => (
  <HeadlessPopover className={cn("relative", className)} {...props}>
    {withBackdrop && <PopoverBackdrop className="fixed inset-0 bg-neutral-900/20 dark:bg-black/40" />}
    {children as React.ReactNode}
  </HeadlessPopover>
);
Root.displayName = "Popover.Root";

interface TriggerProps extends React.ComponentProps<typeof PopoverButton> {
  asChild?: boolean;
}

const Trigger = React.forwardRef<HTMLButtonElement, TriggerProps>(
  ({ asChild, children, className, ...props }, ref) => {
    if (asChild) {
      return (
        <PopoverButton as={Slot} ref={ref} className={className} {...props}>
          {children}
        </PopoverButton>
      );
    }
    return (
      <PopoverButton ref={ref} className={className} {...props}>
        {children}
      </PopoverButton>
    );
  }
);
Trigger.displayName = "Popover.Trigger";

interface ContentProps extends React.ComponentProps<typeof PopoverPanel> {
  /**
   * HeadlessUI v2 anchor positioning. Defaults to `bottom start` with
   * an 8px gap so the panel sits below the trigger.
   */
  anchor?: React.ComponentProps<typeof PopoverPanel>["anchor"];
}

const Content = React.forwardRef<HTMLDivElement, ContentProps>(
  ({ className, anchor = { to: "bottom start", gap: 8 }, ...props }, ref) => (
    <PopoverPanel
      ref={ref}
      anchor={anchor}
      transition
      className={cn(
        // Surface — matches Select.Content. Floating elevation (design
        // guide §4.1) via the brand multi-layer shadow token; dark mode
        // leans on the glass-edge ring since shadows vanish on dark.
        "z-50 rounded-xl border border-neutral-200 bg-white p-1 shadow-floating",
        "dark:border-neutral-800 dark:bg-neutral-900 dark:ring-1 dark:ring-white/[0.06]",
        // Enter/leave — fade + scale + small lift, scaled from the
        // trigger-side corner so the panel feels like it springs open.
        "origin-top-right transition duration-fast ease-out",
        "data-closed:scale-95 data-closed:opacity-0 data-closed:translate-y-1",
        "focus:outline-none",
        className
      )}
      {...props}
    />
  )
);
Content.displayName = "Popover.Content";

export const Popover = Object.assign(Root, {
  Trigger,
  Content,
});
