/**
 * The visual-signature API hooks (specs/visual-signatures.md §6, §8):
 * the thin suggest pass through `POST /structura/v1/visual-signature/suggest`,
 * the preview through `/visual-signature/preview`, and the plan-gate
 * mapping of a refused preset save (403 `plan_gated`).
 *
 * Real hooks on a real TanStack cache; only `apiFetch` (the network edge)
 * is mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { ToastProvider } from "@structura/ui";
import type { ReactNode } from "react";

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@wordpress/api-fetch", () => ({ default: apiFetchMock }));

import {
  isPlanGatedError,
  readVisualSuggestion,
  usePreviewVisualSignatureMutation,
  useSuggestVisualSignatureMutation,
  useVisualPresetMutations,
  useVisualSignatureSuggestion,
} from "../useVisualPresets";

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  return { client, wrapper };
}

/** Runs `call` inside act and returns what it rejected with (act must not see the rejection). */
async function rejectionOf(call: () => Promise<unknown>): Promise<unknown> {
  let error: unknown;
  await act(async () => {
    await call().catch((err: unknown) => {
      error = err;
    });
  });
  return error;
}

/** apiFetch's rejection for a WP REST error the proxy built from a cloud refusal. */
const restError = (status: number, code?: string) => ({
  code: "cloud_error",
  message: "Refused by the cloud.",
  data: { status, ...(code ? { code } : {}) },
});

const SUGGESTION = {
  pick: "paper-cut",
  runnerUp: "ink-and-fill",
  reason: "Warm and hand-made, like your seasonal planting guides.",
  palette: ["#2f6b4f", "#C8553D", "not-a-colour", "#A3C585"],
};

beforeEach(() => {
  apiFetchMock.mockReset();
  document.documentElement.lang = "de-DE";
});

afterEach(() => {
  document.documentElement.lang = "";
});

describe("useSuggestVisualSignatureMutation", () => {
  it("posts the admin's language and shares the checked result through the cache", async () => {
    apiFetchMock.mockResolvedValue({ suggestion: SUGGESTION, homepageRead: true });
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({
        suggest: useSuggestVisualSignatureMutation(),
        known: useVisualSignatureSuggestion(undefined),
      }),
      { wrapper }
    );

    expect(result.current.known).toBeUndefined();
    await act(() => result.current.suggest.mutateAsync());

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: "/structura/v1/visual-signature/suggest",
      method: "POST",
      data: { locale: "de" },
    });
    await waitFor(() =>
      expect(result.current.known).toEqual({
        pick: "paper-cut",
        runnerUp: "ink-and-fill",
        reason: SUGGESTION.reason,
        // Normalised to upper-case #RRGGBB, junk dropped.
        palette: ["#2F6B4F", "#C8553D", "#A3C585"],
      })
    );
  });

  it("sends no locale the cloud doesn't support", async () => {
    document.documentElement.lang = "ja";
    apiFetchMock.mockResolvedValue({ suggestion: null, homepageRead: false, reason: "error" });
    const { wrapper } = setup();
    const { result } = renderHook(() => useSuggestVisualSignatureMutation(), { wrapper });

    await act(() => result.current.mutateAsync());

    expect(apiFetchMock.mock.calls[0][0].data).toEqual({});
  });

  it("caches null when the pass found no pick, so it isn't re-run this page load", async () => {
    apiFetchMock.mockResolvedValue({
      suggestion: null,
      homepageRead: false,
      reason: "ai_unavailable",
    });
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({
        suggest: useSuggestVisualSignatureMutation(),
        known: useVisualSignatureSuggestion(undefined),
      }),
      { wrapper }
    );

    const answer = await act(() => result.current.suggest.mutateAsync());

    expect(answer).toBeNull();
    await waitFor(() => expect(result.current.known).toBeNull());
  });

  it("a refused pass (429) also counts as run, and the error reaches the caller", async () => {
    apiFetchMock.mockRejectedValue(restError(429, "ai_rate_limited"));
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({
        suggest: useSuggestVisualSignatureMutation(),
        known: useVisualSignatureSuggestion(undefined),
      }),
      { wrapper }
    );

    expect(await rejectionOf(() => result.current.suggest.mutateAsync())).toMatchObject({
      data: { code: "ai_rate_limited" },
    });
    await waitFor(() => expect(result.current.known).toBeNull());
  });
});

