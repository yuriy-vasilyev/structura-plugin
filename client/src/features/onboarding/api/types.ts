/**
 * Client-side mirrors of the cloud onboarding wire types.
 *
 * Kept in sync with `functions/src/onboarding/types.ts` by hand — when
 * the server adds a field, mirror it here.
 */

export type WizardStepId = 1 | 2 | 3 | 4 | 5 | 6;

export interface WizardState {
  currentStep: WizardStepId;
  completedSteps: WizardStepId[];
  skippedSteps: WizardStepId[];
  startedAt: string;
  completedAt: string | null;
  completedAtPlanId: string | null;
  initiatedFromSurface: string;
  lastUpdatedFromSurface: string;
}

export interface GetWizardStateResponse {
  state: WizardState;
  justCreated: boolean;
  /**
   * Whether THIS SITE still needs its own positioning. Positioning is
   * activation-scoped (2026-06-02) while wizard progress is workspace-level,
   * so a 2nd site under a completed-wizard workspace has none of its own.
   * When `true` the wizard re-surfaces step 3 for this site even though
   * `completedSteps` includes 3. Absent on older servers → treat as `false`.
   * Mirrors `GetWizardStateResponse.activationNeedsPositioning` in
   * `functions/src/onboarding/types.ts`.
   */
  activationNeedsPositioning?: boolean;
}

export interface WizardStepResponse {
  state: WizardState;
}

/** Mirrors `ConnectionTestErrorCode` in `functions/src/onboarding/test-connection.ts`. */
export type ConnectionTestErrorCode =
  | "auth"
  | "rate_limit"
  | "model_unavailable"
  | "network"
  | "timeout"
  | "other";

export interface AiConnectionTestRequest {
  provider: "openai" | "gemini" | "anthropic";
  model: string;
}

export interface AiConnectionTestResponse {
  ok: boolean;
  latencyMs: number;
  errorCode?: ConnectionTestErrorCode;
  errorMessage?: string;
  /**
   * Where the API key came from. Managed tiers test against
   * Structura's master key; BYOK tiers test against the workspace's
   * saved credential. The SPA uses this to phrase the failure
   * messaging ("Add an API key" vs. "Notify support").
   */
  keySource: "managed" | "byok";
}

export interface NotifyWizardSupportRequest {
  provider: string;
  model: string;
  errorCode: string;
  errorMessage: string;
}
