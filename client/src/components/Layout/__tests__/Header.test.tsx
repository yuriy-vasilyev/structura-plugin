/**
 * Header tests.
 *
 * Three things are pinned here:
 *
 *   1. Account & Settings stay OUT of the primary horizontal nav and
 *      live in the plan-chip account menu — the row was overflowing in
 *      longer locales (German). `buildPrimaryNavLinks` must never emit
 *      `/account` or `/settings`.
 *   2. The account menu's CTAs follow license state: anonymous → Connect,
 *      licensed → Manage, and Upgrade everywhere except the Cloud Pro
 *      ceiling. `getAccountMenuModel` owns that branching.
 *   3. The Header *renders* without throwing. This is the regression
 *      guard for React error #185: the account menu was briefly built on
 *      DropdownMenu, whose anchored `MenuItems` mount eagerly, so
 *      floating-ui ran at rest and looped — crashing the whole app from
 *      the header (which sits outside the route error boundary). The
 *      Popover rebuild mounts its panel only on open, so a closed Header
 *      must render cleanly.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
}));

const state = vi.hoisted(() => ({
  license: {
    isLicensed: false,
    plan: "none",
    audience: null as string | null,
    loading: false,
  },
  channelsVisible: false,
}));

vi.mock("@/features/settings", () => ({
  useLicense: () => state.license,
}));
vi.mock("@/features/channels", () => ({
  useChannelsVisibility: () => state.channelsVisible,
}));
// NoticesBell pulls in TanStack Query; stub it so the header renders
// without a QueryClientProvider in scope.
vi.mock("@/features/notices", () => ({
  NoticesBell: () => null,
}));

import Header from "../Header";
import { buildPrimaryNavLinks, getAccountMenuModel } from "../headerNav";

describe("buildPrimaryNavLinks", () => {
  it("never includes Account or Settings (they live in the account menu)", () => {
    const links = buildPrimaryNavLinks({ channelsVisible: true, plan: "byok" });
    const paths = links.map((l) => l.to);
    expect(paths).not.toContain("/account");
    expect(paths).not.toContain("/settings");
  });

  it("keeps the core destinations inline", () => {
    const paths = buildPrimaryNavLinks({
      channelsVisible: false,
      plan: "free",
    }).map((l) => l.to);
    // `/site` sits after Visuals — identity/intelligence surface sits
    // after the daily-work content flow. Spec/seo-intelligence-plan.md §4.
    expect(paths).toEqual([
      "/",
      "/campaigns",
      "/personas",
      "/visuals",
      "/site",
      "/ai-engine",
    ]);
  });

  it("always includes /site (identity tab unlocked on every tier)", () => {
    // The Info tab is universally available (it hosts the Headless
    // Mode toggle, an existing free feature). Higher tabs in the same
    // route lock per-tier, but the entry point must always be
    // visible — otherwise the user can't reach the always-available
    // identity controls.
    for (const plan of ["none", "free", "byok", "cloud", "cloud_pro"]) {
      const paths = buildPrimaryNavLinks({
        channelsVisible: false,
        plan,
      }).map((l) => l.to);
      expect(paths).toContain("/site");
    }
  });

  it("shows Channels only when visible", () => {
    const withChannels = buildPrimaryNavLinks({
      channelsVisible: true,
      plan: "byok",
    }).map((l) => l.to);
    expect(withChannels).toContain("/channels");

    const without = buildPrimaryNavLinks({
      channelsVisible: false,
      plan: "byok",
    }).map((l) => l.to);
    expect(without).not.toContain("/channels");
  });

  it("hides AI Engine on managed plans (Cloud runs the keys for them)", () => {
    const cloud = buildPrimaryNavLinks({
      channelsVisible: false,
      plan: "cloud",
    }).map((l) => l.to);
    expect(cloud).not.toContain("/ai-engine");

    const byok = buildPrimaryNavLinks({
      channelsVisible: false,
      plan: "byok",
    }).map((l) => l.to);
    expect(byok).toContain("/ai-engine");
  });
});

describe("getAccountMenuModel", () => {
  it("anonymous: prominent Upgrade → pricing, quiet Create-a-free-account", () => {
    expect(
      getAccountMenuModel({ loading: false, isLicensed: false, plan: "none" })
    ).toEqual({
      showUpgrade: true,
      upgradeTarget: "pricing",
      showManage: false,
      showCreateAccount: true,
    });
  });

  it("Free: Upgrade → portal billing, plus Manage account", () => {
    expect(
      getAccountMenuModel({ loading: false, isLicensed: true, plan: "free" })
    ).toEqual({
      showUpgrade: true,
      upgradeTarget: "portal",
      showManage: true,
      showCreateAccount: false,
    });
  });

  it("paid tiers (byok, cloud, cloud_pro): Manage account only — no Upgrade", () => {
    for (const plan of ["byok", "cloud", "cloud_pro"]) {
      expect(
        getAccountMenuModel({ loading: false, isLicensed: true, plan })
      ).toEqual({
        showUpgrade: false,
        upgradeTarget: "portal",
        showManage: true,
        showCreateAccount: false,
      });
    }
  });

  it("surfaces nothing while the license query is in flight", () => {
    expect(
      getAccountMenuModel({ loading: true, isLicensed: false, plan: "none" })
    ).toEqual({
      showUpgrade: false,
      upgradeTarget: "portal",
      showManage: false,
      showCreateAccount: false,
    });
  });
});

describe("<Header /> (renders at rest — guards React #185)", () => {
  it("renders without looping and keeps Account/Settings out of the closed row", () => {
    state.license = {
      isLicensed: true,
      plan: "byok",
      audience: "individual",
      loading: false,
    };
    state.channelsVisible = false;

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    // Primary destination is inline…
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    // …the plan chip doubles as the account-menu trigger…
    expect(
      screen.getByRole("button", { name: "Account menu" })
    ).toBeInTheDocument();
    // …and the account items are not in the closed header: the Popover
    // panel mounts only on open, which is the whole point of the #185 fix.
    expect(screen.queryByText("Account & License")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });
});
