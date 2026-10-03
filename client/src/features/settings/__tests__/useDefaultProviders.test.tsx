/**
 * Default text provider for new campaigns and one-off posts (2026-10-02,
 * specs/byok-ai-guidance.md §9): an explicit plugin default wins; without
 * one, the best connected provider the plan allows, not the first connected.
 *
 * The real hook and the real `@structura/model-catalog` order run; only the
 * settings / connections / licence data edges are mocked.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const h = vi.hoisted(() => ({
  plan: "byok" as string,
  textDefault: "" as string,
  connected: [] as string[],
}));

vi.mock("@/features/ai-engine", () => ({
  useAiSettingsQuery: () => ({ data: { defaults: { text_provider: h.textDefault, image_provider: "" } } }),
}));
vi.mock("../api/useLicense", () => ({ useLicense: () => ({ plan: h.plan }) }));
vi.mock("../api/useAiConnections", () => ({
  useAiConnections: () => ({
    textProviders: h.connected,
    imageProviders: h.connected.filter((p) => p !== "anthropic"),
    activeProviders: h.connected,
    incompleteProviders: [],
    isProviderIncomplete: () => false,
  }),
}));

import { useDefaultProviders } from "../api/useDefaultProviders";

const textDefault = (connected: string[], explicit = "", plan = "byok") => {
  h.connected = connected;
  h.textDefault = explicit;
  h.plan = plan;
  return renderHook(() => useDefaultProviders()).result.current.defaultTextProvider;
};

describe("useDefaultProviders — default text provider", () => {
  it("an explicit plugin default wins over the best connected provider", () => {
    expect(textDefault(["gemini", "openai", "anthropic"], "gemini")).toBe("gemini");
  });

  it("no default, Gemini connected before OpenAI: OpenAI", () => {
    expect(textDefault(["gemini", "openai"])).toBe("openai");
  });

  it("no default, all three connected: Anthropic", () => {
    expect(textDefault(["gemini", "openai", "anthropic"])).toBe("anthropic");
  });

  it("no default, only Gemini: Gemini", () => {
    expect(textDefault(["gemini"])).toBe("gemini");
  });

  it("Free never defaults to Anthropic, which the plan cannot run", () => {
    expect(textDefault(["gemini", "anthropic", "openai"], "", "free")).toBe("openai");
  });
});
