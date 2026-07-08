/**
 * RunDetailPage render-branch tests.
 *
 * The detail page is a read-only receipt view (Phase 1 per
 * `specs/run-detail-view.md` §10). The branches that matter are:
 *
 *   1. Loading — first poll hasn't landed; a calm in-page PageLoader is
 *      rendered (not the brand-level AppLoader — that one forces a 70vh
 *      min-height and ships the wrong "Initializing core…" copy for a
 *      per-record fetch).
 *   2. Error / 404 — NotFoundState with the 30-day TTL copy and a
 *      "Back to Overview" link.
 *   3. Loaded (succeeded) — header with campaign name + "View post",
 *      inputs card with keywords / persona / providers, outputs empty
 *      state or channels summary.
 *   4. Loaded (succeeded_with_warnings) — warnings banner rendered
 *      under the outputs header + failed channels with "failed" label.
 *   5. Loaded (failed) — TimelineRow for the failing step renders the
 *      user-safe error message inline.
 *   6. Technical details accordion — collapsed by default, toggles open
 *      to reveal runId, error code, current step, and step timings.
 *
 * We intentionally do NOT assert on every label / badge / icon in every
 * branch — the component is long and those low-value assertions pin
 * markup rather than behaviour. Each test grabs the smallest
 * representative piece of copy or role that proves the branch fired.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import type { ReactNode } from "react";
import type {
  CampaignRunInputs,
  CampaignRunOutputs,
  RunStatusSerialized,
} from "@structura/types";

const apiFetchMock = vi.fn();
vi.mock("@wordpress/api-fetch", () => ({
  default: (...args: unknown[]) => apiFetchMock(...args),
}));
// sprintf matches ProgressDrawer.test.tsx — handles %s, %d, and
// positional %1$s / %2$d placeholders used in the detail view.
vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

// RunDetailPage uses useCampaignRunQuery, which now gates on
// `useLicense().hasUsableLicense`. Stub to "bound" so the per-run poll
// fires and the render-branch assertions still trip.
vi.mock("@/features/settings/api/useLicense", () => ({
  useLicense: () => ({ hasUsableLicense: true, hasWorkspace: true }),
}));

import { RunDetailPage } from "../routes/RunDetailPage";

/**
 * Canonical succeeded-run fixture. Individual tests spread this and
 * override only the fields relevant to their branch — same pattern as
 * the drawer tests for consistency.
 */
const SAMPLE_INPUTS: CampaignRunInputs = {
  keywords: ["headless wordpress", "nextjs"],
  // v2 — store only the Firestore nanoid; the UI resolves the
  // display name through `usePersonasQuery`. Fixture id matches the
  // mocked persona returned below so the runtime lookup finds it.
  persona: { personaId: "voice-of-brand-nanoid" },
  providers: {
    text: { id: "openai", model: "gpt-4o" },
    image: { id: "gemini", model: "imagen-3.0-fast" },
  },
  rhythm: "0 9 * * 1",
};

const BASE_SUCCESS_RUN: RunStatusSerialized = {
  schemaVersion: 1,
  runId: "run-xyz",
  campaignId: 42,
  campaignName: "Weekly Digest",
  status: "succeeded",
  currentStep: "done",
  progressPercent: 100,
  headline: "Post published",
  startedAt: "2026-04-22T12:00:00.000Z",
  updatedAt: "2026-04-22T12:03:42.000Z",
  endedAt: "2026-04-22T12:03:42.000Z",
  durationMs: 222_000, // 3m 42s
  resultPostId: 101,
  resultPostUrl: "https://example.com/?p=101",
  stepDurationsMs: { research: 20_000, drafting: 150_000 },
  inputs: SAMPLE_INPUTS,
};

/**
 * Mount the page under a MemoryRouter seeded at the runs route so
 * `useParams().runId` resolves the way the production HashRouter does.
 */
