/**
 * Plugin account page, Cloud plan card (2026-10-12,
 * specs/cloud-volume-pricing.md §4 slice 4): one Cloud card for every
 * volume option, labelled with the license's posts per site (read from the
 * cycle-usage view).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CycleUsageView } from "@/features/dashboard/api/useUsageAnalytics";

const license = vi.hoisted(() => ({ plan: "cloud" as string }));
const usage = vi.hoisted(() => ({ cycle: null as unknown }));

vi.mock("@/features/settings", () => ({
  useLicense: () => ({
    isLicensed: true,
    plan: license.plan,
    license: { masked_key: "ST-ABCD***********WXYZ", plan: license.plan },
    cloudStatus: { valid: true },
    entitlements: {},
    graceperiods: {},
    activate: vi.fn(),
    deactivate: vi.fn(),
    processing: false,
    workspace: undefined,
  }),
}));

// The data hook is the network edge; the row selection stays real.
vi.mock("@/features/dashboard/api/useUsageAnalytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/dashboard/api/useUsageAnalytics")>()),
  useUsageAnalytics: () => ({ data: usage.cycle ? { cycleUsage: usage.cycle } : undefined }),
}));

// Add-on cards fetch their own state; not what this file covers.
vi.mock("../components/AddonsSection", () => ({ AddonsSection: () => null }));

import { Account, cloudPostsPerSite } from "../routes/AccountPage";

function managedView(postsIncluded: number | undefined): CycleUsageView {
  return {
    kind: "managed",
    cycleMonth: "2026-10",
    cycleResetsAt: 0,
    daysLeftInCycle: 19,
    workspace: {
      tokensUsed: 0,
      tokensIncluded: 0,
      imagesUsed: 0,
      imagesIncluded: 0,
      postsUsed: 3,
      postsIncluded: postsIncluded === undefined ? undefined : postsIncluded * 2,
      utilizationPercent: 3,
    },
    activations: [
      {
        activationId: "act-1",
        label: "example.com",
        tokensUsed: 0,
        tokensIncluded: 0,
        imagesUsed: 0,
        imagesIncluded: 0,
        postsUsed: 3,
        postsIncluded,
        utilizationPercent: 3,
      },
    ],
  };
}

describe("cloudPostsPerSite", () => {
  it("reads the per-site posts from the license's usage row, not the workspace sum", () => {
    expect(cloudPostsPerSite(managedView(100))).toBe(100);
  });

  it("is null before the view loads, off a managed plan, or on a cloud without posts", () => {
    expect(cloudPostsPerSite(undefined)).toBeNull();
    expect(cloudPostsPerSite({ kind: "none", reason: "free" })).toBeNull();
    expect(cloudPostsPerSite(managedView(undefined))).toBeNull();
  });
});

describe("Account — Cloud plan card", () => {
  beforeEach(() => {
    usage.cycle = null;
  });

  it("shows a 100-post Cloud license as Cloud with its posts number", () => {
    license.plan = "cloud";
    usage.cycle = managedView(100);
    render(<Account />);
    expect(screen.getByRole("heading", { name: "Cloud Architect" })).toBeInTheDocument();
    expect(screen.getByText("Cloud, 100 posts")).toBeInTheDocument();
    expect(screen.queryByText(/Cloud Pro/)).not.toBeInTheDocument();
  });

  it("falls back to the plain Cloud label until the posts number is known", () => {
    license.plan = "cloud";
    render(<Account />);
    expect(screen.getByRole("heading", { name: "Cloud Architect" })).toBeInTheDocument();
    expect(screen.getByText("Cloud")).toBeInTheDocument();
  });
});
