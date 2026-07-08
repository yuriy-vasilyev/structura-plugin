/**
 * Sub-navigation strip for the `/site` route.
 *
 * Spec: `specs/seo-intelligence-plan.md` §4.2.
 *
 * Five tabs sit under one "Site" entry point — Info / Keywords /
 * Competitors / Authority / Settings — so the user thinks about their
 * site identity, ranking footprint, competitor map, and SEO refresh
 * preferences from a single landing surface.
 *
 * Pattern follows `features/channels/components/ChannelsSubNav.tsx`
 * deliberately — same NavLink-based tab strip, same hover/active rules,
 * so the wp-admin SPA's nav semantics stay consistent. Each tab is a
 * real route (not JS-driven state) so middle-click / copy-link /
 * keyboard navigation all work natively.
 */

import { NavLink } from "react-router";
import { __ } from "@wordpress/i18n";
import { Link2, Search, Settings as SettingsIcon, Users } from "lucide-react";
import { cn } from "@structura/ui";
import type { ReactNode } from "react";

interface TabProps {
  to: string;
  icon: ReactNode;
  children: ReactNode;
}

const Tab = ({ to, icon, children }: TabProps) => (
  <NavLink
    to={to}
    // Same active-tab visual rules as ChannelsSubNav — see that file for
    // why `text-*!` is needed (WP admin's global `a {}` rules).
    className={({ isActive }: { isActive: boolean }) =>
      cn(
        "-mb-px inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors",
        isActive
          ? "border-brand-500 text-brand-600!"
          : "border-transparent text-neutral-500! hover:border-neutral-300 hover:text-neutral-800!",
      )
    }
  >
    <span aria-hidden="true" className="inline-flex items-center">
      {icon}
    </span>
    {children}
  </NavLink>
);

export const SiteSubNav = () => (
  <nav
    aria-label={__("Site sections", "structura")}
    className="flex flex-wrap items-center gap-6 border-b border-neutral-200"
  >
    {/*
      Tab order — Info first because it carries the always-available
      identity controls (Headless Mode toggle, domain, locale).
      Competitors is the site-scoped SEO surface (keywords + authority
      moved to the campaign level). Settings is last — refresh frequency,
      digest opt-in, budget — preferences rather than primary surface.
    */}
    <Tab to="/site/info" icon={<SettingsIcon size={14} />}>
      {__("Info", "structura")}
    </Tab>
    <Tab to="/site/competitors" icon={<Users size={14} />}>
      {__("Competitors", "structura")}
    </Tab>
    <Tab to="/site/referrals" icon={<Link2 size={14} />}>
      {__("Referral links", "structura")}
    </Tab>
    <Tab to="/site/settings" icon={<Search size={14} />}>
      {__("Settings", "structura")}
    </Tab>
  </nav>
);
