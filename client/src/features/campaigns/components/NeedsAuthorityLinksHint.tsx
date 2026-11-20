import { __ } from "@wordpress/i18n";
import { cn } from "@structura/ui";

/**
 * The line under the References list toggle while authority links are off.
 * `besideAuthority` is for a page that shows the authority toggle right above
 * it; otherwise the line says where that toggle is.
 */
export const NeedsAuthorityLinksHint = ({
  className,
  besideAuthority = false,
}: {
  className?: string;
  besideAuthority?: boolean;
}) => (
  <p className={cn("m-0! text-[11px] leading-snug text-neutral-500 dark:text-neutral-400", className)}>
    {besideAuthority
      ? __("Turn on authority links to use this.", "structura")
      : __("Turn on Outbound link authority under Advanced Settings > SEO Directives to use this.", "structura")}
  </p>
);
