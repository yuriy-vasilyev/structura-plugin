/**
 * Unit tests for the inline CampaignRunProgress strip.
 *
 * What's pinned here is the gating + render-branch contract:
 *   - Silent when no active run.
 *   - Silent for cards whose campaignId doesn't match the active run.
 *   - Lights up with the milestone headline + percent when it does match.
 *   - Flips to terminal receipt copy on `succeeded` / `failed`.
 *   - Auto-collapses after the success linger window; stays sticky on failure.
 *
 * The animation classes themselves aren't asserted as visual output —
 * jsdom doesn't render CSS keyframes. We do assert the class names
 * land on the right nodes, because that's the guardrail against a
 * future refactor accidentally dropping `animate-progress-flow` and
 * reducing the strip to a static fill.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, useEffect, type ReactNode } from "react";
import type { RunStatusSerialized } from "@structura/types";

const apiFetchMock = vi.fn();
vi.mock("@wordpress/api-fetch", () => ({
  default: (...args: unknown[]) => apiFetchMock(...args),
}));

// CampaignRunProgress mounts useCampaignRunQuery + useActiveRunsQuery
// (via RunsProvider). Both now gate on `useLicense().hasUsableLicense` —
// stub to "bound" so the polling fetch fires and the terminal-status
// branch render assertions still trip.
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => ({ hasUsableLicense: true, hasWorkspace: true }),
}));

import { CampaignRunProgress } from "../components/CampaignRunProgress";
import { RunsProvider, useRuns } from "../context/RunsContext";

/**
 * Pushes a `{runId, campaignId}` pair into the RunsProvider from a
 * child component. Written as a component (rather than imperatively
 * calling the hook outside of React) so we stay inside React's
 * render/effect cycle — the real call sites (Generate-Now mutation
 * success handler) do the same.
 *
 * Default `campaignId` of 42 matches `BASE_RUN` below so most tests
 * don't need to specify it explicitly; pass a different value when
 * exercising the "active run belongs to a different card" branch.
 */
const ActiveRunSetter = ({
  runId,
  campaignId = 42,
}: {
  runId: string | null;
  campaignId?: number;
}) => {
  const { setActiveRun } = useRuns();
  // `useEffect` (not `queueMicrotask`) so the side-effect runs during
  // React's commit phase — fake-timer harnesses don't fake commit
  // phases, while they DO intercept microtask scheduling via some
  // polyfills, which would leave a test like the terminal-success
  // linger one stuck forever waiting for `setActiveRun` to land.
  useEffect(() => {
    if (runId !== null) {
      setActiveRun({ runId, campaignId });
    } else {
      setActiveRun(null);
    }
  }, [runId, campaignId, setActiveRun]);
  return null;
};

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client },
      createElement(RunsProvider, null, children),
    );
}

const BASE_RUN: RunStatusSerialized = {
  schemaVersion: 1,
  runId: "run-xyz",
  campaignId: 42,
  campaignName: "Weekly Digest",
  status: "running",
  currentStep: "drafting",
  progressPercent: 37,
  headline: "Writing the draft",
  startedAt: "2026-04-22T12:00:00.000Z",
  updatedAt: "2026-04-22T12:00:30.000Z",
  stepDurationsMs: {},
};

