/**
 * useCampaignSetupDraft — drafts only when asked (2026-10-02, spec
 * `campaign-language-and-smart-setup.md` §4.4).
 *
 * The real hook runs against a stubbed `@wordpress/api-fetch` edge.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const apiFetchMock = vi.fn();
vi.mock("@wordpress/api-fetch", () => ({
  default: (...args: unknown[]) => apiFetchMock(...args),
}));

import { useCampaignSetupDraft, type CampaignSetupDraft } from "../useCampaignSetupDraft";

const draft = (over: Partial<CampaignSetupDraft> = {}): CampaignSetupDraft =>
  ({
    language: { code: "en", source: "wp", support: "full", additionalLanguages: [] },
    name: "Balcony gardens",
    objective: "Teach renters to grow food on a balcony.",
    topics: ["balcony garden"],
    campaignMode: "traffic_magnet",
    discoveryMode: "winnable",
    suggestedPostsPerWeek: 2,
    siblingCampaigns: [],
    sitePostsPerWeek: 2,
    rationale: [],
    stage: "deterministic",
    ...over,
  }) as CampaignSetupDraft;

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("useCampaignSetupDraft", () => {
  it("makes no call until suggest() runs, then exactly one", async () => {
    apiFetchMock.mockResolvedValue({ success: true, draft: draft() });
    const onDraft = vi.fn();
    const { result } = renderHook(() => useCampaignSetupDraft({ onDraft }));

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(result.current.draft).toBeNull();

    act(() => result.current.suggest("de_AT", "deterministic"));
    await waitFor(() => expect(result.current.draft?.name).toBe("Balcony gardens"));
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock.mock.calls[0][0]).toMatchObject({
      path: "/structura/v1/campaigns/draft-setup",
      method: "POST",
      data: { stage: "deterministic", language: "de_AT" },
    });
    expect(onDraft).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it("does not forward the site-language sentinel", async () => {
    apiFetchMock.mockResolvedValue({ success: true, draft: draft({ stage: "ai" }) });
    const { result } = renderHook(() => useCampaignSetupDraft());

    act(() => result.current.suggest("default", "ai"));
    await waitFor(() => expect(result.current.isSuggesting).toBe(false));
    expect(apiFetchMock.mock.calls[0][0].data).toEqual({ stage: "ai" });
  });

  it("a gated AI pass lands the templated draft with the generic error", async () => {
    apiFetchMock.mockResolvedValue({ success: true, draft: draft({ aiReason: "plan_gated" }) });
    const onDraft = vi.fn();
    const { result } = renderHook(() => useCampaignSetupDraft({ onDraft }));

    act(() => result.current.suggest("en", "ai"));
    await waitFor(() =>
      expect(result.current.error).toBe("Couldn't refine this campaign — try again")
    );
    expect(onDraft).toHaveBeenCalledTimes(1);
    expect(result.current.draft?.stage).toBe("deterministic");
  });

  it("maps the AI call limit refusal to its own message and lands nothing", async () => {
    apiFetchMock.mockRejectedValue({
      code: "draft_failed",
      message: "Too many AI requests.",
      data: { status: 429, code: "ai_rate_limited" },
    });
    const onDraft = vi.fn();
    const { result } = renderHook(() => useCampaignSetupDraft({ onDraft }));

    act(() => result.current.suggest("en", "ai"));
    await waitFor(() =>
      expect(result.current.error).toBe(
        "Too many AI requests from this workspace. Try again in a minute, or tomorrow if you have made a lot of requests today."
      )
    );
    expect(onDraft).not.toHaveBeenCalled();
  });

  it("any other failure gets the generic message", async () => {
    apiFetchMock.mockRejectedValue({
      code: "draft_failed",
      message: "Could not draft the campaign.",
    });
    const { result } = renderHook(() => useCampaignSetupDraft());

    act(() => result.current.suggest("en", "deterministic"));
    await waitFor(() =>
      expect(result.current.error).toBe("Couldn't refine this campaign — try again")
    );
  });

  it("a newer suggestion wins over an older one still in flight", async () => {
    let releaseFirst: (v: unknown) => void = () => {};
    apiFetchMock
      .mockImplementationOnce(() => new Promise((r) => (releaseFirst = r)))
      .mockResolvedValueOnce({ success: true, draft: draft({ name: "Newer" }) });
    const { result } = renderHook(() => useCampaignSetupDraft());

    act(() => result.current.suggest("de", "deterministic"));
    act(() => result.current.suggest("en", "deterministic"));
    await waitFor(() => expect(result.current.draft?.name).toBe("Newer"));

    await act(async () => releaseFirst({ success: true, draft: draft({ name: "Older" }) }));
    expect(result.current.draft?.name).toBe("Newer");
  });
});
