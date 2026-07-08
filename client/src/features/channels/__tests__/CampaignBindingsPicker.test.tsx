/**
 * CampaignBindingsPicker tests.
 *
 * Pins the three behaviors the install modal relies on:
 *   1. Default is "all campaigns" (null) — no campaigns fetch fires, matching
 *      what the wire payload should be for a fresh install.
 *   2. Switching to "Selected only" lazy-fetches campaigns and emits the
 *      toggled list back via onChange. Empty list means "silence everything"
 *      rather than "all campaigns" — the cloud normalizes it back to null
 *      but the client surface keeps the intent distinct so the dispatcher
 *      log reads accurately.
 *   3. Switching back to "All campaigns" coerces the value to null so the
 *      parent form posts the canonical default on save.
 *
 * Uses the same mocking pattern as the sibling AddWebhookForm test so the
 * two suites share a consistent wiring for apiFetch + @wordpress/i18n.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

// The picker's inline campaigns query now consults
// `useLicense().hasUsableLicense`. Stub to "bound" so the existing
// lazy-fetch / mode-toggle assertions still trip.
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => ({ hasUsableLicense: true, hasWorkspace: true }),
}));

import { CampaignBindingsPicker } from "../components/CampaignBindingsPicker";

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("CampaignBindingsPicker", () => {
  it("defaults to 'All campaigns' mode and does NOT fetch the campaigns list", () => {
    // Lazy fetch is load-bearing for two reasons:
    //   (a) every install modal would otherwise hammer /scheduler/campaigns
    //       on mount even when the user never narrows bindings;
    //   (b) the save-form tests rely on apiFetch not being called on mount.
    renderWithClient(
      <CampaignBindingsPicker value={null} onChange={() => {}} />,
    );

    expect(screen.getByText("All campaigns")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("switches to 'Selected only' mode, fetches campaigns, and emits the ticked id", async () => {
    apiFetchMock.mockResolvedValue([
      { id: 1, identity: { name: "Launch campaign" } },
      { id: 2, identity: { name: "Evergreen FAQs" } },
    ]);

    const onChange = vi.fn();
    renderWithClient(
      <CampaignBindingsPicker value={null} onChange={onChange} />,
    );

    // Flip into the selection mode. The button click calls onChange with the
    // current selectedIds (empty array), telling the parent to render a
    // "no campaigns picked → silence everything" state. We then re-render
    // with value=[] so the checkbox list mounts.
    fireEvent.click(screen.getByRole("button", { name: /selected only/i }));
    expect(onChange).toHaveBeenLastCalledWith([]);

    // Simulate the parent re-render that would follow the state update.
    renderWithClient(
      <CampaignBindingsPicker value={[]} onChange={onChange} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Launch campaign")).toBeInTheDocument();
    });
    expect(apiFetchMock).toHaveBeenCalledWith({
      path: "/structura/v1/scheduler/campaigns",
    });

    // Tick the second campaign — onChange receives an explicit allowlist.
    fireEvent.click(screen.getByLabelText(/evergreen faqs/i));
    expect(onChange).toHaveBeenLastCalledWith([2]);
  });

  it("flipping back to 'All campaigns' emits null so the wire default is restored", () => {
    // The parent form posts `bound_campaign_ids` 1:1 from this value. A
    // round-trip from [1,2] → null has to go through null, not [], so the
    // dispatcher treats the connection as unbound rather than as
    // "explicitly silenced" the next time it reads the Firestore doc.
    // The mocked campaigns response is a dummy list — we don't assert on
    // what gets rendered, we just need the query to resolve cleanly so
    // TanStack Query doesn't log an "undefined data" warning.
    apiFetchMock.mockResolvedValue([
      { id: 1, identity: { name: "Campaign 1" } },
      { id: 2, identity: { name: "Campaign 2" } },
    ]);

    const onChange = vi.fn();
    renderWithClient(
      <CampaignBindingsPicker value={[1, 2]} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /all campaigns/i }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("renders a zero-campaign nudge when the site has no campaigns yet", async () => {
    // Edge case that's easy to miss: a brand-new site opens the Store before
    // creating any campaigns. The empty allowlist would silence the channel
    // forever; we surface an amber hint pointing the user back to All mode.
    apiFetchMock.mockResolvedValue([]);

    renderWithClient(
      <CampaignBindingsPicker value={[]} onChange={() => {}} />,
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalled();
    });
    expect(
      await screen.findByText(/no campaigns exist yet/i),
    ).toBeInTheDocument();
  });
});
