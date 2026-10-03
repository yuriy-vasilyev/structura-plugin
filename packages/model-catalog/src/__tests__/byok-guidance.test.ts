/**
 * The 2026-10-01 BYOK catalog refresh and the recommendations export
 * (specs/byok-ai-guidance.md §2, §3). The FROZEN bindings pin exact ids:
 * each moves only with its own test run of the feature it feeds.
 */
import { describe, expect, it } from "vitest";
import {
  MODEL_CATALOG,
  RECOMMENDATIONS,
  adviceFor,
  bestConnected,
  getDefaultModel,
  getRegistryModelId,
  resolveByokDefaultTextModelId,
  resolveFastModelId,
  resolveLegacyDefaultTextModelId,
  resolveManagedModelId,
  resolveRecommendedTextModel,
  resolveSocialCopyModelId,
  resolveSuggestionModelId,
  resolveSupersededTextModelId,
  resolveUtilityModelId,
  type AdviceContext,
  type AIProvider,
} from "../index";

const PROVIDERS: AIProvider[] = ["openai", "gemini", "anthropic"];
const recommended = (p: AIProvider, role: "text" | "image") =>
  MODEL_CATALOG[p][role].filter((e) => e.recommended).map((e) => e.id);

describe("frozen bindings (pinned at their pre-refresh ids)", () => {
  it("suggestions on BYOK and Free", () => {
    expect(resolveSuggestionModelId("openai")).toBe("gpt-5.2-2025-12-11");
    expect(resolveSuggestionModelId("gemini")).toBe("gemini-3.1-pro-preview");
    expect(resolveSuggestionModelId("anthropic")).toBe("claude-opus-4-8");
  });

  it("the legacy managed text mapping (managed suggestions and social copy)", () => {
    expect(resolveManagedModelId("cloud", "text", "openai")).toBe("gpt-5.4-mini");
    expect(resolveManagedModelId("cloud", "text", "gemini")).toBe("gemini-3.5-flash");
    expect(resolveManagedModelId("cloud", "text", "anthropic")).toBe("claude-sonnet-5");
    expect(resolveManagedModelId("cloud_pro", "text", "openai")).toBe("gpt-5.2-2025-12-11");
    expect(resolveManagedModelId("cloud_pro", "text", "gemini")).toBe("gemini-3.1-pro-preview");
    expect(resolveManagedModelId("cloud_pro", "text", "anthropic")).toBe("claude-opus-4-8");
    for (const plan of ["free", "byok"] as const) {
      for (const p of PROVIDERS) expect(resolveManagedModelId(plan, "text", p)).toBeUndefined();
    }
  });

  it("the legacy default text model (discovery utilities, managed AI on a non-managed plan)", () => {
    expect(resolveLegacyDefaultTextModelId("openai")).toBe("gpt-5.2-2025-12-11");
    expect(resolveLegacyDefaultTextModelId("gemini")).toBe("gemini-3.1-pro-preview");
    expect(resolveLegacyDefaultTextModelId("anthropic")).toBe("claude-sonnet-5");
  });

  it("the fast model, which the served defaults.fast also carries", () => {
    expect(resolveFastModelId("openai")).toBe("gpt-5.4-mini");
    expect(resolveFastModelId("gemini")).toBe("gemini-3.5-flash");
    expect(resolveFastModelId("anthropic")).toBe("claude-haiku-4-5-20251001");
    for (const p of PROVIDERS) expect(MODEL_CATALOG[p].defaults.fast).toBe(resolveFastModelId(p));
  });

  it("utility calls and images stay where they were", () => {
    expect(resolveUtilityModelId("openai")).toBe("gpt-5-nano-2025-08-07");
    expect(resolveUtilityModelId("gemini")).toBe("gemini-3.1-flash-lite");
    expect(resolveUtilityModelId("anthropic")).toBe("claude-haiku-4-5-20251001");
    expect(resolveManagedModelId("cloud_pro", "image", "gemini")).toBe("gemini-3.1-flash-image");
    expect(resolveManagedModelId("cloud_pro", "image", "openai")).toBe("gpt-image-2");
    expect(getDefaultModel("openai", "image")).toBe("gpt-image-1-mini");
  });
});

describe("social copy on BYOK and Free (FROZEN)", () => {
  it("maps each current tier model to the pre-refresh model of its provider and tier", () => {
    expect(resolveSocialCopyModelId("anthropic", "claude-sonnet-5-5")).toBe("claude-sonnet-5");
    expect(resolveSocialCopyModelId("anthropic", "claude-opus-5-5")).toBe("claude-opus-4-8");
    expect(resolveSocialCopyModelId("openai", "gpt-5.6-sol")).toBe("gpt-5.4-mini");
    expect(resolveSocialCopyModelId("openai", "gpt-6-astra")).toBe("gpt-5.2-2025-12-11");
    expect(resolveSocialCopyModelId("gemini", "gemini-3.8-flash")).toBe("gemini-3.5-flash");
  });

  it("keeps every other id as stored", () => {
    for (const [p, id] of [
      ["gemini", "gemini-3.1-pro-preview"],
      ["anthropic", "claude-sonnet-5"],
      ["openai", "gpt-4o"],
      ["anthropic", "claude-haiku-4-5-20251001"],
      ["openai", "claude-sonnet-5-5"],
    ] as Array<[AIProvider, string]>) {
      expect(resolveSocialCopyModelId(p, id)).toBe(id);
    }
  });
});

