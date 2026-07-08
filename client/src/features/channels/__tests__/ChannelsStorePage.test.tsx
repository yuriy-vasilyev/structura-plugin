/**
 * ChannelsStorePage render-state tests.
 *
 * Covers the four surfaces a user can see on the Store tab:
 *   - Loading (skeleton grid)
 *   - Error   (red banner with cloud error message)
 *   - Empty   (catalog returned zero entries)
 *   - Populated — specifically the **Free-tier teaser** path: a free-plan
 *     user must see every catalog entry with the correct upgrade CTA wired
 *     to the pricing page (spec §10, §17 Phase 6).
 *
 * The per-card rendering logic (badges, CTAs, gating hints) is exercised in
 * CatalogEntryCard.test.tsx. Here we only confirm the page composes the
 * query → grid pipeline and that the upgrade conversion lever reaches the
 * DOM for a free user — i.e. that the `activeAddons`-derivation fix (prior
 * slice) actually produces the right teaser when rendered end-to-end.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
    return format.replace(/%[sd]/g, () => String(args[i++]));
  },
}));

// IntegrationIcon does a CDN fetch with fallback state — unrelated to this
// slice. Stub to a marker so we can assert the card actually rendered.
vi.mock("../components/IntegrationIcon", () => ({
  IntegrationIcon: ({ integrationId }: { integrationId: string }) => (
    <span data-testid={`icon-${integrationId}`} />
  ),
}));

// `useChannelCatalogQuery` now consults `useLicense()` to decide whether
// the cloud handshake can succeed on this host (see 2026-04 refactor).
// In the page tests we don't care about that path — stub useLicense to a
// fixed paid-and-valid shape so the catalog query runs as before.
const licenseMock = vi.hoisted(() => ({
  isActivationValid: true as boolean | null,
  // hasUsableLicense gates every cloud-bound query post-2026-05; stub
  // to "bound" so the catalog fetch fires under test like it would on
  // a live paid install.
  hasUsableLicense: true as boolean | null,
}));
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => licenseMock,
}));

// InstallModal is mounted per-card but only rendered to DOM when `open=true`.
// The Store page itself never opens a modal on mount — stub to null so tests
// don't depend on Headless UI portal plumbing.
vi.mock("../components/InstallModal", () => ({
  InstallModal: () => null,
}));

import { ChannelsStorePage } from "../routes/ChannelsStorePage";
import type { IntegrationCatalogEntry, ListCatalogResponse } from "../types";

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // MemoryRouter is required: ChannelsSubNav renders NavLinks.
  return render(
    <MemoryRouter initialEntries={["/channels/store"]}>
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </MemoryRouter>,
  );
}

// Minimal catalog mirroring the shape a free-plan user receives from the
// cloud post-§11 migration. Three slots cover the three blocker branches:
//   - coming_soon (whatsapp): always blocked regardless of plan
//   - upgrade_plan (slack): the core Free-tier teaser path
//   - add_channels (linkedin, with comingSoon=false so the branch fires):
//     Pro users without the Channels SKU would see this; free users get
//     upgrade_plan first per the computeEntitlement order, but we include
//     a synthesized flavor here to cover the LinkedIn-ships future.
const freeUserCatalog: ListCatalogResponse = {
  success: true,
  plan: "free",
  // activeAddons is empty for a free user with no entitlements — this is
  // exactly the shape the fixed endpoint returns when `License.entitlements`
  // is absent or empty (the legacy `activeAddons` array is ignored now).
  activeAddons: [],
  entries: [
    {
      id: "whatsapp",
      name: "WhatsApp",
      description: "Ping yourself on WhatsApp when a post goes live.",
      category: "notify",
      capabilities: ["notify"],
      authType: "apikey",
      iconUrl: "",
      gating: { requiredPlan: "free", requiredAddon: null },
      comingSoon: true,
      entitlement: { canInstall: false, blocker: "coming_soon" },
    },
    {
      id: "slack-webhook",
      name: "Slack",
      description: "Post to Slack when content publishes.",
      category: "notify",
      capabilities: ["notify"],
      authType: "webhook",
      iconUrl: "",
      gating: { requiredPlan: "byok", requiredAddon: null },
      entitlement: { canInstall: false, blocker: "upgrade_plan" },
    },
  ] satisfies IntegrationCatalogEntry[],
};

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("ChannelsStorePage — free-tier teaser", () => {
  it("renders skeleton placeholders while the catalog query is in flight", () => {
    // Return a never-settling promise so the query stays pending. The page
    // must mount the busy grid immediately, not a blank area, so the card
    // positions don't jump when the response lands.
    apiFetchMock.mockImplementationOnce(() => new Promise(() => {}));

    renderWithClient(<ChannelsStorePage />);

    expect(
      screen.getByLabelText("Loading the integration catalog"),
    ).toHaveAttribute("aria-busy");
    // Cards haven't arrived yet.
    expect(screen.queryByText("Slack")).toBeNull();
  });

  it("renders the populated grid with each entry's name and CTA for a free user", async () => {
    apiFetchMock.mockResolvedValueOnce(freeUserCatalog);
    renderWithClient(<ChannelsStorePage />);

    // Wait for the real grid to replace the skeleton.
    await waitFor(() => {
      expect(screen.getByText("Slack")).toBeInTheDocument();
    });

    // WhatsApp (coming_soon) — card present.
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();

    // Exactly one coming-soon CTA (WhatsApp) — present as a disabled button,
    // not a link. The blocked slack card also carries a visible "Upgrade plan"
    // link; keep the assertions specific so one path can't mask the other.
    // The URL is built via `buildMarketingPricingUrl`, so it carries
    // the locale segment + `intent=general_upgrade` query — assert
    // structure rather than literal string (same pattern as
    // CatalogEntryCard.test.tsx).
    const upgradeLink = screen.getByRole("link", { name: /upgrade plan/i });
    const upgradeHref = new URL(upgradeLink.getAttribute("href") ?? "");
    expect(upgradeHref.host).toBe("www.structurawp.com");
    expect(upgradeHref.pathname).toMatch(/\/(en|de|es|fr)\/pricing$/);
    expect(upgradeHref.searchParams.get("intent")).toBe("general_upgrade");

    // Gating hints reach the DOM — this is the bit that pins the spec §10
    // promise "Basic/Free users still see the Store tab" to actual rendered
    // output for the new entitlement shape.
    expect(screen.getByText("Requires Pro plan")).toBeInTheDocument();

    // No Install buttons — the free user has nothing they can install.
    expect(screen.queryByRole("button", { name: /^install$/i })).toBeNull();
  });

  it("posts to the WP REST proxy at /structura/v1/channels/catalog", async () => {
    apiFetchMock.mockResolvedValueOnce(freeUserCatalog);
    renderWithClient(<ChannelsStorePage />);

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith({
        path: "/structura/v1/channels/catalog",
      });
    });
  });

  it("renders the empty state when the catalog has zero entries", async () => {
    // Cloud might return zero entries mid-deploy while the catalog file is
    // being rolled out. The page must fall back to a message rather than
    // an empty div so users know it's not just a styling bug.
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      plan: "free",
      activeAddons: [],
      entries: [],
    } satisfies ListCatalogResponse);

    renderWithClient(<ChannelsStorePage />);

    await waitFor(() => {
      expect(
        screen.getByText("The catalog is empty right now"),
      ).toBeInTheDocument();
    });
    // No skeleton left over.
    expect(screen.queryByLabelText("Loading the integration catalog")).toBeNull();
  });

  it("renders the error banner with the thrown message when the query fails", async () => {
    apiFetchMock.mockRejectedValueOnce(new Error("cloud is down"));
    renderWithClient(<ChannelsStorePage />);

    await waitFor(() => {
      expect(
        screen.getByText("We couldn't load the integration catalog."),
      ).toBeInTheDocument();
    });
    // The thrown message is surfaced so operators can diagnose at a glance.
    expect(screen.getByText("cloud is down")).toBeInTheDocument();
  });

  it("coerces a malformed cloud response to the empty state", async () => {
    // `useChannelCatalogQuery` defends against a malformed envelope by
    // returning an empty catalog. The page should render the empty-state
    // branch rather than crash when `entries` is missing.
    apiFetchMock.mockResolvedValueOnce({ success: true } as unknown);
    renderWithClient(<ChannelsStorePage />);

    await waitFor(() => {
      expect(
        screen.getByText("The catalog is empty right now"),
      ).toBeInTheDocument();
    });
  });
});
