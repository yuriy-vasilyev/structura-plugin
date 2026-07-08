import { FC } from "react";
import { __ } from "@wordpress/i18n";
import { Button, Card } from "@structura/ui";
import { ArrowRight, Sparkles } from "lucide-react";
import { useLicense } from "@/features/settings";
import { buildPortalSignupUrl } from "@/utils/portalLinks";

/**
 * Persistent conversion widget that fills the Overview's third stat-row
 * column for non-paying tiers — the slot {@link IntelligenceUsage}
 * occupies once a paid license is active.
 *
 * Copy adapts to where the user sits on the conversion ladder:
 *
 *   - `none` (anonymous, wp.org install) — "create your free account",
 *     the first rung: register to unlock featured images, the full block
 *     library, and multi-site activation.
 *   - `free` (registered Free license) — capability-unlock Pro upsell.
 *     This is the warmest lead (already signed up, actively publishing)
 *     and otherwise sees no upgrade prompt on the dashboard at all.
 *
 * Both CTAs carry the `general_upgrade` portal intent so the portal can
 * branch on session state (signup for `none`, billing for `free`) — the
 * same contract the header Upgrade link uses.
 */
export const UpgradeCard: FC = () => {
  const { plan, loading } = useLicense();

  // Render nothing until the license tier resolves so we don't flash the
  // `none` ("create account") variant at a Free user during first paint.
  if (loading) return null;

  const isAnonymous = plan === "none";

  const content = isAnonymous
    ? {
        eyebrow: __("Get started", "structura"),
        title: __("Create your free account", "structura"),
        body: __(
          "Register a free license to unlock featured images, the full Gutenberg block library, and one-click activation across your sites.",
          "structura"
        ),
        // Same label + translation as the former upgrade banner — keeps
        // the CTA wording consistent and reuses the existing string.
        cta: __("Get Free License", "structura"),
      }
    : {
        eyebrow: __("Go Pro", "structura"),
        title: __("Unlock the full engine", "structura"),
        body: __(
          "The 20-point SEO protocol, live SERP research, Keyword Bank & authority links — on every post.",
          "structura"
        ),
        cta: __("See Pro plans", "structura"),
      };

  const href = buildPortalSignupUrl({
    intent: "general_upgrade",
    domain: typeof window !== "undefined" ? window.location.hostname : undefined,
    plan,
  });

  return (
    <Card className="relative flex h-full flex-col overflow-hidden rounded-lg border-l-4 border-l-purple-500 bg-linear-to-br from-purple-50/60 to-white p-6! shadow-sm dark:border-l-purple-500 dark:from-purple-950/20 dark:to-neutral-900">
      {/* Decorative corner motif — gives the upsell its own visual punch
          without competing with the muted stat cards beside it. */}
      <Sparkles
        aria-hidden="true"
        className="pointer-events-none absolute -right-3 -bottom-3 h-20 w-20 rotate-12 text-purple-500/10"
      />

      <div className="flex items-center gap-1.5">
        <Sparkles aria-hidden="true" size={12} className="text-purple-500" />
        <p className="m-0! text-[10px] font-bold tracking-widest text-purple-600 uppercase dark:text-purple-300">
          {content.eyebrow}
        </p>
      </div>

      <h3 className="mt-2! mb-1! text-lg font-black text-neutral-900 dark:text-white">
        {content.title}
      </h3>

      <p className="m-0! text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
        {content.body}
      </p>

      <Button asChild size="sm" className="mt-4 self-start">
        <a href={href} target="_blank" rel="noreferrer" className="text-white!">
          {content.cta}
          <ArrowRight size={14} className="ml-1.5" />
        </a>
      </Button>
    </Card>
  );
};
