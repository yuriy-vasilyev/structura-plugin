import { cn } from "@structura/ui";
import type { HTMLAttributes, ReactNode } from "react";

/**
 * Standardises page-level horizontal width across the admin app.
 *
 * - `wide` (default): no max width, flows to the admin content column. Use for
 *   dashboards, tables, lists, and anything that benefits from horizontal room.
 * - `narrow`: `max-w-4xl` (896px). Use for reading- and form-oriented pages
 *   (AI Engine, Single Campaign view/edit/create, Settings, Account,
 *   Channels Activity). Reads more comfortably and matches the existing
 *   campaign-page proportions.
 *
 * Width changes belong here — do NOT add `mx-auto max-w-*` on individual pages.
 * That's how the app drifted into three different "narrow" widths (3xl vs 4xl)
 * and several pages with no container at all.
 */
type PageContainerVariant = "wide" | "narrow";

type PageContainerProps = HTMLAttributes<HTMLDivElement> & {
  variant?: PageContainerVariant;
  children: ReactNode;
};

const VARIANT_CLASSES: Record<PageContainerVariant, string> = {
  wide: "w-full",
  narrow: "mx-auto w-full max-w-4xl",
};

export const PageContainer = ({
  variant = "wide",
  className,
  children,
  ...rest
}: PageContainerProps) => {
  return (
    <div className={cn(VARIANT_CLASSES[variant], className)} {...rest}>
      {children}
    </div>
  );
};
