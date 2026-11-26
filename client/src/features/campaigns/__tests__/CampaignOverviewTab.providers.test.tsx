/**
 * Campaign view Overview — the "AI Providers" row by plan (2026-10-01).
 *
 * Managed plans (Cloud) never see a text provider or a model
 * name (specs/managed-ai-lineup.md §3.3), so the row goes there. BYOK
 * keeps the provider icons and names the providers. Since the owner's
 * decision of 2026-11-25 no plan sees a model named: not the model id an
 * older campaign stored, and not the served catalog's default, which the
 * row showed that morning (specs/byok-ai-guidance.md §2.2).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@wordpress/i18n", () => ({
  __: (t: string) => t,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

const planMock = vi.hoisted(() => ({ plan: "byok" }));
vi.mock("@/features/settings", () => ({
  useLicense: () => ({ plan: planMock.plan }),
}));

// The served catalog answers, so a row that read it again would have names to show.
vi.mock("@/features/ai-engine/api/useAvailableModelsQuery", () => ({
  useAvailableModelsQuery: () => ({
    data: {
      text: [{ id: "gpt-5.6-sol", name: "GPT-5.6 Sol", provider: "openai" }],
      image: [{ id: "gemini-3.1-flash-image", name: "Gemini 3.1 Flash Image", provider: "gemini" }],
      defaults: {
        openai: { text: "gpt-5.6-sol", fast: "", image: "" },
        gemini: { text: "", fast: "", image: "gemini-3.1-flash-image" },
      },
    },
  }),
}));

vi.mock("@/features/campaigns/api/useCampaignPostsQuery", () => ({
  useCampaignPostsQuery: () => ({ data: { data: [] }, isLoading: false }),
}));

// The live-run strip has its own polling; not under test here.
vi.mock("@/features/progress", () => ({
  CampaignRunProgress: () => null,
}));

import { OverviewTab } from "../routes/CampaignViewPage";
import type { Campaign } from "../types";
import { MODEL_NAME } from "@/test/modelNames";

const campaign = {
  id: "camp-1",
  status: "active",
  identity: { name: "Weekly Digest", objective: "Signups", campaignMode: "traffic_magnet" },
  intelligence: {
    textProvider: "openai",
    // A model an older campaign stored: never shown.
    textModel: "gpt-6-astra",
    imageProvider: "gemini",
    language: "default",
    postLength: 1200,
  },
  structure: { postStatus: "publish", disclosure: { enabled: false, text: "" } },
  taxonomy: { categories: { mode: "auto", list: [] }, tags: { mode: "auto", list: [] } },
  schedule: { cron: "0 9 * * 1", endCondition: { type: "infinite", value: 0 } },
  stats: { postsPublished: 3, nextRun: "" },
} as unknown as Campaign;

const renderTab = () =>
  render(
    <MemoryRouter>
      <OverviewTab campaign={campaign} />
    </MemoryRouter>
  );

beforeEach(() => {
  planMock.plan = "byok";
});

describe("OverviewTab — AI Providers row", () => {
  it("BYOK: shows the row with each provider's name and no model", () => {
    const { container } = renderTab();
    const row = screen.getByText("AI Providers").parentElement!;
    expect(row).toHaveTextContent("OpenAI");
    expect(row).toHaveTextContent("Gemini");
    expect(container.textContent).not.toMatch(MODEL_NAME);
  });

  it("managed: drops the row, keeps the rest of the configuration", () => {
    planMock.plan = "cloud";
    const { container } = renderTab();
    expect(screen.queryByText("AI Providers")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(MODEL_NAME);
    expect(screen.getByText("Campaign Configuration")).toBeInTheDocument();
    expect(screen.getByText("Post Length")).toBeInTheDocument();
  });
});
