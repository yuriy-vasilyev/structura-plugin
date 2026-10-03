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
  resolveGroundingAuditModel,
  resolveManagedWriterLineup,
  resolveTextOutputBudget,
  acceptsTemperature,
  acceptsLowEffort,
  TEXT_OUTPUT_BUDGET,
  resolveByokTierModelId,
  tierForModelId,
  type AIProvider,
  type CatalogModel,
} from "../index";

/**
 * The exact object every plugin install + the SPA + the web portal already
 * parse off `getAvailableModels`. Frozen here as the wire contract: if the
 * derivation ever produces anything structurally different, this fails and the
 * refactor is caught before it ships a broken catalog to clients.
 */
const EXPECTED_CATALOG = {
  openai: {
    // 2026-10-01 refresh (specs/byok-ai-guidance.md §2): `text` is the
    // Standard tier, `fast` stays frozen at the superseded fast model.
    defaults: {
      text: "gpt-5.6-sol",
      fast: "gpt-5.4-mini",
      image: "gpt-image-1-mini",
    },
    text: [
      { id: "gpt-6-astra", name: "GPT-6 Astra" },
      { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", default: true, recommended: true },
      { id: "gpt-5-nano-2025-08-07", name: "GPT-5 Nano" },
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    ],
    image: [
      { id: "gpt-image-1-mini", name: "GPT Image 1 Mini", default: true },
      { id: "gpt-image-2", name: "GPT Image 2", recommended: true },
    ],
    manifest: {
      "gpt-6-astra": { family: "chat", endpoint: "v1/chat/completions" },
      "gpt-5.6-sol": { family: "chat", endpoint: "v1/chat/completions" },
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
    // Gemini text carries no `recommended` entry (spec §3).
    defaults: {
      text: "gemini-3.8-flash",
      fast: "gemini-3.5-flash",
      image: "gemini-3.1-flash-image",
    },
    text: [
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro" },
      { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", default: true },
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    ],
    image: [
      { id: "gemini-3.1-flash-image", name: "Gemini 3.1 Flash Image", default: true, recommended: true },
      { id: "gemini-3-pro-image", name: "Gemini 3 Pro Image" },
    ],
    manifest: {
      "gemini-3.1-pro-preview": { family: "text", endpoint: "generateContent" },
      "gemini-3.8-flash": { family: "text", endpoint: "generateContent" },
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
      text: "claude-sonnet-5-5",
      fast: "claude-haiku-4-5-20251001",
      image: "",
    },
    text: [
      { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", default: true, recommended: true },
      { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", fast: true },
    ],
    image: [],
    manifest: {
      "claude-sonnet-5-5": { family: "messages", endpoint: "v1/messages", max_output_tokens: 8192 },
      "claude-opus-5-5": { family: "messages", endpoint: "v1/messages", max_output_tokens: 8192 },
      "claude-haiku-4-5-20251001": { family: "messages", endpoint: "v1/messages", max_output_tokens: 8192 },
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
  it("has exactly one text default per provider, and it is the listed Standard tier", () => {
    for (const provider of PROVIDERS) {
      const text = MODELS.filter((m) => m.provider === provider && m.role === "text");
      const defaults = text.filter((m) => m.default);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].tier).toBe("mid");
      expect(defaults[0].unlisted).toBeUndefined();
    }
  });

  it("stores no `recommended` flag: the served one derives from RECOMMENDATIONS", () => {
    for (const m of MODELS) expect("recommended" in m).toBe(false);
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
  it("getDefaultModel returns the role default (text = Standard tier since 2026-10-01)", () => {
    expect(getDefaultModel("openai", "text")).toBe("gpt-5.6-sol");
    expect(getDefaultModel("gemini", "text")).toBe("gemini-3.8-flash");
    expect(getDefaultModel("anthropic", "text")).toBe("claude-sonnet-5-5");
    expect(getDefaultModel("openai", "fast")).toBe("gpt-5.4-mini");
    expect(getDefaultModel("gemini", "image")).toBe("gemini-3.1-flash-image");
    expect(getDefaultModel("anthropic", "image")).toBe("");
  });

  it("getRecommendedModel is the recommended tier's model, or the default for Gemini, which has none", () => {
    expect(getRecommendedModel("openai", "text")).toBe("gpt-5.6-sol");
    expect(getRecommendedModel("anthropic", "text")).toBe("claude-sonnet-5-5");
    expect(getRecommendedModel("gemini", "text")).toBe("gemini-3.8-flash");
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

  // FROZEN text mapping (specs/byok-ai-guidance.md §2): the 2026-10-01 tier
  // refresh must not move it. It feeds managed suggestions and social copy.
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
    // it: the full ids now resolve. Values are the live batch input rates read
    // 2026-10-01 (gpt-5.2, gpt-5.4-mini, Gemini 3.1 Pro <=200k, Flash-Lite and
    // Sonnet 5 were stale before).
    expect(lookupBatchInputPrice("openai", "gpt-5.2-2025-12-11")).toBe(0.875);
    expect(lookupBatchInputPrice("gemini", "gemini-3.1-pro-preview")).toBe(1);
    expect(lookupBatchInputPrice("anthropic", "claude-opus-4-8")).toBe(2.5);
    expect(lookupBatchInputPrice("anthropic", "claude-sonnet-5")).toBe(1);
    expect(lookupBatchInputPrice("openai", "gpt-5.4-mini")).toBe(0.375);
  });

  it("prices every BYOK text tier model, which the stock batch path submits on a customer key", () => {
    for (const provider of PROVIDERS) {
      for (const tier of ["top", "mid"] as const) {
        const m = getRegistryModel(provider, "text", tier)!;
        expect(m.batchInputUsdPerMTok, m.id).toBe(m.pricing?.batchInputUsdPerMTok);
        expect(lookupBatchInputPrice(provider, m.id), m.id).not.toBeNull();
      }
    }
  });

  it("no longer carries the stale short keys", () => {
    expect(BATCH_INPUT_PRICE_USD_PER_M_TOKENS["openai:gpt-5.2"]).toBeUndefined();
    expect(BATCH_INPUT_PRICE_USD_PER_M_TOKENS["gemini:gemini-3.1-pro"]).toBeUndefined();
  });

  it("retains legacy retiree ids for in-flight/historical records", () => {
    expect(lookupBatchInputPrice("anthropic", "claude-opus-4-6")).toBe(2.5);
    expect(lookupBatchInputPrice("anthropic", "claude-sonnet-4-5")).toBe(1.5);
    expect(lookupBatchInputPrice("gemini", "gemini-3.1-flash-lite")).toBe(0.125);
  });

  it("returns null for an unpriced model", () => {
    expect(lookupBatchInputPrice("openai", "gpt-4o")).toBeNull();
  });
});

describe("registry tiers (binding layer)", () => {
  // 2026-10-01 BYOK refresh (specs/byok-ai-guidance.md §2); `cheap` untouched.
  it("resolves top/mid/cheap text ids per provider", () => {
    expect(getRegistryModelId("openai", "text", "top")).toBe("gpt-6-astra");
    expect(getRegistryModelId("openai", "text", "mid")).toBe("gpt-5.6-sol");
    expect(getRegistryModelId("openai", "text", "cheap")).toBe("gpt-5-nano-2025-08-07");

    expect(getRegistryModelId("gemini", "text", "top")).toBe("gemini-3.1-pro-preview");
    expect(getRegistryModelId("gemini", "text", "mid")).toBe("gemini-3.8-flash");
    // Gemini's cheap model (Flash-Lite) landed via the slice-5 sync script.
    expect(getRegistryModelId("gemini", "text", "cheap")).toBe("gemini-3.1-flash-lite");

    expect(getRegistryModelId("anthropic", "text", "top")).toBe("claude-opus-5-5");
    expect(getRegistryModelId("anthropic", "text", "mid")).toBe("claude-sonnet-5-5");
    expect(getRegistryModelId("anthropic", "text", "cheap")).toBe(
      "claude-haiku-4-5-20251001",
    );
  });

  it("getRegistryModel returns the entry with its display name (for tier labels)", () => {
    expect(getRegistryModel("gemini", "text", "top")).toMatchObject({
      id: "gemini-3.1-pro-preview",
      name: "Gemini 3.1 Pro",
    });
    expect(getRegistryModel("gemini", "text", "mid")?.name).toBe("Gemini 3.8 Flash");
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
  // FROZEN (specs/byok-ai-guidance.md §2): the pre-refresh top models, not
  // the current Top tier.
  it("suggestions bind to the frozen pre-refresh top text models", () => {
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

  // Owner decisions 2026-10-01: Cloud Pro audited with Opus 5.5 and every
  // other audited tier with Gemini 3.8 Flash (3.5 Flash failed 15 of 33
  // audits in the shortlist matrix and destroyed a must-keep line); later the
  // same day Cloud moved to the premium auditor too (specs/managed-ai-lineup.md
  // §2: Opus 5.5 found 7 real problems in 12 drafts where 3.8 Flash found
  // none). This test pinned Cloud on the standard auditor until then.
  it("the grounding audit binds per plan: Cloud and Cloud Pro to the premium auditor, everything else to the standard one", () => {
    for (const plan of ["cloud", "cloud_pro"] as const) {
      expect(resolveGroundingAuditModel(plan)).toEqual({ provider: "anthropic", model: "claude-opus-5-5" });
    }
    for (const plan of ["byok", "free", "none", null, undefined] as const) {
      expect(resolveGroundingAuditModel(plan)).toEqual({ provider: "gemini", model: "gemini-3.8-flash" });
    }
    expect(resolveGroundingAuditModel("byok").model).not.toBe(resolveUtilityModelId("gemini"));
  });

  // specs/managed-ai-lineup.md §2 (owner decision 2026-10-01).
  it("the managed writer lineup is Sonnet 5.5 with GPT-5.6 Sol as failover, on Cloud and Cloud Pro only", () => {
    for (const plan of ["cloud", "cloud_pro"] as const) {
      expect(resolveManagedWriterLineup(plan)).toEqual({
        writer: { provider: "anthropic", model: "claude-sonnet-5-5" },
        failover: { provider: "openai", model: "gpt-5.6-sol" },
      });
    }
    for (const plan of ["byok", "free", "none", null, undefined] as const) {
      expect(resolveManagedWriterLineup(plan)).toBeUndefined();
    }
  });

  // Since 2026-10-01 a model may hold a BYOK tier AND a role: Sonnet 5.5 is
  // the managed writer and the Anthropic Standard tier.
  it("exactly one catalog text model carries each managed writer role, on different providers", () => {
    const holders = (role: "primary" | "failover") => MODELS.filter((m) => m.managedWriter === role);
    for (const role of ["primary", "failover"] as const) {
      expect(holders(role)).toHaveLength(1);
      expect(holders(role)[0].role).toBe("text");
    }
    // A provider outage must not take out both the writer and its failover.
    expect(holders("primary")[0].provider).not.toBe(holders("failover")[0].provider);
  });

  it("prices the managed writer for the stock batch cost estimator", () => {
    const { writer } = resolveManagedWriterLineup("cloud")!;
    expect(lookupBatchInputPrice(writer.provider, writer.model)).toBe(1);
  });

  it("exactly one catalog text model carries each auditor role", () => {
    for (const role of ["premium", "standard"] as const) {
      const holders = MODELS.filter((m) => m.auditor === role);
      expect(holders).toHaveLength(1);
      expect(holders[0].role).toBe("text");
    }
  });

  it("BYOK tier resolves top/mid; no tier → undefined (keep legacy model)", () => {
    expect(resolveByokTierModelId("gemini", "text", "top")).toBe("gemini-3.1-pro-preview");
    expect(resolveByokTierModelId("gemini", "text", "mid")).toBe("gemini-3.8-flash");
    expect(resolveByokTierModelId("anthropic", "text", "top")).toBe("claude-opus-5-5");
    expect(resolveByokTierModelId("anthropic", "text", "mid")).toBe("claude-sonnet-5-5");
    expect(resolveByokTierModelId("openai", "text", "top")).toBe("gpt-6-astra");
    expect(resolveByokTierModelId("openai", "text", "mid")).toBe("gpt-5.6-sol");
    expect(resolveByokTierModelId("openai", "image", "top")).toBe("gpt-image-2");
    expect(resolveByokTierModelId("openai", "image", "mid")).toBe("gpt-image-1-mini");
    // No stored tier (legacy campaign) → undefined, caller keeps its model.
    expect(resolveByokTierModelId("openai", "text", undefined)).toBeUndefined();
  });
});

describe("tierForModelId (reverse lookup — legacy campaigns store a model, not a tier)", () => {
  it("maps a live registry id back to its tier", () => {
    expect(tierForModelId("gemini", "text", "gemini-3.1-pro-preview")).toBe("top");
    expect(tierForModelId("gemini", "text", "gemini-3.8-flash")).toBe("mid");
    expect(tierForModelId("openai", "image", "gpt-image-2")).toBe("top");
    expect(tierForModelId("anthropic", "text", "claude-sonnet-5-5")).toBe("mid");
  });

  it("maps a superseded id to the tier it held, which is the tier it now runs on", () => {
    expect(tierForModelId("gemini", "text", "gemini-3.5-flash")).toBe("mid");
    expect(tierForModelId("anthropic", "text", "claude-sonnet-5")).toBe("mid");
    expect(tierForModelId("anthropic", "text", "claude-opus-4-8")).toBe("top");
    expect(tierForModelId("openai", "text", "gpt-5.4-mini")).toBe("mid");
    expect(tierForModelId("openai", "text", "gpt-5.2-2025-12-11")).toBe("top");
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

// One output budget per model for every text generation path (direct engine
// callers and the stock batch path). 2026-10-01: Sonnet 5's adaptive thinking
// spent the direct path's whole 16,384-token max_tokens and never wrote JSON.
describe("text output budget", () => {
  it("defaults to the batch path's 64k budget and caps Claude at its 64,000-token maximum", () => {
    expect(TEXT_OUTPUT_BUDGET).toBe(65536);
    expect(resolveTextOutputBudget("gemini", "gemini-3.5-flash")).toBe(65536);
    expect(resolveTextOutputBudget("openai", "gpt-5.2-2025-12-11")).toBe(65536);
    for (const id of ["claude-sonnet-5", "claude-opus-4-8", "claude-haiku-4-5-20251001"]) {
      expect(resolveTextOutputBudget("anthropic", id)).toBe(64000);
    }
  });

  it("falls back to the default for a model id the catalog does not carry (legacy BYOK)", () => {
    expect(resolveTextOutputBudget("openai", "gpt-legacy")).toBe(65536);
  });
});

// 2026-10-01: gpt-5-nano answers 400 "Only the default (1) value is supported"
// to any explicit temperature.
describe("temperature capability", () => {
  it("is false only for models that accept the default temperature alone", () => {
    expect(acceptsTemperature("openai", "gpt-5-nano-2025-08-07")).toBe(false);
    expect(acceptsTemperature("openai", "gpt-5.2-2025-12-11")).toBe(true);
    expect(acceptsTemperature("openai", "gpt-5.4-mini")).toBe(true);
    expect(acceptsTemperature("gemini", "gemini-3.5-flash")).toBe(true);
    expect(acceptsTemperature("openai", "gpt-legacy")).toBe(true);
  });

  it("marks every Anthropic model from Opus 4.7 on as default-temperature only, and not Haiku 4.5", () => {
    for (const id of ["claude-sonnet-5", "claude-opus-4-8", "claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1"]) {
      expect(acceptsTemperature("anthropic", id)).toBe(false);
    }
    expect(acceptsTemperature("anthropic", "claude-haiku-4-5-20251001")).toBe(true);
  });

  it("marks the GPT-6 and GPT-5.6 families default-temperature only (probed 2026-10-01), and not GPT-5.2 or 5.4 Mini", () => {
    for (const id of ["gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) {
      expect(acceptsTemperature("openai", id)).toBe(false);
    }
  });
});

// 2026-10-01 catalog refresh: current models are known to the registry for
// the eval harness, without reaching any customer surface. Five of them
// became BYOK tiers the same day (specs/byok-ai-guidance.md §2).
describe("unlisted models (known, not offered)", () => {
  const NOW_TIERED: Array<[AIProvider, string]> = [
    ["anthropic", "claude-opus-5-5"],
    ["anthropic", "claude-sonnet-5-5"],
    ["openai", "gpt-6-astra"],
    ["openai", "gpt-5.6-sol"],
    ["gemini", "gemini-3.8-flash"],
  ];
  const STILL_UNLISTED_TEXT: Array<[AIProvider, string]> = [
    ["anthropic", "claude-fable-5-1"],
    ["openai", "gpt-6.1-sol"],
    ["openai", "gpt-6-luna"],
    ["openai", "gpt-5.6-terra"],
    ["openai", "gpt-5.6-luna"],
    ["gemini", "gemini-3.5-flash-lite"],
  ];
  const NEW_TEXT = [...NOW_TIERED, ...STILL_UNLISTED_TEXT];
  const NEW_IMAGE: Array<[AIProvider, string]> = [
    ["openai", "gpt-image-2.5-sunburst"],
    ["openai", "gpt-image-2.5-flare"],
    ["gemini", "gemini-3.1-flash-lite-image"],
  ];
  const find = (p: AIProvider, id: string) => MODELS.find((m) => m.provider === p && m.id === id);

  it("carries each new id once; the still-unlisted ones with no tier, no flag and no batch price", () => {
    for (const [p, id] of [...NEW_TEXT, ...NEW_IMAGE]) {
      expect(MODELS.filter((m) => m.id === id)).toHaveLength(1);
      expect(find(p, id)).toBeDefined();
    }
    for (const [p, id] of [...STILL_UNLISTED_TEXT, ...NEW_IMAGE]) {
      const m = find(p, id)!;
      expect(m.unlisted).toBe(true);
      expect(m.tier).toBeUndefined();
      expect(m.default ?? m.fast).toBeUndefined();
      expect(m.batchInputUsdPerMTok).toBeUndefined();
    }
  });

  it("serves the newly tiered models, roles included, on their tier", () => {
    for (const [p, id] of NOW_TIERED) {
      const m = find(p, id)!;
      expect(m.unlisted).toBeUndefined();
      expect(MODEL_CATALOG[p].text.some((e) => e.id === id)).toBe(true);
      expect(id in MODEL_CATALOG[p].manifest).toBe(true);
      expect(getRegistryModelId(p, "text", m.tier!)).toBe(id);
    }
  });

  it("serves none of the still-unlisted ones and never resolves them through a binding", () => {
    for (const [p, id] of [...STILL_UNLISTED_TEXT, ...NEW_IMAGE]) {
      const block = MODEL_CATALOG[p];
      expect([...block.text, ...block.image].some((e) => e.id === id)).toBe(false);
      expect(id in block.manifest).toBe(false);
      expect(tierForModelId(p, find(p, id)!.role, id)).toBeUndefined();
    }
    for (const p of PROVIDERS) {
      for (const tier of ["top", "mid", "cheap"] as const) {
        expect(getRegistryModel(p, "text", tier)?.unlisted).toBeUndefined();
        expect(getRegistryModel(p, "image", tier)?.unlisted).toBeUndefined();
      }
    }
  });

  it("prices the new text models as read on 2026-10-01", () => {
    expect(find("anthropic", "claude-opus-5-5")!.pricing).toEqual({
      pricedAt: "2026-10-01",
      inputUsdPerMTok: 4,
      outputUsdPerMTok: 20,
      batchInputUsdPerMTok: 2,
      batchOutputUsdPerMTok: 10,
    });
    expect(find("openai", "gpt-6.1-sol")!.pricing?.longContext).toEqual({
      inputUsdPerMTok: 4,
      outputUsdPerMTok: 15,
      batchInputUsdPerMTok: 2,
      batchOutputUsdPerMTok: 7.5,
    });
    // The page states no threshold for OpenAI's long-context rate.
    expect(find("openai", "gpt-6.1-sol")!.pricing?.longContext?.aboveInputTokens).toBeUndefined();
    expect(find("gemini", "gemini-3.8-flash")!.pricing).toMatchObject({ inputUsdPerMTok: 0.75, outputUsdPerMTok: 3.75 });
    for (const [p, id] of NEW_TEXT) expect(find(p, id)!.pricing?.pricedAt).toBe("2026-10-01");
  });

  it("budgets the new Claude models at 64,000 output tokens and the rest at the default", () => {
    for (const id of ["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1"]) {
      expect(resolveTextOutputBudget("anthropic", id)).toBe(64000);
    }
    expect(resolveTextOutputBudget("openai", "gpt-6.1-sol")).toBe(TEXT_OUTPUT_BUDGET);
    expect(resolveTextOutputBudget("gemini", "gemini-3.8-flash")).toBe(TEXT_OUTPUT_BUDGET);
  });
});

describe("pricing shape", () => {
  const priced = MODELS.filter((m): m is CatalogModel & { pricing: NonNullable<CatalogModel["pricing"]> } => !!m.pricing);

  it("prices every text model with a pricedAt date, and only text models", () => {
    for (const m of MODELS.filter((x) => x.role === "text")) expect(m.pricing?.pricedAt).toBe("2026-10-01");
    for (const m of priced) expect(m.role).toBe("text");
  });

  it("keeps the batch estimator's price equal to the listed batch input rate", () => {
    for (const m of MODELS.filter((x) => x.batchInputUsdPerMTok !== undefined)) {
      expect(m.batchInputUsdPerMTok).toBe(m.pricing?.batchInputUsdPerMTok);
    }
  });

  it("applies a long-context band only above a stated threshold (Gemini 3.1 Pro above 200k)", () => {
    expect(MODELS.find((m) => m.id === "gemini-3.1-pro-preview")!.pricing?.longContext).toEqual({
      aboveInputTokens: 200000,
      inputUsdPerMTok: 4,
      outputUsdPerMTok: 18,
      batchInputUsdPerMTok: 2,
      batchOutputUsdPerMTok: 9,
    });
  });

  it("leaves unpublished rates undefined (Gemini 2.5 Pro batch)", () => {
    const m = MODELS.find((x) => x.id === "gemini-2.5-pro")!;
    expect(m.pricing?.batchInputUsdPerMTok).toBeUndefined();
    expect(m.pricing?.batchOutputUsdPerMTok).toBeUndefined();
  });
});

describe("deprecations", () => {
  it("records the providers' retirement dates", () => {
    const dep = (id: string) => MODELS.find((m) => m.id === id)?.deprecation;
    expect(dep("gpt-5-nano-2025-08-07")?.retiresOn).toBe("2026-12-11");
    expect(dep("gpt-image-1-mini")?.retiresOn).toBe("2026-12-01");
    expect(dep("claude-haiku-4-5-20251001")?.retiresOn).toBeUndefined();
    expect(dep("claude-haiku-4-5-20251001")?.note).toContain("2026-10-15");
    expect(dep("gemini-2.5-pro")?.note).toContain("already used 2.5");
  });
});

// 2026-10-01 probes: Gemini 3.8 Flash takes thinkingLevel LOW (400 on
// MINIMAL), Opus 5.5 takes output_config.effort "low".
describe("low reasoning capability", () => {
  it("is true only where a real call confirmed it", () => {
    expect(acceptsLowEffort("gemini", "gemini-3.8-flash")).toBe(true);
    expect(acceptsLowEffort("anthropic", "claude-opus-5-5")).toBe(true);
    expect(acceptsLowEffort("gemini", "gemini-3.5-flash")).toBe(false);
    expect(acceptsLowEffort("openai", "gpt-5.2-2025-12-11")).toBe(false);
    expect(acceptsLowEffort("openai", "gpt-legacy")).toBe(false);
  });
});

