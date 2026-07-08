import { FC, ReactNode } from "react";
import { ArrowRight, ExternalLink } from "lucide-react";

export interface JustThePluginSectionProps {
  /**
   * Free plan card content for the LEFT column.
   *
   * Optional: when Free is presented in the main paid grid (founding-offer
   * 4-card layout), omit this and the section collapses to just the WP.org
   * plugin band. When both `free` and `plugin` are omitted, the section
   * renders nothing.
   */
  free?: {
    title: string;
    description: string;
    features: readonly string[];
    ctaLabel: string;
    /** Where "Get free license" goes — typically the app signup with `plan=free`. */
    ctaHref: string;
    /** Optional eyebrow above the title (e.g. "Free plan"). */
    eyebrow?: string;
    /**
     * Arbitrary `data-*` attributes forwarded onto the CTA anchor. Used
     * by the marketing site for PostHog click-delegation tracking. Keys
     * are passed verbatim — pass them already in `data-foo` form.
     */
    ctaDataAttributes?: Record<string, string>;
  };
  /**
   * WP.org plugin card content for the RIGHT column. The escape hatch
   * for prospects who want to try the plugin without an account.
   *
   * Pass `undefined` to omit the column entirely — the section
   * collapses to a single centered Free card. Used during the window
   * between launch and the wp.org listing being live; see
   * `WP_PLUGIN_PUBLISHED` in `www/lib/urls.ts`.
   */
  plugin?: {
    title: string;
    body: string;
    /** Secondary copy clarifying what's locked behind the paid tiers. */
    upgradeNote: string;
    ctaLabel: string;
    /** wp.org plugin URL or any other "free download" surface. */
    href: string;
    /** Optional eyebrow above the title (e.g. "Just the plugin"). */
    eyebrow?: string;
  };
  /**
   * Optional slot rendered above the two columns (e.g. a section
   * heading shared by both columns). Most consumers leave this
   * undefined and let the two columns speak for themselves.
   */
  header?: ReactNode;
}

/**
 * Two-column "free options" callout. Visually lighter than the paid
 * grid on purpose — we want prospects to see the paid tiers first and
 * read this band as the escape hatch for "I just want to try it."
 *
 * The LEFT column is the **Free plan card** (account required, license
 * issued, upload to wp-admin). The RIGHT column is the **WP.org
 * standalone plugin** (no account, paragraph-only, BYOK).
 *
 * Wave-2 restructure (2026-05-04): Free was hoisted out of the paid
 * grid into this band so the paid cards (BYOK / Cloud / Cloud Pro) get
 * their own visual rhythm without a "$0" outlier in the row. The plugin
 * column on the right is the same content this component used to be
 * before the restructure, just shifted to make room for Free.
 *
 * Spec: pricing-v2-implementation.md §8.1; multi-tenant-and-public-api.md
 * §Product Decisions ("Free is presented separately from the paid grid
 * in an expanded `JustThePluginSection`").
 */
export const JustThePluginSection: FC<JustThePluginSectionProps> = ({
  free,
  plugin,
  header,
}) => {
  // Nothing to show — Free is in the paid grid and the wp.org listing isn't
  // live yet. Render nothing rather than an empty band.
  if (!free && !plugin) return null;

  const twoColumn = Boolean(free && plugin);

  return (
    <section
      aria-labelledby="just-the-plugin-section"
      className="mx-auto mt-16 w-full max-w-6xl"
    >
      {header && <div className="mb-6">{header}</div>}
      <div
        className={
          twoColumn
            ? "grid grid-cols-1 gap-6 md:grid-cols-2"
            : // A single column (lone Free card, or lone plugin band) — center
              // it so it doesn't look orphaned in a half-width grid cell.
              "mx-auto max-w-2xl"
        }
      >
      {/* LEFT — Free plan card */}
      {free && (
      <div
        aria-labelledby="just-the-plugin-free-title"
        className="flex flex-col rounded-3xl border border-neutral-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900"
      >
        {free.eyebrow && (
          <p className="mb-2 text-xs font-bold tracking-wide text-brand-600 uppercase dark:text-brand-400">
            {free.eyebrow}
          </p>
        )}
        <h3
          id="just-the-plugin-free-title"
          className="mb-2 text-xl font-bold text-neutral-900 dark:text-white"
        >
          {free.title}
        </h3>
        <p className="mb-5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          {free.description}
        </p>
        <ul className="mb-6 flex flex-1 flex-col gap-2 text-sm text-neutral-600 dark:text-neutral-300">
          {free.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-1 inline-block size-1.5 shrink-0 rounded-full bg-brand-500 dark:bg-brand-400"
              />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        <a
          href={free.ctaHref}
          {...free.ctaDataAttributes}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-500 dark:bg-brand-500 dark:hover:bg-brand-400"
        >
          {free.ctaLabel}
          <ArrowRight className="size-4" strokeWidth={2.5} />
        </a>
      </div>
      )}

      {/* RIGHT — WP.org standalone plugin (omitted pre-launch) */}
      {plugin && (
        <div
          aria-labelledby="just-the-plugin-plugin-title"
          className="flex flex-col rounded-3xl border border-dashed border-neutral-200 bg-neutral-50/60 p-8 dark:border-neutral-800 dark:bg-neutral-900/30"
        >
          {plugin.eyebrow && (
            <p className="mb-2 text-xs font-bold tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
              {plugin.eyebrow}
            </p>
          )}
          <h3
            id="just-the-plugin-plugin-title"
            className="mb-3 text-xl font-bold text-neutral-900 dark:text-white"
          >
            {plugin.title}
          </h3>
          <p className="mb-4 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
            {plugin.body}
          </p>
          <p className="mb-6 flex-1 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
            {plugin.upgradeNote}
          </p>
          <a
            href={plugin.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 self-start rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-bold text-neutral-900 transition-colors hover:border-brand-500/40 hover:bg-brand-50/40 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:hover:border-brand-400/40 dark:hover:bg-brand-500/10"
          >
            {plugin.ctaLabel}
            <ExternalLink className="size-4" strokeWidth={2.5} />
          </a>
        </div>
      )}
      </div>
    </section>
  );
};
