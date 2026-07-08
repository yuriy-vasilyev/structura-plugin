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
const competitorsSuggestMock = vi.hoisted(() => vi.fn());
const licenseMock = vi.hoisted(() => ({
  current: { plan: "cloud", isPaidLicense: true },
}));
const analysisMock = vi.hoisted(() => ({
  current: { data: undefined as Record<string, unknown> | undefined },
}));

vi.mock("@/features/settings", () => ({
  useLicense: () => licenseMock.current,
}));
vi.mock("@/features/site/api/useSiteAnalysis", () => ({
  useSiteAnalysisQuery: () => analysisMock.current,
}));
vi.mock("../api/useWizardSeo", () => ({
  useSuggestWizardPositioningMutation: () => ({
    mutateAsync: positioningSuggestMock,
    isPending: false,
  }),
  useSuggestWizardCompetitorsMutation: () => ({
    mutateAsync: competitorsSuggestMock,
    isPending: false,
  }),
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
  competitorsSuggestMock.mockReset();
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
    competitorsSuggestMock.mockResolvedValue({
      suggestions: [{ domain: "koala.ai", rationale: "Same audience." }],
    });

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
    competitorsSuggestMock.mockResolvedValue({ suggestions: [] });

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
    // The one-shot competitor watcher still fans out off the warmed positioning.
    await waitFor(() => expect(competitorsSuggestMock).toHaveBeenCalled());
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
