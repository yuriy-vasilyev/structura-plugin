/**
 * ChannelsConnectionsPage integration test.
 *
 * The page composes the list query + mutation hooks with the ChannelConnectionRow
 * presentational component. Adding new connections now lives in the Store install
 * flow, not on this page, so we don't test a create-webhook surface here. We
 * cover the three render branches the user will actually see (empty / populated
 * / error) plus one end-to-end delete flow to verify the mutation +
 * cache-invalidation wiring.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

const apiFetchMock = vi.fn();
vi.mock("@wordpress/api-fetch", () => ({
  default: (...args: unknown[]) => apiFetchMock(...args),
}));
vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

vi.mock("@structura/ui", async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    toast: { success: vi.fn(), error: vi.fn() },
  };
});

// `useChannelConnectionsQuery` now consults `useLicense()` so it can
// short-circuit when the activation-secret handshake would fail on the
// current host (see 2026-04 refactor — isActivationValid). The page
// tests don't care about that branch; stub the hook to a valid,
// paid-tier shape so the connections query runs as before.
const licenseMock = vi.hoisted(() => ({
  isActivationValid: true as boolean | null,
  // hasUsableLicense gates every cloud-bound query post-2026-05; stub
  // to "bound" so the connections fetch fires under test.
  hasUsableLicense: true as boolean | null,
}));
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => licenseMock,
}));

import { ChannelsConnectionsPage } from "../routes/ChannelsConnectionsPage";
import type { ConnectionSummary } from "../types";

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // MemoryRouter needed because the page renders ChannelsSubNav (NavLink).
  return render(
    <MemoryRouter initialEntries={["/channels/connections"]}>
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </MemoryRouter>,
  );
}

const connection: ConnectionSummary = {
  integrationId: "slack",
  status: "connected",
  displayName: "#deploys",
  externalAccountId: "hooks.slack.com",
  connectedAt: "2026-04-14T12:00:00Z",
  lastUsedAt: null,
  lastError: null,
};

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("ChannelsConnectionsPage", () => {
  it("renders the empty state when the cloud returns no connections", async () => {
    apiFetchMock.mockResolvedValueOnce({ success: true, connections: [] });

    renderWithClient(<ChannelsConnectionsPage />);

    await waitFor(() => {
      expect(
        screen.getByText("No channels connected yet"),
      ).toBeInTheDocument();
    });
    // Header is always mounted regardless of list state.
    expect(screen.getByText("Channel Connections")).toBeInTheDocument();
    // The webhook form has moved to the Store install flow — it must NOT
    // render on the Connections page any more.
    expect(screen.queryByText("Add a webhook channel")).toBeNull();
  });

  it("renders a row for each connection returned by the cloud", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      connections: [connection],
    });

    renderWithClient(<ChannelsConnectionsPage />);

    await waitFor(() => {
      expect(screen.getByText("#deploys")).toBeInTheDocument();
    });
    expect(screen.getByText("hooks.slack.com")).toBeInTheDocument();
    expect(screen.queryByText("No channels connected yet")).toBeNull();
  });

  it("renders an error state when the list query rejects", async () => {
    apiFetchMock.mockRejectedValueOnce(new Error("cloud is down"));

    renderWithClient(<ChannelsConnectionsPage />);

    await waitFor(() => {
      expect(
        screen.getByText("We couldn't load your channel connections."),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("cloud is down")).toBeInTheDocument();
  });

  it("opens the InstallModal in edit mode when the user clicks Edit on a webhook row", async () => {
    // Wiring the edit-in-place flow: clicking Edit on a webhook row that
    // (a) has a connectionId and (b) has a matching catalog entry should
    // open the InstallModal with the title "Edit <integration>". The modal
    // is the same component used for fresh installs; presence of the
    // edit-mode title is the strongest signal that editingConnection was
    // threaded through correctly. Webhook-ping in particular needs this:
    // rotating a signing secret is a routine operation and shouldn't
    // require deleting + reinstalling a connection.
    const CONN_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    // First fetch: list — returns one webhook-ping connection.
    // Second fetch: catalog — the page queries it in parallel; we return a
    //   single webhook-ping entry so the row can resolve canEdit=true.
    apiFetchMock
      .mockResolvedValueOnce({
        success: true,
        connections: [
          {
            connectionId: CONN_ID,
            integrationId: "webhook-ping",
            status: "connected",
            displayName: "Next.js revalidator",
            externalAccountId: "example.com",
            connectedAt: "2026-04-19T12:00:00Z",
            lastUsedAt: null,
            lastError: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        success: true,
        plan: "byok",
        activeAddons: [],
        entries: [
          {
            id: "webhook-ping",
            name: "Webhook",
            description: "Signed HTTPS webhook for headless consumers.",
            category: "notify",
            capabilities: ["notify"],
            authType: "webhook",
            iconUrl: "https://cdn.simpleicons.org/webhook/8A8A8A",
            gating: { requiredPlan: "byok", requiredAddon: null },
          },
        ],
      });

    renderWithClient(<ChannelsConnectionsPage />);

    // Wait until the row lands AND the catalog has resolved — the Edit
    // button only renders once both queries have completed since the page
    // gates the button on `catalogById.get(...)`.
    const editButton = await screen.findByRole("button", { name: /^edit$/i });
    fireEvent.click(editButton);

    // The InstallModal renders its Dialog portal; title matches "Edit <name>"
    // when editingConnection is threaded through — the Store's install path
    // would instead render "Install Webhook", so we assert on the exact edit
    // title to rule out a false positive where the modal mounts in the
    // wrong mode.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Edit Webhook")).toBeInTheDocument();
    // And the form inside should be pre-seeded with the existing display
    // name — proving the connection summary actually reached the form,
    // not just the modal shell.
    expect(within(dialog).getByDisplayValue("Next.js revalidator")).toBeInTheDocument();
  });

  it("DELETEs by connectionId and refetches the list on disconnect confirmation", async () => {
    // Post-UUID migration the row stores `connectionId` — the cloud returns
    // it on list responses and the row keys delete by it, so two siblings
    // sharing `integrationId` can be severed independently. We key the row
    // on the UUID to pin that behavior.
    const CONN_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    apiFetchMock
      .mockResolvedValueOnce({
        success: true,
        connections: [{ ...connection, connectionId: CONN_ID }],
      })
      .mockResolvedValueOnce({ success: true, connectionId: CONN_ID })
      .mockResolvedValueOnce({ success: true, connections: [] });

    renderWithClient(<ChannelsConnectionsPage />);

    await waitFor(() => {
      expect(screen.getByText("#deploys")).toBeInTheDocument();
    });

    // Click the row-level Disconnect button to open the confirm dialog.
    // At this point there's only one Disconnect button on the page.
    fireEvent.click(screen.getByRole("button", { name: /disconnect/i }));

    // Confirm inside the dialog. The row-level button plus the dialog's
    // confirm both carry the label "Disconnect" — scope the query with
    // `within(dialog)` so we don't accidentally hit the row button again.
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: /^disconnect$/i }),
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith({
        path: `/structura/v1/channels/connections/${CONN_ID}`,
        method: "DELETE",
      });
    });
    // Cache invalidation triggers a refetch, which returns an empty list and
    // swaps the page into its empty state.
    await waitFor(() => {
      expect(
        screen.getByText("No channels connected yet"),
      ).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Video channel — quota pass-through + deep-link upgrade gate
// ---------------------------------------------------------------------------

describe("ChannelsConnectionsPage — video channel", () => {
  const videoConnection: ConnectionSummary = {
    connectionId: "conn-video",
    integrationId: "video",
    status: "connected",
    displayName: "Vertical video",
    externalAccountId: null,
    connectedAt: "2026-07-01T12:00:00Z",
    lastUsedAt: null,
    lastError: null,
  };

  const videoCatalogEntry = {
    id: "video",
    name: "Video: Shorts & TikTok",
    description: "Vertical videos for Shorts and TikTok.",
    category: "video",
    capabilities: ["adapt"],
    authType: "none",
    iconUrl: "",
    gating: { requiredPlan: "cloud_pro", requiredAddon: null },
    entitlement: { canInstall: true, blocker: null as string | null },
  };

  /** Path-routed mock: connections + catalog resolve independently of call order. */
  const mockApi = ({
    videoQuota,
    entitlementBlocker = null as string | null,
  }: { videoQuota?: { used: number; cap: number }; entitlementBlocker?: string | null } = {}) => {
    apiFetchMock.mockImplementation((args: { path?: string }) => {
      const path = (args as { path?: string })?.path ?? "";
      if (path.startsWith("/structura/v1/channels/catalog")) {
        return Promise.resolve({
          success: true,
          plan: "cloud_pro",
          activeAddons: [],
          entries: [
            {
              ...videoCatalogEntry,
              entitlement: {
                canInstall: entitlementBlocker === null,
                blocker: entitlementBlocker,
              },
            },
          ],
        });
      }
      if (path.startsWith("/structura/v1/channels/connections")) {
        return Promise.resolve({
          success: true,
          connections: [videoConnection],
          ...(videoQuota ? { videoQuota } : {}),
        });
      }
      if (path.startsWith("/structura/v1/scheduler/campaigns")) {
        // CampaignBindingsPicker inside the configure modal fetches the
        // campaign list — an empty array keeps it in its "no campaigns"
        // branch without muddying these assertions.
        return Promise.resolve([]);
      }
      return Promise.resolve({ success: true });
    });
  };

  const renderAt = (initialEntry: string) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <QueryClientProvider client={client}>
          <ChannelsConnectionsPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );
  };

  it("threads the top-level videoQuota through to the video row's meter", async () => {
    mockApi({ videoQuota: { used: 12, cap: 20 } });

    renderAt("/channels/connections");

    await waitFor(() => {
      expect(screen.getByText("Vertical video")).toBeInTheDocument();
    });
    expect(screen.getByText("12 of 20 videos this month")).toBeInTheDocument();
  });

  it("gates a deep-linked video connection behind the Cloud Pro upsell when the plan lost access", async () => {
    // Installed on Cloud Pro, then downgraded: a `?configure=` deep link to
    // the video connection must show the upgrade gate (handoff §4) instead
    // of the settings modal.
    mockApi({ entitlementBlocker: "upgrade_plan" });

    renderAt("/channels/connections?configure=conn-video");

    await waitFor(() => {
      expect(
        screen.getByText("Video is a Cloud Pro feature"),
      ).toBeInTheDocument();
    });
    // The settings modal must NOT have opened.
    expect(screen.queryByText("Configure Vertical video")).toBeNull();
    const upgrade = screen.getByRole("link", { name: /upgrade plan/i });
    expect(new URL(upgrade.getAttribute("href") ?? "").searchParams.get("intent")).toBe(
      "unlock_video",
    );
  });

  it("opens the settings modal for a deep-linked video connection when entitled", async () => {
    mockApi();

    renderAt("/channels/connections?configure=conn-video");

    await waitFor(() => {
      expect(screen.getByText("Configure Vertical video")).toBeInTheDocument();
    });
    expect(screen.queryByText("Video is a Cloud Pro feature")).toBeNull();
  });
});
