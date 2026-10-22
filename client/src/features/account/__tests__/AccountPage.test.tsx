/**
 * Plugin account page.
 *
 * Cloud plan card (2026-10-12, specs/cloud-volume-pricing.md §4 slice 4):
 * one Cloud card for every volume option, labelled with the license's posts
 * per site (read from the cycle-usage view).
 *
 * Plan hero and payment attention (2026-10-21,
 * specs/in-portal-billing-design.md §6): the plan as the portal names it,
 * never "Architect" or "Pro"; this site's usage this month, loading and
 * unavailable rather than zero; Change volume, Manage account and, while
 * the heartbeat reports a failed payment, Fix payment, each a customer
 * portal link carrying the site, plan, return URL and, for billing, the
 * workspace.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { CycleUsageView } from "@/features/dashboard/api/useUsageAnalytics";

const license = vi.hoisted(() => ({
  plan: "cloud" as string,
  status: "active" as string,
  maskedKey: "ST-ABCD***********WXYZ" as string,
  workspace: { id: "ws-1", name: "Northstar Studio", activationsCount: 1 } as {
    id: string;
    name: string;
    activationsCount: number;
  } | null,
}));
const usage = vi.hoisted(() => ({ cycle: null as unknown, isLoading: false }));

vi.mock("@/features/settings", () => ({
  useLicense: () => ({
    isLicensed: license.plan !== "none",
    plan: license.plan,
    status: license.status,
    license: { masked_key: license.maskedKey, plan: license.plan },
    cloudStatus: { valid: true },
    entitlements: {},
    graceperiods: {},
    activate: vi.fn(),
    deactivate: vi.fn(),
    processing: false,
    workspace: license.workspace,
  }),
}));

// The data hook is the network edge; the row selection stays real.
vi.mock("@/features/dashboard/api/useUsageAnalytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/dashboard/api/useUsageAnalytics")>()),
  useUsageAnalytics: () => ({
    data: usage.cycle ? { cycleUsage: usage.cycle } : undefined,
    isLoading: usage.isLoading,
  }),
}));

// Add-on cards fetch their own state; not what this file covers.
vi.mock("../components/AddonsSection", () => ({ AddonsSection: () => null }));

import { Account, cloudPostsPerSite } from "../routes/AccountPage";

/** 2026-11-01T00:00:00Z, when October's allowance resets. */
const NOV_1 = Date.UTC(2026, 10, 1);

type ManagedRow = Extract<CycleUsageView, { kind: "managed" }>["activations"][number];

function managedRow(overrides: Partial<ManagedRow> = {}): ManagedRow {
  return {
    activationId: "act-1",
    label: "example.com",
    tokensUsed: 0,
    tokensIncluded: 0,
    imagesUsed: 51,
    imagesIncluded: 90,
    postsUsed: 24,
    postsIncluded: 30,
    utilizationPercent: 80,
    ...overrides,
  };
}

function managedView(postsIncluded: number | undefined, rows?: ManagedRow[]): CycleUsageView {
  const activations = rows ?? [managedRow({ postsUsed: 3, postsIncluded, utilizationPercent: 3 })];
  return {
    kind: "managed",
    cycleMonth: "2026-10",
    cycleResetsAt: NOV_1,
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
    activations,
  };
}

/** The plan hero: the card around the plan's heading. */
function hero(name: string): HTMLElement {
  return screen.getByRole("heading", { level: 2, name }).closest("[class*='p-8']") as HTMLElement;
}

/** A customer portal link's query, as a plain object. */
function portalQuery(link: HTMLElement) {
  const url = new URL(link.getAttribute("href") ?? "");
  expect(url.origin + url.pathname).toBe("https://app.structurawp.com/");
  return Object.fromEntries(url.searchParams);
}

beforeEach(() => {
  license.plan = "cloud";
  license.status = "active";
  license.maskedKey = "ST-ABCD***********WXYZ";
  license.workspace = { id: "ws-1", name: "Northstar Studio", activationsCount: 1 };
  usage.cycle = null;
  usage.isLoading = false;
  window.structuraConfig = { activation_id: "act-1" } as typeof window.structuraConfig;
});

afterEach(() => {
  delete (window as { structuraConfig?: unknown }).structuraConfig;
  vi.restoreAllMocks();
});

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
  it("shows a 100-post Cloud license as Cloud with its posts number", () => {
    usage.cycle = managedView(100);
    render(<Account />);
    expect(screen.getByRole("heading", { level: 2, name: "Cloud · 100 posts" })).toBeInTheDocument();
    expect(screen.queryByText(/Cloud Pro/)).not.toBeInTheDocument();
  });

  it("falls back to the plain Cloud label until the posts number is known", () => {
    render(<Account />);
    expect(screen.getByRole("heading", { level: 2, name: "Cloud" })).toBeInTheDocument();
  });
});

