/**
 * WizardGscConnectCard — the SEO step's optional GSC connect card
 * (design handoff gsc_wizard_dashboard, Board 01).
 *
 * Pins:
 *   - the four board states (not_connected / connecting / connected /
 *     skipped) + the property_pending EXTENSION state;
 *   - "Skip for now" persists in the wizard store and Undo reverses it;
 *   - Connect goes through the real mutations hook and sends
 *     `return_hash: "#/onboarding"` on the oauth/init wire — the field
 *     that brings the user back INTO the wizard after the bounce;
 *   - the card never touches step validity in any state or interaction
 *     ("Optional" is a hard contract, not a label).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@wordpress/api-fetch", () => ({
  default: (...args: unknown[]) => apiFetchMock(...args),
}));

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("@structura/ui", async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    toast: { success: vi.fn(), error: toastError },
  };
});

// Connection state driver — the card derives everything from this query.
const connectionsMock = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));
vi.mock("@/features/channels/api/useChannelConnectionsQuery", () => ({
  useChannelConnectionsQuery: () => connectionsMock.current,
}));

import { WizardGscConnectCard } from "../components/WizardGscConnectCard";
import { useWizardStore } from "../state/wizardStore";
import type { ConnectionSummary } from "@/features/channels/types";

/** A settled connections query with the given rows. */
const settled = (connections: ConnectionSummary[]) => ({
  data: connections,
  isSuccess: true,
  isError: false,
  isPending: false,
  fetchStatus: "idle",
});

/** An in-flight connections query (post-bounce re-entry, cache cold). */
const loading = () => ({
  data: undefined,
  isSuccess: false,
  isError: false,
  isPending: true,
  fetchStatus: "fetching",
});

const gscConnection = (
  over: Partial<ConnectionSummary> = {},
): ConnectionSummary => ({
  connectionId: "conn-1",
  integrationId: "google-search-console",
  status: "connected",
  displayName: "owner@acme-blog.com",
  externalAccountId: "sc-domain:acme-blog.com",
  connectedAt: "2026-07-18T10:00:00Z",
  lastUsedAt: null,
  lastError: null,
  externalAccountMeta: {
    googleEmail: "owner@acme-blog.com",
    property: "sc-domain:acme-blog.com",
    availableProperties: [
      { siteUrl: "sc-domain:acme-blog.com", permissionLevel: "siteOwner" },
    ],
  },
  ...over,
});

function renderCard(node: ReactNode = <WizardGscConnectCard />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}

beforeEach(() => {
  useWizardStore.getState().reset();
  apiFetchMock.mockReset();
  toastError.mockReset();
  connectionsMock.current = settled([]);
});

describe("WizardGscConnectCard — states (Board 01)", () => {
  it("not_connected: header, Optional pill, one value line, Connect, Skip, read-only meta", () => {
    renderCard();

    expect(screen.getByText("Google Search Console")).toBeInTheDocument();
    expect(screen.getByText("Optional")).toBeInTheDocument();
    expect(
      screen.getByText(
        "See what each post earns from Google Search — connect now and your first posts report from day one.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Connect/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Skip for now" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Free · read-only")).toBeInTheDocument();
  });

  it("connecting: re-entry after the OAuth bounce (persisted flag + cold connections cache)", () => {
    useWizardStore.getState().setGscConnectPending(true);
    connectionsMock.current = loading();
    renderCard();

    expect(
      screen.getByText(
        "Finishing up with Google… you can keep going — we'll confirm here.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Connect/ })).toBeNull();
  });

  it("connected: emerald 'done' tint, Connected badge, mono property id", () => {
    connectionsMock.current = settled([gscConnection()]);
    renderCard();

    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("sc-domain:acme-blog.com")).toBeInTheDocument();
    expect(screen.getByTestId("gsc-connect-card").className).toContain(
      "border-emerald-200/70",
    );
  });

  it("skipped: collapses to the one-line row with Undo", () => {
    useWizardStore.getState().setGscSkipped(true);
    renderCard();

    expect(
      screen.getByText(
        "Search Console skipped — connect anytime from Channels.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    // Collapsed row — no header, no Connect.
    expect(screen.queryByText("Google Search Console")).toBeNull();
    expect(screen.queryByRole("button", { name: /Connect/ })).toBeNull();
  });

  it("EXTENSION property_pending: non-tinted 'one step left' row deep-linking the Configure picker", () => {
    connectionsMock.current = settled([
      gscConnection({
        externalAccountId: null,
        externalAccountMeta: { googleEmail: "owner@acme-blog.com", property: null },
      }),
    ]);
    renderCard();

    expect(
      screen.getByText(
        "One step left — choose your Search Console property.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Choose property" }),
    ).toHaveAttribute("href", "#/channels/connections?configure=conn-1");
    // Not the emerald "done" celebration — the job isn't finished.
    expect(screen.getByTestId("gsc-connect-card").className).not.toContain(
      "border-emerald-200/70",
    );
    // Never re-offer OAuth here.
    expect(screen.queryByRole("button", { name: /Connect/ })).toBeNull();
  });
});

describe("WizardGscConnectCard — skip persistence + Undo", () => {
  it("Skip for now persists in the wizard store; Undo restores the card and the store", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(useWizardStore.getState().gscSkipped).toBe(true);
    expect(
      screen.getByText(
        "Search Console skipped — connect anytime from Channels.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(useWizardStore.getState().gscSkipped).toBe(false);
    expect(screen.getByRole("button", { name: /Connect/ })).toBeInTheDocument();
    expect(screen.getByText("Free · read-only")).toBeInTheDocument();
  });
});

describe("WizardGscConnectCard — Connect wire", () => {
  it("sends return_hash '#/onboarding' on the oauth/init call and flags the round-trip", async () => {
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      authorizeUrl: "https://accounts.google.example/auth",
    });
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));

    await waitFor(() => {
      const call = apiFetchMock.mock.calls.find(
        (c) =>
          (c[0] as { path?: string })?.path ===
          "/structura/v1/channels/oauth/init",
      );
      expect(call).toBeTruthy();
      const data = (call![0] as { data: Record<string, unknown> }).data;
      expect(data.integration_id).toBe("google-search-console");
      // The field that lands the bounce back INSIDE the wizard.
      expect(data.return_hash).toBe("#/onboarding");
    });
    // Persisted before the redirect unloads the SPA.
    await waitFor(() =>
      expect(useWizardStore.getState().gscConnectPending).toBe(true),
    );
  });

  it("clears the persisted pending flag once connections resolve without a GSC row (user cancelled at Google)", async () => {
    useWizardStore.getState().setGscConnectPending(true);
    connectionsMock.current = settled([]);
    renderCard();

    // Back to the offer, not a forever-spinner.
    expect(screen.getByRole("button", { name: /Connect/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(useWizardStore.getState().gscConnectPending).toBe(false),
    );
  });
});

describe("WizardGscConnectCard — step validity is untouched", () => {
  it("never writes step-3 validity in any state or interaction", async () => {
    // Pre-set validity so we'd notice a write in either direction.
    useWizardStore.getState().setStepValid(3, false);

    // not_connected + skip + undo.
    const first = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(useWizardStore.getState().stepValidity[3]).toBe(false);
    first.unmount();

    // connected — the "success" state must not validate the step either.
    connectionsMock.current = settled([gscConnection()]);
    renderCard();
    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(useWizardStore.getState().stepValidity[3]).toBe(false);
  });
});