describe("BYOK post default and fallback model", () => {
  it("is the provider's Standard tier, the same model the served defaults.text names", () => {
    expect(resolveByokDefaultTextModelId("anthropic")).toBe("claude-sonnet-5-5");
    expect(resolveByokDefaultTextModelId("openai")).toBe("gpt-5.6-sol");
    expect(resolveByokDefaultTextModelId("gemini")).toBe("gemini-3.8-flash");
    for (const p of PROVIDERS) expect(getDefaultModel(p, "text")).toBe(resolveByokDefaultTextModelId(p));
  });
});

describe("superseded ids", () => {
  it("run the current model of the tier they held", () => {
    expect(resolveSupersededTextModelId("anthropic", "claude-sonnet-5")).toBe("claude-sonnet-5-5");
    expect(resolveSupersededTextModelId("anthropic", "claude-opus-4-8")).toBe("claude-opus-5-5");
    expect(resolveSupersededTextModelId("openai", "gpt-5.4-mini")).toBe("gpt-5.6-sol");
    expect(resolveSupersededTextModelId("openai", "gpt-5.2-2025-12-11")).toBe("gpt-6-astra");
    expect(resolveSupersededTextModelId("gemini", "gemini-3.5-flash")).toBe("gemini-3.8-flash");
  });

  it("leave current ids, never-tiered ids, unknown ids and a provider mismatch unchanged", () => {
    for (const [p, id] of [
      ["anthropic", "claude-sonnet-5-5"],
      ["gemini", "gemini-3.1-pro-preview"],
      ["openai", "gpt-4o"],
      ["gemini", "gemini-2.5-pro"],
      ["anthropic", "claude-haiku-4-5-20251001"],
      ["anthropic", "claude-sonnet-4-6"],
      ["openai", "claude-sonnet-5"],
    ] as Array<[AIProvider, string]>) {
      expect(resolveSupersededTextModelId(p, id)).toBe(id);
    }
  });

  it("stay out of the served catalog", () => {
    for (const [p, id] of [
      ["anthropic", "claude-sonnet-5"],
      ["anthropic", "claude-opus-4-8"],
      ["openai", "gpt-5.4-mini"],
      ["openai", "gpt-5.2-2025-12-11"],
      ["gemini", "gemini-3.5-flash"],
    ] as Array<[AIProvider, string]>) {
      expect(MODEL_CATALOG[p].text.some((e) => e.id === id)).toBe(false);
    }
  });
});

describe("RECOMMENDATIONS", () => {
  it("is exactly spec §3", () => {
    expect(RECOMMENDATIONS).toEqual({
      text: { order: ["anthropic", "openai", "gemini"], provider: "anthropic", model: { anthropic: "mid", openai: "mid" }, caution: ["gemini"] },
      image: { order: null, provider: null, model: {}, caution: [] },
    });
  });

  it("drives the served text `recommended` flag: Standard for Anthropic and OpenAI, nothing for Gemini", () => {
    expect(recommended("anthropic", "text")).toEqual(["claude-sonnet-5-5"]);
    expect(recommended("openai", "text")).toEqual(["gpt-5.6-sol"]);
    expect(recommended("gemini", "text")).toEqual([]);
  });

  // FROZEN legacy image flags (not from testing): old clients preselect the
  // recommended image model, so these must not move with this change.
  it("keeps the served image `recommended` flags exactly as before 2026-10-01", () => {
    expect(recommended("openai", "image")).toEqual(["gpt-image-2"]);
    expect(recommended("gemini", "image")).toEqual(["gemini-3.1-flash-image"]);
    expect(recommended("anthropic", "image")).toEqual([]);
  });

  it("resolveRecommendedTextModel uses the recommended tier, or mid for a provider without one", () => {
    expect(resolveRecommendedTextModel("anthropic")).toEqual({ tier: "mid", model: "claude-sonnet-5-5" });
    expect(resolveRecommendedTextModel("openai")).toEqual({ tier: "mid", model: "gpt-5.6-sol" });
    expect(resolveRecommendedTextModel("gemini")).toEqual({ tier: "mid", model: getRegistryModelId("gemini", "text", "mid") });
  });
});

