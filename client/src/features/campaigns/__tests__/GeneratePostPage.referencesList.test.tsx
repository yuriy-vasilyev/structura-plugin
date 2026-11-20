/**
 * GeneratePostPage — the References list toggle (specs/study-lookup.md §12.3).
 *
 * Off by default, sent on the `/post/generate` wire, and unavailable with a
 * hint while authority links are off; turning authority links off turns it
 * off. Only the network edge (`@wordpress/api-fetch`) and the settings /
 * persona data hooks are mocked; the page, the form state and the REAL
 * mutation + flattenCampaign run.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";

vi.mock("@wordpress/i18n", () => ({
  __: (t: string) => t,
  _x: (t: string) => t,
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

vi.mock("@/features/settings", () => ({
  useLicense: () => ({ isPaidLicense: true, isLicensed: true, plan: "cloud" }),
  usePublicSiteProfile: () => ({ data: { language: "en-US" }, isLoading: false }),
  useAiConnections: () => ({
    activeProviders: [],
    textProviders: [],
    imageProviders: [],
    incompleteProviders: [],
    isProviderIncomplete: () => false,
    isLoading: false,
    isFetching: false,
  }),
  useDefaultProviders: () => ({
    defaultTextProvider: "gemini",
    defaultImageProvider: "gemini",
    availableProviders: ["gemini", "openai", "anthropic"],
    availableImageProviders: ["gemini", "openai"],
    incompleteProviders: [],
    isProviderIncomplete: () => false,
    hasExplicitDefaults: false,
    hasExplicitTextDefault: false,
    hasExplicitImageDefault: false,
    hasMultipleProviders: true,
    isAutoResolved: false,
    isFullyConfigured: true,
    isCloud: true,
  }),
}));

vi.mock("@/features/personas", () => {
  const personas = () => ({ data: [{ id: "p1", name: "House voice" }], isLoading: false });
  return { usePersonasQuery: personas, useSitePersonasQuery: personas };
});

vi.mock("@/hooks/useMagicSuggest", () => ({
  useMagicSuggest: () => ({ suggest: vi.fn(), isSuggesting: false }),
}));

vi.mock("@/features/ai-engine", () => ({
  useAiSettingsQuery: () => ({ data: {} }),
}));

vi.mock("@/features/settings/api/useVisualPresets", () => ({
  useVisualPresetsQuery: () => ({ data: { boundPresetId: "preset-1" }, isLoading: false }),
}));

import GeneratePostPage from "../routes/GeneratePostPage";

const HINT = "Turn on authority links to use this.";
/** The description `SEO_Rules_Registry` gives the rule on the campaign pages. */
const DESCRIPTION = "Add a list of the studies and sources a post cites, in full, at the end of the post.";

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/generate"]}>
        <Routes>
          <Route path="/generate" element={<GeneratePostPage />} />
          <Route path="*" element={<div>elsewhere</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

const toggle = (name: string) => screen.getByRole("switch", { name });

/** Fill a valid objective, submit, and return the sent SEO rules. */
const submitAndReadRules = async (): Promise<Record<string, unknown>> => {
  fireEvent.change(screen.getByPlaceholderText(/Write an in-depth guide/), {
    target: { value: "How to choose the right grind size for pour-over coffee." },
  });
  fireEvent.click(screen.getByRole("button", { name: /Generate Now/ }));

  let rules: Record<string, unknown> = {};
  await waitFor(() => {
    const call = apiFetchMock.mock.calls.find(
      (c) => (c[0] as { path?: string }).path === "/structura/v1/post/generate"
    );
    expect(call).toBeDefined();
    const data = (call?.[0] as { data?: { seo_optimization_rules?: Record<string, unknown> } }).data;
    rules = data?.seo_optimization_rules ?? {};
  });
  return rules;
};

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (opts: { path?: string }) => {
    if (opts.path === "/structura/v1/post/generate") {
      return { success: true, run_id: "run-1" };
    }
    return {};
  });
});

describe("GeneratePostPage — References list (study lookup §12.3)", () => {
  it("is off by default and sent off", async () => {
    renderPage();

    expect(toggle("References list")).toHaveAttribute("aria-checked", "false");
    expect(toggle("References list")).toBeEnabled();
    expect(screen.getByText(DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByText(HINT)).toBeNull();
    // Right after the authority toggle it depends on, so its hint can say "authority links".
    const switches = screen.getAllByRole("switch");
    expect(switches.indexOf(toggle("References list"))).toBe(
      switches.indexOf(toggle("Authority outbound links")) + 1
    );

    const rules = await submitAndReadRules();
    expect(rules.references_list).toBe(false);
    expect(rules.outbound_link_authority).toBe(true);
  });

  it("is sent on once turned on", async () => {
    renderPage();

    fireEvent.click(toggle("References list"));
    expect(toggle("References list")).toHaveAttribute("aria-checked", "true");

    const rules = await submitAndReadRules();
    expect(rules.references_list).toBe(true);
  });

  it("goes off and is held back with a hint when authority links are turned off", async () => {
    renderPage();

    fireEvent.click(toggle("References list"));
    fireEvent.click(toggle("Authority outbound links"));

    expect(toggle("References list")).toHaveAttribute("aria-checked", "false");
    expect(toggle("References list")).toBeDisabled();
    expect(screen.getByText(HINT)).toBeInTheDocument();

    // A click on the held-back toggle changes nothing.
    fireEvent.click(toggle("References list"));
    expect(toggle("References list")).toHaveAttribute("aria-checked", "false");

    const rules = await submitAndReadRules();
    expect(rules.outbound_link_authority).toBe(false);
    expect(rules.references_list).toBe(false);
  });

  it("stays off when authority links come back on", () => {
    renderPage();

    fireEvent.click(toggle("References list"));
    fireEvent.click(toggle("Authority outbound links"));
    fireEvent.click(toggle("Authority outbound links"));

    expect(toggle("References list")).toBeEnabled();
    expect(toggle("References list")).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText(HINT)).toBeNull();
  });
});
