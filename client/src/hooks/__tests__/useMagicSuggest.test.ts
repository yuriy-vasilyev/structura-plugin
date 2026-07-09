/**
 * useMagicSuggest — paid-tier gate.
 *
 * Regression (2026-07-09): AI "suggest" calls (persona / campaign /
 * visual / topic_chips) were reachable on none/free from ungated
 * triggers (e.g. the Persona editor's "Magic Suggest"). The hook now
 * refuses to fire for a non-paid tier — the central safety net behind
 * each surface's own UI gate.
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

const licenseMock = vi.hoisted(() => ({ current: { isPaidLicense: false } }));
vi.mock("@/features/settings", () => ({ useLicense: () => licenseMock.current }));

import { useMagicSuggest } from "../useMagicSuggest";

beforeEach(() => {
  apiFetchMock.mockReset();
  errorToastMock.mockReset();
  licenseMock.current = { isPaidLicense: false };
});

describe("useMagicSuggest", () => {
  it("does NOT hit the cloud on a non-paid tier and returns null", async () => {
    licenseMock.current = { isPaidLicense: false };
    const { result } = renderHook(() => useMagicSuggest());

    let out: unknown;
    await act(async () => {
      out = await result.current.suggest("persona", { provider: "openai" });
    });

    expect(out).toBeNull();
    expect(apiFetchMock).not.toHaveBeenCalled();
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
});