describe("useVisualSignatureSuggestion — the stored pick", () => {
  const STORED = {
    pick: "miniature-world",
    runnerUp: "isometric-glass",
    reason: "Playful and precise, like your build guides.",
    palette: ["#123456"],
    at: "2026-11-09T14:00:00.000Z",
  };

  it("prefers the pick stored on the activation (from the preset list) over this page load's pass", async () => {
    apiFetchMock.mockResolvedValue({ suggestion: SUGGESTION, homepageRead: true });
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({
        suggest: useSuggestVisualSignatureMutation(),
        known: useVisualSignatureSuggestion(STORED),
      }),
      { wrapper }
    );

    expect(result.current.known).toMatchObject({ pick: "miniature-world", palette: ["#123456"] });
    await act(() => result.current.suggest.mutateAsync());
    // The page-load cache only stands in when the list carries nothing.
    expect(result.current.known?.pick).toBe("miniature-world");
  });

  it("a stored value without a library pick falls back to the last pass", async () => {
    apiFetchMock.mockResolvedValue({ suggestion: SUGGESTION, homepageRead: true });
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({
        suggest: useSuggestVisualSignatureMutation(),
        known: useVisualSignatureSuggestion({ ...STORED, pick: "oil-painting" }),
      }),
      { wrapper }
    );

    expect(result.current.known).toBeUndefined();
    await act(() => result.current.suggest.mutateAsync());
    await waitFor(() => expect(result.current.known?.pick).toBe("paper-cut"));
  });

  it("keeps its identity across renders while the stored value does", () => {
    const { wrapper } = setup();
    const { result, rerender } = renderHook(({ stored }) => useVisualSignatureSuggestion(stored), {
      wrapper,
      initialProps: { stored: STORED },
    });
    const first = result.current;
    rerender({ stored: STORED });
    // The Visuals page re-seeds its draft when this changes; a fresh object
    // per render would loop.
    expect(result.current).toBe(first);
  });

  it("a pass refetches the preset list before it resolves, so the new stored pick wins", async () => {
    let listCalls = 0;
    apiFetchMock.mockImplementation(({ path }: { path: string }) => {
      if (path === "/structura/v1/visual-presets") {
        listCalls += 1;
        return Promise.resolve({ success: true, boundPresetId: null, presets: [] });
      }
      return Promise.resolve({ suggestion: SUGGESTION, homepageRead: true });
    });
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({
        list: useQuery({
          queryKey: ["visual-presets"],
          queryFn: () => apiFetchMock({ path: "/structura/v1/visual-presets" }),
        }),
        suggest: useSuggestVisualSignatureMutation(),
      }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    expect(listCalls).toBe(1);

    await act(() => result.current.suggest.mutateAsync());

    expect(listCalls).toBe(2);
  });
});

describe("readVisualSuggestion", () => {
  it("refuses a pick outside the library and an unknown runner-up", () => {
    expect(readVisualSuggestion({ ...SUGGESTION, pick: "oil-painting" })).toBeNull();
    expect(readVisualSuggestion(null)).toBeNull();
    expect(readVisualSuggestion({ ...SUGGESTION, runnerUp: "nope" })?.runnerUp).toBeNull();
  });

  it("caps the palette at six colours", () => {
    const palette = ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777"];
    expect(readVisualSuggestion({ ...SUGGESTION, palette })?.palette).toHaveLength(6);
  });
});

