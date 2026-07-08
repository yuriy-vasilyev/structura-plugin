/**
 * React Query hooks for the onboarding wizard.
 *
 * Plan: `/Users/yuriyvasilyev/.claude/plans/valiant-juggling-kazoo.md`.
 *
 * Three hooks:
 *   - `useWizardStateQuery()`  — read (creates lazily on first call).
 *   - `useSaveWizardStepMutation()` — mark step complete + advance.
 *   - `useSkipWizardStepMutation()` — mark step skipped + advance.
 *
 * The wizard's UI draft state (in-flight edits the user is making
 * before saving) lives in the Zustand store next door — React Query
 * only owns the SERVER state (the progress doc).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiFetch from "@wordpress/api-fetch";

import type {
  AiConnectionTestRequest,
  AiConnectionTestResponse,
  GetWizardStateResponse,
  NotifyWizardSupportRequest,
  WizardStepId,
  WizardStepResponse,
} from "./types";

const WIZARD_QUERY_KEY = ["onboarding", "wizard", "state"] as const;

/**
 * Reads the wizard state. Lazily-creates the document server-side on
 * first call — repeated calls are idempotent. `staleTime: 30s`
 * because the wizard isn't a hot-path screen and we don't want every
 * step transition to refetch.
 */
export function useWizardStateQuery(opts: { enabled?: boolean } = {}) {
  return useQuery<GetWizardStateResponse>({
    queryKey: WIZARD_QUERY_KEY,
    enabled: opts.enabled ?? true,
    // The wizard state is a background nudge (auto-redirect + resume
    // tile), not user-requested data — a failure must never produce
    // the global "Data Fetch Error" toast. This was THE toast every
    // fresh keyless install saw on first load: the query fired
    // without an activation bearer and the proxy rejected it.
    meta: { silentError: true },
    staleTime: 30 * 1000,
    queryFn: async () => {
      return apiFetch<GetWizardStateResponse>({
        path: "/structura/v1/wizard/state",
        method: "POST",
        data: {},
      });
    },
  });
}

/**
 * Marks a step as completed and advances the wizard cursor. The
 * response IS the new state — we set the React Query cache directly
 * instead of invalidating to avoid a follow-up refetch.
 */
export function useSaveWizardStepMutation() {
  const queryClient = useQueryClient();
  return useMutation<WizardStepResponse, Error, WizardStepId>({
    mutationFn: async (step) => {
      return apiFetch<WizardStepResponse>({
        path: "/structura/v1/wizard/step",
        method: "POST",
        data: { step },
      });
    },
    onSuccess: (result) => {
      queryClient.setQueryData<GetWizardStateResponse>(
        WIZARD_QUERY_KEY,
        (prev) => ({
          state: result.state,
          // Once the wizard has been mutated by the user, the
          // `justCreated` flag from the initial GET is stale; clear
          // it so the SPA doesn't keep showing fresh-start animations.
          justCreated: prev?.justCreated ?? false,
        }),
      );
    },
  });
}

/**
 * Run a real AI connection test against the chosen provider + model.
 * Used by W-B step 2 — wizard cannot advance past step 2 until this
 * returns `ok: true`.
 *
 * Not cached as a query (it's a discrete action, not a derivable
 * state) — repeated calls re-run the test.
 */
export function useTestAiConnectionMutation() {
  return useMutation<AiConnectionTestResponse, Error, AiConnectionTestRequest>({
    mutationFn: async (input) => {
      return apiFetch<AiConnectionTestResponse>({
        path: "/structura/v1/wizard/test-ai",
        method: "POST",
        data: input,
      });
    },
  });
}

/**
 * Alert the ops team about a managed-tier AI connection failure.
 * The cloud auto-attaches workspace + license + plan context — the
 * client just forwards what it saw (provider/model/error).
 */
export function useNotifyWizardSupportMutation() {
  return useMutation<
    { success: boolean },
    Error,
    NotifyWizardSupportRequest
  >({
    mutationFn: async (input) => {
      return apiFetch<{ success: boolean }>({
        path: "/structura/v1/wizard/notify-support",
        method: "POST",
        data: input,
      });
    },
  });
}

/**
 * Reset wizard progress so the user can run through it again. The
 * underlying saved data (positioning, target keywords, persona, AI
 * settings, visual preset) all persists — only `currentStep`,
 * `completedSteps`, `skippedSteps`, and `completedAt` get wiped.
 *
 * Surfaces: step 6 "Restart" button, `?restart=1` URL param.
 */
export function useResetWizardMutation() {
  const queryClient = useQueryClient();
  return useMutation<{ state: GetWizardStateResponse["state"] }, Error, void>({
    mutationFn: async () => {
      return apiFetch<{ state: GetWizardStateResponse["state"] }>({
        path: "/structura/v1/wizard/reset",
        method: "POST",
        data: {},
      });
    },
    onSuccess: (result) => {
      queryClient.setQueryData<GetWizardStateResponse>(
        WIZARD_QUERY_KEY,
        { state: result.state, justCreated: false },
      );
    },
  });
}

/** Same shape as save, marks a step skipped instead. */
export function useSkipWizardStepMutation() {
  const queryClient = useQueryClient();
  return useMutation<WizardStepResponse, Error, WizardStepId>({
    mutationFn: async (step) => {
      return apiFetch<WizardStepResponse>({
        path: "/structura/v1/wizard/skip",
        method: "POST",
        data: { step },
      });
    },
    onSuccess: (result) => {
      queryClient.setQueryData<GetWizardStateResponse>(
        WIZARD_QUERY_KEY,
        (prev) => ({
          state: result.state,
          justCreated: prev?.justCreated ?? false,
        }),
      );
    },
  });
}