describe("Account — plan hero (2026-10-21)", () => {
  it("names the plan as the portal does and shows this site's usage this month", () => {
    usage.cycle = managedView(30, [managedRow(), managedRow({ activationId: "act-2", postsUsed: 30 })]);
    render(<Account />);

    expect(screen.getByRole("heading", { level: 2, name: "Cloud · 30 posts" })).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(
      screen.getByText("Managed AI for this site. Your monthly allowance includes research, writing and images.")
    ).toBeInTheDocument();
    // This site's row (act-1), not its sibling's.
    const posts = screen.getByRole("progressbar", { name: "24 of 30 posts delivered" });
    expect(posts).toHaveAttribute("aria-valuenow", "24");
    expect(posts).toHaveAttribute("aria-valuemax", "30");
    expect(screen.getByRole("progressbar", { name: "51 of 90 images" })).toHaveAttribute("aria-valuenow", "51");
    expect(screen.getByText("Resets Nov 1, 2026 · UTC")).toBeInTheDocument();
    expect(
      screen.getByText("Billing changes are made in the customer portal. You may need to sign in as the payer.")
    ).toBeInTheDocument();
    expect(hero("Cloud · 30 posts").textContent).not.toMatch(/Architect|\bPro\b/);
  });

  it("links Change volume and Manage account to the customer portal with the site's context", () => {
    usage.cycle = managedView(30, [managedRow()]);
    render(<Account />);

    expect(portalQuery(screen.getByRole("link", { name: "Change volume in customer portal" }))).toEqual({
      intent: "change_volume",
      source: "plugin",
      domain: window.location.hostname,
      plan: "cloud",
      returnTo: window.location.href,
      workspaceId: "ws-1",
    });
    // One Manage account on the page: it moved from License Activation to the hero.
    const manage = screen.getAllByRole("link", { name: "Manage account" });
    expect(manage).toHaveLength(1);
    expect(portalQuery(manage[0])).toEqual({
      intent: "manage_account",
      source: "plugin",
      domain: window.location.hostname,
      plan: "cloud",
      returnTo: window.location.href,
    });
    expect(screen.queryByRole("button", { name: "Fix payment in customer portal" })).not.toBeInTheDocument();
    expect(screen.queryByText("Your payment needs attention")).not.toBeInTheDocument();
  });

  it("leaves the workspace off the billing links until the heartbeat names it", () => {
    license.workspace = null;
    render(<Account />);
    const query = portalQuery(screen.getByRole("link", { name: "Change volume in customer portal" }));
    expect(query).not.toHaveProperty("workspaceId");
  });

  it.each(["past_due", "unpaid"])("asks to fix the payment in the portal while the license is %s", (status) => {
    license.status = status;
    usage.cycle = { kind: "none", reason: `license status: ${status}` };
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<Account />);

    const alert = screen.getByRole("status");
    expect(alert).toHaveTextContent("Your payment needs attention");
    expect(alert).toHaveTextContent(
      "We could not collect your latest payment. Update your payment method, then check the outstanding invoice."
    );
    fireEvent.click(within(alert).getByRole("button", { name: "Fix payment in customer portal" }));
    expect(open).toHaveBeenCalledTimes(1);
    const [href, target, features] = open.mock.calls[0] as [string, string, string];
    expect(target).toBe("_blank");
    expect(features).toBe("noopener,noreferrer");
    const link = document.createElement("a");
    link.setAttribute("href", href);
    expect(portalQuery(link)).toEqual({
      intent: "fix_payment",
      source: "plugin",
      domain: window.location.hostname,
      plan: "cloud",
      returnTo: window.location.href,
      workspaceId: "ws-1",
    });
    expect(screen.getByText("Payment overdue")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    // The cloud sends no usage for a license that is not active: never a zero.
    expect(screen.getByText("This month's usage is not available right now.")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("says the usage is loading instead of showing zero", () => {
    usage.isLoading = true;
    render(<Account />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading this month's usage…");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/\b0 of\b/)).not.toBeInTheDocument();
  });

  it("does not show another site's usage when this site's row is missing", () => {
    usage.cycle = managedView(30, [
      managedRow({ activationId: "act-2" }),
      managedRow({ activationId: "act-3" }),
    ]);
    render(<Account />);
    expect(screen.getByText("This month's usage is not available right now.")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows BYOK's counts this month without a volume change", () => {
    license.plan = "byok";
    usage.cycle = {
      kind: "byok",
      cycleMonth: "2026-10",
      cycleResetsAt: NOV_1,
      daysLeftInCycle: 19,
      postsUsed: 12,
      tokensUsed: 90_000,
      imagesUsed: 1,
    };
    render(<Account />);

    expect(screen.getByRole("heading", { level: 2, name: "BYOK" })).toBeInTheDocument();
    expect(screen.getByText("12 posts delivered this month")).toBeInTheDocument();
    expect(screen.getByText("1 image this month")).toBeInTheDocument();
    expect(screen.getByText("Resets Nov 1, 2026 · UTC")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Change volume in customer portal" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage account" })).toBeInTheDocument();
  });

  it("names a Free license Free, without the retired Pro plan", () => {
    license.plan = "free";
    render(<Account />);

    expect(screen.getByRole("heading", { level: 2, name: "Free" })).toBeInTheDocument();
    expect(
      screen.getByText("Your account is connected. Upgrade for high-authority SEO rules and bulk synthesis.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage account" })).toBeInTheDocument();
    // No usage source for Free: no meters, no loading or unavailable line.
    expect(screen.queryByRole("group", { name: "This month's usage" })).not.toBeInTheDocument();
    expect(screen.queryByText(/this month/i)).not.toBeInTheDocument();
    expect(hero("Free").textContent).not.toMatch(/Architect|\bPro\b/);
  });

  it("keeps Anonymous Mode for a site without an account", () => {
    license.plan = "none";
    license.maskedKey = "";
    license.status = "none";
    render(<Account />);

    expect(screen.getByRole("heading", { level: 2, name: "Anonymous Mode" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Create Free Account" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Manage account" })).not.toBeInTheDocument();
  });
});
