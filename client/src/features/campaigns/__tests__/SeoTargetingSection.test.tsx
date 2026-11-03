/**
 * <SeoTargetingSection> — the wp-admin Generate a Post keyphrase picker.
 *
 * 2026-10-23: the focus keyphrase only filled on a click of Suggest
 * keyphrases, so a post sent straight from the topic ran with no keyphrase.
 * The page now passes the settled topic as `autoSuggestSeed`; the section runs
 * discovery once per distinct seed and pre-picks the top-ranked candidate
 * (customer portal parity with FocusKeyphrasePicker).
 *
 * Runs the REAL section and the REAL useCampaignMutations; only the network
 * edge (`@wordpress/api-fetch`) is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, useState, type ReactElement } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SeoTargetingSection } from "@/features/campaigns/components/SeoTargetingSection";
import { DEFAULT_CAMPAIGN_FORM_DATA } from "@/features/campaigns/constants";
import type { CampaignFormData } from "@/features/campaigns/types";

const { calls, discovery } = vi.hoisted(() => ({
  /** Every request that crossed the (mocked) network edge. */
  calls: [] as Array<{ path?: string; data?: Record<string, unknown> }>,
  /** Answers each keyword discovery request; a test swaps it for a held promise. */
  discovery: {
    answer: (_data: Record<string, unknown>): Promise<unknown> =>
      Promise.resolve({ success: true, keywords: [] }),
  },
}));

const DISCOVER_PATH = "/structura/v1/scheduler/discover-keywords";

vi.mock("@wordpress/api-fetch", () => ({
  default: async (opts: { path?: string; data?: Record<string, unknown> }) => {
    calls.push(opts);
    return opts.path === DISCOVER_PATH ? discovery.answer(opts.data ?? {}) : {};
  },
}));

const SEED = "How to descale an entry-level espresso machine";
const TOP = "descale espresso machine";
const RESULT = {
  success: true,
  keywords: [{ keyword: TOP }, { keyword: "espresso machine descaling" }],
  metrics: { [TOP]: { volumeNumber: 2400 } },
  meta: { path: "provider" },
};

const SEED_B = "Choosing a burr grinder for a home espresso setup";
const TOP_B = "best burr grinder for espresso";
const RESULT_B = {
  success: true,
  keywords: [{ keyword: TOP_B }, { keyword: "burr grinder vs blade grinder" }],
  meta: { path: "provider" },
};

const PICKED_LINE =
  "Picked for you: the top-ranked suggestion. Choose another below or clear it.";

const formWith = (objective: string): CampaignFormData => ({
  ...DEFAULT_CAMPAIGN_FORM_DATA,
  identity: { ...DEFAULT_CAMPAIGN_FORM_DATA.identity, objective },
});

/**
 * Holds the form the way Generate a Post does (cluster patches merged into
 * state above the section) and echoes the keyphrase, so a pick is observable.
 */
function Harness(props: {
  seed?: string;
  pickTop?: boolean;
  onPending?: (pending: boolean) => void;
  paid?: boolean;
}) {
  const [formData, setFormData] = useState(() => formWith(SEED));
  return (
    <>
      <SeoTargetingSection
        formData={formData}
        onChange={(patch) => setFormData((prev) => ({ ...prev, ...patch }))}
        isPaidLicense={props.paid ?? true}
        autoSuggestSeed={props.seed}
        onPendingChange={props.onPending}
        pickTopOnSettle={props.pickTop}
      />
      <output data-testid="selected">{formData.identity.focusKeyphrase ?? ""}</output>
    </>
  );
}

function renderSection(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (node: ReactElement) => (
    <QueryClientProvider client={client}>{node}</QueryClientProvider>
  );
  const view = render(wrap(ui));
  return {
    container: view.container,
    unmount: view.unmount,
    rerender: (next: ReactElement) => view.rerender(wrap(next)),
  };
}

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

