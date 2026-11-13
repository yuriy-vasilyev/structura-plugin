/**
 * The pages read from the site for its positioning: read-only, each linking
 * to the page (specs/site-reading.md §5a). Titled by whether a draft in this
 * visit read them or they are the site's stored selection (§11), as the
 * customer portal does. Shared by the Site → Info positioning card and the
 * setup wizard's positioning step.
 */
import { __ } from "@wordpress/i18n";
import { Badge } from "@structura/ui";
import { ExternalLink } from "lucide-react";

import type { PositioningPageRead } from "../api/useWizardSeo";

const ROLE_LABELS: Record<PositioningPageRead["role"], () => string> = {
  home: () => __("Homepage", "structura"),
  service: () => __("Service", "structura"),
  product: () => __("Product", "structura"),
  audience: () => __("Audience", "structura"),
  pricing: () => __("Pricing", "structura"),
  about: () => __("About", "structura"),
  other: () => __("Page", "structura"),
};

export const PositioningPagesRead = ({
  pages,
  drafted,
}: {
  pages: PositioningPageRead[];
  /** True when a draft in this visit read these pages; false for the stored selection. */
  drafted: boolean;
}) => {
  if (pages.length === 0) return null;
  const title = drafted
    ? __("Drafted from these pages", "structura")
    : __("Pages we read from your site", "structura");
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0! text-xs font-semibold text-neutral-700 dark:text-neutral-300">{title}</p>
      {/* Two columns shared by every row, so the links line up whatever the badge's width. */}
      <ul aria-label={title} className="m-0! grid grid-cols-[max-content_minmax(0,1fr)] gap-x-2 gap-y-1.5 p-0!">
        {pages.map((page) => (
          <li key={page.url} className="m-0! col-span-2 grid grid-cols-subgrid items-center text-[13px]">
            <span className="flex">
              <Badge intent="default">{(ROLE_LABELS[page.role] ?? ROLE_LABELS.other)()}</Badge>
            </span>
            <a
              href={page.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-w-0 items-center gap-1 text-brand-600 hover:underline dark:text-brand-400"
            >
              <span className="truncate">{page.label}</span>
              <ExternalLink size={12} aria-hidden className="shrink-0" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};
