/**
 * Sub-navigation for the Channels section.
 *
 * The top-level "Channels" header link lands the user on Activity, but
 * there's no way to discover the Connections page from there without
 * typing a URL. This tab strip sits inside both pages so users can flip
 * between them — and makes "where do I add an integration?" an obvious
 * one-click answer.
 *
 * Keep this intentionally simple (NavLink + cn), not a full tabs
 * primitive — both destinations are real routes, so we want native
 * browser semantics (middle-click, copy link, keyboard) rather than
 * JS-driven tab state.
 */

import { NavLink } from "react-router";
import { __ } from "@wordpress/i18n";
import { Activity, Plug, Store } from "lucide-react";
import { cn } from "@structura/ui";
import type { ReactNode } from "react";

interface TabProps {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  end?: boolean;
}

const Tab = ({ to, icon, children, end }: TabProps) => (
  <NavLink
    to={to}
    end={end}
    // `-mb-px` lives on each tab (not the parent nav) so the active tab's 2px
    // bottom border overlaps the nav's 1px border cleanly — classic tabs-overlap-
    // underline pattern.
    //
    // `text-*!` is required: NavLink renders <a>, and WP admin ships global
    // `a { color: ... }` rules that otherwise win over the utility class.
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

export const ChannelsSubNav = () => (
  <nav
    aria-label={__("Channels sections", "structura")}
    className="flex items-center gap-6 border-b border-neutral-200"
  >
    {/*
      Tab order — Connections first because `/channels` now lands there by
      default. Store is the discovery surface; Activity is the per-post
      dispatch log and least commonly visited, so it sits last.

      Both `/channels` and `/channels/connections` render the same
      component, so we only expose one NavLink for Connections (pointing at
      the canonical path) — `end: false` on "/channels/connections" means
      it stays active whether the URL is `/channels` or
      `/channels/connections`. We intentionally drop the `end` prop and
      rely on NavLink's default prefix match.
    */}
    <Tab to="/channels/connections" icon={<Plug size={14} />}>
      {__("Connections", "structura")}
    </Tab>
    <Tab to="/channels/store" icon={<Store size={14} />}>
      {__("Store", "structura")}
    </Tab>
    <Tab to="/channels/activity" icon={<Activity size={14} />}>
      {__("Activity", "structura")}
    </Tab>
  </nav>
);
