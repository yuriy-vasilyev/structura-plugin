/**
 * `useWorkspaceKeysQuery` license-gating tests — Phase 1.8a.
 *
 * The workspace-keys library endpoint (`/structura/v1/keys/workspace`)
 * proxies to a cloud-only handler. On a `none`-tier install with no
 * license bound, that proxy 401s. Pre-1.8a the hook fired
 * unconditionally on the AI Engine page mount and surfaced the auth
 * error as a generic toast on every page load. The fix is the
 * `enabled: hasUsableLicense === true` gate — TanStack Query's
 * standard "don't run this until the precondition is met" idiom.
 *
 * Coverage priorities:
 *   - When `hasUsableLicense === null` (settings still loading) the
 *     gate is closed and `apiFetch` is never called. This is the
 *     first-paint case before the heartbeat lands.
 *   - When `hasUsableLicense === false` (no license bound) the gate
 *     is closed and `apiFetch` is never called. This is the
 *     "Anonymous Mode" case and the one that produced the toast
 *     storm pre-1.8a.
 *   - When `hasUsableLicense === true` (license bound) the gate is
 *     open and the query runs. The actual response shape isn't
 *     interesting here — what matters is that the fetch fires.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";

const h = vi.hoisted(() => ({
  hasUsableLicense: null as boolean | null,
  apiFetchImpl: vi.fn(),
}));

vi.mock("@wordpress/api-fetch", () => ({
  default: (...args: unknown[]) => h.apiFetchImpl(...args),
}));

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
}));

vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => ({ hasUsableLicense: h.hasUsableLicense }),
}));

vi.mock("@structura/ui", () => ({
  useToast: () => ({
    successToast: vi.fn(),
    errorToast: vi.fn(),
  }),
}));

import { useWorkspaceKeysQuery } from "../useWorkspaceKeys";

function wrapperWithClient(): (props: { children: ReactNode }) => ReactNode {
  // Fresh QueryClient per test so cached results don't bleed between
  // gate states. `retry: false` prevents the runner from waiting on
  // failed-fetch backoff.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }) =>
    createElement(QueryClientProvider, { client }, children);
}

describe("useWorkspaceKeysQuery", () => {
  beforeEach(() => {
    h.hasUsableLicense = null;
    h.apiFetchImpl = vi.fn();
  });

  it("does NOT fetch while hasUsableLicense is null (settings still loading)", async () => {
    h.hasUsableLicense = null;
    const wrapper = wrapperWithClient();

    const { result } = renderHook(() => useWorkspaceKeysQuery(), { wrapper });

    // The query should land in pending+disabled (no fetchStatus). Give
    // React a tick to flush effects, then assert apiFetch was not
    // called and the query never transitions out of pending.
    await new Promise((r) => setTimeout(r, 10));
    expect(h.apiFetchImpl).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("does NOT fetch when hasUsableLicense is false (Anonymous Mode)", async () => {
    h.hasUsableLicense = false;
    const wrapper = wrapperWithClient();

    renderHook(() => useWorkspaceKeysQuery(), { wrapper });

    await new Promise((r) => setTimeout(r, 10));
    expect(h.apiFetchImpl).not.toHaveBeenCalled();
  });

  it("DOES fetch when hasUsableLicense is true", async () => {
    h.hasUsableLicense = true;
    h.apiFetchImpl.mockResolvedValueOnce({
      success: true,
      credentials: [],
    });
    const wrapper = wrapperWithClient();

    const { result } = renderHook(() => useWorkspaceKeysQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.apiFetchImpl).toHaveBeenCalledTimes(1);
    expect(h.apiFetchImpl).toHaveBeenCalledWith({
      path: "/structura/v1/keys/workspace",
    });
  });
});
