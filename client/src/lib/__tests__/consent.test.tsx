/**
 * Unit tests for `client/src/lib/consent.ts` — the wp-admin SPA's
 * telemetry-consent client. The module exposes two TanStack Query hooks
 * (`usePrivacyConsent`, `useUpdatePrivacyConsent`) that talk to the
 * `/wp-json/structura/v1/privacy/consent` REST endpoint via fetch.
 *
 * What this suite pins:
 *
 *   1. **REST contract** — the GET reads from the endpoint, the POST
 *      writes with the correct body + nonce header. If the wire format
 *      ever drifts from `Privacy_Rest_Api`'s expectations, the test
 *      fails before the SPA does silently in production.
 *   2. **Cache update** — a successful mutation seeds the query cache
 *      with the new state, so the toggle reflects the change without a
 *      refetch. Matches the auto-save pattern in `PrivacyTelemetryCard`.
 *   3. **Failure path** — a non-2xx response surfaces as a query/mutation
 *      error so the card can show its error toast.
 *
 * The fetch boundary is mocked rather than the underlying SDK — same
 * pattern as `web/src/features/admin/hooks/__tests__/useIncidents.test.ts`
 * (mock at the module boundary, test the code, not the runtime).
 */

import { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { usePrivacyConsent, useUpdatePrivacyConsent } from "../consent";

const fetchMock = vi.fn();

// Canonical `Window.structuraConfig` shape lives in `client/src/types.d.ts`
// as a required field set. We don't redeclare it here — duplicate
// `declare global` blocks with mismatched modifiers (optional vs.
// required) trip TS2687/TS2717 and break `tsc && vite build`. Tests use
// `as Window["structuraConfig"]` to satisfy the canonical type with the
// minimal fields each case actually exercises.
const baseConfig = {
  rest_url: "/wp-json/",
  webhook_url: "/wp-json/structura/v1/webhook",
  nonce: "test-nonce",
  domain: "example.com",
} as Window["structuraConfig"];

beforeEach(() => {
  // The SPA reads its REST base + nonce off `window.structuraConfig`,
  // which the WordPress admin page boots with at first paint. Mirror
  // that here so the fetch URL is deterministic.
  window.structuraConfig = baseConfig;

  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
});

afterEach(() => {
  // Reassign back to the canonical-shape baseline rather than `delete`
  // (the field is required on Window per types.d.ts, so `delete` trips
  // TS2790).
  window.structuraConfig = baseConfig;
  vi.restoreAllMocks();
});

/**
 * Fresh QueryClient per test so cache state doesn't leak across cases.
 * `retry: false` short-circuits the default exponential-backoff retry
 * which would otherwise time the test out on the failure-path assertion.
 */
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("usePrivacyConsent", () => {
  it("fetches the consent state from the REST endpoint with the WP nonce header", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: 1,
        choseAt: null,
        telemetryEnabled: false,
        hasMadeChoice: false,
      }),
    });

    const { result } = renderHook(() => usePrivacyConsent(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/wp-json/structura/v1/privacy/consent",
      expect.objectContaining({
        headers: { "X-WP-Nonce": "test-nonce" },
      })
    );
    expect(result.current.data).toEqual({
      version: 1,
      choseAt: null,
      telemetryEnabled: false,
      hasMadeChoice: false,
    });
  });

  it("strips the trailing slash from the REST base URL before joining", async () => {
    // Prevents `/wp-json//structura/v1/...` double-slash, which some WP
    // installs reject and others quietly redirect — both are bugs we
    // shouldn't paper over silently.
    window.structuraConfig = {
      ...baseConfig,
      rest_url: "/wp-json/",
      nonce: "n",
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: 1,
        choseAt: null,
        telemetryEnabled: false,
        hasMadeChoice: false,
      }),
    });

    const { result } = renderHook(() => usePrivacyConsent(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toBe("/wp-json/structura/v1/privacy/consent");
    expect(calledUrl).not.toContain("//structura");
  });

  it("surfaces a non-2xx response as a query error", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

    const { result } = renderHook(() => usePrivacyConsent(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain("500");
  });
});

describe("useUpdatePrivacyConsent", () => {
  it("posts the new state with the correct body and updates the query cache", async () => {
    const written = {
      version: 1,
      choseAt: 1716816000,
      telemetryEnabled: true,
      hasMadeChoice: true,
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => written,
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useUpdatePrivacyConsent(), { wrapper });

    await result.current.mutateAsync(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "/wp-json/structura/v1/privacy/consent",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-WP-Nonce": "test-nonce",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ telemetryEnabled: true }),
      })
    );

    // The mutation's onSuccess seeds the cache with the response — so the
    // matching query reads the new state without a fresh network round-trip.
    expect(queryClient.getQueryData(["privacy", "consent"])).toEqual(written);
  });

  it("posts telemetryEnabled=false on a revoke", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: 1,
        choseAt: 1716816000,
        telemetryEnabled: false,
        hasMadeChoice: true,
      }),
    });

    const { result } = renderHook(() => useUpdatePrivacyConsent(), {
      wrapper: makeWrapper(),
    });

    await result.current.mutateAsync(false);

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body).toEqual({ telemetryEnabled: false });
  });

  it("rejects when the server returns non-2xx so the card can toast an error", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 });

    const { result } = renderHook(() => useUpdatePrivacyConsent(), {
      wrapper: makeWrapper(),
    });

    await expect(result.current.mutateAsync(true)).rejects.toThrow(/403/);
  });
});
