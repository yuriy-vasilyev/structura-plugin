/**
 * Tests for the campaign Stock tab (2026-06-05).
 *
 * What's pinned:
 *   - BYOK + pre-generation OFF → explainer banner with the
 *     "Enable pre-generation" CTA (the discovery/upsell surface),
 *     and no entry list.
 *   - Ready entries render title/excerpt + Ready badge.
 *   - Failed entries surface the failure reason + a retry control —
 *     the visibility the 2026-06-04 wedged-batch incident lacked.
 *   - In-flight entries render the generating strip with the
 *     "Cancel & regenerate" CTA; past 60 min it flips to the
 *     "taking longer than usual" stuck tone.
 *   - Empty stock renders the "Generate now" CTA.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const useDefaultProvidersMock = vi.hoisted(() => vi.fn());
const useCampaignMutationsMock = vi.hoisted(() => vi.fn());
const useStockListQueryMock = vi.hoisted(() => vi.fn());
const useStockMutationsMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/settings", () => ({
  useDefaultProviders: useDefaultProvidersMock,
}));
vi.mock("@/features/campaigns/api/useCampaignMutations", () => ({
  useCampaignMutations: useCampaignMutationsMock,
}));
vi.mock("@/features/campaigns/api/useStockListQuery", () => ({
  useStockListQuery: useStockListQueryMock,
}));
vi.mock("@/features/campaigns/api/useStockMutations", () => ({
  useStockMutations: useStockMutationsMock,
}));

import { StockTab } from "../components/StockTab";
import type { Campaign } from "../types";
import type {
  StockEntryView,
  StockPregenStatus,
} from "../api/useStockListQuery";

function makeCampaign(pregenerationEnabled: boolean): Campaign {
  return {
    id: "camp-1",
    status: "active",
    identity: { name: "C", objective: "O", campaignMode: undefined },
    intelligence: {},
    structure: { postStatus: "publish" },
    taxonomy: {},
    schedule: { pregenerationEnabled },
    stats: { postsPublished: 0, nextRun: "" },
  } as unknown as Campaign;
}

function makeEntry(over: Partial<StockEntryView> = {}): StockEntryView {
  return {
    stockId: "s-1",
    entryStatus: "ready",
    textStatus: "ready",
    imageStatus: "ready",
    title: "Stocked Post",
    excerpt: "A pre-generated excerpt.",
    featuredImageUrl: null,
    provider: "gemini",
    textModel: "gemini-3.1-pro-preview",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    batchSubmittedAt: null,
    failureReason: null,
    ...over,
  };
}

function setup(
  opts: {
    isCloud?: boolean;
    entries?: StockEntryView[];
    pregen?: StockPregenStatus | null;
    isDeletingEntry?: boolean;
  } = {},
) {
  useDefaultProvidersMock.mockReturnValue({ isCloud: opts.isCloud ?? false });
  useCampaignMutationsMock.mockReturnValue({
    updateCampaign: vi.fn(),
    isUpdating: false,
  });
  useStockListQueryMock.mockReturnValue({
    data: { entries: opts.entries ?? [], pregen: opts.pregen ?? null },
    isLoading: false,
  });
  useStockMutationsMock.mockReturnValue({
    deleteEntry: vi.fn(),
    isDeletingEntry: opts.isDeletingEntry ?? false,
    clearStock: vi.fn(),
    isClearing: false,
    restock: vi.fn(),
    isRestocking: false,
  });
}

describe("<StockTab>", () => {
  it("shows the enable-recommendation banner (and no list) for BYOK with pre-gen off", () => {
    setup({ isCloud: false });
    render(<StockTab campaign={makeCampaign(false)} />);

    expect(
      screen.getByText(/Pre-generation is off for this campaign/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Enable pre-generation/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ready in stock/i)).not.toBeInTheDocument();
  });

  it("shows the neutral explainer (always-on note) for managed plans", () => {
    setup({ isCloud: true });
    render(<StockTab campaign={makeCampaign(true)} />);

    expect(screen.getByText(/What is stock\?/i)).toBeInTheDocument();
    expect(
      screen.getByText(/always on for managed plans/i),
    ).toBeInTheDocument();
  });

  it("renders ready entries with title, excerpt, and Ready badge", () => {
    setup({ entries: [makeEntry()] });
    render(<StockTab campaign={makeCampaign(true)} />);

    expect(screen.getByText("Stocked Post")).toBeInTheDocument();
    expect(screen.getByText("A pre-generated excerpt.")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText(/1 ready in stock/i)).toBeInTheDocument();
  });

  it("surfaces the failure reason and a retry control on failed entries", () => {
    setup({
      entries: [
        makeEntry({
          stockId: "s-failed",
          entryStatus: "failed",
          textStatus: "failed",
          title: null,
          excerpt: null,
          failureReason:
            "Text batch exceeded 6h ceiling — provider job stuck in flight.",
        }),
      ],
    });
    render(<StockTab campaign={makeCampaign(true)} />);

    expect(screen.getByText(/exceeded 6h ceiling/i)).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByTitle("Retry")).toBeInTheDocument();
  });

  it("shows the generating strip with Cancel & regenerate while a batch is in flight", () => {
    setup({
      entries: [
        makeEntry({
          stockId: "s-gen",
          entryStatus: "pending",
          textStatus: "in_flight",
          title: null,
          excerpt: null,
          // 5 minutes ago — healthy, no stuck warning.
          batchSubmittedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
        }),
      ],
    });
    render(<StockTab campaign={makeCampaign(true)} />);

    expect(screen.getByText(/Generating 1 post/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Cancel & regenerate/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/taking longer than usual/i),
    ).not.toBeInTheDocument();
  });

  it("flips the strip to the stuck tone after 60 minutes in flight", () => {
    setup({
      entries: [
        makeEntry({
          stockId: "s-stuck",
          entryStatus: "pending",
          textStatus: "in_flight",
          title: null,
          excerpt: null,
          // 9 hours ago — the 2026-06-04 wedge scenario.
          batchSubmittedAt: new Date(Date.now() - 9 * 60 * 60_000).toISOString(),
        }),
      ],
    });
    render(<StockTab campaign={makeCampaign(true)} />);

    expect(screen.getByText(/taking longer than usual/i)).toBeInTheDocument();
  });

  it("renders the empty state with a Generate now CTA", () => {
    setup({ entries: [] });
    render(<StockTab campaign={makeCampaign(true)} />);

    expect(screen.getByText(/Stock is empty/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Generate now/i }),
    ).toBeInTheDocument();
  });

  it("shows the provider-errors paused banner when pre-generation is capped", () => {
    setup({
      entries: [],
      pregen: {
        paused: true,
        reason: "failure_cap",
        failureCount: 26,
        failureCap: 10,
        resetsAt: "2026-06-18T00:00:00.000Z",
      },
    });
    render(<StockTab campaign={makeCampaign(true)} />);

    expect(
      screen.getByText(/Pre-generation paused — provider errors/i),
    ).toBeInTheDocument();
    // The failed-attempt count is surfaced in the explanation.
    expect(screen.getByText(/26 failed generation attempts/i)).toBeInTheDocument();
  });

  it("shows a loading state on the discard confirmation while the delete is in flight", () => {
    // Regression: the single-post discard dialog hardcoded `loading={false}`,
    // so clicking Discard gave no feedback while the mutation was in flight —
    // only the clear-all path wired `isClearing`. Wiring `isDeletingEntry`
    // makes the confirm button spin and disables Cancel.
    setup({ entries: [makeEntry()], isDeletingEntry: true });
    render(<StockTab campaign={makeCampaign(true)} />);

    // Open the confirmation for the single ready entry.
    fireEvent.click(screen.getByTitle("Discard"));
    expect(screen.getByText("Discard this post?")).toBeInTheDocument();

    // Confirm button is in its loading state; Cancel is disabled. Before the
    // fix (`loading={false}` for delete) neither held: the button read
    // "Discard" and Cancel stayed enabled.
    expect(screen.getAllByText("Loading...").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeDisabled();
  });

  it("does not show the paused banner when pre-generation is healthy", () => {
    setup({ entries: [makeEntry()], pregen: { paused: false, reason: null, failureCount: 0, failureCap: 10, resetsAt: null } });
    render(<StockTab campaign={makeCampaign(true)} />);

    expect(
      screen.queryByText(/Pre-generation paused/i),
    ).not.toBeInTheDocument();
  });
});
