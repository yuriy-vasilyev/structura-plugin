/**
 * Guided interview — coming back to the step.
 *
 * Regression net for 2026-09-22 (reported against the portal, same code
 * shape here): the Interview step unmounts whenever the wizard shows
 * another step, so stepping back onto it re-ran the site analysis AND
 * dropped the user on a blank question 1 with every answer gone.
 *
 * Drives the REAL interview with the REAL topic-chip query and the REAL
 * query cache, mocking only the `apiFetch` transport — a test that stubbed
 * the hook would pass with the caching removed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@structura/ui";

const h = vi.hoisted(() => ({
  /** Every `topic_chips` suggest POST, in order. */
  topicCalls: [] as Array<Record<string, unknown>>,
  provider: "gemini" as string,
}));

vi.mock("@wordpress/api-fetch", () => ({
  default: async ({ path, data }: { path: string; data?: Record<string, unknown> }) => {
    if (path === "/structura/v1/suggest" && data?.mode === "topic_chips") {
      h.topicCalls.push(data);
      return { topics: [{ label: "Pharmacy Handover", value: "pharmacy_handover" }] };
    }
    return {};
  },
}));

vi.mock("@/features/settings", () => ({
  useLicense: () => ({ isPaidLicense: true, hasWorkspace: true, plan: "cloud_pro" }),
  // Single provider → the pill hides, keeping this test on the interview.
  useDefaultProviders: () => ({
    hasExplicitDefaults: true,
    hasMultipleProviders: false,
    availableProviders: [],
    isProviderIncomplete: () => false,
    isCloud: true,
  }),
}));

vi.mock("@/features/campaigns/context/CampaignContext", () => ({
  useCampaignForm: () => ({
    formData: { intelligence: { textProvider: h.provider } },
    updateForm: vi.fn(),
  }),
}));

import {
  GuidedInterview,
  type InterviewSession,
} from "../components/interview/GuidedInterview";

const GOAL_QUESTION = "What's the primary goal of this campaign?";
const AUDIENCE_QUESTION = "Who's your target audience?";
const GOAL_ANSWER = "Drive organic traffic";

/**
 * The wizard page in miniature: it owns the interview session and mounts
 * the step conditionally, so leaving the step really unmounts it.
 */
function Wizard() {
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [onStep, setOnStep] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOnStep(false)}>
        leave step
      </button>
      <button type="button" onClick={() => setOnStep(true)}>
        return to step
      </button>
      {onStep ? (
        <GuidedInterview
          onComplete={vi.fn()}
          session={session}
          onSessionChange={setSession}
        />
      ) : (
        <p>strategy step</p>
      )}
    </>
  );
}

function renderWizard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Wizard />
      </ToastProvider>
    </QueryClientProvider>
  );
  return {
    leaveStep: () => fireEvent.click(screen.getByRole("button", { name: "leave step" })),
    returnToStep: () =>
      fireEvent.click(screen.getByRole("button", { name: "return to step" })),
  };
}

beforeEach(() => {
  h.topicCalls.length = 0;
  h.provider = "gemini";
});

describe("GuidedInterview — coming back to the step", () => {
  it("does not re-analyze the site when the user steps back onto it", async () => {
    const wizard = renderWizard();
    await waitFor(() => expect(h.topicCalls).toHaveLength(1));

    wizard.leaveStep();
    await screen.findByText("strategy step");
    wizard.returnToStep();
    await screen.findByText(GOAL_QUESTION);

    // Seeds come back from the cache; the site is not read again.
    await waitFor(() => expect(h.topicCalls).toHaveLength(1));
  });

  it("keeps the answers the user already gave", async () => {
    const wizard = renderWizard();
    await screen.findByText(GOAL_QUESTION);

    // Single-select auto-advances, so this lands on question 2.
    fireEvent.click(screen.getByRole("button", { name: new RegExp(GOAL_ANSWER) }));
    await screen.findByText(AUDIENCE_QUESTION);

    wizard.leaveStep();
    await screen.findByText("strategy step");
    wizard.returnToStep();

    // Back where they left off — the live question is still the audience
    // one, and the goal answer is there in the answered-so-far list.
    expect(await screen.findByRole("heading", { level: 3 })).toHaveTextContent(
      AUDIENCE_QUESTION
    );
    expect(screen.getByText(GOAL_ANSWER)).toBeInTheDocument();
  });

  it("does fetch fresh seeds when the campaign's provider changed", async () => {
    const wizard = renderWizard();
    await waitFor(() => expect(h.topicCalls).toHaveLength(1));

    wizard.leaveStep();
    h.provider = "anthropic";
    wizard.returnToStep();

    // A different model gets asked for its own seeds.
    await waitFor(() => expect(h.topicCalls).toHaveLength(2));
    expect(h.topicCalls[1]).toMatchObject({ provider: "anthropic" });
  });
});
