/**
 * useLicense — plan auto-sync fires once per page load.
 *
 * Regression (2026-10-06): wp-admin fired `/license/sync` about 28 times
 * in 15 seconds on load. Every component that calls `useLicense()` ran its
 * own sync effect behind its own `isSyncing` ref, so every mounted
 * instance POSTed when the heartbeat landed, and every later mount POSTed
 * again while the stored plan still read differently from the cloud plan.
 *
 * Runs the real hook against the real TanStack cache; only `apiFetch` (the
 * network edge) is mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@structura/ui";
import type { ReactNode } from "react";

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@wordpress/api-fetch", () => ({ default: apiFetchMock }));

import { useLicense } from "../useLicense";
import { settingsKeys } from "../keys";

const state = { storedPlan: "none", cloudPlan: "cloud" };

function routeApiFetch({ path }: { path: string }) {
  if (path === "/structura/v1/settings") {
    return Promise.resolve({
      license: { plan: state.storedPlan, license_key: "ST-AAAA-BBBB-CCCC", is_pro: false },
    });
  }
  if (path === "/structura/v1/license/cloud-status") {
    return Promise.resolve({ plan: state.cloudPlan, status: "active", message: "" });
  }
  if (path === "/structura/v1/license/sync") {
    return Promise.resolve({ success: true });
  }
  return Promise.resolve({});
}

const syncCalls = () =>
  apiFetchMock.mock.calls.filter(([arg]) => arg?.path === "/structura/v1/license/sync");

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  state.storedPlan = "none";
  state.cloudPlan = "cloud";
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(routeApiFetch);
});

describe("useLicense plan auto-sync (2026-10-06 /license/sync storm)", () => {
  it("POSTs /license/sync once when many components mount useLicense", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = makeWrapper(client);

    const hooks = Array.from({ length: 8 }, () => renderHook(() => useLicense(), { wrapper }));
    await waitFor(() => expect(hooks[0].result.current.cloudStatus?.plan).toBe("cloud"));
    await waitFor(() => expect(syncCalls().length).toBeGreaterThan(0));
    // Let the settings invalidation refetch settle.
    await new Promise((r) => setTimeout(r, 30));

    // Later mounts (route changes) while the stored plan still differs.
    renderHook(() => useLicense(), { wrapper });
    renderHook(() => useLicense(), { wrapper });
    await new Promise((r) => setTimeout(r, 30));

    expect(syncCalls()).toHaveLength(1);
    expect(syncCalls()[0][0].data).toEqual({ plan: "cloud" });
  });

  it("syncs again when the cloud plan really changes", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = makeWrapper(client);

    const { result } = renderHook(() => useLicense(), { wrapper });
    renderHook(() => useLicense(), { wrapper });
    await waitFor(() => expect(syncCalls()).toHaveLength(1));

    state.cloudPlan = "cloud_pro";
    await client.invalidateQueries({ queryKey: ["license-cloud-verify"] });
    await waitFor(() => expect(result.current.cloudStatus?.plan).toBe("cloud_pro"));
    await new Promise((r) => setTimeout(r, 30));

    expect(syncCalls()).toHaveLength(2);
    expect(syncCalls()[1][0].data).toEqual({ plan: "cloud_pro" });
  });

  it("does not sync when the stored plan already matches the cloud", async () => {
    state.storedPlan = "cloud";
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = makeWrapper(client);

    const { result } = renderHook(() => useLicense(), { wrapper });
    await waitFor(() => expect(result.current.cloudStatus?.plan).toBe("cloud"));
    await waitFor(() => expect(client.getQueryState(settingsKeys.all)?.status).toBe("success"));
    await new Promise((r) => setTimeout(r, 30));

    expect(syncCalls()).toHaveLength(0);
  });
});
