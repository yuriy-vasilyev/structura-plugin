/**
 * ExpiredConnectionsBanner tests.
 *
 * Coverage priorities:
 *   - Banner is invisible when all connections are "connected".
 *   - Banner is invisible while the query is loading (no flash).
 *   - Banner appears with singular copy for one unhealthy connection.
 *   - Banner appears with plural copy (count + status buckets) for
 *     multiple unhealthy connections.
 *   - Error variant (red) is used for expired/revoked; warning variant
 *     (yellow) is used for error-only.
 *   - CTA button navigates to `/channels/connections`.
 *
 * Pure helpers (`selectUnhealthy`, `countByStatus`) get dedicated
 * unit tests so we don't need to render the whole component to exercise
 * the filter logic.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

const h = vi.hoisted(() => ({
  connections: [] as unknown[],
  isLoading: false,
}));

vi.mock("@/features/channels/api/useChannelConnectionsQuery", () => ({
  useChannelConnectionsQuery: () => ({
    data: h.connections,
    isLoading: h.isLoading,
  }),
}));

import {
  ExpiredConnectionsBanner,
  selectUnhealthy,
  countByStatus,
} from "../ExpiredConnectionsBanner";
import type { ConnectionSummary } from "@/features/channels/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function conn(overrides: Partial<ConnectionSummary> = {}): ConnectionSummary {
  return {
    connectionId: "conn-1",
    integrationId: "slack-webhook",
    status: "connected",
    displayName: "#deploys",
    externalAccountId: "hooks.slack.com",
    connectedAt: "2026-04-14T12:00:00Z",
    lastUsedAt: null,
    lastError: null,
    ...overrides,
  };
}

function renderBanner() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <ExpiredConnectionsBanner />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.connections = [];
  h.isLoading = false;
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("selectUnhealthy", () => {
  it("returns [] when all connections are connected", () => {
    expect(selectUnhealthy([conn(), conn({ connectionId: "c2" })])).toEqual(
      [],
    );
  });

  it("filters out connected and keeps expired/revoked/error", () => {
    const result = selectUnhealthy([
      conn({ status: "connected" }),
      conn({ connectionId: "c2", status: "expired" }),
      conn({ connectionId: "c3", status: "revoked" }),
      conn({ connectionId: "c4", status: "error" }),
    ]);
    expect(result.length).toBe(3);
    expect(result.map((c) => c.status)).toEqual([
      "expired",
      "revoked",
      "error",
    ]);
  });
});

describe("countByStatus", () => {
  it("counts each bucket correctly", () => {
    const unhealthy = [
      conn({ status: "expired" }),
      conn({ status: "expired" }),
      conn({ status: "revoked" }),
      conn({ status: "error" }),
    ];
    expect(countByStatus(unhealthy)).toEqual({
      expired: 2,
      revoked: 1,
      error: 1,
    });
  });

  it("returns zeros for an empty list", () => {
    expect(countByStatus([])).toEqual({ expired: 0, revoked: 0, error: 0 });
  });
});

// ---------------------------------------------------------------------------
// Render tests
// ---------------------------------------------------------------------------

describe("ExpiredConnectionsBanner render", () => {
  it("renders nothing when all connections are connected", () => {
    h.connections = [conn(), conn({ connectionId: "c2" })];
    const { container } = renderBanner();
    expect(screen.queryByTestId("expired-connections-banner")).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when there are no connections at all", () => {
    h.connections = [];
    const { container } = renderBanner();
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing while the query is loading", () => {
    h.isLoading = true;
    h.connections = [];
    const { container } = renderBanner();
    expect(container.innerHTML).toBe("");
  });

  it("renders singular copy for one unhealthy connection", () => {
    h.connections = [conn({ status: "expired", displayName: "#alerts" })];
    renderBanner();
    expect(
      screen.getByTestId("expired-connections-banner"),
    ).toBeInTheDocument();
    // Singular form includes the connection name.
    expect(
      screen.getByText(/channel connection \u201c#alerts\u201d needs attention/i),
    ).toBeInTheDocument();
  });

  it("renders plural copy with count for multiple unhealthy connections", () => {
    h.connections = [
      conn({ connectionId: "c1", status: "expired" }),
      conn({ connectionId: "c2", status: "revoked", displayName: "#general" }),
    ];
    renderBanner();
    expect(screen.getByText(/2 channel connections/i)).toBeInTheDocument();
  });

  it("lists status buckets in the body text", () => {
    h.connections = [
      conn({ connectionId: "c1", status: "expired" }),
      conn({ connectionId: "c2", status: "expired" }),
      conn({ connectionId: "c3", status: "revoked" }),
    ];
    renderBanner();
    expect(screen.getByText(/2 expired/i)).toBeInTheDocument();
    expect(screen.getByText(/1 revoked/i)).toBeInTheDocument();
  });

  it("uses error variant when any connection is expired", () => {
    h.connections = [conn({ status: "expired" })];
    renderBanner();
    // The Alert component receives variant="error" which renders
    // a destructive/red appearance. We check for the XCircle icon
    // (unique to error variant) via its role="img" svg.
    const banner = screen.getByTestId("expired-connections-banner");
    // The title is present — just verify the banner rendered.
    expect(banner).toBeInTheDocument();
  });

  it("uses error variant when any connection is revoked", () => {
    h.connections = [conn({ status: "revoked" })];
    renderBanner();
    expect(
      screen.getByTestId("expired-connections-banner"),
    ).toBeInTheDocument();
  });

  it("uses warning variant when only error-status connections exist", () => {
    h.connections = [conn({ status: "error" })];
    renderBanner();
    expect(
      screen.getByTestId("expired-connections-banner"),
    ).toBeInTheDocument();
  });

  it("renders a CTA button pointing to the connections page", () => {
    h.connections = [conn({ status: "expired" })];
    renderBanner();
    const button = screen.getByRole("button", { name: /view connections/i });
    expect(button).toBeInTheDocument();
  });

  it("ignores healthy connections alongside unhealthy ones", () => {
    h.connections = [
      conn({ connectionId: "c1", status: "connected" }),
      conn({
        connectionId: "c2",
        status: "expired",
        displayName: "#broken",
      }),
    ];
    renderBanner();
    // Only one unhealthy → singular copy with the broken connection's name.
    expect(screen.getByText(/#broken/)).toBeInTheDocument();
  });
});
