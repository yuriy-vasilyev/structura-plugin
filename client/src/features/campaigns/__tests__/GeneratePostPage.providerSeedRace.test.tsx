/**
 * GeneratePostPage — provider seeding race (wp.org first-impression QA,
 * 2026-09-02).
 *
 * The wp_localize bootstrap omits the cloud-derived `connected` flags, so
 * on first paint `useAiConnections().activeProviders` is empty and
 * `useDefaultProviders` falls back to "gemini" — which the page's
 * one-shot seed effect then locked in even when the user's only key was
 * OpenAI. The generation went to the cloud requesting gemini and 403'd
 * with `credentials_missing` on a provider the user never picked.
 *
 * Pins both halves of the fix:
 *   1. Seeding waits for the connections fetch to settle, so the wire
 *      carries the provider the user actually has.
 *   2. Defence-in-depth: if the selected provider is somehow not
 *      connected, submit is blocked with an explanatory banner instead
 *      of handing the cloud a doomed run.
 *
 * Only the network edge (`@wordpress/api-fetch`) and the settings/persona
 * data hooks are mocked — the page, its seed effect, and the REAL
 * mutation + flatten run for real (repo rule: never mock the unit under
 * test).
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

// Swappable connection state — the race is staged by flipping this
// between renders, exactly like the settings query settling.
const connectionsMock = vi.hoisted(() => ({
  current: {
    activeProviders: [] as string[],
    isLoading: false,
    isFetching: true,
  },
}));
const defaultsMock = vi.hoisted(() => ({
  current: { text: "gemini", image: "gemini" },
}));

vi.mock("@/features/settings", () => ({
  useLicense: () => ({ isPaidLicense: false, isLicensed: false, plan: "none" }),
  useAiConnections: () => ({
    activeProviders: connectionsMock.current.activeProviders,
    textProviders: connectionsMock.current.activeProviders,
    imageProviders: connectionsMock.current.activeProviders,
    incompleteProviders: [],
    isProviderIncomplete: () => false,
    isLoading: connectionsMock.current.isLoading,
    isFetching: connectionsMock.current.isFetching,
  }),
  useDefaultProviders: () => ({
    defaultTextProvider: defaultsMock.current.text,
    defaultImageProvider: defaultsMock.current.image,
    availableProviders: connectionsMock.current.activeProviders,
    availableImageProviders: connectionsMock.current.activeProviders,
    incompleteProviders: [],
    isProviderIncomplete: () => false,
    hasExplicitDefaults: false,
    hasExplicitTextDefault: false,
    hasExplicitImageDefault: false,
    hasMultipleProviders: false,
    isAutoResolved: true,
    isFullyConfigured: false,
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

// Truthy settings data so the seed effect is eligible to run — the race
// under test is between THIS landing and the `connected` flags landing.
vi.mock("@/features/ai-engine", () => ({
  useAiSettingsQuery: () => ({ data: {} }),
}));

vi.mock("@/features/settings/api/useVisualPresets", () => ({
  useVisualPresetsQuery: () => ({
    data: { boundPresetId: "preset-1" },
    isLoading: false,
  }),
}));

import GeneratePostPage from "../routes/GeneratePostPage";

const buildTree = () => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <MemoryRouter initialEntries={["/generate"]}>
      <Routes>
        <Route path="/generate" element={<GeneratePostPage />} />
        <Route path="*" element={<div>elsewhere</div>} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>
);

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (opts: { path?: string }) => {
    if (opts.path === "/structura/v1/post/generate") {
      return { success: true, run_id: "run-9" };
    }
    return {};
  });
  connectionsMock.current = { activeProviders: [], isLoading: false, isFetching: true };
  defaultsMock.current = { text: "gemini", image: "gemini" };
});

describe("GeneratePostPage — provider seeding race", () => {
  it("waits for connections to settle so the wire carries the connected provider, not the gemini fallback", async () => {
    // 1st render: settings landed, connections still fetching — the
    // fallback default is "gemini" (no key exists for it).
    const { rerender } = render(buildTree());

    // Connections settle: only OpenAI is connected and the defaults
    // resolve accordingly (what useDefaultProviders returns once the
    // `connected` flags land).
    connectionsMock.current = {
      activeProviders: ["openai"],
      isLoading: false,
      isFetching: false,
    };
    defaultsMock.current = { text: "openai", image: "openai" };
    rerender(buildTree());

    fireEvent.change(screen.getByPlaceholderText(/Write an in-depth guide/), {
      target: { value: "How to choose the right grind size for pour-over coffee." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Generate Now/ }));

    await waitFor(() => {
      const genCall = apiFetchMock.mock.calls.find(
        (c) => (c[0] as { path?: string }).path === "/structura/v1/post/generate",
      );
      expect(genCall).toBeDefined();
      const data = (genCall?.[0] as { data?: Record<string, unknown> }).data ?? {};
      expect(data.text_provider).toBe("openai");
    });
  });

  it("blocks submit with an explanation when the selected provider is not connected", async () => {
    // Connections are settled, OpenAI is the only key — but the defaults
    // (and therefore the seeded selection) point at gemini. However it
    // happens, a doomed run must not reach the cloud.
    connectionsMock.current = {
      activeProviders: ["openai"],
      isLoading: false,
      isFetching: false,
    };
    defaultsMock.current = { text: "gemini", image: "gemini" };
    render(buildTree());

    fireEvent.change(screen.getByPlaceholderText(/Write an in-depth guide/), {
      target: { value: "Best water temperature for brewing light roast coffee." },
    });

    expect(
      await screen.findByText(/The selected text provider isn't connected/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate Now/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Generate Now/ }));
    expect(
      apiFetchMock.mock.calls.find(
        (c) => (c[0] as { path?: string }).path === "/structura/v1/post/generate",
      ),
    ).toBeUndefined();
  });
});
