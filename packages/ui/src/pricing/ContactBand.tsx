import { FC } from "react";
import { ArrowRight } from "lucide-react";

export interface ContactBandProps {
  title: string;
  body: string;
  ctaLabel: string;
  /** mailto: or https:// link for sales conversations. */
  href: string;
}

/**
 * Enterprise routing band. We deliberately do NOT render an "Enterprise" card
 * with a "Custom" price because we don't yet have the ops capacity to deliver
 * enterprise-tier work (SSO/SAML, custom DPA, dedicated SLAs). Instead we
 * signal that 25+ / white-label / compliance conversations are welcome
 * without committing to them as a productized tier.
 *
 * Spec: pricing-v2-implementation.md §8.1; marketing/PRICING-PAGE-COPY-V2.md
 * "Running a larger operation?" section.
 */
export const ContactBand: FC<ContactBandProps> = ({ title, body, ctaLabel, href }) => (
  <section
    aria-labelledby="contact-band-title"
    className="mx-auto mt-16 w-full max-w-5xl rounded-3xl bg-gradient-to-br from-brand-50 to-brand-100/40 p-10 text-center dark:from-brand-500/10 dark:to-brand-500/5 dark:ring-1 dark:ring-brand-400/20"
  >
    <h3
      id="contact-band-title"
      className="mb-3 text-2xl font-bold text-neutral-900 dark:text-white"
    >
      {title}
    </h3>
    <p className="mx-auto mb-6 max-w-2xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
      {body}
    </p>
    <a
      href={href}
      className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400"
    >
      {ctaLabel}
      <ArrowRight className="size-4" strokeWidth={2.5} />
    </a>
  </section>
);
