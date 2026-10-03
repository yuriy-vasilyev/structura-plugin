"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ToolOutcome } from "./lib/response";
import type { RefusalCode, ToolErrorCode, ToolId, ToolResultMap } from "./lib/types";
import { isValidToolInput } from "./lib/validate";

/** What the visitor asked for; kept so "Try again" re-issues the same request. */
export interface ToolRequestInput {
  /** The URL, domain or seed keyword, trimmed. */
  input: string;
  /** The market, keyword generator only. */
  country?: string;
}

/** A refused run, as the surface's card needs it. */
export interface ToolRefusal {
  reason: RefusalCode;
  /** Epoch ms when this tool may run again, when the answer said (`Retry-After`). */
  retryAt?: number;
}

/** Where a tool form is in its lifecycle. */
export type ToolState<T extends ToolId> =
  | { phase: "idle" }
  | { phase: "loading"; request: ToolRequestInput }
  | { phase: "done"; request: ToolRequestInput; result: ToolResultMap[T]; cached: boolean }
  | {
      phase: "error";
      request: ToolRequestInput;
      error: ToolErrorCode;
      /** Epoch ms before which a retry would only be refused again (429 `Retry-After`, either limit). */
      retryAt?: number;
    };

/**
 * Sends one request the surface's way and resolves to what the UI shows:
 * www posts to its `/api/tools/{tool}` route, the customer portal calls its
 * callable. Must not reject: a transport failure resolves to an
 * `unavailable` outcome. Only the keyword generator passes a `country`.
 */
export type ToolRunner = <T extends ToolId>(tool: T, input: string, country?: string) => Promise<ToolOutcome<T>>;

/**
 * One step of a run, for the surface's analytics: `run` on submit, then
 * `result` or `error`. Never carries the input: a URL or a seed can be
 * private.
 */
export type ToolRunEvent =
  | { type: "run"; tool: ToolId; country?: string }
  | { type: "result"; tool: ToolId; cached: boolean }
  | { type: "error"; tool: ToolId; error: ToolErrorCode; status: number };

/**
 * Run-and-track state for one free tool: hands each request to the
 * surface's `runner`, turns the outcome into a {@link ToolState}, and reports
 * each step to `onEvent` (www sends them to PostHog as the events from
 * specs/blogseo-gap-analysis.md §4.4: `tool_run` on submit, then
 * `tool_result` or `tool_error` with the status).
 *
 * `retry` re-issues the last request with the same input and country
 * (§4.8.1 #8). A request counter drops answers that arrive after the
 * visitor has reset or submitted again, so a slow first check cannot
 * overwrite a newer one. `run` and `retry` change identity with `runner`
 * and `onEvent`, so pass stable ones.
 *
 * `autoRun`, read on mount only, is sent once without a submit when its
 * input passes the form's validation: the customer portal's tool links
 * run on arrival (§4.9.6). A later change to it never sends again.
 */
export function useToolRun<T extends ToolId>(
  tool: T,
  runner: ToolRunner,
  onEvent?: (event: ToolRunEvent) => void,
  autoRun?: ToolRequestInput,
) {
  const [state, setState] = useState<ToolState<T>>({ phase: "idle" });
  const requestId = useRef(0);
  const last = useRef<ToolRequestInput | null>(null);
  // A ref, not a dependency: StrictMode's second effect pass and later
  // renders must find it spent, or a link would spend a second check.
  const pendingAutoRun = useRef(autoRun && isValidToolInput(tool, autoRun.input) ? autoRun : null);

  const run = useCallback(
    async (input: string, country?: string) => {
      const request: ToolRequestInput = { input, ...(country ? { country } : {}) };
      last.current = request;
      const id = ++requestId.current;
      setState({ phase: "loading", request });
      onEvent?.({ type: "run", tool, ...(country ? { country } : {}) });
      const outcome = await runner(tool, input, country);
      if (id !== requestId.current) return;

      if (outcome.ok) {
        onEvent?.({ type: "result", tool, cached: outcome.cached });
        setState({ phase: "done", request, result: outcome.result, cached: outcome.cached });
      } else {
        onEvent?.({ type: "error", tool, error: outcome.error, status: outcome.status });
        setState({
          phase: "error",
          request,
          error: outcome.error,
          ...((outcome.error === "rate_limited" || outcome.error === "visitor_limit") &&
          outcome.retryAfterSeconds !== undefined
            ? { retryAt: Date.now() + outcome.retryAfterSeconds * 1000 }
            : {}),
        });
      }
    },
    [tool, runner, onEvent],
  );

  useEffect(() => {
    const request = pendingAutoRun.current;
    if (!request) return;
    pendingAutoRun.current = null;
    void run(request.input.trim(), request.country);
  }, [run]);

  const retry = useCallback(() => {
    if (last.current) void run(last.current.input, last.current.country);
  }, [run]);

  const reset = useCallback(() => {
    requestId.current += 1;
    setState({ phase: "idle" });
  }, []);

  return { state, run, retry, reset };
}
