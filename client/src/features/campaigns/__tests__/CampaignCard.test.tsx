/**
 * CampaignCard — unacknowledged-failure indicator tests.
 *
 * Spec: `specs/plugin-quiet-mode.md` §5.6 (needs-attention overlay on
 * campaign rows). The indicator is failure-only by deliberate choice —
 * `succeeded_with_warnings` gets the calmer in-drawer receipt path; a
 * red badge on the campaign list for every warning would be noise.
 *
 * We also pin the click-through UX: the card itself is a `<button>` that
 * navigates to the campaign detail, so the indicator uses `role="link"`
 * + `stopPropagation` to peel off to `#/runs/{runId}` without the parent
 * hijacking. These tests guard against the nested-interactive trap if
 * anyone refactors the row into a real anchor.
 */

import { describe, expect, it, vi } from "vitest";
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

// The card now uses `useAcknowledgeRunMutation` to clear the pill on
// click. That hook reaches for `useQueryClient` — stub `apiFetch` so
// the fire-and-forget POST is silent, and wrap every render in a
// QueryClientProvider so the hook resolves without real network IO.
vi.mock("@wordpress/api-fetch", () => ({
  default: vi.fn().mockResolvedValue({ success: true }),
}));

// CampaignCard transitively renders StockSummaryChip + CampaignRunProgress,
// both of whose query hooks now consult `useLicense().hasUsableLicense`.
// Stub to "bound" so the existing assertions on the failure pill /
// click-through behaviour still trip without spinning up the real
// settings provider chain.
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => ({ hasUsableLicense: true, hasWorkspace: true }),
}));

import { CampaignCard } from "../routes/CampaignsPage";
import type { Campaign } from "../types";

/**
 * Render helper that wraps the card in a fresh QueryClientProvider per
 * test. A fresh client avoids cross-test cache leakage (invalidations
 * triggered by the ack mutation only touch this test's client) and
 * keeps the existing assertions — which all probe the rendered DOM
 * rather than the cache — unchanged.
 */
