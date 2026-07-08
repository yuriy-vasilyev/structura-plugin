/**
 * Render-branch tests for the Phase 3.7 workspace membership card.
 *
 * We pin:
 *   - hidden when workspace is null (pre-Phase-3.7 cloud OR cloud
 *     read failure)
 *   - hidden when activationsCount <= 1 (single-site licenses, the
 *     v1 common case)
 *   - rendered with workspace name + sibling-count copy when
 *     activationsCount > 1
 *   - "Manage workspace" CTA points at the portal URL with the
 *     workspace id
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  _n: (single: string, plural: string, count: number) =>
    count === 1 ? single : plural,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format
      .replace(/%(\d+)\$[sd]/g, (_m, idx) => String(args[Number(idx) - 1]))
      .replace(/%[sd]/g, () => String(args[i++]))
      .replace(/%%/g, "%");
  },
}));

const useLicenseMock = vi.fn();
vi.mock("@/features/settings", () => ({
  useLicense: () => useLicenseMock(),
}));

import { WorkspaceMembershipCard } from "../WorkspaceMembershipCard";

describe("WorkspaceMembershipCard — hidden states", () => {
  it("renders nothing when workspace is null", () => {
    useLicenseMock.mockReturnValue({ workspace: null });
    const { container } = render(<WorkspaceMembershipCard />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when activationsCount is 1 (single-site license)", () => {
    useLicenseMock.mockReturnValue({
      workspace: {
        id: "ws_1",
        name: "Yurii's workspace",
        activationsCount: 1,
      },
    });
    const { container } = render(<WorkspaceMembershipCard />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when activationsCount is 0 (defensive)", () => {
    useLicenseMock.mockReturnValue({
      workspace: { id: "ws_1", name: "ws", activationsCount: 0 },
    });
    const { container } = render(<WorkspaceMembershipCard />);
    expect(container.firstChild).toBeNull();
  });
});

describe("WorkspaceMembershipCard — visible states", () => {
  it("renders workspace name + plural sibling count", () => {
    useLicenseMock.mockReturnValue({
      workspace: {
        id: "ws_abc",
        name: "Acme Marketing",
        activationsCount: 5,
      },
    });
    render(<WorkspaceMembershipCard />);

    expect(screen.getByText("Acme Marketing")).toBeTruthy();
    // 5 total → 4 siblings → plural form.
    expect(
      screen.getByText(/alongside 4 other sites/),
    ).toBeTruthy();
  });

  it("renders the singular form when activationsCount is exactly 2", () => {
    useLicenseMock.mockReturnValue({
      workspace: { id: "ws_xy", name: "Two Sites", activationsCount: 2 },
    });
    render(<WorkspaceMembershipCard />);

    expect(screen.getByText("Two Sites")).toBeTruthy();
    // 2 total → 1 sibling → singular.
    expect(screen.getByText(/alongside 1 other site\./)).toBeTruthy();
  });

  it("links the Manage workspace CTA at the portal workspace URL", () => {
    useLicenseMock.mockReturnValue({
      workspace: {
        id: "ws_abc",
        name: "Acme",
        activationsCount: 3,
      },
    });
    render(<WorkspaceMembershipCard />);

    const link = screen.getByRole("link", { name: /Manage workspace/ });
    expect(link.getAttribute("href")).toBe(
      "https://app.structurawp.com/workspaces/ws_abc",
    );
    // Opens in new tab — workspace management is portal territory.
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});
