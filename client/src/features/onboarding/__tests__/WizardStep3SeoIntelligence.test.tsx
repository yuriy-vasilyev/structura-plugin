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
 *   4. The manual "AI draft" button (specs/site-reading.md §11, wp-admin
 *      positioning round two, 2026-11-13): it selects the site's pages
 *      again and asks before replacing text with the card's rule. The step
 *      used to seed every saved positioning as the operator's own, so even
 *      an untouched saved AI draft would have asked.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
// The step seeds its draft from server-saved positioning and returns early
// while that query is still `undefined`, so this has to RESOLVE for the
// seeding path to run at all. Default `positioning: null` = a workspace that
// never saved one, which is what these tests exercise; a test wanting the
// returning-user branch overwrites `.current`.
const positioningQueryMock = vi.hoisted(() => ({
  current: {
    data: { positioning: null } as
      | { positioning: Record<string, string> | null }
      | undefined,
  },
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
// A factory mock replaces the WHOLE module, so every export the component
// calls must appear here — a missing one throws "No <name> export is defined
// on the mock" at call time. That is how `useWizardPositioningQuery` broke
// this file: the step started reading saved positioning and this factory was
// not updated alongside it.
vi.mock("../api/useWizardSeo", () => ({
  useWizardPositioningQuery: () => positioningQueryMock.current,
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
  positioningQueryMock.current = { data: { positioning: null } };
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

  // specs/site-reading.md §5a (2026-11-13): wp-admin lists the pages the
  // draft read, as the customer portal does.
  it("lists the pages the auto-draft read, read-only", async () => {
    positioningSuggestMock.mockResolvedValue({
      suggestion: {
        what: "We automate blogs",
        who: "Site owners",
        problem: "No time to write",
        rationale: "",
      },
      pages: [
        { url: "https://blog.test", label: "blog.test", role: "home" },
        { url: "https://blog.test/pricing", label: "Pricing plans", role: "pricing" },
      ],
    });

    renderStep();

    const list = await screen.findByRole("list", { name: "Drafted from these pages" });
    const links = list.querySelectorAll("a");
    expect([...links].map((link) => link.getAttribute("href"))).toEqual([
      "https://blog.test",
      "https://blog.test/pricing",
    ]);
    expect(list).toHaveTextContent("Pricing plans");
    expect(list.querySelectorAll("button, input, textarea")).toHaveLength(0);
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

describe("WizardStep3SeoIntelligence — the manual AI draft", () => {
  const SAVED = {
    what: "We sell shoes",
    who: "Runners",
    problem: "Blisters",
    capturedAt: "2026-11-01T00:00:00.000Z",
  };
  const REDRAFT = {
    suggestion: {
      what: "Trail running shoes",
      who: "Ultra runners",
      problem: "Rocky trails",
      rationale: "",
    },
    pages: [
      { url: "https://shoes.test", label: "shoes.test", role: "home" },
      { url: "https://shoes.test/trail", label: "Trail range", role: "product" },
    ],
  };
  const WHAT = "In one sentence, what does your business do?";
  const field = (label: string) => screen.getByLabelText(label) as HTMLTextAreaElement;
  const draftButton = () => screen.getByRole("button", { name: "AI draft" });
  const confirmTitle = () => screen.queryByText("Replace your edits?");

  it("re-drafts an untouched saved AI draft without asking, and selects the pages again", async () => {
    positioningQueryMock.current = { data: { positioning: { ...SAVED, source: "ai_draft" } } };
    positioningSuggestMock.mockResolvedValue(REDRAFT);
    renderStep();
    await waitFor(() => expect(field(WHAT).value).toBe("We sell shoes"));
    // The saved source carries into the draft Finish writes back.
    expect(useWizardStore.getState().drafts.step3?.positioningSource).toBe("ai_draft");

    fireEvent.click(draftButton());

    expect(confirmTitle()).toBeNull();
    await waitFor(() => expect(field(WHAT).value).toBe("Trail running shoes"));
    expect(positioningSuggestMock).toHaveBeenCalledTimes(1);
    expect(positioningSuggestMock).toHaveBeenCalledWith({ reselectPages: true });
    expect(await screen.findByText("Drafted from your site's pages. Edit anything below.")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Drafted from these pages" })).toHaveTextContent("Trail range");
  });

  it("asks before replacing a positioning the operator wrote; Keep mine keeps it, Replace drafts", async () => {
    positioningQueryMock.current = { data: { positioning: { ...SAVED, source: "user" } } };
    positioningSuggestMock.mockResolvedValue(REDRAFT);
    renderStep();
    await waitFor(() => expect(field(WHAT).value).toBe("We sell shoes"));

    fireEvent.click(draftButton());
    expect(confirmTitle()).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep mine" }));
    expect(positioningSuggestMock).not.toHaveBeenCalled();
    expect(field(WHAT).value).toBe("We sell shoes");

    fireEvent.click(draftButton());
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(field(WHAT).value).toBe("Trail running shoes"));
    expect(positioningSuggestMock).toHaveBeenCalledWith({ reselectPages: true });
  });

  it("asks before replacing a saved AI draft edited since", async () => {
    positioningQueryMock.current = { data: { positioning: { ...SAVED, source: "ai_draft" } } };
    renderStep();
    await waitFor(() => expect(field(WHAT).value).toBe("We sell shoes"));

    fireEvent.change(field(WHAT), { target: { value: "We sell trail shoes" } });
    fireEvent.click(draftButton());

    expect(confirmTitle()).toBeInTheDocument();
    expect(positioningSuggestMock).not.toHaveBeenCalled();
  });

  it("re-drafts the automatic first draft without asking until it is edited by hand", async () => {
    positioningSuggestMock
      .mockResolvedValueOnce({
        suggestion: { what: "We automate blogs", who: "Site owners", problem: "No time to write", rationale: "" },
      })
      .mockResolvedValue(REDRAFT);
    renderStep();
    await waitFor(() => expect(field(WHAT).value).toBe("We automate blogs"));

    fireEvent.click(draftButton());
    expect(confirmTitle()).toBeNull();
    await waitFor(() => expect(field(WHAT).value).toBe("Trail running shoes"));
    expect(positioningSuggestMock).toHaveBeenLastCalledWith({ reselectPages: true });

    fireEvent.change(field(WHAT), { target: { value: "Our own words" } });
    fireEvent.click(draftButton());
    expect(confirmTitle()).toBeInTheDocument();
    expect(positioningSuggestMock).toHaveBeenCalledTimes(2);
  });

  it("drafts right away on an empty step", async () => {
    // Not paid: no automatic first draft, so the fields stay empty.
    licenseMock.current = { plan: "free", isPaidLicense: false };
    positioningSuggestMock.mockResolvedValue(REDRAFT);
    renderStep();
    await waitFor(() => expect(useWizardStore.getState().drafts.step3).toBeDefined());

    fireEvent.click(draftButton());

    expect(confirmTitle()).toBeNull();
    await waitFor(() => expect(field(WHAT).value).toBe("Trail running shoes"));
    expect(positioningSuggestMock).toHaveBeenCalledWith({ reselectPages: true });
  });
});
