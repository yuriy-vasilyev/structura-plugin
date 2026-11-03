/**
 * GeneratePostPage — the focus keyphrase is suggested once the topic settles
 * (2026-10-23, customer portal parity).
 *
 * The keyphrase only filled on a click of Suggest keyphrases, so a topic sent
 * straight away ran with no focus keyphrase. The topic now settles when the
 * field loses focus (20+ characters) or Generate post strategy writes it, and
 * SEO Targeting suggests and pre-picks for it. A Generate Now click while the
 * suggestion runs is held and sent once it lands.
 *
 * Only the network edge (`@wordpress/api-fetch`) and the settings / persona /
 * suggestion data hooks are mocked: the page, SEO Targeting, the REAL
 * useCampaignMutations and flattenCampaign run for real, so the keyphrase is
 * read off the `/structura/v1/post/generate` wire.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const { state, calls } = vi.hoisted(() => ({
  state: {
    license: { isPaidLicense: true, isLicensed: true, plan: "byok" },
    /** What "Generate post strategy" answers with. */
    suggestion: null as Record<string, unknown> | null,
    /** Answers each keyword discovery request; a test swaps it for a held promise. */
    discover: (_data: Record<string, unknown>): Promise<unknown> =>
      Promise.resolve({ success: true, keywords: [] }),
  },
  /** Every request that crossed the (mocked) network edge. */
  calls: [] as Array<{ path?: string; data?: Record<string, unknown> }>,
}));

const DISCOVER_PATH = "/structura/v1/scheduler/discover-keywords";
const GENERATE_PATH = "/structura/v1/post/generate";

vi.mock("@wordpress/api-fetch", () => ({
  default: async (opts: { path?: string; data?: Record<string, unknown> }) => {
    calls.push(opts);
    if (opts.path === DISCOVER_PATH) return state.discover(opts.data ?? {});
    if (opts.path === GENERATE_PATH) return { success: true, run_id: "run-9" };
    return {};
  },
}));

