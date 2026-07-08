import { NavLink } from "react-router";
import { __ } from "@wordpress/i18n";
import { useState } from "@wordpress/element";
import { ReactNode } from "react";
import { useLicense } from "@/features/settings";
import { useChannelsVisibility } from "@/features/channels";
import { NoticesBell } from "@/features/notices";
import { Badge, BadgeProps, Popover, cn, Logo } from "@structura/ui";
import {
  ChevronDown,
  ExternalLink,
  Menu,
  Settings as SettingsIcon,
  Sparkles,
  UserCircle,
  UserPlus,
  X,
} from "lucide-react";
import {
  buildMarketingPricingUrl,
  buildPortalSignupUrl,
} from "@/utils/portalLinks";
import { formatPlanLabel } from "@/utils/planLabel";
import { buildPrimaryNavLinks, getAccountMenuModel } from "./headerNav";

interface MobileLinkProps {
  to: string;
  children: ReactNode;
  onClick: () => void;
}

const Header = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const { isLicensed, plan, audience, loading } = useLicense();
  const channelsVisible = useChannelsVisibility();
  const getNavClass = ({ isActive }: { isActive: boolean }) =>
    `nav-item ${isActive ? "nav-item-active" : ""}`;

  // Intent is plan-keyed (not affected by the audience axis) — Agency
  // and Individual variants of the same tier share the same accent
  // color. Label composes plan + audience via the shared helper so the
  // wp-admin badge tells the same story as the portal subscription
  // cards.
  const getPlanBadgeConfig = (): { label: string; intent: BadgeProps["intent"] } => {
    if (loading) return { label: "---", intent: "default" };

    if (plan === "none" || plan === "") {
      // No license payload at all — truly anonymous. `useLicense` falls
      // back to the literal "none" when neither the WP license nor the
      // cloud heartbeat has a plan; the empty-string branch is defensive
      // in case a future caller forgets the `|| "none"` guard.
      return { label: __("Anonymous", "structura"), intent: "default" };
    }

    const intent: BadgeProps["intent"] =
      plan === "byok"
        ? "success"
        : plan === "cloud" || plan === "cloud_pro"
          ? "premium"
          : plan === "free"
            ? "info"
            : "default";

    return { label: formatPlanLabel(plan, audience), intent };
  };

  const badge = getPlanBadgeConfig();
  const navLinks = buildPrimaryNavLinks({ channelsVisible, plan });
  const menu = getAccountMenuModel({ loading, isLicensed, plan });

  const domain =
    typeof window !== "undefined" ? window.location.hostname : undefined;
  // "Manage account" and "Create a free account" both open the portal at
  // its root; the portal branches on session + `plan` (sign-up for none,
  // dashboard for licensed).
  const portalHref = buildPortalSignupUrl({
    intent: "manage_account",
    domain,
    plan,
  });
  // Upgrade destination is tier-aware (see `getAccountMenuModel`):
  //   - none    → marketing pricing page (sell plans before sign-in)
  //   - account → customer-portal billing view (upgrade = billing change)
  // Both carry `general_upgrade`; the difference is portal vs. www origin.
  const upgradeHref =
    menu.upgradeTarget === "pricing"
      ? buildMarketingPricingUrl({ intent: "general_upgrade", domain, plan })
      : buildPortalSignupUrl({ intent: "general_upgrade", domain, plan });

  return (
    <nav className="sticky top-0 z-50 border-b border-neutral-200 bg-white sm:top-11.5 md:top-8 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          {/* LEFT: Logo & Desktop Nav */}
          <div className="flex">
            <Logo />

            <div className="s-hidden items-center md:ml-8 md:flex md:space-x-1.5">
              {navLinks.map((link) => (
                <NavLink key={link.to} to={link.to} className={getNavClass}>
                  {link.label}
                </NavLink>
              ))}
            </div>
          </div>

          {/* RIGHT: Status & Actions */}
          <div className="flex items-center gap-4">
            {/* Notification Center bell — opens a popover with the
              * top open/acknowledged notices. Mounted left of the
              * plan badge so the bell + its count sit in the same
              * visual cluster as the rest of the global header
              * actions; the badge keeps anchoring the tier label. */}
            <NoticesBell />

            {/* Plan chip → account menu.
              *
              * The chip doubles as the menu trigger so Account, Settings,
              * and the portal/upgrade links live here rather than as extra
              * items in the horizontal nav (which was already overflowing
              * in German — see `buildPrimaryNavLinks`). Consolidating here
              * also means paid users finally have a persistent route back
              * to the customer portal, which the old "Pro → nothing"
              * funnel never gave them.
              *
              * Built on Popover (not DropdownMenu) deliberately: the Menu
              * primitive mounts its anchored `MenuItems` eagerly, so
              * floating-ui's auto-positioning ran on every page load and
              * tripped React error #185 ("max update depth") from inside
              * the header — which sits *outside* the route error boundary,
              * so it took down the whole app. Popover's panel mounts only
              * when opened (same pattern as <NoticesBell/>), so the
              * floating machinery never runs at rest. */}
            <Popover>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-full",
                    "focus-visible:ring-brand-500/40 focus-visible:ring-2 focus-visible:outline-none"
                  )}
                  aria-label={__("Account menu", "structura")}
                >
                  <Badge
                    variant="solid"
                    intent={badge.intent}
                    className={
                      loading
                        ? "animate-pulse opacity-50"
                        : "px-2.5 font-black uppercase"
                    }
                  >
                    {badge.label}
                  </Badge>
                  <ChevronDown
                    size={14}
                    className="text-neutral-400 dark:text-neutral-500"
                    aria-hidden
                  />
                </button>
              </Popover.Trigger>

              <Popover.Content
                anchor={{ to: "bottom end", gap: 8 }}
                className="min-w-[14rem]"
              >
                {/* `close` lets link clicks dismiss the panel — unlike a
                    Menu, a Popover doesn't auto-close on activate, and the
                    header persists across SPA navigations so it would
                    otherwise stay open over the next page. */}
                {({ close }: { close: () => void }) => (
                  <>
                    <div className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-wider text-neutral-400 uppercase">
                      {badge.label}
                    </div>

                    {/* Internal app routes first… */}
                    <NavLink
                      to="/account"
                      onClick={() => close()}
                      className={ACCOUNT_MENU_ROW_CLASS}
                    >
                      <UserCircle className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="flex-1 text-left">
                        {__("Account & License", "structura")}
                      </span>
                    </NavLink>

                    <NavLink
                      to="/settings"
                      onClick={() => close()}
                      className={ACCOUNT_MENU_ROW_CLASS}
                    >
                      <SettingsIcon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="flex-1 text-left">
                        {__("Settings", "structura")}
                      </span>
                    </NavLink>

                    {/* …then the external (portal / pricing) links. The
                        divider only makes sense when there's at least one
                        external row below it. */}
                    {(menu.showUpgrade ||
                      menu.showManage ||
                      menu.showCreateAccount) && (
                      <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-800" />
                    )}

                    {/* Upgrade — brand-colored, bold; tier-aware destination
                        (pricing vs. portal billing) resolved into
                        `upgradeHref` above. */}
                    {menu.showUpgrade && (
                      <a
                        href={upgradeHref}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => close()}
                        className={ACCOUNT_MENU_UPGRADE_CLASS}
                      >
                        <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="flex-1 text-left">
                          {__("Upgrade", "structura")}
                        </span>
                      </a>
                    )}

                    {menu.showManage && (
                      <a
                        href={portalHref}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => close()}
                        className={ACCOUNT_MENU_ROW_CLASS}
                      >
                        <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="flex-1 text-left">
                          {__("Manage account", "structura")}
                        </span>
                      </a>
                    )}

                    {/* Quieter free path for anonymous installs. */}
                    {menu.showCreateAccount && (
                      <a
                        href={portalHref}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => close()}
                        className={ACCOUNT_MENU_ROW_CLASS}
                      >
                        <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="flex-1 text-left">
                          {__("Create a free account", "structura")}
                        </span>
                      </a>
                    )}
                  </>
                )}
              </Popover.Content>
            </Popover>

            {/* Mobile Hamburger */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className={cn(
                "inline-flex items-center justify-center rounded-lg p-2 md:hidden",
                "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900",
                "transition-all duration-150 ease-out",
                "focus-visible:ring-brand-500/40 focus:outline-none focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.15)] focus-visible:ring-2",
                "dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
              )}
              aria-label={
                isMobileMenuOpen ? __("Close menu", "structura") : __("Open menu", "structura")
              }
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="border-t border-neutral-200 bg-neutral-50 md:hidden dark:border-neutral-800 dark:bg-neutral-900">
          <div className="space-y-1 px-2 pt-2 pb-3">
            {navLinks.map((link) => (
              <MobileLink key={link.to} to={link.to} onClick={() => setIsMobileMenuOpen(false)}>
                {link.label}
              </MobileLink>
            ))}

            {/* Account section — mirrors the desktop account menu, since
              * the hamburger has no plan-chip trigger to hang it off of.
              * Internal app routes first, external links after. */}
            <div className="my-2 h-px bg-neutral-200 dark:bg-neutral-800" />

            <MobileLink to="/account" onClick={() => setIsMobileMenuOpen(false)}>
              {__("Account & License", "structura")}
            </MobileLink>
            <MobileLink to="/settings" onClick={() => setIsMobileMenuOpen(false)}>
              {__("Settings", "structura")}
            </MobileLink>

            {(menu.showUpgrade || menu.showManage || menu.showCreateAccount) && (
              <div className="my-2 h-px bg-neutral-200 dark:bg-neutral-800" />
            )}

            {menu.showUpgrade && (
              <a
                href={upgradeHref}
                target="_blank"
                rel="noreferrer"
                onClick={() => setIsMobileMenuOpen(false)}
                className={MOBILE_UPGRADE_CLASS}
              >
                {__("Upgrade", "structura")}
              </a>
            )}
            {menu.showManage && (
              <a
                href={portalHref}
                target="_blank"
                rel="noreferrer"
                onClick={() => setIsMobileMenuOpen(false)}
                className={MOBILE_EXTERNAL_LINK_CLASS}
              >
                {__("Manage account", "structura")}
              </a>
            )}
            {menu.showCreateAccount && (
              <a
                href={portalHref}
                target="_blank"
                rel="noreferrer"
                onClick={() => setIsMobileMenuOpen(false)}
                className={MOBILE_EXTERNAL_LINK_CLASS}
              >
                {__("Create a free account", "structura")}
              </a>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

/** Row styling for the account-menu popover items — mirrors the look of
 *  the DropdownMenu.Item it replaced (hover/focus surfaces, dark mode).
 *
 *  Colors carry `!` on purpose: these rows render as <a>/NavLink, and WP
 *  admin ships a global `a { color: … }` rule that otherwise wins over the
 *  utility and paints the whole menu link-blue (same reason `.nav-item`
 *  and ChannelsSubNav force their colors). Icons inherit via currentColor.
 */
const ACCOUNT_MENU_ROW_CLASS = cn(
  "flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm no-underline select-none",
  "text-neutral-700! transition-colors hover:bg-neutral-100 hover:text-neutral-900!",
  "focus-visible:bg-neutral-100 focus-visible:text-neutral-900! focus-visible:outline-none",
  "dark:text-neutral-200! dark:hover:bg-neutral-800 dark:hover:text-white! dark:focus-visible:bg-neutral-800 dark:focus-visible:text-white!"
);

/** Upgrade row — brand-colored, bold text + icon (no fill) so it stands
 *  out from the neutral rows without shouting. `text-brand-600!` beats
 *  WP's global `a` color; the Sparkles icon inherits it via currentColor. */
const ACCOUNT_MENU_UPGRADE_CLASS = cn(
  "flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold no-underline select-none",
  "text-brand-600! transition-colors hover:bg-brand-50 hover:text-brand-700!",
  "focus-visible:bg-brand-50 focus-visible:text-brand-700! focus-visible:outline-none",
  "dark:text-brand-400! dark:hover:bg-brand-950/30 dark:hover:text-brand-300! dark:focus-visible:bg-brand-950/30 dark:focus-visible:text-brand-300!"
);

/** Mobile Upgrade row — same brand-colored bold treatment, scaled to the
 *  larger mobile list rows. */
const MOBILE_UPGRADE_CLASS = cn(
  "block w-full rounded-lg px-3 py-2 text-left text-base font-bold no-underline",
  "text-brand-600! transition-colors hover:bg-brand-50 hover:text-brand-700!",
  "dark:text-brand-400! dark:hover:bg-brand-950/30 dark:hover:text-brand-300!"
);

/** Shared styling for external (portal/pricing) rows in the mobile menu,
 *  matching MobileLink's inactive state so the two read as one list. */
const MOBILE_EXTERNAL_LINK_CLASS = cn(
  "block w-full rounded-lg px-3 py-2 text-left text-base font-medium",
  "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900",
  "dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
);

const MobileLink = ({ to, children, onClick }: MobileLinkProps) => (
  <NavLink
    to={to}
    onClick={onClick}
    className={({ isActive }: { isActive: boolean }) =>
      cn(
        "block w-full rounded-lg px-3 py-2 text-left text-base font-medium",
        isActive
          ? "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300"
          : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
      )
    }
  >
    {children}
  </NavLink>
);

export default Header;
