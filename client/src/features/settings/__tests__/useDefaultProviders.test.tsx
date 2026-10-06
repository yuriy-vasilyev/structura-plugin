/**
 * Default text provider for new campaigns and one-off posts (2026-10-02,
 * specs/byok-ai-guidance.md §9): an explicit plugin default wins; without
 * one, the best connected provider, not the first connected. Images follow
 * the image recommendation (Gemini, then OpenAI) since 2026-10-06.
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

  // 2026-10-06 (specs/open-providers.md): Free and anonymous may run
  // Anthropic, so they default to it like BYOK.
  it.each(["free", "none"])("%s defaults to Anthropic when it is connected", (plan) => {
    expect(textDefault(["gemini", "anthropic", "openai"], "", plan)).toBe("anthropic");
  });
});

const imageDefault = (connected: string[], plan = "byok") => {
  h.connected = connected;
  h.textDefault = "";
  h.plan = plan;
  return renderHook(() => useDefaultProviders()).result.current.defaultImageProvider;
};

// 2026-10-06: without an explicit image default, Gemini (recommended for
// images) before OpenAI, whatever order the keys were connected in.
describe("useDefaultProviders — default image provider", () => {
  it("prefers Gemini over OpenAI", () => {
    expect(imageDefault(["openai", "gemini"])).toBe("gemini");
  });

  it("falls back to OpenAI when Gemini is not connected", () => {
    expect(imageDefault(["anthropic", "openai"])).toBe("openai");
  });
});

// Owner review 2026-10-06: providers list Claude, OpenAI, Gemini wherever
// they are listed, whatever order the keys were connected in.
describe("useDefaultProviders — provider lists", () => {
  it("orders the override lists Claude, OpenAI, Gemini", () => {
    h.connected = ["gemini", "openai", "anthropic"];
    h.textDefault = "";
    h.plan = "none";
    const { availableProviders, availableImageProviders } = renderHook(() => useDefaultProviders()).result.current;
    expect(availableProviders).toEqual(["anthropic", "openai", "gemini"]);
    expect(availableImageProviders).toEqual(["openai", "gemini"]);
  });
});