describe("usePreviewVisualSignatureMutation", () => {
  it("posts the unsaved choice and palette to the preview route", async () => {
    apiFetchMock.mockResolvedValue({
      success: true,
      imageUrl: "https://cdn.test/p.webp",
      concept: "A seed packet",
    });
    const { wrapper } = setup();
    const { result } = renderHook(() => usePreviewVisualSignatureMutation(), { wrapper });

    const answer = await act(() =>
      result.current.mutateAsync({
        signature: { kind: "curated", id: "paper-cut", version: 1 },
        palette: ["#2F6B4F"],
      })
    );

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: "/structura/v1/visual-signature/preview",
      method: "POST",
      data: { signature: { kind: "curated", id: "paper-cut", version: 1 }, palette: ["#2F6B4F"] },
    });
    expect(answer.imageUrl).toBe("https://cdn.test/p.webp");
  });
});

describe("isPlanGatedError", () => {
  it("is the cloud's 403 plan gate, from a save or a preview", () => {
    expect(isPlanGatedError(restError(403, "plan_gated"))).toBe(true);
    expect(isPlanGatedError(restError(403, "permission-denied"))).toBe(true);
    expect(isPlanGatedError(restError(403))).toBe(false);
    expect(isPlanGatedError(restError(400, "plan_gated"))).toBe(false);
    expect(isPlanGatedError(new Error("network"))).toBe(false);
    expect(isPlanGatedError(null)).toBe(false);
  });
});

describe("preset saves (spec §7 gate)", () => {
  it("a gated save shows the plan line instead of the generic failure", async () => {
    apiFetchMock.mockRejectedValue(restError(403, "plan_gated"));
    const { wrapper } = setup();
    const { result } = renderHook(() => useVisualPresetMutations(), { wrapper });

    const error = await rejectionOf(() =>
      result.current.update({
        preset_id: "p1",
        content: {
          global_art_direction: "",
          aspect_ratio: "16:9",
          format: "webp",
          optimize_on_upload: true,
          signature: { kind: "curated", id: "paper-cut", version: 1 },
        },
      })
    );

    expect(isPlanGatedError(error)).toBe(true);

    expect(await screen.findByText("That style comes with paid plans.")).toBeInTheDocument();
    expect(screen.queryByText(/Action Failed/)).toBeNull();
  });

  it("any other failure keeps the generic toast", async () => {
    apiFetchMock.mockRejectedValue({
      code: "cloud_error",
      message: "Failed to update preset.",
      data: { status: 500 },
    });
    const { wrapper } = setup();
    const { result } = renderHook(() => useVisualPresetMutations(), { wrapper });

    expect(
      await rejectionOf(() => result.current.update({ preset_id: "p1", label: "x" }))
    ).toBeTruthy();

    expect(await screen.findByText("Action Failed: Failed to update preset.")).toBeInTheDocument();
  });

  it("a save resolves only after the presets list refetched", async () => {
    let listCalls = 0;
    apiFetchMock.mockImplementation(({ path, method }: { path: string; method?: string }) => {
      if (path === "/structura/v1/visual-presets" && !method) {
        listCalls += 1;
        return Promise.resolve({ success: true, boundPresetId: "p1", presets: [] });
      }
      return Promise.resolve({ success: true, preset: { presetId: "p1" } });
    });
    const { wrapper } = setup();
    // An active observer on the list, as the Visuals page has.
    const { result } = renderHook(
      () => ({
        list: useQuery({
          queryKey: ["visual-presets"],
          queryFn: () => apiFetchMock({ path: "/structura/v1/visual-presets" }),
        }),
        mutations: useVisualPresetMutations(),
      }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    expect(listCalls).toBe(1);

    await act(() => result.current.mutations.update({ preset_id: "p1", label: "Renamed" }));

    // The page re-seeds right after this resolves; the refetch already landed.
    expect(listCalls).toBe(2);
  });
});