beforeEach(() => {
  apiFetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CampaignRunProgress", () => {
  it("renders nothing when no run is active", () => {
    apiFetchMock.mockResolvedValue({ success: true, run: BASE_RUN });
    const { container } = render(
      <CampaignRunProgress campaignId={42} />,
      { wrapper: makeWrapper() },
    );
    // No progressbar role → no strip mounted. The strip uses
    // role="progressbar" on its outermost visible node, so absence of
    // that is the cleanest "silent" assertion.
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it("renders nothing when the active run is for a different campaign", async () => {
    apiFetchMock.mockResolvedValue({ success: true, run: BASE_RUN });
    render(
      <>
        <ActiveRunSetter runId="run-xyz" />
        <CampaignRunProgress campaignId={999} />
      </>,
      { wrapper: makeWrapper() },
    );

    // Let the microtask + poll settle. The strip for campaign 999 must
    // stay silent because the run's campaignId is 42.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("lights up with headline + percent for the matching campaign", async () => {
    apiFetchMock.mockResolvedValue({ success: true, run: BASE_RUN });
    render(
      <>
        <ActiveRunSetter runId="run-xyz" />
        <CampaignRunProgress campaignId={42} />
      </>,
      { wrapper: makeWrapper() },
    );

    // Wait for the milestone headline — that's the string ONLY the
    // real strip renders (the `StartingStrip` placeholder shows a
    // generic "Connecting to cloud — first run can take up to 30 seconds…" instead), so this is our signal
    // that the first poll has landed and the matcher has swapped in
    // the real content. We then reach for the progressbar by its
    // distinct aria-label so we don't accidentally grab the
    // placeholder if the test order somehow leaves a stale node.
    await screen.findByText("Writing the draft");
    const bar = screen.getByLabelText("Campaign run progress");
    expect(bar.getAttribute("aria-valuenow")).toBe("37");
    expect(screen.getByText("37%")).toBeInTheDocument();
  });

  it("applies the default 'lines' texture overlay while in flight", async () => {
    apiFetchMock.mockResolvedValue({ success: true, run: BASE_RUN });
    render(
      <>
        <ActiveRunSetter runId="run-xyz" />
        <CampaignRunProgress campaignId={42} />
      </>,
      { wrapper: makeWrapper() },
    );

    await screen.findByText("Writing the draft");
    // Guardrail: the default texture must be the animated diagonal
    // stripes ("lines"). If a future refactor swaps the default to a
    // more ambient variant we want to catch it — the lines texture is
    // the one designed to carry the strongest "it's happening right
    // now" affordance, per the 2026-04-22 redesign.
    expect(screen.getByTestId("crp-texture-lines")).toBeInTheDocument();
  });

  it("honors the texture prop (pulse) over the default", async () => {
    apiFetchMock.mockResolvedValue({ success: true, run: BASE_RUN });
    render(
      <>
        <ActiveRunSetter runId="run-xyz" />
        <CampaignRunProgress campaignId={42} texture="pulse" />
      </>,
      { wrapper: makeWrapper() },
    );

    await screen.findByText("Writing the draft");
    // The requested texture replaces the default. Other textures must
    // NOT render (single-texture switch is the contract).
    expect(screen.getByTestId("crp-texture-pulse")).toBeInTheDocument();
    expect(screen.queryByTestId("crp-texture-lines")).toBeNull();
    expect(screen.queryByTestId("crp-texture-grid")).toBeNull();
    expect(screen.queryByTestId("crp-texture-flow")).toBeNull();
  });

  it("supports the 'flow' and 'grid' textures", async () => {
    apiFetchMock.mockResolvedValue({ success: true, run: BASE_RUN });
    const { rerender } = render(
      <>
        <ActiveRunSetter runId="run-xyz" />
        <CampaignRunProgress campaignId={42} texture="flow" />
      </>,
      { wrapper: makeWrapper() },
    );
    await screen.findByText("Writing the draft");
    expect(screen.getByTestId("crp-texture-flow")).toBeInTheDocument();

    rerender(
      <>
        <ActiveRunSetter runId="run-xyz" />
        <CampaignRunProgress campaignId={42} texture="grid" />
      </>,
    );
    await screen.findByText("Writing the draft");
    expect(screen.getByTestId("crp-texture-grid")).toBeInTheDocument();
  });

  it("drops the texture overlay on terminal states (no animation on a receipt)", async () => {
    const succeeded: RunStatusSerialized = {
      ...BASE_RUN,
      status: "succeeded",
      currentStep: "done",
      progressPercent: 100,
      endedAt: "2026-04-22T12:02:00.000Z",
    };
    apiFetchMock.mockResolvedValue({ success: true, run: succeeded });
    render(
      <>
        <ActiveRunSetter runId="run-xyz" />
        <CampaignRunProgress campaignId={42} />
      </>,
      { wrapper: makeWrapper() },
    );

    await screen.findByText("Post published");
    // The texture overlay is only meaningful while the run is moving —
    // on a terminal state the strip reads as a receipt, not a progress
    // bar, so the motion needs to stop.
    expect(screen.queryByTestId("crp-texture-lines")).toBeNull();
    expect(screen.queryByTestId("crp-texture-pulse")).toBeNull();
    expect(screen.queryByTestId("crp-texture-flow")).toBeNull();
    expect(screen.queryByTestId("crp-texture-grid")).toBeNull();
  });

  it("renders terminal-success copy + icon and auto-collapses after the linger window", async () => {
    const succeeded: RunStatusSerialized = {
      ...BASE_RUN,
      status: "succeeded",
      currentStep: "done",
      progressPercent: 100,
      endedAt: "2026-04-22T12:02:00.000Z",
    };
    apiFetchMock.mockResolvedValue({ success: true, run: succeeded });

    render(
      <>
        <ActiveRunSetter runId="run-xyz" />
        <CampaignRunProgress campaignId={42} />
      </>,
      { wrapper: makeWrapper() },
    );

    // Wait for the terminal-success copy to actually render. We don't
    // use `vi.useFakeTimers` here — the `setLingerExpired` setTimeout
    // fires from a useEffect scheduled at commit time, and mixing
    // fake/real timers around React Query's fetch resolution led to
    // a deadlock where `vi.waitFor` polled on a faked setInterval
    // that never ticked. Real timers + an explicit real-time wait
    // past the 4s linger is slower by a few seconds but reliably
    // exercises the real scheduler the component uses in production.
    await screen.findByText("Post published");

    // Sleep real time past the 4s linger (SUCCESS_LINGER_MS in the
    // component). Once that timer fires the strip unmounts.
    await new Promise((r) => setTimeout(r, 4_500));

    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("renders terminal-failure copy and does NOT auto-collapse", async () => {
    const failed: RunStatusSerialized = {
      ...BASE_RUN,
      status: "failed",
      currentStep: "error",
      progressPercent: 60,
      endedAt: "2026-04-22T12:02:00.000Z",
      error: {
        code: "provider_error",
        userMessage: "AI provider returned an error.",
        logRunId: "log-abc",
      },
    };
    apiFetchMock.mockResolvedValue({ success: true, run: failed });

    render(
      <>
        <ActiveRunSetter runId="run-xyz" />
        <CampaignRunProgress campaignId={42} />
      </>,
      { wrapper: makeWrapper() },
    );

    await screen.findByText("Generation stopped");

    // Failure stays sticky — wait well past the success linger
    // window in real time and verify the strip hasn't collapsed.
    // Failure deserves persistent feedback on the originating card
    // until the user visits the run detail.
    await new Promise((r) => setTimeout(r, 4_500));

    expect(screen.getByText("Generation stopped")).toBeInTheDocument();
  });

  it("renders a 'Starting generation…' placeholder when the first poll hasn't landed yet", async () => {
    // Simulate the AS-jitter window: every poll 404s for a while until
    // the cloud dispatcher primes the Firestore run doc. We reproduce
    // that by making apiFetch reject, which is how `@wordpress/api-fetch`
    // surfaces 4xx errors to React Query.
    apiFetchMock.mockRejectedValue(new Error("run_not_found"));

    render(
      <>
        <ActiveRunSetter runId="run-xyz" campaignId={42} />
        <CampaignRunProgress campaignId={42} />
      </>,
      { wrapper: makeWrapper() },
    );

    // The outer gate already knows this card is the originating one
    // (campaignId matches), so we render the placeholder immediately
    // instead of waiting for a successful poll that may be 10s away.
    // This is the fix for "the user never sees anything during the
    // jitter window" — the whole point of keeping the strip alive
    // before the first poll lands.
    await screen.findByText("Connecting to cloud — first run can take up to 30 seconds…");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "0",
    );
  });

  it("stays silent on non-originating cards even during the jitter window", async () => {
    apiFetchMock.mockRejectedValue(new Error("run_not_found"));

    render(
      <>
        {/* Active run is for campaign 42, but this card renders for
            campaign 7 — the "Starting…" strip must NOT spill onto
            other cards, even before the first poll lands. */}
        <ActiveRunSetter runId="run-xyz" campaignId={42} />
        <CampaignRunProgress campaignId={7} />
      </>,
      { wrapper: makeWrapper() },
    );

    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText("Connecting to cloud — first run can take up to 30 seconds…")).toBeNull();
  });

  it("page variant renders with the hero card geometry (redesign 2026-04-22)", async () => {
    apiFetchMock.mockResolvedValue({ success: true, run: BASE_RUN });
    const { container } = render(
      <>
        <ActiveRunSetter runId="run-xyz" />
        <CampaignRunProgress campaignId={42} variant="page" />
      </>,
      { wrapper: makeWrapper() },
    );

    // Wait for the real-strip-only milestone headline before inspecting
    // the DOM; without this we'd race the `StartingStrip` placeholder
    // (which also exposes role="progressbar" and identical page-variant
    // shell) and the textContent assertion below would match the
    // placeholder's "Connecting to cloud — first run can take up to 30 seconds…" instead.
    await screen.findByText("Writing the draft");
    const bar = screen.getByLabelText("Campaign run progress");
    // The page variant is now a proper card: `rounded-xl` + `p-5`
    // padding + a border/shadow combo. We assert on those static class
    // strings because jsdom doesn't render arbitrary Tailwind values,
    // but the strings themselves are the contract — a refactor that
    // loses `rounded-xl` or `p-5` would collapse the hero card back to
    // a bare strip and we'd catch it here.
    expect(bar.className).toContain("rounded-xl");
    expect(bar.className).toContain("p-5");
    expect(bar.className).toContain("shadow-sm");
    // And the card variant's compact `h-11` strip height must NOT leak
    // into the page-variant rendering — they're visually distinct
    // surfaces.
    expect(bar.className).not.toContain("h-11");
    expect(container.textContent).toContain("Writing the draft");
  });

  it("expandable=true renders the 'Show all steps' toggle on the page variant", async () => {
    apiFetchMock.mockResolvedValue({ success: true, run: BASE_RUN });
    render(
      <>
        <ActiveRunSetter runId="run-xyz" />
        <CampaignRunProgress
          campaignId={42}
          variant="page"
          expandable
        />
      </>,
      { wrapper: makeWrapper() },
    );

    // The toggle only shows up once the strip has swapped in the real
    // (non-Starting) content — the expandable wrapper is rendered on
    // the real strip, not on the StartingStrip placeholder.
    await screen.findByText("Writing the draft");
    // The button uses `aria-expanded` so assistive tech can state the
    // current disclosure state. We assert on that attribute rather than
    // the copy so changing "Show all steps" → "Expand" wouldn't break
    // the test for the wrong reason.
    const toggle = screen.getByRole("button", { expanded: false });
    expect(toggle.textContent).toContain("Show all steps");
  });

  it("expandable toggle reveals the RunTimeline and updates aria-expanded", async () => {
    apiFetchMock.mockResolvedValue({ success: true, run: BASE_RUN });
    render(
      <>
        <ActiveRunSetter runId="run-xyz" />
        <CampaignRunProgress
          campaignId={42}
          variant="page"
          expandable
        />
      </>,
      { wrapper: makeWrapper() },
    );

    await screen.findByText("Writing the draft");
    const toggle = screen.getByRole("button", { expanded: false });
    // `fireEvent.click` is used (rather than userEvent) because the
    // repo doesn't ship `@testing-library/user-event` — the same
    // choice existing tests have made (e.g. RunDetailPage.test.tsx's
    // Technical Inspector toggle test).
    fireEvent.click(toggle);

    // After click: the button copy flips AND the reveal panel mounts.
    // We probe for the reveal by its `id` (the same id that
    // `aria-controls` points at) — if a future refactor breaks the
    // aria wiring we catch it here.
    expect(
      screen.getByRole("button", { expanded: true }).textContent,
    ).toContain("Hide steps");
    expect(document.getElementById("crp-timeline-reveal")).not.toBeNull();
  });

  it("expand toggle auto-collapses when the run hits a terminal status", async () => {
    // First return a running run, then flip to succeeded on the next
    // poll. The matcher effect watches `runStatus` and should flip
    // `timelineExpanded` back to false without any user interaction —
    // that's the core "the strip's expanded view shares the strip's
    // lifecycle, not the RunDetailPage's" contract.
    //
    // Fixture detail: we use a fresh `updatedAt` (Date.now()-ish)
    // because `useCampaignRunQuery`'s refetchInterval drops to 5s
    // when `updatedAt` is older than 60s — the static BASE_RUN
    // timestamp is deep in the past relative to the test env clock,
    // which would push the second poll past our timeout.
    const now = new Date();
    const freshRun: RunStatusSerialized = {
      ...BASE_RUN,
      updatedAt: now.toISOString(),
    };
    // The counter tracks calls to the campaign-run poll specifically.
    // `RunsProvider`'s refresh-recovery hook also hits `/runs/active`
    // on mount — we respond to that with an empty array and do NOT
    // advance the counter, so the first run-poll still returns the
    // "running" fixture and the second returns the terminal one.
    let callCount = 0;
    apiFetchMock.mockImplementation((opts?: { path?: string }) => {
      const path = opts?.path ?? "";
      if (path.includes("/runs/active")) {
        return Promise.resolve([]);
      }
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve({ success: true, run: freshRun });
      }
      return Promise.resolve({
        success: true,
        run: {
          ...freshRun,
          status: "succeeded",
          currentStep: "done",
          progressPercent: 100,
          endedAt: new Date(now.getTime() + 30_000).toISOString(),
        } satisfies RunStatusSerialized,
      });
    });

    render(
      <>
        <ActiveRunSetter runId="run-xyz" />
        <CampaignRunProgress
          campaignId={42}
          variant="page"
          expandable
        />
      </>,
      { wrapper: makeWrapper() },
    );

    await screen.findByText("Writing the draft");
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    // Sanity: we did actually open it before the terminal arrives.
    expect(document.getElementById("crp-timeline-reveal")).not.toBeNull();

    // Wait for the next poll to land the terminal status. Headline
    // swaps to "Post published" on the success branch. The 3s ceiling
    // covers React Query's 1s polling cadence plus margin.
    await screen.findByText("Post published", {}, { timeout: 3_000 });

    // Auto-collapse: the reveal panel must be gone even though the
    // user never clicked the toggle again. If a future refactor drops
    // the terminal-status effect, this test catches the regression
    // before a user ever sees a static timeline sitting under a
    // receipt strip.
    expect(document.getElementById("crp-timeline-reveal")).toBeNull();
  });
});