vi.mock("@/features/settings", () => ({
  useLicense: () => state.license,
  usePublicSiteProfile: () => ({ data: { language: "en-US" }, isLoading: false }),
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

vi.mock("@/features/personas", () => {
  const personas = () => ({
    data: [
      { id: "p1", name: "House voice" },
      { id: "p2", name: "Casual expert" },
    ],
    isLoading: false,
  });
  return { usePersonasQuery: personas, useSitePersonasQuery: personas };
});

vi.mock("@/hooks/useMagicSuggest", () => ({
  useMagicSuggest: () => ({
    suggest: vi.fn(async () => state.suggestion),
    isSuggesting: false,
  }),
}));

vi.mock("@/features/ai-engine", () => ({
  // Truthy so the provider seed effect snaps the form onto the connected OpenAI.
  useAiSettingsQuery: () => ({ data: {} }),
}));

vi.mock("@/features/settings/api/useVisualPresets", () => ({
  useVisualPresetsQuery: () => ({ data: { boundPresetId: "preset-1" }, isLoading: false }),
}));

import GeneratePostPage from "../routes/GeneratePostPage";

const TOPIC = "Show small finance teams how to trace a broken nested spreadsheet formula.";
const TOP = "debug nested spreadsheet formulas";
const DISCOVERY = {
  success: true,
  keywords: [{ keyword: TOP }, { keyword: "nested if formula errors" }],
  metrics: { [TOP]: { volumeNumber: 880 } },
  meta: { path: "provider" },
};
const PICKED_LINE =
  "Picked for you: the top-ranked suggestion. Choose another below or clear it.";
const WAITING_LINE = "Finding your best keyphrase…";

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

const topicField = () => screen.getByPlaceholderText(/Write an in-depth guide/);
const generateButton = () => screen.getByRole("button", { name: /Generate Now/ });
/** The actions row: the held-click status line next to Cancel and Generate Now. */
const actions = () => generateButton().parentElement as HTMLElement;
/** The selected focus keyphrase pill's text, or null when nothing is picked. */
const pickedKeyphrase = () =>
  screen.queryByRole("button", { name: "Clear keyphrase" })?.parentElement?.textContent ?? null;
const discoverCalls = () => calls.filter((c) => c.path === DISCOVER_PATH);
const generateCalls = () => calls.filter((c) => c.path === GENERATE_PATH);
const tick = (ms = 50) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

/** A discovery answer the test releases by hand. */
function held() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Types the topic, then clicks Generate Now: focus leaves the field first, as a mousedown does. */
function typeTopicAndClickGenerate() {
  act(() => topicField().focus());
  fireEvent.change(topicField(), { target: { value: TOPIC } });
  act(() => generateButton().focus());
  fireEvent.click(generateButton());
}

beforeEach(() => {
  calls.length = 0;
  state.license = { isPaidLicense: true, isLicensed: true, plan: "byok" };
  state.suggestion = null;
  state.discover = () => Promise.resolve({ success: true, keywords: [] });
});

describe("GeneratePostPage — the focus keyphrase is suggested once the topic settles (2026-10-23)", () => {
  it("blurring a settled topic suggests and pre-picks the top keyphrase, and Generate Now sends it", async () => {
    state.discover = async () => DISCOVERY;
    renderPage();

    fireEvent.change(topicField(), { target: { value: TOPIC } });
    fireEvent.blur(topicField());

    await waitFor(() => expect(discoverCalls()).toHaveLength(1));
    expect(discoverCalls()[0].data).toMatchObject({ keyphrase: TOPIC, provider: "openai" });
    expect(await screen.findByText(PICKED_LINE)).toBeInTheDocument();
    expect(pickedKeyphrase()).toBe(TOP);

    fireEvent.click(generateButton());

    await waitFor(() => expect(generateCalls()).toHaveLength(1));
    expect(generateCalls()[0].data).toMatchObject({ topic: TOPIC, focus_keyphrase: TOP });
  });

  it("blurring the same topic again after clearing the pick runs no second discovery", async () => {
    state.discover = async () => DISCOVERY;
    renderPage();
    fireEvent.change(topicField(), { target: { value: TOPIC } });
    fireEvent.blur(topicField());
    expect(await screen.findByText(PICKED_LINE)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear keyphrase" }));
    fireEvent.focus(topicField());
    fireEvent.blur(topicField());
    await tick();

    expect(discoverCalls()).toHaveLength(1);
    expect(pickedKeyphrase()).toBeNull();
  });

  it("a new topic settled while a keyphrase is selected runs no discovery and keeps the keyphrase", async () => {
    state.discover = async () => DISCOVERY;
    renderPage();
    fireEvent.change(topicField(), { target: { value: TOPIC } });
    fireEvent.blur(topicField());
    expect(await screen.findByText(PICKED_LINE)).toBeInTheDocument();

    const rewritten = "A beginner's checklist for auditing spreadsheet formulas.";
    fireEvent.change(topicField(), { target: { value: rewritten } });
    fireEvent.blur(topicField());
    await tick();

    expect(discoverCalls()).toHaveLength(1);
    fireEvent.click(generateButton());
    await waitFor(() => expect(generateCalls()).toHaveLength(1));
    expect(generateCalls()[0].data).toMatchObject({ topic: rewritten, focus_keyphrase: TOP });
  });

  it("a click on Generate Now straight from the topic field waits for the suggestion, then sends the run once with the picked keyphrase", async () => {
    const run = held();
    state.discover = () => run.promise;
    renderPage();

    typeTopicAndClickGenerate();

    await waitFor(() => expect(discoverCalls()).toHaveLength(1));
    expect(discoverCalls()[0].data?.keyphrase).toBe(TOPIC);
    await tick();
    expect(generateCalls()).toEqual([]);
    expect(generateButton()).toHaveAttribute("aria-busy", "true");
    expect(within(actions()).getByRole("status")).toHaveTextContent(WAITING_LINE);

    run.resolve(DISCOVERY);

    await waitFor(() => expect(generateCalls()).toHaveLength(1));
    expect(generateCalls()[0].data).toMatchObject({ topic: TOPIC, focus_keyphrase: TOP });
    await tick();
    expect(generateCalls()).toHaveLength(1);
  });

  it.each([
    ["comes back empty", (run: ReturnType<typeof held>) => run.resolve({ success: true, keywords: [] })],
    ["fails", (run: ReturnType<typeof held>) => run.reject(new Error("keyword service unavailable"))],
  ])("a held run still goes out once, without a keyphrase, when the suggestion %s", async (_label, settle) => {
    const run = held();
    state.discover = () => run.promise;
    renderPage();

    typeTopicAndClickGenerate();
    await waitFor(() => expect(discoverCalls()).toHaveLength(1));
    await tick();
    expect(generateCalls()).toEqual([]);

    settle(run);

    await waitFor(() => expect(generateCalls()).toHaveLength(1));
    expect(generateCalls()[0].data).toMatchObject({ topic: TOPIC });
    expect(generateCalls()[0].data).not.toHaveProperty("focus_keyphrase");
    await tick();
    expect(generateCalls()).toHaveLength(1);
  });

  it("a click on Generate Now during a manual Suggest waits for it and sends the top candidate", async () => {
    const run = held();
    state.discover = () => run.promise;
    renderPage();
    fireEvent.change(topicField(), { target: { value: TOPIC } });
    fireEvent.click(screen.getByRole("button", { name: /Suggest keyphrases/ }));
    await waitFor(() => expect(discoverCalls()).toHaveLength(1));

    fireEvent.click(generateButton());
    await tick();
    expect(generateCalls()).toEqual([]);
    expect(generateButton()).toHaveAttribute("aria-busy", "true");

    run.resolve(DISCOVERY);

    // Suggest alone only lists the candidates, but a held click is leaving
    // the form: the user asked for a keyphrase, so the top one rides along.
    await waitFor(() => expect(generateCalls()).toHaveLength(1));
    expect(generateCalls()[0].data).toMatchObject({ focus_keyphrase: TOP });
    await tick();
    expect(generateCalls()).toHaveLength(1);
  });

  it("holds the click that blurred the topic field even before React has rendered the pending suggestion", async () => {
    // Browser order: the mousedown moves focus and React flushes the blur's
    // update in a microtask, then the click arrives as its own task while the
    // pending state still waits for a render. Real scheduling here, so nothing
    // renders between the two the way act() would.
    const run = held();
    state.discover = () => run.promise;
    renderPage();
    act(() => topicField().focus());
    fireEvent.change(topicField(), { target: { value: TOPIC } });

    const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      generateButton().focus();
      await Promise.resolve();
      generateButton().click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(discoverCalls()).toHaveLength(1);
      expect(generateCalls()).toEqual([]);
    } finally {
      env.IS_REACT_ACT_ENVIRONMENT = previous;
    }

    run.resolve(DISCOVERY);
    await waitFor(() => expect(generateCalls()).toHaveLength(1));
    expect(generateCalls()[0].data).toMatchObject({ focus_keyphrase: TOP });
  });

  it("a suggestion that lands after the topic was edited keeps the edited topic", async () => {
    // The pick replaces the identity cluster; built from the form as it was
    // when the run started, it would write the old topic back.
    const run = held();
    state.discover = () => run.promise;
    renderPage();
    fireEvent.change(topicField(), { target: { value: TOPIC } });
    fireEvent.blur(topicField());
    await waitFor(() => expect(discoverCalls()).toHaveLength(1));

    const edited = `${TOPIC} Include a printable checklist.`;
    fireEvent.change(topicField(), { target: { value: edited } });

    run.resolve(DISCOVERY);

    expect(await screen.findByText(PICKED_LINE)).toBeInTheDocument();
    expect(topicField()).toHaveValue(edited);
    fireEvent.click(generateButton());
    await waitFor(() => expect(generateCalls()).toHaveLength(1));
    expect(generateCalls()[0].data).toMatchObject({ topic: edited, focus_keyphrase: TOP });
  });

  it("Generate post strategy settles the objective it writes, and the keyphrase is suggested for it", async () => {
    const objective = "Explain how small finance teams can audit nested spreadsheet formulas.";
    state.suggestion = { strategy: objective };
    state.discover = async () => DISCOVERY;
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Generate post strategy/ }));

    await waitFor(() => expect(discoverCalls()).toHaveLength(1));
    expect(discoverCalls()[0].data?.keyphrase).toBe(objective);
    expect(await screen.findByText(PICKED_LINE)).toBeInTheDocument();
    expect(topicField()).toHaveValue(objective);
  });

  it("a topic under 20 characters does not settle, so blurring it suggests nothing", async () => {
    state.discover = async () => DISCOVERY;
    renderPage();

    fireEvent.change(topicField(), { target: { value: "espresso tips" } });
    fireEvent.blur(topicField());
    await tick();

    expect(discoverCalls()).toEqual([]);
  });

  it("free license: a settled topic runs no discovery and Generate Now sends at once", async () => {
    state.license = { isPaidLicense: false, isLicensed: true, plan: "free" };
    state.discover = async () => DISCOVERY;
    renderPage();

    typeTopicAndClickGenerate();

    await waitFor(() => expect(generateCalls()).toHaveLength(1));
    expect(discoverCalls()).toEqual([]);
    expect(generateCalls()[0].data).toMatchObject({ topic: TOPIC });
    expect(generateCalls()[0].data).not.toHaveProperty("focus_keyphrase");
  });
});
