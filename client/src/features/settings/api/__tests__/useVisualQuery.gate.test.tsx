/**
 * useVisualQuery — locked-tier fetch gate.
 *
 * Regression (2026-07-09): the Visuals page renders a locked teaser for
 * plan "none", but this query fired anyway whenever a license_key was
 * present (the cancelled-key / cloud-pending window), producing a stray
 * "Data Fetch Error: Cookie check failed" toast under the teaser. The
 * query now also requires `isLicensed` (plan !== "none"), matching the
 * teaser gate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@wordpress/api-fetch", () => ({ default: apiFetchMock }));

const licenseMock = vi.hoisted(() => ({
  current: { hasUsableLicense: true as boolean | null, isLicensed: false },
}));
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => licenseMock.current,
}));

import { useVisualQuery } from "../useVisualQuery";

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({});
});

describe("useVisualQuery — tier gate", () => {
  it("does NOT fetch for a plan-'none' install even when a license_key is present", async () => {
    // hasUsableLicense true (key present) but plan is "none" → locked page.
    licenseMock.current = { hasUsableLicense: true, isLicensed: false };
    renderHook(() => useVisualQuery(), { wrapper });

    // Give TanStack a tick; a disabled query must never call the fetcher.
    await new Promise((r) => setTimeout(r, 20));
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("fetches for a licensed (non-none) install", async () => {
    licenseMock.current = { hasUsableLicense: true, isLicensed: true };
    renderHook(() => useVisualQuery(), { wrapper });

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
  });
});
