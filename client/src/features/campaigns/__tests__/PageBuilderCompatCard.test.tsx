/**
 * PageBuilderCompatCard — render-branch and dismissal tests.
 *
 * The card has four observable states, each of which we pin:
 *
 *   1. Nothing detected → render null (most common state in prod).
 *   2. Atomic-meta builder detected → "info" variant, "compatibility
 *      guide" link to the docs URL for the builder.
 *   3. Only opt-in builders detected → "default" variant, gentler
 *      copy, still one doc link per detected builder.
 *   4. Dismissal counter past the threshold → render null.
 *
 * Spec: `specs/page-builder-compat.md` §4.2.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { PageBuilderCompatCard } from "../components/PageBuilderCompatCard";
import type { CompatPageBuildersResponse } from "../api/useCompatPageBuildersQuery";
import { perActivationStorageKey } from "@/utils/storageKey";

// Translation stubs — return the raw keys so assertions can use the
// English source strings literally. Mirrors the pattern used in
// CampaignCard.test.tsx.
vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

// Stub apiFetch so the query hook resolves against our fixture.
const apiFetchMock = vi.fn();
vi.mock("@wordpress/api-fetch", () => ({
  __esModule: true,
  default: (...args: unknown[]) => apiFetchMock(...args),
}));

// useCompatPageBuildersQuery now gates on `useLicense().hasUsableLicense` —
// stub to "bound" so the existing render-branch assertions still trip.
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => ({ hasUsableLicense: true, hasWorkspace: true }),
}));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function resolveWith(response: CompatPageBuildersResponse) {
  apiFetchMock.mockResolvedValue(response);
}

async function flushMicrotasks() {
  // Two awaits because tanstack-query resolves across a microtask
  // boundary before the component re-renders.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  apiFetchMock.mockReset();
  window.localStorage.clear();
});

describe("PageBuilderCompatCard", () => {
  it("renders nothing when no builders are detected", async () => {
    resolveWith({ detected: [], checked_at: null });
    const { container } = render(wrap(<PageBuilderCompatCard />));
    await flushMicrotasks();
    expect(container.firstChild).toBeNull();
  });

  it("renders an info-variant card with the docs link when an atomic-meta builder is detected", async () => {
    resolveWith({
      detected: [
        {
          slug: "divi",
          label: "Divi",
          kind: "atomic-meta",
          docs_url: "https://docs.structurawp.com/en/troubleshooting/page-builders/divi",
          opt_out_meta_active: true,
        },
      ],
      checked_at: "2026-04-23T10:00:00Z",
    });

    render(wrap(<PageBuilderCompatCard />));
    await flushMicrotasks();

    // The headline names the builder.
    expect(await screen.findByText(/Divi detected on this site/i)).toBeInTheDocument();

    // The docs link points at the URL the endpoint returned.
    const link = screen.getByRole("link", { name: /Divi compatibility guide/i });
    expect(link).toHaveAttribute(
      "href",
      "https://docs.structurawp.com/en/troubleshooting/page-builders/divi"
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("uses the gentler default-variant copy when only opt-in builders are detected", async () => {
    resolveWith({
      detected: [
        {
          slug: "elementor",
          label: "Elementor",
          kind: "opt-in",
          docs_url: "https://docs.structurawp.com/en/troubleshooting/page-builders/elementor",
          opt_out_meta_active: false,
        },
      ],
      checked_at: "2026-04-23T10:00:00Z",
    });

    render(wrap(<PageBuilderCompatCard />));
    await flushMicrotasks();

    // Opt-in copy: "is active" rather than "detected on this site".
    expect(
      await screen.findByText(/Elementor is active on this site/i)
    ).toBeInTheDocument();
  });

  it("disappears after the user clicks dismiss three times", async () => {
    resolveWith({
      detected: [
        {
          slug: "divi",
          label: "Divi",
          kind: "atomic-meta",
          docs_url: "https://docs.structurawp.com/en/troubleshooting/page-builders/divi",
          opt_out_meta_active: true,
        },
      ],
      checked_at: "2026-04-23T10:00:00Z",
    });

    // Pre-seed the dismissal counter to 2 so a single click crosses
    // the threshold — avoids having to wrangle three re-renders in a
    // jsdom environment where useQuery unmounts between renders. The
    // key is now per-activation, so derive it the same way the card does.
    window.localStorage.setItem(
      perActivationStorageKey("structura:page-builder-compat-card:v1"),
      JSON.stringify({ count: 2, snapshot: "divi" })
    );

    const { container, rerender } = render(wrap(<PageBuilderCompatCard />));

    const dismiss = await waitFor(() =>
      screen.getByRole("button", { name: /Dismiss/i })
    );
    fireEvent.click(dismiss);

    // After the third dismiss, re-render with a fresh card and
    // confirm it no longer appears. A fresh render is needed rather
    // than relying on the same component instance to re-check its
    // own dismissal — the gate lives in the render body, not in a
    // reactive subscription to localStorage.
    rerender(wrap(<PageBuilderCompatCard />));
    await waitFor(() => {
      expect(container.querySelector('[role="alert"]')).toBeNull();
    });
  });
});
