import {
  Menu as HeadlessMenu,
  MenuButton,
  MenuItem,
  MenuItems,
  MenuSeparator,
} from "@headlessui/react";
import React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../utils";

/**
 * DropdownMenu — action-list dropdown anchored to a trigger.
 *
 * Use this when the contents are a flat list of actions (Sign out,
 * Switch theme, Settings…). For richer content (a workspace switcher
 * with sub-info, a contextual peek), prefer Popover.
 *
 * Visual surface matches Select.Content so a dropdown dropped near a
 * Select reads as the same family.
 */

const Root: React.FC<React.ComponentProps<typeof HeadlessMenu>> = ({ children, ...props }) => (
  <HeadlessMenu as="div" className="relative" {...props}>
    {children}
  </HeadlessMenu>
);
Root.displayName = "DropdownMenu.Root";

interface TriggerProps extends React.ComponentProps<typeof MenuButton> {
  asChild?: boolean;
}

const Trigger = React.forwardRef<HTMLButtonElement, TriggerProps>(
  ({ asChild, children, className, ...props }, ref) => {
    if (asChild) {
      return (
        <MenuButton as={Slot} ref={ref} className={className} {...props}>
          {children}
        </MenuButton>
      );
    }
    return (
      <MenuButton ref={ref} className={className} {...props}>
        {children}
      </MenuButton>
    );
  }
);
Trigger.displayName = "DropdownMenu.Trigger";

interface ContentProps extends React.ComponentProps<typeof MenuItems> {
  anchor?: React.ComponentProps<typeof MenuItems>["anchor"];
}

const Content = React.forwardRef<HTMLDivElement, ContentProps>(
  ({ className, anchor = { to: "bottom end", gap: 8 }, ...props }, ref) => (
    <MenuItems
      ref={ref}
      anchor={anchor}
      transition
      className={cn(
        "z-50 min-w-[14rem] rounded-xl border border-neutral-200 bg-white p-1 shadow-xl",
        "dark:border-neutral-800 dark:bg-neutral-900 dark:ring-1 dark:ring-white/[0.04]",
        "transition duration-100 ease-out data-leave:data-closed:opacity-0",
        "data-closed:translate-y-1 data-open:translate-y-0",
        "focus:outline-none",
        className
      )}
      {...props}
    />
  )
);
Content.displayName = "DropdownMenu.Content";

interface ItemProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onSelect?: () => void;
  /** Render the row as a destructive action (red on hover/focus). */
  destructive?: boolean;
  /** When set, render as an anchor or Link — `asChild` defers wrapping. */
  asChild?: boolean;
  disabled?: boolean;
  className?: string;
}

const Item: React.FC<ItemProps> = ({
  children,
  icon,
  onSelect,
  destructive,
  asChild,
  disabled,
  className,
}) => {
  const rowClass = cn(
    "group flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm",
    "text-neutral-700 transition-colors select-none",
    "data-focus:bg-neutral-100 data-focus:text-neutral-900",
    "dark:text-neutral-200 dark:data-focus:bg-neutral-800 dark:data-focus:text-white",
    destructive &&
      "data-focus:bg-red-50 data-focus:text-red-700 dark:data-focus:bg-red-500/10 dark:data-focus:text-red-300",
    disabled && "pointer-events-none opacity-50",
    className
  );

  return (
    <MenuItem disabled={disabled}>
      {asChild ? (
        <Slot className={rowClass}>{children}</Slot>
      ) : (
        <button type="button" onClick={onSelect} className={rowClass}>
          {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>}
          <span className="flex-1 text-left">{children}</span>
        </button>
      )}
    </MenuItem>
  );
};
Item.displayName = "DropdownMenu.Item";

interface LabelProps {
  children: React.ReactNode;
  className?: string;
}

const Label: React.FC<LabelProps> = ({ children, className }) => (
  <div
    className={cn(
      "px-3 pt-2 pb-1 text-[10px] font-bold tracking-wider text-neutral-400 uppercase",
      className
    )}
  >
    {children}
  </div>
);
Label.displayName = "DropdownMenu.Label";

const Separator: React.FC<{ className?: string }> = ({ className }) => (
  <MenuSeparator
    className={cn("my-1 h-px bg-neutral-200 dark:bg-neutral-800", className)}
  />
);
Separator.displayName = "DropdownMenu.Separator";

export const DropdownMenu = Object.assign(Root, {
  Trigger,
  Content,
  Item,
  Label,
  Separator,
});
