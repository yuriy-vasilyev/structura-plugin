/**
 * `useWpUsersQuery` workspace-gating tests — Phase 1.8a → Phase 1.8.
 *
 * Pre-1.8a `useWpUsersQuery` (the WP-users picker for assigning
 * persona authors) fired unconditionally on the Personas page mount
 * even when no license was bound. The endpoint itself is local-only
 * (`get_users(...)` on the WP DB), so it didn't 401, but it produced
 * wasted bandwidth and broke the consistency rule that *every*
 * cloud-or-feature-scoped query short-circuits when there's nothing
 * the user can do with the data anyway.
 *
 * PR7b flipped the gate from `hasUsableLicense` to `hasWorkspace` so
 * anonymous shadow workspaces (Phase 1.8) can use the persona picker
 * too. The structural argument is the same — don't fetch when there's
 * no workspace presence — but the trigger condition widens to "either
 * a license OR an anonymous bootstrap-minted bearer."
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";

const h = vi.hoisted(() => ({
  hasWorkspace: null as boolean | null,
  apiFetchImpl: vi.fn(),
}));

vi.mock("@wordpress/api-fetch", () => ({
  default: (...args: unknown[]) => h.apiFetchImpl(...args),
}));

vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => ({ hasWorkspace: h.hasWorkspace }),
}));

import { useWpUsersQuery } from "../usePersonasQuery";

function wrapperWithClient(): (props: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }) =>
    createElement(QueryClientProvider, { client }, children);
}

describe("useWpUsersQuery", () => {
  beforeEach(() => {
    h.hasWorkspace = null;
    h.apiFetchImpl = vi.fn();
  });

  it("does NOT fetch while hasWorkspace is null", async () => {
    h.hasWorkspace = null;
    const wrapper = wrapperWithClient();

    renderHook(() => useWpUsersQuery(), { wrapper });

    await new Promise((r) => setTimeout(r, 10));
    expect(h.apiFetchImpl).not.toHaveBeenCalled();
  });

  it("does NOT fetch when hasWorkspace is false", async () => {
    h.hasWorkspace = false;
    const wrapper = wrapperWithClient();

    renderHook(() => useWpUsersQuery(), { wrapper });

    await new Promise((r) => setTimeout(r, 10));
    expect(h.apiFetchImpl).not.toHaveBeenCalled();
  });

  it("DOES fetch when hasWorkspace is true", async () => {
    h.hasWorkspace = true;
    h.apiFetchImpl.mockResolvedValueOnce([
      { id: 1, name: "Test", avatarUrl: "" },
    ]);
    const wrapper = wrapperWithClient();

    const { result } = renderHook(() => useWpUsersQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.apiFetchImpl).toHaveBeenCalledTimes(1);
    expect(h.apiFetchImpl).toHaveBeenCalledWith({
      path: "/structura/v1/users",
    });
  });
});