/** Lets effects and settled promises run when the test expects nothing to happen. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

const discoverCalls = () => calls.filter((c) => c.path === DISCOVER_PATH);
const selected = () => screen.getByTestId("selected");

beforeEach(() => {
  calls.length = 0;
  discovery.answer = () => Promise.resolve({ success: true, keywords: [] });
});

describe("<SeoTargetingSection>", () => {
  // Owner review 2026-10-06: no locked teaser on None/Free; the page lists
  // what a paid plan adds in one card instead.
  it("renders nothing for None/Free — no teaser, no inputs", () => {
    const { container } = renderSection(
      <SeoTargetingSection
        formData={formWith(SEED)}
        onChange={vi.fn()}
        isPaidLicense={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers DFS keyphrase discovery for paid tiers", () => {
    renderSection(
      <SeoTargetingSection formData={formWith(SEED)} onChange={vi.fn()} isPaidLicense />,
    );
    expect(screen.getByRole("button", { name: /Suggest keyphrases/i })).toBeInTheDocument();
    // Teaser is gone on the paid path.
    expect(screen.queryByText("Pro / Cloud Feature")).toBeNull();
  });
});

describe("<SeoTargetingSection> — suggest and pre-pick once the topic settles (2026-10-23)", () => {
  it("runs discovery once for a settled seed, pre-picks the top candidate and reports pending true then false", async () => {
    const run = held();
    discovery.answer = () => run.promise;
    const pending: boolean[] = [];
    renderSection(<Harness seed={SEED} onPending={(p) => pending.push(p)} />);

    await waitFor(() => expect(discoverCalls()).toHaveLength(1));
    expect(discoverCalls()[0].data).toEqual({
      keyphrase: SEED,
      language: "default",
      provider: "gemini",
    });
    expect(pending).toEqual([true]);
    expect(screen.getByText("Finding your best keyphrase…")).toBeInTheDocument();

    run.resolve(RESULT);

    await waitFor(() => expect(selected()).toHaveTextContent(new RegExp(`^${TOP}$`)));
    expect(screen.getByText(PICKED_LINE)).toHaveAttribute("role", "status");
    await waitFor(() => expect(pending).toEqual([true, false]));
    expect(discoverCalls()).toHaveLength(1);
  });

  it("does not run again for the same seed, even after the pick is cleared", async () => {
    discovery.answer = async () => RESULT;
    const view = renderSection(<Harness seed={SEED} />);
    await waitFor(() => expect(selected()).toHaveTextContent(TOP));

    fireEvent.click(screen.getByRole("button", { name: "Clear keyphrase" }));
    // The same topic settles again, give or take whitespace.
    view.rerender(<Harness seed={`  ${SEED} `} />);
    await flush();

    expect(discoverCalls()).toHaveLength(1);
    expect(selected()).toBeEmptyDOMElement();
  });

  it("runs again for a new seed once nothing is selected, and picks from that run", async () => {
    discovery.answer = async (data) => (data.keyphrase === SEED ? RESULT : RESULT_B);
    const view = renderSection(<Harness seed={SEED} />);
    await waitFor(() => expect(selected()).toHaveTextContent(TOP));

    fireEvent.click(screen.getByRole("button", { name: "Clear keyphrase" }));
    view.rerender(<Harness seed={SEED_B} />);

    await waitFor(() => expect(discoverCalls()).toHaveLength(2));
    expect(discoverCalls()[1].data?.keyphrase).toBe(SEED_B);
    await waitFor(() => expect(selected()).toHaveTextContent(TOP_B));
    expect(screen.getByText(PICKED_LINE)).toBeInTheDocument();
  });

  it("never runs while a keyphrase is selected", async () => {
    discovery.answer = async () => RESULT;
    const view = renderSection(<Harness seed={SEED} />);
    await waitFor(() => expect(selected()).toHaveTextContent(TOP));

    view.rerender(<Harness seed={SEED_B} />);
    await flush();

    expect(discoverCalls()).toHaveLength(1);
    expect(selected()).toHaveTextContent(TOP);
  });

  it("a seed that settles while a run is in flight runs after it, and only its own run picks", async () => {
    // e.g. the field blurred on a rough topic, then Generate post strategy
    // rewrote it before discovery answered.
    const first = held();
    const second = held();
    discovery.answer = (data) => (data.keyphrase === SEED ? first.promise : second.promise);
    const view = renderSection(<Harness seed={SEED} />);
    await waitFor(() => expect(discoverCalls()).toHaveLength(1));

    view.rerender(<Harness seed={SEED_B} />);
    await flush();
    expect(discoverCalls()).toHaveLength(1);

    first.resolve(RESULT);
    await waitFor(() => expect(discoverCalls()).toHaveLength(2));
    expect(discoverCalls()[1].data?.keyphrase).toBe(SEED_B);
    // The run for the old topic picked nothing.
    expect(selected()).toBeEmptyDOMElement();

    second.resolve(RESULT_B);
    await waitFor(() => expect(selected()).toHaveTextContent(TOP_B));
  });

  it("a manual Suggest shows the ranked chips without picking one", async () => {
    discovery.answer = async () => RESULT;
    renderSection(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: /Suggest keyphrases/ }));

    expect(
      await screen.findByText("Pick one — it becomes your focus keyphrase."),
    ).toBeInTheDocument();
    expect(discoverCalls()).toHaveLength(1);
    expect(discoverCalls()[0].data?.keyphrase).toBe(SEED);
    expect(screen.getByRole("button", { name: /espresso machine descaling/ })).toBeInTheDocument();
    expect(selected()).toBeEmptyDOMElement();
    expect(screen.queryByText(PICKED_LINE)).not.toBeInTheDocument();
  });

  it("a manual Suggest picks the top candidate when a click is held before it lands", async () => {
    const run = held();
    discovery.answer = () => run.promise;
    const view = renderSection(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: /Suggest keyphrases/ }));
    await waitFor(() => expect(discoverCalls()).toHaveLength(1));
    // The page holds its Generate Now click while the run is in flight.
    view.rerender(<Harness pickTop />);

    run.resolve(RESULT);

    await waitFor(() => expect(selected()).toHaveTextContent(new RegExp(`^${TOP}$`)));
    expect(screen.getByText(PICKED_LINE)).toBeInTheDocument();
    expect(discoverCalls()).toHaveLength(1);
  });

  it("a held click keeps a keyphrase that was already picked when Re-suggest lands", async () => {
    discovery.answer = async () => RESULT;
    const view = renderSection(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Suggest keyphrases/ }));
    fireEvent.click(await screen.findByRole("button", { name: /espresso machine descaling/ }));
    expect(selected()).toHaveTextContent(/^espresso machine descaling$/);

    const run = held();
    discovery.answer = () => run.promise;
    fireEvent.click(screen.getByRole("button", { name: /Re-suggest/ }));
    await waitFor(() => expect(discoverCalls()).toHaveLength(2));
    view.rerender(<Harness pickTop />);

    run.resolve(RESULT);

    expect(
      await screen.findByText("Pick one — it becomes your focus keyphrase."),
    ).toBeInTheDocument();
    expect(selected()).toHaveTextContent(/^espresso machine descaling$/);
    expect(screen.queryByText(PICKED_LINE)).not.toBeInTheDocument();
  });

  it("an empty result selects nothing, shows the empty state and does not retry by itself", async () => {
    const pending: boolean[] = [];
    renderSection(<Harness seed={SEED} onPending={(p) => pending.push(p)} />);

    expect(
      await screen.findByText(
        "No live search data for that topic. Enter your own focus keyphrase.",
      ),
    ).toBeInTheDocument();
    expect(selected()).toBeEmptyDOMElement();
    await waitFor(() => expect(pending).toEqual([true, false]));
    await flush();
    expect(discoverCalls()).toHaveLength(1);
  });

  it("a failed run selects nothing, offers Retry and does not retry by itself", async () => {
    const run = held();
    discovery.answer = () => run.promise;
    const pending: boolean[] = [];
    renderSection(<Harness seed={SEED} onPending={(p) => pending.push(p)} />);
    await waitFor(() => expect(discoverCalls()).toHaveLength(1));

    run.reject(new Error("keyword service unavailable"));

    expect(await screen.findByRole("button", { name: /Retry/ })).toBeInTheDocument();
    expect(selected()).toBeEmptyDOMElement();
    await waitFor(() => expect(pending).toEqual([true, false]));
    await flush();
    expect(discoverCalls()).toHaveLength(1);
  });

  it.each([
    [
      "picks another chip",
      () => fireEvent.click(screen.getByRole("button", { name: /espresso machine descaling/ })),
      "espresso machine descaling",
    ],
    [
      "types their own",
      () => {
        fireEvent.change(screen.getByLabelText("…or type your own keyphrase"), {
          target: { value: "espresso maintenance routine" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Use" }));
      },
      "espresso maintenance routine",
    ],
    [
      "clears it",
      () => fireEvent.click(screen.getByRole("button", { name: "Clear keyphrase" })),
      "",
    ],
  ])("the picked-for-you line goes once the user %s", async (_label, choose, chosen) => {
    discovery.answer = async () => RESULT;
    renderSection(<Harness seed={SEED} />);
    expect(await screen.findByText(PICKED_LINE)).toBeInTheDocument();

    choose();

    await waitFor(() => expect(selected()).toHaveTextContent(new RegExp(`^${chosen}$`)));
    expect(screen.queryByText(PICKED_LINE)).not.toBeInTheDocument();
  });

  it("reports pending false when it unmounts mid-run, so the page's click is not held", async () => {
    discovery.answer = () => held().promise;
    const pending: boolean[] = [];
    const view = renderSection(<Harness seed={SEED} onPending={(p) => pending.push(p)} />);
    await waitFor(() => expect(pending).toEqual([true]));

    view.unmount();

    expect(pending).toEqual([true, false]);
  });

  it("runs nothing on a free license, even with a settled topic", async () => {
    const pending: boolean[] = [];
    const { container } = renderSection(
      <Harness seed={SEED} paid={false} onPending={(p) => pending.push(p)} />,
    );
    await flush();

    expect(discoverCalls()).toEqual([]);
    expect(pending).toEqual([]);
    expect(container.querySelector("button")).toBeNull();
  });

  it("still ends and picks under StrictMode, with one discovery call", async () => {
    // wp-admin renders the SPA in StrictMode, which runs mount effects twice;
    // a mutation started on the first pass loses its observer, which left the
    // campaign keyword step's loader stuck (2026-10-08).
    discovery.answer = async () => RESULT;
    const pending: boolean[] = [];
    renderSection(
      <StrictMode>
        <Harness seed={SEED} onPending={(p) => pending.push(p)} />
      </StrictMode>,
    );

    await waitFor(() => expect(selected()).toHaveTextContent(TOP));
    await waitFor(() => expect(pending.at(-1)).toBe(false));
    expect(discoverCalls()).toHaveLength(1);
  });
});
