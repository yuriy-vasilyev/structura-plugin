import React from "react";
import { ChevronRight } from "lucide-react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../utils";

/**
 * Breadcrumbs — hierarchical location trail (design-guide §5.15; first
 * consumer is the portal post view's header, spec
 * `marketing/design_handoff_post_view/README.md`).
 *
 * Anatomy: a labelled `<nav>` landmark wrapping an `<ol>`; 12px chevron
 * separators are injected between items and hidden from the a11y tree.
 * Router-agnostic: link segments use `asChild` (Radix Slot) so consumers
 * pass their own `<Link>`/`<a>`; the last segment takes `current`, which
 * renders plain text with `aria-current="page"` and truncates so long
 * titles don't blow up the header (mobile truncation per the guide).
 *
 * @example
 * ```tsx
 * <Breadcrumbs aria-label="Breadcrumb">
 *   <Breadcrumbs.Item asChild><Link to="/sites/a">acme.com</Link></Breadcrumbs.Item>
 *   <Breadcrumbs.Item asChild><Link to="/sites/a/posts">Posts</Link></Breadcrumbs.Item>
 *   <Breadcrumbs.Item current>{post.title}</Breadcrumbs.Item>
 * </Breadcrumbs>
 * ```
 */

interface RootProps {
  children: React.ReactNode;
  "aria-label"?: string;
  className?: string;
}

const Root: React.FC<RootProps> = ({ children, className, ...rest }) => {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <nav
      aria-label={rest["aria-label"]}
      className={cn("min-w-0", className)}
    >
      <ol className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-neutral-400 dark:text-neutral-500">
        {items.map((item, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <li
                aria-hidden="true"
                data-breadcrumb-separator=""
                className="flex shrink-0 items-center text-neutral-300 dark:text-neutral-600"
              >
                <ChevronRight size={12} />
              </li>
            )}
            {item}
          </React.Fragment>
        ))}
      </ol>
    </nav>
  );
};
Root.displayName = "Breadcrumbs";

interface ItemProps {
  children: React.ReactNode;
  /**
   * Marks the trail's last segment: plain truncating text with
   * `aria-current="page"`. Mutually exclusive with `asChild`.
   */
  current?: boolean;
  /** Defer rendering to the child (e.g. a router `<Link>`). */
  asChild?: boolean;
  className?: string;
}

const Item: React.FC<ItemProps> = ({ children, current, asChild, className }) => {
  if (current) {
    return (
      <li className="flex min-w-0 items-center">
        <span
          aria-current="page"
          className={cn("truncate text-neutral-600 dark:text-neutral-300", className)}
        >
          {children}
        </span>
      </li>
    );
  }
  const linkClass = cn(
    "shrink-0 transition-colors hover:text-neutral-600 dark:hover:text-neutral-300",
    className
  );
  return (
    <li className="flex shrink-0 items-center">
      {asChild ? <Slot className={linkClass}>{children}</Slot> : (
        <span className={linkClass}>{children}</span>
      )}
    </li>
  );
};
Item.displayName = "Breadcrumbs.Item";

export const Breadcrumbs = Object.assign(Root, { Item });
