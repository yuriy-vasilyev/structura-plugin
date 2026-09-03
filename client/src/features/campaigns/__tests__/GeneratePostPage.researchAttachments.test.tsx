/**
 * GeneratePostPage — "Research material" section (2026-08-01).
 *
 * Pins the three page-level halves of the feature:
 *   1. Gating — paid licenses get the real `ResearchAttachments` dropzone;
 *      None/Free get the SectionGateTeaser with the handoff's gate copy and
 *      no upload affordance behind it.
 *   2. Transport — an attached file goes through the REAL
 *      `uploadResearchDoc` helper (multipart FormData to
 *      `/structura/v1/research-docs`) and lands as a ready row.
 *   3. Wire — submit runs the REAL `useCampaignMutations` +
 *      `flattenCampaign`, so the ready refs must reach
 *      `/structura/v1/post/generate` as `research_attachments` `{id, name}`.
 *
 * Only the network edge (`@wordpress/api-fetch`) and the settings/personas
 * data hooks are mocked — the section, transport helper, mutation and
 * flatten all run for real (repo rule: never mock the unit under test).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";

vi.mock("@wordpress/i18n", () => ({
  __: (t: string) => t,
  _n: (single: string, plural: string, n: number) => (n === 1 ? single : plural),
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

const apiFetchMock = vi.fn();
vi.mock("@wordpress/api-fetch", () => ({
  default: (...args: unknown[]) => apiFetchMock(...args),
}));

// License is swappable per test — paid vs free drives the section gate.
const licenseMock = vi.hoisted(() => ({
  current: { isPaidLicense: true, isLicensed: true, plan: "byok" },
}));
vi.mock("@/features/settings", () => ({
  useLicense: () => licenseMock.current,
  useAiConnections: () => ({
    activeProviders: ["openai"],
    textProviders: ["openai"],
    imageProviders: ["openai"],
    incompleteProviders: [],
    isProviderIncomplete: () => false,
    isLoading: false,
    isFetching: false,
  }),
  useDefaultProviders: () => ({
    defaultTextProvider: "openai",
    defaultImageProvider: "openai",
    availableProviders: ["openai"],
    availableImageProviders: ["openai"],
    incompleteProviders: [],
    isProviderIncomplete: () => false,
    hasExplicitDefaults: true,
    hasExplicitTextDefault: true,
    hasExplicitImageDefault: true,
    hasMultipleProviders: false,
    isAutoResolved: false,
    isFullyConfigured: true,
    isCloud: false,
  }),
}));

vi.mock("@/features/personas", () => ({
  usePersonasQuery: () => ({
    data: [
      { id: "p1", name: "House voice" },
      { id: "p2", name: "Casual expert" },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useMagicSuggest", () => ({
  useMagicSuggest: () => ({ suggest: vi.fn(), isSuggesting: false }),
}));

vi.mock("@/features/ai-engine", () => ({
  // Truthy so the provider seed effect runs and snaps the form onto the
  // connected OpenAI — with `undefined` the form stayed on the static
  // gemini default, which the submit gate now (correctly) blocks as an
  // unconnected provider (see GeneratePostPage.providerSeedRace.test.tsx).
  useAiSettingsQuery: () => ({ data: {} }),
}));

// A bound preset keeps the VisualStyleFallbackNotice quiet (it's covered
// by its own test file).
vi.mock("@/features/settings/api/useVisualPresets", () => ({
  useVisualPresetsQuery: () => ({
    data: { boundPresetId: "preset-1" },
    isLoading: false,
  }),
}));

import GeneratePostPage from "../routes/GeneratePostPage";

const renderPage = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/generate"]}>
        <Routes>
          <Route path="/generate" element={<GeneratePostPage />} />
          <Route path="*" element={<div>elsewhere</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (opts: { path?: string }) => {
    if (opts.path === "/structura/v1/research-docs") {
      return {
        success: true,
        attachment: {
          attachmentId: "att-1",
          name: "brief.pdf",
          ext: "pdf",
          sizeBytes: 5,
          charCount: 1200,
          truncated: false,
          extractedUnit: "pages",
          extractedUsed: 3,
          extractedTotal: 3,
        },
      };
    }
    if (opts.path === "/structura/v1/post/generate") {
      return { success: true, run_id: "run-9" };
    }
    return {};
  });
  licenseMock.current = { isPaidLicense: true, isLicensed: true, plan: "byok" };
});

describe("GeneratePostPage — research material gating", () => {
  it("renders the dropzone section for paid licenses", () => {
    renderPage();

    expect(screen.getByText("Research material")).toBeInTheDocument();
    expect(screen.getByText("Click to upload")).toBeInTheDocument();
    // The paid path never shows the gate teaser.
    expect(screen.queryByText("Upgrade plan")).toBeNull();
  });

  it("renders the locked teaser (no dropzone) for free licenses", () => {
    licenseMock.current = { isPaidLicense: false, isLicensed: true, plan: "free" };
    renderPage();

    expect(screen.getByText("Research material")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ground posts in your own PDFs, briefs and interview notes — attach up to 5 files per post.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Upgrade plan")).toBeInTheDocument();
    // Gated fields are neither rendered nor fetched behind the teaser.
    expect(screen.queryByText("Click to upload")).toBeNull();
  });
});

describe("GeneratePostPage — upload → submit wire", () => {
  it("uploads via /research-docs and submits ready refs as research_attachments", async () => {
    const { container } = renderPage();

    // A valid objective (≥ 20 chars) so the submit gate opens.
    fireEvent.change(
      screen.getByPlaceholderText(/Write an in-depth guide/),
      { target: { value: "Write a detailed post about our Q3 market research." } },
    );

    // Attach a file through the section's hidden picker input — this drives
    // the REAL uploadResearchDoc transport against the apiFetch edge.
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const file = new File(["research"], "brief.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [file] } });

    // Row lands ready (sr-only "Ready" on the check disc) with the
    // extracted-size meta.
    await screen.findByText("brief.pdf");
    await screen.findByText("Ready");

    // Multipart contract: FormData body, field name "file".
    const uploadCall = apiFetchMock.mock.calls.find(
      (c) => (c[0] as { path?: string }).path === "/structura/v1/research-docs",
    );
    expect(uploadCall).toBeDefined();
    const body = (uploadCall?.[0] as { body?: FormData }).body;
    expect(body).toBeInstanceOf(FormData);
    expect(body?.get("file")).toBeInstanceOf(File);

    // Submit — the REAL mutation + flattenCampaign must put the ready ref
    // on the wire as snake_case research_attachments.
    fireEvent.click(screen.getByRole("button", { name: /Generate Now/ }));

    await waitFor(() => {
      const genCall = apiFetchMock.mock.calls.find(
        (c) => (c[0] as { path?: string }).path === "/structura/v1/post/generate",
      );
      expect(genCall).toBeDefined();
      expect(
        (genCall?.[0] as { data?: { research_attachments?: unknown } }).data
          ?.research_attachments,
      ).toEqual([{ id: "att-1", name: "brief.pdf" }]);
    });
  });

  it("omits research_attachments when nothing was attached", async () => {
    renderPage();

    fireEvent.change(
      screen.getByPlaceholderText(/Write an in-depth guide/),
      { target: { value: "Write a detailed post with no attachments at all." } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Generate Now/ }));

    await waitFor(() => {
      const genCall = apiFetchMock.mock.calls.find(
        (c) => (c[0] as { path?: string }).path === "/structura/v1/post/generate",
      );
      expect(genCall).toBeDefined();
      expect(
        "research_attachments" in
          ((genCall?.[0] as { data?: Record<string, unknown> }).data ?? {}),
      ).toBe(false);
    });
  });
});
