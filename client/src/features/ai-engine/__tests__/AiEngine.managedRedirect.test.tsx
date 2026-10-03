/**
 * AI Engine page — managed plans are sent to the dashboard (2026-10-01).
 *
 * The nav already hides "AI Engine" on Cloud / Cloud Pro. A direct visit
 * must not list providers either: managed customers never see provider
 * names (specs/managed-ai-lineup.md §3.3). BYOK still gets the page.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

vi.mock("@wordpress/i18n", () => ({ __: (t: string) => t }));

const planMock = vi.hoisted(() => ({ plan: "cloud" }));
vi.mock("@/features/settings", () => ({
  useLicense: () => ({ plan: planMock.plan, providerCountCap: 3 }),
}));

vi.mock("@/features/ai-engine", () => ({
  useAiSettingsQuery: () => ({
    isLoading: false,
    data: {
      providers: {
        openai: {
          connected: true,
          capabilities: ["text", "image"],
          text_model: "m",
          image_model: "i",
        },
      },
      catalog: {
        openai: { name: "OpenAI", description: "OpenAI models", capabilities: ["text", "image"] },
      },
      defaults: { text_provider: "openai", image_provider: "openai" },
      has_text: true,
    },
  }),
}));

// Card internals are not under test; keep their data hooks out of the way.
vi.mock("../components/InstalledProviderCard", () => ({
  InstalledProviderCard: ({ name }: { name: string }) => <div>{name}</div>,
}));
vi.mock("../components/AvailableProviderCard", () => ({
  AvailableProviderCard: () => null,
}));
vi.mock("../components/WorkspaceKeysPicker", () => ({
  WorkspaceKeysPicker: () => null,
}));

import { AiEngine } from "../routes/AiEngine";

const renderAt = () =>
  render(
    <MemoryRouter initialEntries={["/ai-engine"]}>
      <Routes>
        <Route path="/" element={<div>dashboard</div>} />
        <Route path="/ai-engine" element={<AiEngine />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  planMock.plan = "cloud";
});

describe("AiEngine route by plan", () => {
  it("managed: redirects to the dashboard and lists no provider", () => {
    renderAt();
    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(screen.queryByText("OpenAI")).not.toBeInTheDocument();
  });

  it("Cloud Pro: redirects too", () => {
    planMock.plan = "cloud_pro";
    renderAt();
    expect(screen.getByText("dashboard")).toBeInTheDocument();
  });

  it("BYOK: renders the page with the connected provider", () => {
    planMock.plan = "byok";
    renderAt();
    expect(screen.queryByText("dashboard")).not.toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
  });
});
