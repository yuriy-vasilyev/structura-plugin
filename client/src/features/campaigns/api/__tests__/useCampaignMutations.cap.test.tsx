/**
 * Cap-reached UX for the create-campaign mutation.
 *
 * The cloud rejects with `{ code: "campaign_limit_reached", data: {
 * status, limit, current, tier } }` when an activation hits its
 * per-tier cap (spec §1.0l). The plugin propagates the structured
 * error verbatim through `WP_Error->error_data`, so apiFetch surfaces
 * it as a rejection with the same shape. These tests pin:
 *   1. The custom toast renders with title + body + Contact-us action.
 *   2. The toast is sticky (`duration: 0`) so the CTA stays reachable.
 *   3. Other failures still surface via the inline fallback (we
 *      opt out of the global handler via `meta.silentError`).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

const mockApiFetch = vi.fn();
vi.mock("@wordpress/api-fetch", () => ({
  default: (...args: unknown[]) => mockApiFetch(...args),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@structura/ui", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

// `useCampaignMutations` imports campaign / progress query keys via the
// feature barrels — keep those resolution paths intact (the hook itself
// is what we exercise).
import { useCampaignMutations } from "../useCampaignMutations";

function renderMutationsHook() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useCampaignMutations(), { wrapper });
}

const minimalCampaignFormData = {
  identity: { name: "Test", objective: "test", campaignMode: "traffic_magnet" },
  intelligence: {
    textProvider: "openai",
    imageProvider: null,
    textModel: "",
    imageModel: "",
    fallbackTextProvider: null,
    fallbackImageProvider: null,
    personaId: 1,
    language: "en",
    postLength: 1000,
    replaceLongDashes: false,
    disableEmojis: false,
    seoRules: [],
  },
  structure: {
    enabledBlocks: [],
    disclosure: { enabled: false, text: "" },
    featuredImage: false,
    bodyImages: false,
    postStatus: "publish",
  },
  taxonomy: {
    categories: { mode: "auto", list: [] },
    tags: { mode: "auto", list: [] },
  },
  schedule: {
    cron: "",
    endCondition: { type: "infinite", value: null },
    pregenerationEnabled: true,
  },
  authority: { domains: [] },
  keywords: { bank: [] },
} as any;

describe("useCampaignMutations.createCampaign — campaign_limit_reached", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("renders the cap-reached toast with a Contact us action when the cloud returns campaign_limit_reached", async () => {
    mockApiFetch.mockRejectedValueOnce({
      code: "campaign_limit_reached",
      message: "Campaign limit reached for the \"pro\" plan (10 of 10 used).",
      data: { status: 403, limit: 10, current: 10, tier: "byok" },
    });

    const { result } = renderMutationsHook();

    await expect(
      result.current.createCampaign({ data: minimalCampaignFormData }),
    ).rejects.toBeDefined();

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    const [message, options] = toastError.mock.calls[0];

    expect(message).toContain("10 of 10");
    expect(options).toMatchObject({
      title: "Campaign limit reached",
      // Sticky — CTA must stay reachable until dismissed.
      duration: 0,
    });
    expect(options.action).toBeDefined();
    expect(options.action.label).toBe("Contact us");
    expect(typeof options.action.onClick).toBe("function");
  });

  it("falls back to a plain Action Failed toast for other errors (global handler is suppressed by meta.silentError)", async () => {
    mockApiFetch.mockRejectedValueOnce({
      code: "cloud_error",
      message: "Internal error.",
      data: { status: 500 },
    });

    const { result } = renderMutationsHook();

    await expect(
      result.current.createCampaign({ data: minimalCampaignFormData }),
    ).rejects.toBeDefined();

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    const [message] = toastError.mock.calls[0];
    expect(message).toContain("Action Failed");
    expect(message).toContain("Internal error.");
  });

  it("toasts success when the create succeeds", async () => {
    mockApiFetch.mockResolvedValueOnce({ success: true, campaign_id: "uuid-1" });

    const { result } = renderMutationsHook();

    await result.current.createCampaign({ data: minimalCampaignFormData });

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe("useCampaignMutations — cadence_limit_reached (Free weekly cap)", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("shows a Go Pro toast when create is rejected for cadence", async () => {
    mockApiFetch.mockRejectedValueOnce({
      code: "cadence_limit_reached",
      message: 'Publishing cadence exceeds the "free" plan limit of 1 post per week.',
      data: { status: 403, maxPerWeek: 1, weeklyCount: 7, tier: "free" },
    });

    const { result } = renderMutationsHook();

    await expect(
      result.current.createCampaign({ data: minimalCampaignFormData }),
    ).rejects.toBeDefined();

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    const [message, options] = toastError.mock.calls[0];
    expect(message).toContain("one post a week");
    expect(options).toMatchObject({ title: "Publishing limit reached", duration: 0 });
    expect(options.action.label).toBe("Go Pro");
  });

  it("shows the same Go Pro toast when an edit is rejected for cadence", async () => {
    mockApiFetch.mockRejectedValueOnce({
      code: "cadence_limit_reached",
      message: 'Publishing cadence exceeds the "free" plan limit of 1 post per week.',
      data: { status: 403, maxPerWeek: 1, weeklyCount: 7, tier: "free" },
    });

    const { result } = renderMutationsHook();

    await expect(
      result.current.updateCampaign({ id: "camp-1", data: minimalCampaignFormData }),
    ).rejects.toBeDefined();

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    const [, options] = toastError.mock.calls[0];
    expect(options.action.label).toBe("Go Pro");
  });
});
