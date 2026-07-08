/**
 * OnboardingPage — managed-plan (cloud / cloud_pro) AI-engine skip.
 *
 * Pins the 2026-06-06 fix: cloud plans run on Structura's master keys,
 * so the wizard must NOT ask them to connect an AI provider. The
 * AI-engine step (2) is removed from the flow for them:
 *   1. The step pill disappears from the strip and the remaining steps
 *      renumber contiguously (SEO intelligence shows as "2", not "3").
 *   2. `stepValidity[2]` is auto-set so steps 3–6 unlock without the
 *      step component ever mounting.
 *   3. Continue from step 1 hops straight to step 3; Back from 3
 *      returns to 1.
 *   4. A persisted/stale `activeStep === 2` bounces forward to 3.
 * BYOK keeps the step (regression guard).
 *
 * Also pins the license gate (2026-06-06): installs with no key bound
 * see a connect-your-account screen before step 1 — key input wired to
 * the activate mutation, portal signup link, and (only when an
 * anonymous workspace exists) a "continue without an account" path.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (text: string) => text,
}));
vi.mock("@wordpress/api-fetch", () => ({ default: vi.fn() }));

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router", () => ({
  useNavigate: () => navigateMock,
  Link: ({ children, ...props }: { children?: unknown } & Record<string, unknown>) => (
    <a {...(props as Record<string, never>)}>{children as never}</a>
  ),
}));

const activateMock = vi.hoisted(() => vi.fn());
const licenseMock = vi.hoisted(() => ({
  current: {
    isPaidLicense: true,
    plan: "cloud" as string,
    hasUsableLicense: true as boolean | null,
    hasWorkspace: true as boolean | null,
    activate: activateMock,
    processing: false,
  },
}));
vi.mock("@/features/settings", () => ({
  useLicense: () => licenseMock.current,
}));

vi.mock("../api/useOnboardingState", () => ({
  useWizardStateQuery: () => ({
    data: { state: { completedAtPlanId: null } },
    isLoading: false,
  }),
  useResetWizardMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../api/useFinishWizard", () => ({
  useFinishWizard: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

// Step bodies are irrelevant here — the page's routing/gating is under
// test, not the steps themselves. Stub them to cheap markers.
vi.mock("../components/WizardStep1Identity", () => ({
  WizardStep1Identity: () => <div>step-1-body</div>,
}));
vi.mock("../components/WizardStep2AiEngine", () => ({
  WizardStep2AiEngine: () => <div>step-2-body</div>,
}));
vi.mock("../components/WizardStep3SeoIntelligence", () => ({
  WizardStep3SeoIntelligence: () => <div>step-3-body</div>,
}));
vi.mock("../components/WizardStep4Visuals", () => ({
  WizardStep4Visuals: () => <div>step-4-body</div>,
}));
vi.mock("../components/WizardStep5Persona", () => ({
  WizardStep5Persona: () => <div>step-5-body</div>,
}));
vi.mock("../components/WizardStep6Done", () => ({
  WizardStep6Done: () => <div>step-6-body</div>,
}));
vi.mock("../components/LockedStepCard", () => ({
  LockedStepCard: () => <div>locked-step</div>,
}));
vi.mock("../components/DowngradeBanner", () => ({
  DowngradeBanner: () => <div>downgrade-banner</div>,
}));

import { OnboardingPage } from "../routes/OnboardingPage";
import { useWizardStore } from "../state/wizardStore";

beforeEach(() => {
  useWizardStore.getState().reset();
  activateMock.mockReset();
  licenseMock.current = {
    isPaidLicense: true,
    plan: "cloud",
    hasUsableLicense: true,
    hasWorkspace: true,
    activate: activateMock,
    processing: false,
  };
});

describe("OnboardingPage — managed-plan AI-engine skip", () => {
  it("hides the AI engine pill on a cloud plan and renumbers the strip", () => {
    render(<OnboardingPage />);

    expect(screen.queryByText("AI engine")).toBeNull();
    // SEO intelligence renumbers from canonical 3 to displayed 2.
    expect(
      screen.getByLabelText(/Step 2: SEO intelligence/),
    ).toBeInTheDocument();
  });

  it("auto-validates step 2 so it never gates steps 3–6", async () => {
    render(<OnboardingPage />);

    await waitFor(() =>
      expect(useWizardStore.getState().stepValidity[2]).toBe(true),
    );
  });

  it("Continue from step 1 hops to step 3, Back from 3 returns to 1", async () => {
    useWizardStore.getState().setStepValid(1, true);
    render(<OnboardingPage />);

    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await waitFor(() =>
      expect(useWizardStore.getState().activeStep).toBe(3),
    );

    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    await waitFor(() =>
      expect(useWizardStore.getState().activeStep).toBe(1),
    );
  });

  it("bounces a stale activeStep of 2 forward to 3 without mounting the step", async () => {
    // Simulates a persisted localStorage draft from a pre-upgrade
    // (BYOK) session that parked on the AI-engine step.
    useWizardStore.getState().setActiveStep(2);
    render(<OnboardingPage />);

    await waitFor(() =>
      expect(useWizardStore.getState().activeStep).toBe(3),
    );
    expect(screen.queryByText("step-2-body")).toBeNull();
  });

  it("keeps the AI engine step on a BYOK plan", () => {
    licenseMock.current = { ...licenseMock.current, plan: "byok" };
    render(<OnboardingPage />);

    expect(screen.getByText("AI engine")).toBeInTheDocument();
    expect(useWizardStore.getState().stepValidity[2]).toBe(false);
  });
});

describe("OnboardingPage — license gate", () => {
  const keyless = (hasWorkspace: boolean) => {
    licenseMock.current = {
      ...licenseMock.current,
      plan: "none",
      isPaidLicense: false,
      hasUsableLicense: false,
      hasWorkspace,
    };
  };

  it("shows the gate (no step strip, no steps) when no key is bound", () => {
    keyless(false);
    render(<OnboardingPage />);

    expect(screen.getByText("Welcome to Structura")).toBeInTheDocument();
    expect(screen.getByText("License Key")).toBeInTheDocument();
    // The step strip is hidden — the flow hasn't started yet.
    expect(screen.queryByText("Site info")).toBeNull();
    expect(screen.queryByText("step-1-body")).toBeNull();
  });

  it("omits the anonymous escape hatch when there is no workspace bearer", () => {
    keyless(false);
    render(<OnboardingPage />);

    expect(
      screen.queryByText("Continue without an account for now"),
    ).toBeNull();
  });

  it("submits the trimmed key, then bridges the refetch window with a success state", async () => {
    keyless(false);
    activateMock.mockResolvedValue({});
    render(<OnboardingPage />);

    const input = screen.getByPlaceholderText("ST-XXXX-XXXX-XXXX");
    fireEvent.change(input, {
      target: { value: "  ST-TEST-1234-5678  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));

    await waitFor(() =>
      expect(activateMock).toHaveBeenCalledWith("ST-TEST-1234-5678"),
    );
    // The form is REPLACED by an explicit success state until the
    // settings refetch unmounts the gate — an emptied form sitting
    // there for a few seconds read as "nothing happened".
    expect(
      await screen.findByText("License connected!"),
    ).toBeInTheDocument();
    expect(screen.getByText("Starting the wizard…")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("ST-XXXX-XXXX-XXXX")).toBeNull();
  });

  it("keeps the key in the input when activation fails (retry)", async () => {
    keyless(false);
    activateMock.mockRejectedValue(new Error("invalid key"));
    render(<OnboardingPage />);

    const input = screen.getByPlaceholderText("ST-XXXX-XXXX-XXXX");
    fireEvent.change(input, { target: { value: "ST-BAD-KEY" } });
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));

    await waitFor(() => expect(activateMock).toHaveBeenCalled());
    expect((input as HTMLInputElement).value).toBe("ST-BAD-KEY");
  });

  it("lets an anonymous workspace continue without a key into the wizard", async () => {
    keyless(true);
    render(<OnboardingPage />);

    fireEvent.click(
      screen.getByText("Continue without an account for now"),
    );

    await waitFor(() =>
      expect(useWizardStore.getState().licenseGateSkipped).toBe(true),
    );
    // Gate replaced by the real flow (step 1 + strip).
    expect(await screen.findByText("step-1-body")).toBeInTheDocument();
    expect(screen.getByText("Site info")).toBeInTheDocument();
  });

  it("re-engages the gate after a skip if the workspace bearer is gone", () => {
    keyless(false);
    useWizardStore.getState().setLicenseGateSkipped(true);
    render(<OnboardingPage />);

    expect(screen.getByText("Welcome to Structura")).toBeInTheDocument();
  });
});
