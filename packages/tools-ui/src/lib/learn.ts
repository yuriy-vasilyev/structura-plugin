import type { TaskId } from "./tasks";

/**
 * Learn hub pages the free tools link to from their results
 * (specs/blogseo-gap-analysis.md §4.11). They live on www at
 * `/<locale>/learn/<slug>`; a link renders only when its slug is in the
 * surface's published set, so a result never points at a 404.
 */
export const LEARN_SLUGS = [
  "domain-authority",
  "referring-domains",
  "backlink-profile",
  "spam-score",
  "keyword-difficulty",
  "search-volume",
  "search-intent",
  "title-tag-and-meta-description",
  "on-page-seo",
] as const;

/** One of {@link LEARN_SLUGS}. */
export type LearnSlug = (typeof LEARN_SLUGS)[number];

/** Whether `value` is a {@link LearnSlug}. */
export function isLearnSlug(value: string): value is LearnSlug {
  return (LEARN_SLUGS as readonly string[]).includes(value);
}

/**
 * The tool destinations www has published in its English hub. The customer
 * portal cannot read www's content, so it gates its links on this list;
 * `www/lib/__tests__/tools-learn.test.ts` fails when it differs from the
 * corpus. Publishing a tool page means adding its slug here.
 */
export const PUBLISHED_LEARN_SLUGS: ReadonlySet<LearnSlug> = new Set<LearnSlug>([
  "domain-authority",
  "referring-domains",
  "search-intent",
]);

/** Where a surface's Learn links go. */
export interface LearnTarget {
  /** The hub the slug is appended to: `/<locale>/learn` on www, www's English hub in the portal. */
  base: string;
  /** Open in a new tab: the portal, which leaves for www. */
  newTab: boolean;
  /** Pages that exist; a link to any other slug does not render. */
  published: ReadonlySet<LearnSlug>;
}

/** The Learn page that explains how to fix an SEO checker task. */
export function taskLearnSlug(task: TaskId): LearnSlug {
  return task === "title" || task === "meta_description" ? "title-tag-and-meta-description" : "on-page-seo";
}
