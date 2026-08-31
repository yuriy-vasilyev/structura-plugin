import { describe, it, expect } from "vitest";
import {
  MODELS,
  MODEL_CATALOG,
  getDefaultModel,
  getRecommendedModel,
  isKnownImageModelForProvider,
  resolveManagedTier,
  resolveManagedModelId,
  BATCH_INPUT_PRICE_USD_PER_M_TOKENS,
  lookupBatchInputPrice,
  getRegistryModelId,
  getRegistryModel,
  resolveTtsModelId,
  resolveSuggestionModelId,
  resolveUtilityModelId,
  resolveByokTierModelId,
  tierForModelId,
  type AIProvider,
} from "../index";

/**
 * The exact object every plugin install + the SPA + the web portal already
 * parse off `getAvailableModels`. Frozen here as the wire contract: if the
 * derivation ever produces anything structurally different, this fails and the
 * refactor is caught before it ships a broken catalog to clients.
 */
const EXPECTED_CATALOG = {
  openai: {
    defaults: {
      text: "gpt-5.2-2025-12-11",
      fast: "gpt-5.4-mini",
      image: "gpt-image-1-mini",
    },
    text: [
      { id: "gpt-5.2-2025-12-11", name: "GPT-5.2", default: true, recommended: true },
      { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", fast: true },
      { id: "gpt-5-nano-2025-08-07", name: "GPT-5 Nano" },
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    ],
    image: [
      { id: "gpt-image-1-mini", name: "GPT Image 1 Mini", default: true },
      { id: "gpt-image-2", name: "GPT Image 2", recommended: true },
    ],
    manifest: {
      "gpt-5.2-2025-12-11": { family: "chat", endpoint: "v1/chat/completions" },
      "gpt-5.4-mini": { family: "chat", endpoint: "v1/chat/completions" },
      "gpt-5-nano-2025-08-07": { family: "chat", endpoint: "v1/chat/completions" },
      "gpt-4o": { family: "chat", endpoint: "v1/chat/completions" },
      "gpt-4o-mini": { family: "chat", endpoint: "v1/chat/completions" },
      "gpt-image-1-mini": {
        family: "image",
        endpoint: "v1/images/generations",
        sizes: { "1:1": "1024x1024", "16:9": "1536x1024", "9:16": "1024x1536" },
        qualities: ["low", "medium", "high", "auto"],
        default_quality: "high",
      },
      "gpt-image-2": {
        family: "image",
        endpoint: "v1/images/generations",
        sizes: { "1:1": "1024x1024", "16:9": "1536x1024", "9:16": "1024x1536" },
        qualities: ["low", "medium", "high", "auto"],
        default_quality: "high",
      },
    },
  },
  gemini: {
    defaults: {
      text: "gemini-3.1-pro-preview",
      fast: "gemini-3.5-flash",
      image: "gemini-3.1-flash-image",
    },
    text: [
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", default: true, recommended: true },
      { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", fast: true },
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    ],
    image: [
      { id: "gemini-3.1-flash-image", name: "Gemini 3.1 Flash Image", default: true, recommended: true },
      { id: "gemini-3-pro-image", name: "Gemini 3 Pro Image" },
    ],
    manifest: {
      "gemini-3.1-pro-preview": { family: "text", endpoint: "generateContent" },
      "gemini-3.5-flash": { family: "text", endpoint: "generateContent" },
      "gemini-3.1-flash-lite": { family: "text", endpoint: "generateContent" },
      "gemini-2.5-pro": { family: "text", endpoint: "generateContent" },
      "gemini-3.1-flash-image": {
        family: "image",
        endpoint: "generateContent",
        ratios: ["1:1", "4:3", "16:9", "9:16"],
      },
      "gemini-3-pro-image": {
        family: "image",
        endpoint: "generateContent",
        ratios: ["1:1", "4:3", "16:9", "9:16"],
      },
    },
  },
  anthropic: {
    defaults: {
      text: "claude-sonnet-5",
      fast: "claude-haiku-4-5-20251001",
      image: "",
    },
    text: [
      { id: "claude-sonnet-5", name: "Claude Sonnet 5", default: true },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", fast: true },
      { id: "claude-opus-4-8", name: "Claude Opus 4.8", recommended: true },
    ],
    image: [],
    manifest: {
      "claude-sonnet-5": { family: "messages", endpoint: "v1/messages", max_output_tokens: 8192 },
      "claude-haiku-4-5-20251001": { family: "messages", endpoint: "v1/messages", max_output_tokens: 8192 },
      "claude-opus-4-8": { family: "messages", endpoint: "v1/messages", max_output_tokens: 8192 },
    },
  },
};

const PROVIDERS: AIProvider[] = ["openai", "gemini", "anthropic"];

describe("MODEL_CATALOG derivation (wire contract)", () => {
  it("derives the exact served shape from MODELS", () => {
    expect(MODEL_CATALOG).toEqual(EXPECTED_CATALOG);
  });

  it("never emits a false flag — only truthy flags appear on entries", () => {
    for (const provider of PROVIDERS) {
      for (const entry of [...MODEL_CATALOG[provider].text, ...MODEL_CATALOG[provider].image]) {
        for (const flag of ["default", "recommended", "fast"] as const) {
          if (flag in entry) expect(entry[flag]).toBe(true);
        }
      }
    }
  });
});

describe("authoring invariants", () => {
  it("has exactly one text default and one fast model per provider", () => {
    for (const provider of PROVIDERS) {
      const text = MODELS.filter((m) => m.provider === provider && m.role === "text");
      expect(text.filter((m) => m.default)).toHaveLength(1);
      expect(text.filter((m) => m.fast)).toHaveLength(1);
    }
  });

  it("has exactly one image default per image-capable provider", () => {
    for (const provider of ["openai", "gemini"] as const) {
      const image = MODELS.filter((m) => m.provider === provider && m.role === "image");
      expect(image.filter((m) => m.default)).toHaveLength(1);
    }
    expect(MODELS.filter((m) => m.provider === "anthropic" && m.role === "image")).toHaveLength(0);
  });
});

describe("selectors", () => {
  it("getDefaultModel returns the role default", () => {
    expect(getDefaultModel("openai", "text")).toBe("gpt-5.2-2025-12-11");
    expect(getDefaultModel("openai", "fast")).toBe("gpt-5.4-mini");
    expect(getDefaultModel("gemini", "image")).toBe("gemini-3.1-flash-image");
    expect(getDefaultModel("anthropic", "image")).toBe("");
  });

  it("getRecommendedModel returns the recommended entry, splitting from default for Anthropic", () => {
    // OpenAI/Gemini: default === recommended.
    expect(getRecommendedModel("openai", "text")).toBe("gpt-5.2-2025-12-11");
    expect(getRecommendedModel("gemini", "text")).toBe("gemini-3.1-pro-preview");
    // Anthropic: default is Sonnet, recommended is Opus.
    expect(getDefaultModel("anthropic", "text")).toBe("claude-sonnet-5");
    expect(getRecommendedModel("anthropic", "text")).toBe("claude-opus-4-8");
  });

  it("isKnownImageModelForProvider validates and honors requireMidOnly", () => {
    expect(isKnownImageModelForProvider("openai", "gpt-image-2")).toBe(true);
    expect(isKnownImageModelForProvider("openai", "nope")).toBe(false);
    // gpt-image-2 is top (recommended), not mid — blocked when mid-only.
    expect(isKnownImageModelForProvider("openai", "gpt-image-2", true)).toBe(false);
    expect(isKnownImageModelForProvider("openai", "gpt-image-1-mini", true)).toBe(true);
  });
});

describe("managed-tier resolution (replaces PLAN_DEFAULTS)", () => {
  it("cloud → mid, cloud_pro → top", () => {
    expect(resolveManagedTier("cloud", "text", "gemini")).toBe("mid");
    expect(resolveManagedTier("cloud", "text", "openai")).toBe("mid");
    expect(resolveManagedTier("cloud_pro", "text", "openai")).toBe("top");
    expect(resolveManagedTier("cloud_pro", "text", "anthropic")).toBe("top");
  });

  it("Cloud Pro Gemini IMAGE stays on mid (Flash Image) — the one exception", () => {
    expect(resolveManagedTier("cloud_pro", "image", "openai")).toBe("top");
    expect(resolveManagedTier("cloud_pro", "image", "gemini")).toBe("mid");
    expect(resolveManagedTier("cloud", "image", "gemini")).toBe("mid");
  });

  it("reproduces the EXACT former PLAN_DEFAULTS pins (behavior-preserving)", () => {
    // Former cloud pins.
    expect(resolveManagedModelId("cloud", "text", "gemini")).toBe("gemini-3.5-flash");
    expect(resolveManagedModelId("cloud", "text", "openai")).toBe("gpt-5.4-mini");
    expect(resolveManagedModelId("cloud", "text", "anthropic")).toBe("claude-sonnet-5");
    // Former cloud_pro pins.
    expect(resolveManagedModelId("cloud_pro", "text", "openai")).toBe("gpt-5.2-2025-12-11");
    expect(resolveManagedModelId("cloud_pro", "text", "gemini")).toBe("gemini-3.1-pro-preview");
    expect(resolveManagedModelId("cloud_pro", "text", "anthropic")).toBe("claude-opus-4-8");
    // Image pins — note cloud_pro gemini stays Flash Image, matching the old pin.
    expect(resolveManagedModelId("cloud", "image", "gemini")).toBe(
      "gemini-3.1-flash-image",
    );
    expect(resolveManagedModelId("cloud", "image", "openai")).toBe("gpt-image-1-mini");
    expect(resolveManagedModelId("cloud_pro", "image", "openai")).toBe("gpt-image-2");
    expect(resolveManagedModelId("cloud_pro", "image", "gemini")).toBe(
      "gemini-3.1-flash-image",
    );
  });
});

describe("batch pricing (derived, drift-proof)", () => {
  it("prices the REAL submitted model ids, not stale short forms", () => {
    // The prior hand-maintained map keyed `openai:gpt-5.2` and
    // `gemini:gemini-3.1-pro`, neither of which matches the ids actually
    // submitted — so those lookups returned 0. Deriving from the catalog fixes
    // it: the full ids now resolve.
    expect(lookupBatchInputPrice("openai", "gpt-5.2-2025-12-11")).toBe(2.5);
    expect(lookupBatchInputPrice("gemini", "gemini-3.1-pro-preview")).toBe(1.5);
    expect(lookupBatchInputPrice("anthropic", "claude-opus-4-8")).toBe(2.5);
    expect(lookupBatchInputPrice("anthropic", "claude-sonnet-5")).toBe(1.5);
    expect(lookupBatchInputPrice("openai", "gpt-5.4-mini")).toBe(0.5);
  });

  it("no longer carries the stale short keys", () => {
    expect(BATCH_INPUT_PRICE_USD_PER_M_TOKENS["openai:gpt-5.2"]).toBeUndefined();
    expect(BATCH_INPUT_PRICE_USD_PER_M_TOKENS["gemini:gemini-3.1-pro"]).toBeUndefined();
  });

  it("retains legacy retiree ids for in-flight/historical records", () => {
    expect(lookupBatchInputPrice("anthropic", "claude-opus-4-6")).toBe(2.5);
    expect(lookupBatchInputPrice("anthropic", "claude-sonnet-4-5")).toBe(1.5);
    expect(lookupBatchInputPrice("gemini", "gemini-3.1-flash-lite")).toBe(0.15);
  });

  it("returns null for an unpriced model", () => {
    expect(lookupBatchInputPrice("openai", "gpt-4o")).toBeNull();
  });
});

describe("registry tiers (binding layer)", () => {
  it("resolves top/mid/cheap text ids per provider", () => {
    expect(getRegistryModelId("openai", "text", "top")).toBe("gpt-5.2-2025-12-11");
    expect(getRegistryModelId("openai", "text", "mid")).toBe("gpt-5.4-mini");
    expect(getRegistryModelId("openai", "text", "cheap")).toBe("gpt-5-nano-2025-08-07");

    expect(getRegistryModelId("gemini", "text", "top")).toBe("gemini-3.1-pro-preview");
    expect(getRegistryModelId("gemini", "text", "mid")).toBe("gemini-3.5-flash");
    // Gemini's cheap model (Flash-Lite) landed via the slice-5 sync script.
    expect(getRegistryModelId("gemini", "text", "cheap")).toBe("gemini-3.1-flash-lite");

    expect(getRegistryModelId("anthropic", "text", "top")).toBe("claude-opus-4-8");
    expect(getRegistryModelId("anthropic", "text", "mid")).toBe("claude-sonnet-5");
    expect(getRegistryModelId("anthropic", "text", "cheap")).toBe(
      "claude-haiku-4-5-20251001",
    );
  });

  it("getRegistryModel returns the entry with its display name (for tier labels)", () => {
    expect(getRegistryModel("gemini", "text", "top")).toMatchObject({
      id: "gemini-3.1-pro-preview",
      name: "Gemini 3.1 Pro",
    });
    expect(getRegistryModel("gemini", "text", "mid")?.name).toBe("Gemini 3.5 Flash");
    expect(getRegistryModel("anthropic", "image", "top")).toBeUndefined();
  });

  it("resolves image mid/top and has no cheap image tier", () => {
    expect(getRegistryModelId("openai", "image", "mid")).toBe("gpt-image-1-mini");
    expect(getRegistryModelId("openai", "image", "top")).toBe("gpt-image-2");
    expect(getRegistryModelId("gemini", "image", "mid")).toBe(
      "gemini-3.1-flash-image",
    );
    expect(getRegistryModelId("openai", "image", "cheap")).toBeUndefined();
  });

  it("resolves TTS model ids (openai + gemini only)", () => {
    expect(resolveTtsModelId("openai")).toBe("gpt-4o-mini-tts");
    expect(resolveTtsModelId("gemini")).toBe("gemini-3.1-flash-tts-preview");
    expect(resolveTtsModelId("anthropic")).toBeUndefined();
  });
});

describe("use-case bindings", () => {
  it("suggestions bind to each provider's TOP text model", () => {
    expect(resolveSuggestionModelId("openai")).toBe("gpt-5.2-2025-12-11");
    expect(resolveSuggestionModelId("gemini")).toBe("gemini-3.1-pro-preview");
    expect(resolveSuggestionModelId("anthropic")).toBe("claude-opus-4-8");
  });

  it("utility tasks bind to CHEAP text, falling back to mid where none exists", () => {
    // openai + anthropic have a distinct cheap model.
    expect(resolveUtilityModelId("openai")).toBe("gpt-5-nano-2025-08-07");
    expect(resolveUtilityModelId("anthropic")).toBe("claude-haiku-4-5-20251001");
    // gemini now has a distinct cheap model (Flash-Lite, confirmed by the
    // slice-5 sync script) — heading-extraction / migration resolve here.
    expect(resolveUtilityModelId("gemini")).toBe("gemini-3.1-flash-lite");
  });

  it("BYOK tier resolves top/mid; no tier → undefined (keep legacy model)", () => {
    expect(resolveByokTierModelId("gemini", "text", "top")).toBe("gemini-3.1-pro-preview");
    expect(resolveByokTierModelId("gemini", "text", "mid")).toBe("gemini-3.5-flash");
    expect(resolveByokTierModelId("openai", "image", "top")).toBe("gpt-image-2");
    expect(resolveByokTierModelId("openai", "image", "mid")).toBe("gpt-image-1-mini");
    // No stored tier (legacy campaign) → undefined, caller keeps its model.
    expect(resolveByokTierModelId("openai", "text", undefined)).toBeUndefined();
  });
});

describe("tierForModelId (reverse lookup — legacy campaigns store a model, not a tier)", () => {
  it("maps a live registry id back to its tier", () => {
    expect(tierForModelId("gemini", "text", "gemini-3.1-pro-preview")).toBe("top");
    expect(tierForModelId("gemini", "text", "gemini-3.5-flash")).toBe("mid");
    expect(tierForModelId("openai", "image", "gpt-image-2")).toBe("top");
    expect(tierForModelId("anthropic", "text", "claude-sonnet-5")).toBe("mid");
  });

  it("returns undefined for retired/unknown ids and empty input", () => {
    // Retired by the live-confirmed model bump — not in the registry anymore.
    expect(tierForModelId("gemini", "text", "gemini-3-flash-preview")).toBeUndefined();
    expect(tierForModelId("openai", "text", "no-such-model")).toBeUndefined();
    expect(tierForModelId("openai", "text", "")).toBeUndefined();
    expect(tierForModelId("openai", "text", undefined)).toBeUndefined();
  });

  it("is scoped by provider and role — an id never matches across either", () => {
    expect(tierForModelId("openai", "text", "gemini-3.5-flash")).toBeUndefined();
    expect(tierForModelId("gemini", "image", "gemini-3.5-flash")).toBeUndefined();
  });
});

describe("tts is registry-only — never in the served catalog", () => {
  const PROVIDERS: AIProvider[] = ["openai", "gemini", "anthropic"];

  it("no tts id appears in any served text/image array or manifest", () => {
    const ttsIds = new Set(MODELS.filter((m) => m.role === "tts").map((m) => m.id));
    expect(ttsIds.size).toBeGreaterThan(0);
    for (const provider of PROVIDERS) {
      const block = MODEL_CATALOG[provider];
      const served = [
        ...block.text.map((m) => m.id),
        ...block.image.map((m) => m.id),
        ...Object.keys(block.manifest),
      ];
      for (const id of served) expect(ttsIds.has(id)).toBe(false);
    }
  });
});
