/**
 * useMagicSuggest.
 *
 * 2026-07-09 to 2026-10-06 the hook refused to fire on none/free (a safety
 * net behind each surface's paid gate). Since 2026-10-06 Magic suggest is
 * open on every plan (specs/open-providers.md §8): the hook fires on every
 * plan and the cloud's AI call limit is the cost control.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@wordpress/api-fetch", () => ({ default: apiFetchMock }));
vi.mock("@wordpress/i18n", () => ({ __: (t: string) => t }));

const errorToastMock = vi.hoisted(() => vi.fn());
vi.mock("@structura/ui", () => ({ useToast: () => ({ errorToast: errorToastMock }) }));
vi.mock("@/hooks/humanizeSuggestionError", () => ({
  humanizeSuggestionError: (e: unknown) => String(e),
}));

const licenseMock = vi.hoisted(() => ({ current: { isPaidLicense: false, plan: "none" } as Record<string, unknown> }));
vi.mock("@/features/settings", () => ({ useLicense: () => licenseMock.current }));

import { useMagicSuggest } from "../useMagicSuggest";

beforeEach(() => {
  apiFetchMock.mockReset();
  errorToastMock.mockReset();
  licenseMock.current = { isPaidLicense: false, plan: "none" };
});

describe("useMagicSuggest", () => {
  it.each(["none", "free"])("fires the suggestion on the %s plan (open on every plan since 2026-10-06)", async (plan) => {
    licenseMock.current = { isPaidLicense: false, plan };
    apiFetchMock.mockResolvedValue({ result: { name: "Voice" } });
    const { result } = renderHook(() => useMagicSuggest());

    let out: unknown;
    await act(async () => {
      out = await result.current.suggest("persona", { provider: "openai" });
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/structura/v1/suggest", method: "POST" }),
    );
    expect(out).toEqual({ name: "Voice" });
  });

  it("fires the suggestion for a paid tier", async () => {
    licenseMock.current = { isPaidLicense: true };
    apiFetchMock.mockResolvedValue({ result: { name: "Voice" } });
    const { result } = renderHook(() => useMagicSuggest());

    let out: any;
    await act(async () => {
      out = await result.current.suggest("persona", { provider: "openai" });
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/structura/v1/suggest", method: "POST" }),
    );
    expect(out).toEqual({ name: "Voice" });
  });

  it("forwards the campaign language so the cloud drafts in it, not the site language", async () => {
    // Regression (2026-09-22): the body carried no language; the cloud
    // appended the WP site language, so an English campaign on a German
    // site got a German objective.
    licenseMock.current = { isPaidLicense: true };
    apiFetchMock.mockResolvedValue({ result: { name: "X", strategy: "Y" } });
    const { result } = renderHook(() => useMagicSuggest());

    await act(async () => {
      await result.current.suggest("campaign", { provider: "openai", context: [], language: "en" });
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mode: "campaign", language: "en" }) }),
    );
  });

  it("omits the language key when the caller has none (legacy body shape)", async () => {
    licenseMock.current = { isPaidLicense: true };
    apiFetchMock.mockResolvedValue({ result: { name: "Voice" } });
    const { result } = renderHook(() => useMagicSuggest());

    await act(async () => {
      await result.current.suggest("persona", { provider: "openai" });
    });

    const body = apiFetchMock.mock.calls[0][0].data as Record<string, unknown>;
    expect(body).not.toHaveProperty("language");
  });
});