describe("bestConnected", () => {
  it("returns the first connected provider of the order", () => {
    expect(bestConnected("text", ["gemini", "openai", "anthropic"])).toBe("anthropic");
    expect(bestConnected("text", ["gemini", "openai"])).toBe("openai");
    expect(bestConnected("text", ["gemini"])).toBe("gemini");
  });

  it("returns null for an empty connected list, and for a capability with no order", () => {
    expect(bestConnected("text", [])).toBeNull();
    expect(bestConnected("image", ["openai", "gemini"])).toBeNull();
  });
});

describe("adviceFor", () => {
  const ctx = (over: Partial<AdviceContext>): AdviceContext => ({
    plan: "byok",
    provider: "gemini",
    connected: ["gemini"],
    canManageKeys: true,
    canManageBilling: true,
    ...over,
  });

  it("returns null for a provider outside caution, and on managed plans", () => {
    expect(adviceFor(ctx({ provider: "openai", connected: ["openai"] }))).toBeNull();
    expect(adviceFor(ctx({ provider: "anthropic", connected: ["anthropic"] }))).toBeNull();
    expect(adviceFor(ctx({ plan: "cloud" }))).toBeNull();
    expect(adviceFor(ctx({ plan: "cloud_pro" }))).toBeNull();
  });

  it("1: Anthropic connected on BYOK → Switch to Anthropic, no secondary", () => {
    expect(adviceFor(ctx({ connected: ["gemini", "anthropic", "openai"] }))).toEqual({
      situation: 1,
      primary: { kind: "switch", provider: "anthropic", label: "aiAdvice.switchTo" },
      secondary: null,
    });
  });

  it("2: BYOK, OpenAI connected, no Anthropic → Switch to OpenAI, Connect Anthropic", () => {
    expect(adviceFor(ctx({ connected: ["gemini", "openai"] }))).toEqual({
      situation: 2,
      primary: { kind: "switch", provider: "openai", label: "aiAdvice.switchTo" },
      secondary: { kind: "connect", provider: "anthropic", label: "aiAdvice.connectAnthropicForBest" },
    });
    // Without key access the Connect secondary disappears; Switch stays.
    expect(adviceFor(ctx({ connected: ["gemini", "openai"], canManageKeys: false }))).toEqual({
      situation: 2,
      primary: { kind: "switch", provider: "openai", label: "aiAdvice.switchTo" },
      secondary: null,
    });
  });

  it("3: BYOK, only Gemini → Connect Anthropic or OpenAI, Upgrade to Cloud", () => {
    expect(adviceFor(ctx({}))).toEqual({
      situation: 3,
      primary: { kind: "connect", provider: "anthropic", label: "aiAdvice.connectAnthropicOrOpenai" },
      secondary: { kind: "upgrade", label: "aiAdvice.upgradeCloud" },
    });
    expect(adviceFor(ctx({ canManageKeys: false, canManageBilling: false }))).toEqual({
      situation: 3,
      note: "aiAdvice.askAdmin",
      secondary: null,
    });
  });

  it("4: Free, OpenAI connected → Switch to OpenAI, Upgrade", () => {
    expect(adviceFor(ctx({ plan: "free", connected: ["gemini", "openai"] }))).toEqual({
      situation: 4,
      primary: { kind: "switch", provider: "openai", label: "aiAdvice.switchTo" },
      secondary: { kind: "upgrade", label: "aiAdvice.upgradeFree" },
    });
    expect(adviceFor(ctx({ plan: "free", connected: ["openai"], canManageBilling: false }))?.secondary).toBeNull();
  });

  it("5: Free, only Gemini → Connect OpenAI, Upgrade; the role variant shows askAdminFree", () => {
    expect(adviceFor(ctx({ plan: "free" }))).toEqual({
      situation: 5,
      primary: { kind: "connect", provider: "openai", label: "aiAdvice.connectOpenai" },
      secondary: { kind: "upgrade", label: "aiAdvice.upgradeFree" },
    });
    expect(adviceFor(ctx({ plan: "none", canManageKeys: false }))).toEqual({
      situation: 5,
      note: "aiAdvice.askAdminFree",
      secondary: { kind: "upgrade", label: "aiAdvice.upgradeFree" },
    });
  });

  it("never offers Free a switch to Anthropic, even with an Anthropic key left from a paid plan", () => {
    const withOpenai = adviceFor(ctx({ plan: "free", connected: ["gemini", "anthropic", "openai"] }));
    expect(withOpenai?.situation).toBe(4);
    expect(withOpenai?.primary).toEqual({ kind: "switch", provider: "openai", label: "aiAdvice.switchTo" });
    const onlyAnthropic = adviceFor(ctx({ plan: "free", connected: ["gemini", "anthropic"] }));
    expect(onlyAnthropic?.situation).toBe(5);
    expect(JSON.stringify(onlyAnthropic)).not.toContain("anthropic");
  });

  it("an empty connected list is advised like only Gemini", () => {
    expect(adviceFor(ctx({ connected: [] }))?.situation).toBe(3);
    expect(adviceFor(ctx({ plan: "free", connected: [] }))?.situation).toBe(5);
  });
});
