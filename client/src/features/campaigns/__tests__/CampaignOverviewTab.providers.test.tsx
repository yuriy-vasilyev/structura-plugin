/**
 * Campaign view Overview — the "AI Providers" row by plan (2026-10-01).
 *
 * Managed plans (Cloud, Cloud Pro) never see a text provider or a model
 * name (specs/managed-ai-lineup.md §3.3), so the row goes there. BYOK
 * keeps the provider icons and the resolved model names.
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

vi.mock("@/features/ai-engine/api/useAvailableModelsQuery", () => ({
  useAvailableModelsQuery: () => ({
    data: {
      text: [{ id: "gpt-x", name: "GPT-X" }],
      image: [{ id: "imagen-x", name: "Imagen X" }],
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

const campaign = {
  id: "camp-1",
  status: "active",
  identity: { name: "Weekly Digest", objective: "Signups", campaignMode: "traffic_magnet" },
  intelligence: {
    textProvider: "openai",
    textModel: "gpt-x",
    imageProvider: "gemini",
    imageModel: "imagen-x",
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
  it("BYOK: shows the row with the resolved model names", () => {
    renderTab();
    expect(screen.getByText("AI Providers")).toBeInTheDocument();
    expect(screen.getByText("GPT-X")).toBeInTheDocument();
    expect(screen.getByText("Imagen X")).toBeInTheDocument();
  });

  it("managed: drops the row, keeps the rest of the configuration", () => {
    planMock.plan = "cloud_pro";
    renderTab();
    expect(screen.queryByText("AI Providers")).not.toBeInTheDocument();
    expect(screen.queryByText("GPT-X")).not.toBeInTheDocument();
    expect(screen.queryByText("Imagen X")).not.toBeInTheDocument();
    expect(screen.getByText("Campaign Configuration")).toBeInTheDocument();
    expect(screen.getByText("Post Length")).toBeInTheDocument();
  });
});
