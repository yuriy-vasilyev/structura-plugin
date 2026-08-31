/**
 * WizardStep3SeoIntelligence — auto-suggest orchestration for the
 * positioning + competitors step. Keywords and authority moved to the
 * campaign level, so this step only drafts positioning and scouts
 * competitors.
 *
 * Pins:
 *   1. Paid + everything empty → blocking magic loader, then a
 *      pre-filled screen: positioning patched (ai_draft) + AI competitor
 *      fallback fetched (DFS empty).
 *   2. Step 1's pre-warmed positioning → no blocking pass, competitor
 *      fan-out off the warmed positioning.
 *   3. Returning user with existing content → NO auto-run, prior work
 *      untouched.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@structura/ui";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%[sd]/g, () => String(args[i++]));
  },
}));

const positioningSuggestMock = vi.hoisted(() => vi.fn());
// Captures the args of every useWizardAiCompetitorsQuery render so tests
// can assert on the `enabled` gate; `result.current` is what the hook
// "returns" (the cached suggestions).
const aiCompetitorsQueryMock = vi.hoisted(() => {
  const calls: Array<{ enabled: boolean }> = [];
  return {
    calls,
    result: {
      current: {
        data: undefined as
          | { suggestions: Array<{ domain: string; rationale: string }> }
          | undefined,
        isFetching: false,
        refetch: vi.fn(),
      },
    },
  };
});
const licenseMock = vi.hoisted(() => ({
  current: { plan: "cloud", isPaidLicense: true },
}));
const analysisMock = vi.hoisted(() => ({
  current: { data: undefined as Record<string, unknown> | undefined },
}));

vi.mock("@/features/settings", () => ({
  useLicense: () => licenseMock.current,
}));
// The GSC connect card owns its own channel-connection queries (it needs a
// QueryClient this suite doesn't provide) and has a dedicated test file —
// stub it to a marker so this suite stays focused on the SEO step itself
// while still pinning that the step mounts the card.
vi.mock("../components/WizardGscConnectCard", () => ({
  WizardGscConnectCard: () => <div data-testid="gsc-connect-card-stub" />,
}));
vi.mock("@/features/site/api/useSiteAnalysis", () => ({
  useSiteAnalysisQuery: () => analysisMock.current,
}));
vi.mock("../api/useWizardSeo", () => ({
  useSuggestWizardPositioningMutation: () => ({
    mutateAsync: positioningSuggestMock,
    isPending: false,
  }),
  useWizardAiCompetitorsQuery: (input: { enabled: boolean }) => {
    aiCompetitorsQueryMock.calls.push({ enabled: input.enabled });
    // Mirror the real query: no data until the gate opens.
    return input.enabled
      ? aiCompetitorsQueryMock.result.current
      : { data: undefined, isFetching: false, refetch: vi.fn() };
  },
}));

import { WizardStep3SeoIntelligence } from "../components/WizardStep3SeoIntelligence";
import { useWizardStore } from "../state/wizardStore";

function renderStep() {
  return render(
    <ToastProvider>
      <WizardStep3SeoIntelligence />
    </ToastProvider>,
  );
}

beforeEach(() => {
  useWizardStore.getState().reset();
  positioningSuggestMock.mockReset();
  aiCompetitorsQueryMock.calls.length = 0;
  aiCompetitorsQueryMock.result.current = {
    data: undefined,
    isFetching: false,
    refetch: vi.fn(),
  };
  licenseMock.current = { plan: "cloud", isPaidLicense: true };
  analysisMock.current = { data: undefined };
});

describe("WizardStep3SeoIntelligence — auto-suggest orchestration", () => {
  it("blocks with the magic loader, then reveals a pre-filled screen", async () => {
    // Deferred resolve so the blocking state is observable.
    let resolvePositioning!: (v: unknown) => void;
    positioningSuggestMock.mockReturnValue(
      new Promise((res) => {
        resolvePositioning = res;
      }),
    );
    aiCompetitorsQueryMock.result.current = {
      data: {
        suggestions: [{ domain: "koala.ai", rationale: "Same audience." }],
      },
      isFetching: false,
      refetch: vi.fn(),
    };

    renderStep();

    // Blocking loader first — held open by the pending positioning call.
    expect(
      await screen.findByText("Researching your business"),
    ).toBeInTheDocument();
    resolvePositioning({
      suggestion: {
        what: "We automate blogs",
        who: "Site owners",
        problem: "No time to write",
        rationale: "",
      },
    });

    // Reveal: positioning patched as an AI draft…
    await waitFor(() =>
      expect(
        useWizardStore.getState().drafts.step3?.positioning.what,
      ).toBe("We automate blogs"),
    );
    expect(useWizardStore.getState().drafts.step3?.positioningSource).toBe(
      "ai_draft",
    );
    // …and the AI competitor fallback's chip on screen.
    expect(await screen.findByText("koala.ai")).toBeInTheDocument();
  });

  it("consumes step 1's pre-warmed positioning — pre-filled with NO blocking pass", async () => {
    useWizardStore.getState().setPrewarmedPositioning({
      what: "We automate blogs",
      who: "Site owners",
      problem: "No time to write",
    });

    renderStep();

    await waitFor(() =>
      expect(
        useWizardStore.getState().drafts.step3?.positioning.what,
      ).toBe("We automate blogs"),
    );
    expect(useWizardStore.getState().drafts.step3?.positioningSource).toBe(
      "ai_draft",
    );
    // The homepage was already read on step 1 — no second blocking pass,
    // no second positioning call.
    expect(screen.queryByText("Researching your business")).toBeNull();
    expect(positioningSuggestMock).not.toHaveBeenCalled();
    // The cached competitor query still arms itself off the warmed
    // positioning (enabled gate opens without any blocking pass).
    await waitFor(() =>
      expect(
        aiCompetitorsQueryMock.calls.some((c) => c.enabled),
      ).toBe(true),
    );
  });

  it("does NOT auto-run for a returning user with existing content", async () => {
    useWizardStore.getState().setStep3Draft({
      positioning: { what: "We sell shoes", who: "", problem: "" },
      positioningSource: "user",
      competitorUrls: ["https://rival.com"],
    });

    renderStep();

    expect(screen.queryByText("Researching your business")).toBeNull();
    expect(positioningSuggestMock).not.toHaveBeenCalled();
    // Prior work untouched.
    expect(useWizardStore.getState().drafts.step3?.positioning.what).toBe(
      "We sell shoes",
    );
  });
});