function renderCard(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

const BASE_CAMPAIGN: Campaign = {
  id: 42,
  status: "active",
  identity: {
    name: "Weekly Digest",
    objective: "Drive weekly newsletter signups",
    campaignMode: "traffic_magnet",
  },
  intelligence: {
    textProvider: "gemini",
    imageProvider: "gemini",
    textModel: "gemini-1.5-pro",
    imageModel: "imagen-3",
    personaId: 1,
    language: "en_US",
    postLength: 1200,
    replaceLongDashes: false,
    disableEmojis: false,
    // SeoOptimizationRules is a structural type; empty record satisfies
    // it for fixtures that don't care about SEO.
    seoRules: {} as Campaign["intelligence"]["seoRules"],
  },
  structure: {
    enabledBlocks: [],
    featuredImage: true,
    bodyImages: true,
    disclosure: { enabled: false, text: "" },
    postStatus: "publish",
  },
  taxonomy: {
    categories: { mode: "auto", list: [] },
    tags: { mode: "auto", list: [] },
  },
  schedule: {
    cron: "0 9 * * 1",
    endCondition: { type: "infinite", value: 0 },
    pregenerationEnabled: true,
  },
  stats: { postsPublished: 7, nextRun: "2026-04-29T09:00:00.000Z" },
};

describe("CampaignCard — failure indicator", () => {
  it("does not render the failure pill when there is no lastRun signal", () => {
    renderCard(
      <CampaignCard
        campaign={BASE_CAMPAIGN}
        personaName="Editor"
        onClick={() => {}}
      />,
    );

    // Absence of the indicator = clean state. The pill is the only
    // element we'd find with this role + name on the row.
    expect(
      screen.queryByRole("link", { name: /last run failed/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Needs attention")).not.toBeInTheDocument();
  });

  it("does not render the pill for a warning-level lastRun — warnings are not failures", () => {
    // `succeeded_with_warnings` is PROMOTED to the drawer's calmer
    // WarningsReceipt. Surfacing it as a red badge on the list would
    // mis-signal severity (and the whole point of the indicator is
    // that a red dot means "act on this now").
    renderCard(
      <CampaignCard
        campaign={{
          ...BASE_CAMPAIGN,
          lastRun: {
            runId: "run-warn-1",
            status: "succeeded_with_warnings",
            endedAt: "2026-04-22T12:00:00.000Z",
            headline: "Fan-out warning",
            errorMessage: "",
          },
        }}
        personaName="Editor"
        onClick={() => {}}
      />,
    );

    expect(screen.queryByText("Needs attention")).not.toBeInTheDocument();
  });

  it("renders the failure pill with the error message in the tooltip when lastRun is `failed`", () => {
    renderCard(
      <CampaignCard
        campaign={{
          ...BASE_CAMPAIGN,
          lastRun: {
            runId: "run-failed-1",
            status: "failed",
            endedAt: "2026-04-22T12:00:00.000Z",
            headline: "Generation stopped",
            errorMessage: "Slack disconnected us — please reconnect.",
          },
        }}
        personaName="Editor"
        onClick={() => {}}
      />,
    );

    const pill = screen.getByRole("link", { name: /last run failed/i });
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveTextContent("Needs attention");
    // The browser-native tooltip carries the same human message — the
    // `title` attribute is the quickest hover affordance on wp-admin
    // where our custom tooltip primitive isn't wired into the list.
    expect(pill).toHaveAttribute(
      "title",
      "Slack disconnected us — please reconnect.",
    );
  });

  it("clicks through to the run-detail hash route and does not bubble to the card's onClick", () => {
    const cardOnClick = vi.fn();
    const originalHash = window.location.hash;

    renderCard(
      <CampaignCard
        campaign={{
          ...BASE_CAMPAIGN,
          lastRun: {
            runId: "run-failed-2",
            status: "failed",
            endedAt: "2026-04-22T12:00:00.000Z",
            headline: "",
            errorMessage: "Auth token expired.",
          },
        }}
        personaName="Editor"
        onClick={cardOnClick}
      />,
    );

    const pill = screen.getByRole("link", { name: /last run failed/i });
    fireEvent.click(pill);

    // `stopPropagation` — the card wraps a <button> with an onClick
    // that opens the campaign detail; the pill must not trigger it.
    expect(cardOnClick).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#/runs/run-failed-2");

    // Restore to keep the jsdom environment clean for sibling tests.
    window.location.hash = originalHash;
  });

  it("is keyboard-activatable via Enter and Space and does not propagate to the card", () => {
    const cardOnClick = vi.fn();
    const originalHash = window.location.hash;

    renderCard(
      <CampaignCard
        campaign={{
          ...BASE_CAMPAIGN,
          lastRun: {
            runId: "run-failed-3",
            status: "failed",
            endedAt: "2026-04-22T12:00:00.000Z",
            headline: "",
            errorMessage: "",
          },
        }}
        personaName="Editor"
        onClick={cardOnClick}
      />,
    );

    const pill = screen.getByRole("link", { name: /last run failed/i });
    pill.focus();

    // Enter → navigate
    fireEvent.keyDown(pill, { key: "Enter" });
    expect(window.location.hash).toBe("#/runs/run-failed-3");
    expect(cardOnClick).not.toHaveBeenCalled();

    // Reset and try Space
    window.location.hash = "";
    fireEvent.keyDown(pill, { key: " " });
    expect(window.location.hash).toBe("#/runs/run-failed-3");
    expect(cardOnClick).not.toHaveBeenCalled();

    window.location.hash = originalHash;
  });

  it("falls back to the generic tooltip when `errorMessage` is empty", () => {
    // Defensive: the plugin bridge may surface a failure without a
    // human message (e.g. a provider 5xx with no body). The pill still
    // needs a readable hover affordance or we drop the signal entirely.
    renderCard(
      <CampaignCard
        campaign={{
          ...BASE_CAMPAIGN,
          lastRun: {
            runId: "run-failed-4",
            status: "failed",
            endedAt: "2026-04-22T12:00:00.000Z",
            headline: "",
            errorMessage: "",
          },
        }}
        personaName="Editor"
        onClick={() => {}}
      />,
    );

    const pill = screen.getByRole("link", { name: /last run failed/i });
    expect(pill).toHaveAttribute(
      "title",
      "Last run failed — view details.",
    );
  });

  it("fires /runs/{id}/acknowledge on click so the pill doesn't require a second surface to dismiss", async () => {
    // Before this wiring the only way to clear the pill was via the
    // Needs Attention widget or the admin notice — clicking the pill
    // on the Campaigns list only navigated. That left users who saw
    // the pill on the list with a "flickers then goes away by
    // itself" experience if someone ack'd the run elsewhere. Firing
    // the ack on click aligns the pill's lifecycle with the user's
    // intent ("I see this, take me to the detail").
    //
    // We don't assert on the React Query cache — that's an
    // implementation detail covered in the mutation's own tests.
    // Here we only pin the network edge: was the POST made with the
    // right path?
    const apiFetchMock = (await import("@wordpress/api-fetch"))
      .default as unknown as ReturnType<typeof vi.fn>;
    apiFetchMock.mockClear();
    const originalHash = window.location.hash;

    renderCard(
      <CampaignCard
        campaign={{
          ...BASE_CAMPAIGN,
          lastRun: {
            runId: "run-failed-ack",
            status: "failed",
            endedAt: "2026-04-22T12:00:00.000Z",
            headline: "",
            errorMessage: "",
          },
        }}
        personaName="Editor"
        onClick={() => {}}
      />,
    );

    const pill = screen.getByRole("link", { name: /last run failed/i });
    fireEvent.click(pill);

    // Navigation still lands — the ack is fire-and-forget, not a
    // prerequisite for opening the detail page.
    expect(window.location.hash).toBe("#/runs/run-failed-ack");
    // React Query's `mutate()` returns synchronously but defers
    // `mutationFn` until after `onMutate`'s async cancellations
    // resolve. Wait for the POST to actually reach the wire — a
    // refactor that drops the mutation OR breaks the onMutate chain
    // (so mutationFn never runs) will both trip this assertion.
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/structura/v1/runs/run-failed-ack/acknowledge",
          method: "POST",
        }),
      ),
    );

    window.location.hash = originalHash;
  });
});