function renderRunDetail(runId: string = "run-xyz"): void {
  // retry:false: an error mock resolves in one tick instead of React
  // Query's default exponential back-off. Same pattern as the drawer
  // and channels-page tests.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/runs/${runId}`]}>
        <Routes>
          <Route path="/runs/:runId" element={<RunDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Default fixture for `/structura/v1/personas` — every test in this
 * file mounts `RunDetailPage`, which fires `usePersonasQuery` to
 * resolve the persona name from `inputs.persona.personaId`. We answer
 * that call from the default mock so individual tests only have to
 * stub the run-doc fetch they actually care about.
 */
const PERSONAS_FIXTURE = [
  {
    id: "voice-of-brand-nanoid",
    name: "Voice of the Brand",
    system_prompt: "Speak with brand authority.",
    tone: "professional",
    reading_level: "grade_12",
    author_id: 1,
  },
];

beforeEach(() => {
  apiFetchMock.mockReset();
  // Path-aware default — `/personas` always returns the fixture; any
  // other path falls through to per-test `mockResolvedValueOnce`
  // stacks via the standard mock semantics. Without this default,
  // the persona-name lookup would race the run-doc fetch over the
  // same once-value queue.
  apiFetchMock.mockImplementation((opts: { path?: string } | undefined) => {
    const path = typeof opts?.path === "string" ? opts.path : "";
    if (path.startsWith("/structura/v1/personas")) {
      return Promise.resolve(PERSONAS_FIXTURE);
    }
    // Returning an unresolved promise here would deadlock tests that
    // rely on a thrown / rejected response; instead resolve to
    // undefined so the run-detail path falls through naturally.
    return Promise.resolve(undefined);
  });
});

describe("RunDetailPage", () => {
  it("renders the loader while the first poll is in flight", async () => {
    // Promise never resolves — we want to snapshot the pre-data state.
    apiFetchMock.mockImplementation(() => new Promise(() => {}));
    renderRunDetail();

    // PageLoader emits `role="status"` with a visible "Loading run…"
    // caption — that pair is the a11y contract the tests pin. We avoid
    // matching on Spinner SVG internals (brittle) and instead lean on
    // the status role + the caller-supplied label. If a future refactor
    // swaps PageLoader for a different primitive, the replacement still
    // has to announce "we're loading one run" to screen readers.
    const loader = await screen.findByRole("status");
    expect(loader).toHaveAttribute("aria-busy", "true");
    expect(loader).toHaveTextContent(/Loading run/i);

    // Belt-and-braces: while the loader is on screen, neither the
    // NotFound state nor the Loaded receipt has leaked through.
    expect(screen.queryByText("Run not found")).not.toBeInTheDocument();
    expect(screen.queryByText(/Weekly Digest/i)).not.toBeInTheDocument();
  });

  it("renders the NotFound state when the plugin bridge returns an error (doc TTL'd or kill-switched)", async () => {
    apiFetchMock.mockRejectedValueOnce(new Error("Not Found"));
    renderRunDetail();

    expect(await screen.findByText("Run not found")).toBeInTheDocument();
    // The 30-day TTL number is spec §2.7 — the copy is the user-
    // visible artifact of that policy decision.
    expect(
      screen.getByText(/kept for 30 days after they finish/i),
    ).toBeInTheDocument();

    const back = screen.getByRole("link", { name: /Back to Overview/i });
    // Hash routing — same rationale as the drawer tests.
    expect(back).toHaveAttribute("href", "#/");
  });

  it("renders the succeeded receipt with campaign name, duration, and 'View Published Post' button", async () => {
    apiFetchMock.mockResolvedValueOnce({ success: true, run: BASE_SUCCESS_RUN });
    renderRunDetail();

    // PageTitle is the campaign name, per spec §5.2. Using findByRole
    // for the h1 proves both the Loaded branch rendered AND the title
    // element has the right semantics.
    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Weekly Digest",
    });
    expect(heading).toBeInTheDocument();

    // Duration rendered via sprintf("Finished in %s", formatDuration) —
    // 2026-04-22 redesign moved the meta row out of PageTitle's subtext
    // and onto a Clock/Timer meta strip beneath the h1.
    expect(screen.getByText(/Finished in 3m 42s/)).toBeInTheDocument();

    // View Published Post is the hero CTA on success; it targets the
    // WP post URL and not the hash route. Absence of this link on the
    // header when the run has no resultPostUrl is covered in a
    // separate outputs-section test below.
    const viewPost = screen.getByRole("link", {
      name: /View Published Post/i,
    });
    expect(viewPost).toHaveAttribute("href", "https://example.com/?p=101");

    // Phase 1.6 — sync runs leave servedFromStock absent, so the
    // "Pre-generated" badge MUST NOT appear here. Use an exact match
    // (not the loose /Pre-generated/i) because the timeline's
    // "Pulling pre-generated draft" milestone copy now appears on
    // every run as of the stock_check sync addition, and that
    // substring would otherwise false-positive this assertion.
    expect(screen.queryByText("Pre-generated")).not.toBeInTheDocument();
  });

  it("renders the 'Pre-generated' badge when servedFromStock is set (Phase 1.6)", async () => {
    // Stock-served runs publish in <1s and the badge in the meta row
    // explains why — without it, fast publishes feel like a bug
    // ("did the AI even run?"). Sync runs leave the field absent
    // (covered in the previous test).
    apiFetchMock.mockResolvedValueOnce({
      success: true,
      run: {
        ...BASE_SUCCESS_RUN,
        servedFromStock: {
          stockId: "stock_abc_123",
          textFromStock: true,
          imagesFromStock: false,
        },
      },
    });
    renderRunDetail();

    // Badge text is the visible signal; we don't pin the role / shape
    // so a refactor that swaps the badge primitive doesn't trip.
    // Exact match (not regex) — the timeline's "Pulling pre-generated
    // draft" milestone copy is a substring match and would resolve to
    // multiple elements with a loose regex.
    expect(await screen.findByText("Pre-generated")).toBeInTheDocument();
  });

  it("renders the inputs card with keywords, persona, and provider rows when inputs are present", async () => {
    apiFetchMock.mockResolvedValueOnce({ success: true, run: BASE_SUCCESS_RUN });
    renderRunDetail();

    await screen.findByRole("heading", { level: 1 });

    // Section header — pins the card actually mounted. Renamed from
    // "What this run used" → "Run Configuration" in the 2026-04-22
    // redesign so the receipt reads as a professional job spec rather
    // than conversational copy.
    expect(screen.getByText("Run Configuration")).toBeInTheDocument();

    // Keywords render as Badges — assert the text is on screen without
    // pinning the surrounding markup.
    expect(screen.getByText("headless wordpress")).toBeInTheDocument();
    expect(screen.getByText("nextjs")).toBeInTheDocument();

    // Persona name, not id — the page is for a non-technical audience.
    // `findByText` because the persona-name resolution awaits a
    // separate `usePersonasQuery` fetch that resolves on the tick
    // after the run-doc render.
    expect(
      await screen.findByText("Voice of the Brand"),
    ).toBeInTheDocument();

    // Provider label maps openai → "OpenAI" and renders the model id
    // inside parens. We match on a loose substring so a future
    // whitespace / formatting tweak doesn't break the test.
    expect(screen.getByText(/OpenAI/)).toBeInTheDocument();
    expect(screen.getByText(/\(gpt-4o\)/)).toBeInTheDocument();
    expect(screen.getByText(/Gemini/)).toBeInTheDocument();
    expect(screen.getByText(/\(imagen-3.0-fast\)/)).toBeInTheDocument();
  });

  it("renders the inputs card empty-state for a pre-rollout run (no inputs snapshot)", async () => {
    const legacyRun: RunStatusSerialized = {
      ...BASE_SUCCESS_RUN,
      inputs: undefined,
    };
    apiFetchMock.mockResolvedValueOnce({ success: true, run: legacyRun });
    renderRunDetail();

    // Pre-rollout runs (TTL hasn't cycled once yet post-launch) need a
    // graceful empty state, not a silent nothing. Spec §5.4 implicit:
    // a section that's mounted but blank confuses.
    expect(
      await screen.findByText(/This run predates the inputs snapshot/i),
    ).toBeInTheDocument();
  });

  it("renders the warnings banner and failed channels when status is succeeded_with_warnings", async () => {
    const warningsRun: RunStatusSerialized = {
      ...BASE_SUCCESS_RUN,
      status: "succeeded_with_warnings",
      outputs: {
        channelsSummary: {
          // Wire shape is the lightweight `string[]` summary (spec §3).
          // Structured error copy lives on the `channel_event` doc, not
          // on the run — the run doc just needs ids for the receipt's
          // at-a-glance fan-out list.
          succeeded: ["slack"],
          failed: ["linkedin"],
          skipped: [],
        },
      } satisfies CampaignRunOutputs,
    };
    apiFetchMock.mockResolvedValueOnce({ success: true, run: warningsRun });
    renderRunDetail();

    // Status badge copy — the three terminal success variants each
    // ship their own badge; pinning the label proves we branched
    // right. The redesign shortened "Published with warnings" →
    // "Warnings" so the pill stays compact next to the hero title.
    expect(await screen.findByText("Warnings")).toBeInTheDocument();

    // The warnings note lives inside the outputs card on the
    // succeeded_with_warnings variant only. Spec §5.5.
    expect(
      screen.getByText(
        /post was published, but one or more distribution channels had a problem/i,
      ),
    ).toBeInTheDocument();

    // Channel list: "slack" got the success treatment, "linkedin"
    // rendered with the failure dot treatment. The ids appear on
    // the page; in the 2026-04-22 redesign the "failed" label was
    // replaced by a red pulsing dot next to the id (see
    // ChannelChip). The warnings banner above is where the
    // "one or more channels had a problem" copy lives now.
    expect(screen.getByText("slack")).toBeInTheDocument();
    expect(screen.getByText("linkedin")).toBeInTheDocument();
  });

  it("renders image-failure rows when outputs.imageFailures is populated", async () => {
    // Spec §1.0h Phase 2 — a partial cloud-side image-gen result
    // (one slot succeeded, the other didn't) lands the run in
    // succeeded_with_warnings AND populates `outputs.imageFailures[]`.
    // The receipt has to surface the missing slot + the raw provider
    // reason ("permission denied", "rate limited", etc.) so users
    // know why their post is missing a hero image.
    //
    // Prior to 2026-04-27 the warnings banner only mentioned
    // "distribution channels had a problem" and the receipt rendered
    // no body — surfaced as Yurii's "details below but nothing's
    // there" report on the first DDEV run with a missing IAM role.
    const imageFailureRun: RunStatusSerialized = {
      ...BASE_SUCCESS_RUN,
      status: "succeeded_with_warnings",
      outputs: {
        imageFailures: [
          {
            slot: "featured",
            reason: "Permission 'iam.serviceAccounts.signBlob' denied on resource (or it may not exist).",
          },
        ],
      } satisfies CampaignRunOutputs,
    };
    apiFetchMock.mockResolvedValueOnce({ success: true, run: imageFailureRun });
    renderRunDetail();

    // Headline branches on which kind of failure landed — when only
    // imageFailures are present, the copy points at images, not at
    // distribution channels.
    expect(
      await screen.findByText(/post was published, but one or more images couldn't be generated/i),
    ).toBeInTheDocument();

    // The slot label + provider error string both render so support
    // engineers can pivot from a screenshot to a fix.
    expect(screen.getByText("Featured image")).toBeInTheDocument();
    expect(
      screen.getByText(/iam\.serviceAccounts\.signBlob/i),
    ).toBeInTheDocument();
  });

  it("renders the failing step's user message inline on the timeline when status is failed", async () => {
    const failedRun: RunStatusSerialized = {
      ...BASE_SUCCESS_RUN,
      status: "failed",
      currentStep: "drafting",
      progressPercent: 55,
      durationMs: 60_000,
      error: {
        code: "synthesis_failed",
        userMessage: "The text provider returned an error. Try again.",
        logRunId: "run-xyz",
      },
      outputs: undefined,
      resultPostUrl: undefined,
      resultPostId: undefined,
    };
    apiFetchMock.mockResolvedValueOnce({ success: true, run: failedRun });
    renderRunDetail();

    // Status pill flips to Stopped — the failure treatment in the
    // header mirrors the drawer's AlertCircle-red. Spec §5.2.
    expect(await screen.findByText("Stopped")).toBeInTheDocument();

    // The user-facing failure message renders in TWO places (Yurii
    // feedback 2026-05-01 — surface the real reason in the Production
    // Results card, not just under the timeline row):
    //   1. Inline red-tinted under the failing timeline row (existing
    //      RunTimeline behavior, spec §5.3).
    //   2. Headline of the FailureOutputs card on the Production
    //      Results section, replacing the old "stopped at <step>"
    //      placeholder copy.
    // Both copies are the same string; assert two matches rather
    // than dropping one — losing either would be a regression.
    expect(
      screen.getAllByText("The text provider returned an error. Try again."),
    ).toHaveLength(2);

    // The "Stopped at <step>" hint is now a secondary breadcrumb
    // under the userMessage (rather than the only copy on the
    // failure card). Still rendered so support can pin down the
    // failure point at a glance.
    expect(
      screen.getByText(/Stopped at Writing the draft\.?/i),
    ).toBeInTheDocument();
  });

  it("keeps Technical Inspector collapsed by default and reveals runId + step timings when toggled", async () => {
    apiFetchMock.mockResolvedValueOnce({ success: true, run: BASE_SUCCESS_RUN });
    renderRunDetail();

    // Button renamed "Technical details" → "Technical Inspector" in
    // the 2026-04-22 redesign. The accessible name combines the
    // bold label with the truncated ID subtext, so an
    // accessibleName-based lookup would need to match both. Match on
    // the visible "Technical Inspector" copy instead — it's the
    // unique substring that identifies the toggle.
    const toggle = await screen.findByRole("button", {
      name: /Technical Inspector/i,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Collapsed: the full run id ("run-xyz") lives inside the body,
    // which isn't rendered yet. A *truncated* id ("run-xyz" is under
    // the 12-char threshold so the truncation is a no-op, meaning
    // it'd show up in the collapsed header's subtext too) — so for
    // this test we assert the expanded-only text "Correlation Trace"
    // instead, which is the body-only label.
    expect(screen.queryByText("Correlation Trace")).not.toBeInTheDocument();

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-expanded", "true");
    });
    // Expanded: the body now shows both the grouped labels AND the
    // full runId inside a monospaced box. The runId is the
    // correlation id the support conversation pastes into Cloud
    // Logging — it MUST be copy-pasteable from this view. Spec §5.6.
    expect(screen.getByText("Correlation Trace")).toBeInTheDocument();
    expect(screen.getByText("System Error Reference")).toBeInTheDocument();

    // Step Timings table renders one row per milestone with a
    // recorded duration; the labels are the raw milestone ids
    // (monospace). Header capitalization changed to "Step Timings"
    // (title case) in the redesign to match the new micro-label
    // treatment — we assert the new copy.
    expect(screen.getByText("Step Timings")).toBeInTheDocument();
    expect(screen.getByText("drafting")).toBeInTheDocument();
    expect(screen.getByText("research")).toBeInTheDocument();
  });

  it("renders the Succeeded status badge on a healthy success run", async () => {
    apiFetchMock.mockResolvedValueOnce({ success: true, run: BASE_SUCCESS_RUN });
    renderRunDetail();

    // The status pill is the at-a-glance variant indicator in the
    // redesigned header. `succeeded` → "Succeeded" (as opposed to
    // `succeeded_with_warnings` → "Warnings" / `failed` →
    // "Stopped"). Pinning the copy here guards against the variants
    // table getting accidentally reordered or relabeled.
    expect(await screen.findByText("Succeeded")).toBeInTheDocument();
  });

  it("renders the channels grid section label on a succeeded_with_warnings run", async () => {
    const warningsRun: RunStatusSerialized = {
      ...BASE_SUCCESS_RUN,
      status: "succeeded_with_warnings",
      outputs: {
        channelsSummary: {
          succeeded: ["slack"],
          failed: ["linkedin"],
          skipped: [],
        },
      } satisfies CampaignRunOutputs,
    };
    apiFetchMock.mockResolvedValueOnce({ success: true, run: warningsRun });
    renderRunDetail();

    await screen.findByRole("heading", { level: 1 });
    // New "Distribution Channels" micro-label is the redesign's
    // header for the channels grid — separate from the
    // channelsSummary badges themselves (which show as rows above
    // in the prior `succeeded_with_warnings` test).
    expect(screen.getByText("Distribution Channels")).toBeInTheDocument();
  });
});
