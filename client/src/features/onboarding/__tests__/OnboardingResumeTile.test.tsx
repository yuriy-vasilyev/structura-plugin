/**
 * OnboardingResumeTile — a wizard-state answer without a `state` object
 * (the cloud's `{"success":false,"error":"Unauthorized."}` passed through
 * by a plugin whose activation no longer exists, 2026-10-19) must render
 * nothing instead of taking the dashboard down.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/features/settings", () => ({
  useLicense: () => ({ plan: "cloud", hasWorkspace: true }),
}));
const wizardDataMock = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("../api/useOnboardingState", () => ({
  useWizardStateQuery: () => ({ data: wizardDataMock.current }),
}));

import { OnboardingResumeTile } from "../components/OnboardingResumeTile";

beforeEach(() => {
  wizardDataMock.current = undefined;
  window.sessionStorage.clear();
});

describe("<OnboardingResumeTile>", () => {
  it("renders nothing for an answer without a state object", () => {
    wizardDataMock.current = { success: false, error: "Unauthorized." };
    const { container } = render(<OnboardingResumeTile />);
    expect(container).toBeEmptyDOMElement();
  });

  it("nudges to finish an incomplete wizard", () => {
    wizardDataMock.current = {
      state: {
        currentStep: 2,
        completedSteps: [1],
        skippedSteps: [],
        completedAt: null,
        completedAtPlanId: null,
      },
      justCreated: false,
    };
    render(<OnboardingResumeTile />);
    expect(screen.getByRole("button", { name: /resume|continue|finish/i })).toBeInTheDocument();
  });
});
