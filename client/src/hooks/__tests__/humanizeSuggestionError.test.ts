/**
 * Tests for `humanizeSuggestionError` — the toast-copy mapper for
 * `/structura/v1/suggest` failures.
 *
 * What's worth pinning:
 *   - Transient errors get a "{provider} is busy, retry / switch
 *     provider" message — not the raw `[Gemini Text Synthesis] high
 *     demand…` leak.
 *   - Provider terminal errors get a "check your key / try a different
 *     provider" message.
 *   - Pre-existing structured rejections (tier_quota_exceeded,
 *     missing_provider) pass their `message` through unchanged so cloud
 *     copy edits don't require a client release.
 *   - The provider label resolves to brand names — "Claude" for
 *     anthropic, not the lowercase id.
 *   - Empty / unknown error shapes fall back to a generic copy
 *     instead of throwing or rendering "[object Object]".
 */

import { describe, expect, it } from "vitest";

import { humanizeSuggestionError } from "../humanizeSuggestionError";

describe("humanizeSuggestionError — transient provider errors", () => {
  it("renders 'high demand' copy with the provider's brand label (Gemini)", () => {
    const out = humanizeSuggestionError({
      code: "cloud_suggestion_error",
      message: "[Gemini Text Synthesis] This model is currently experiencing high demand.",
      data: {
        code: "provider_transient",
        provider: "gemini",
        retriable: true,
        reason: "rate_limit",
        status: 503,
      },
    });
    expect(out).toMatch(/Gemini/);
    expect(out).toMatch(/high demand/i);
    // The leaky upstream string must NOT appear in the user-facing copy.
    expect(out).not.toMatch(/Gemini Text Synthesis/);
  });

  it("renders 'Claude' (not 'anthropic') for the anthropic provider", () => {
    const out = humanizeSuggestionError({
      data: { code: "provider_transient", provider: "anthropic", retriable: true },
    });
    expect(out).toMatch(/Claude/);
    expect(out).not.toMatch(/anthropic/i);
  });

  it("renders 'OpenAI' for the openai provider", () => {
    const out = humanizeSuggestionError({
      data: { code: "provider_transient", provider: "openai", retriable: true },
    });
    expect(out).toMatch(/OpenAI/);
  });

  it("falls back to a generic 'AI provider' label when provider is missing", () => {
    const out = humanizeSuggestionError({
      data: { code: "provider_transient", retriable: true },
    });
    expect(out).toMatch(/AI provider/);
    expect(out).toMatch(/high demand/i);
  });
});

describe("humanizeSuggestionError — terminal provider errors", () => {
  it("renders 'check your API key' guidance for provider_error", () => {
    const out = humanizeSuggestionError({
      data: { code: "provider_error", provider: "openai", retriable: false },
    });
    expect(out).toMatch(/OpenAI/);
    expect(out).toMatch(/API key/i);
  });
});

describe("humanizeSuggestionError — passthrough for pre-existing rejections", () => {
  it("passes through tier_quota_exceeded message verbatim (cloud owns the copy)", () => {
    const out = humanizeSuggestionError({
      code: "tier_quota_exceeded",
      message: "You've used your 3 free posts this month. Upgrade for unlimited.",
      data: { code: "tier_quota_exceeded", status: 402 },
    });
    expect(out).toBe("You've used your 3 free posts this month. Upgrade for unlimited.");
  });

  it("passes through missing_provider message verbatim", () => {
    const out = humanizeSuggestionError({
      code: "missing_provider",
      message: "Intelligence source not specified.",
      data: { status: 400 },
    });
    expect(out).toBe("Intelligence source not specified.");
  });
});

describe("humanizeSuggestionError — fallback paths", () => {
  it("falls back to a generic message when the error is empty / undefined", () => {
    const out = humanizeSuggestionError(undefined);
    expect(out).toMatch(/Something went wrong/i);
  });

  it("uses data.message when only that field is populated", () => {
    const out = humanizeSuggestionError({
      data: { message: "Network unreachable." },
    });
    expect(out).toBe("Network unreachable.");
  });

  it("never returns an empty string for any shape we tested", () => {
    const cases: unknown[] = [
      undefined,
      null,
      {},
      { data: {} },
      { message: "" },
      { data: { code: "provider_transient" } },
    ];
    for (const c of cases) {
      const out = humanizeSuggestionError(c);
      expect(out.length).toBeGreaterThan(0);
    }
  });
});
