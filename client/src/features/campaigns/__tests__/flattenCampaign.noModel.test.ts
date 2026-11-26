/**
 * flattenCampaign — the campaign save and one-off post payload carries no
 * model and no tier since 2026-11-25 (owner decision,
 * specs/byok-ai-guidance.md §2.2): the cloud runs each provider's Standard
 * model on own keys and the managed lineup on Cloud, whatever a request
 * names. The providers and fallbacks still travel.
 */
import { describe, it, expect } from "vitest";

import { flattenCampaign } from "../api/useCampaignMutations";
import { DEFAULT_CAMPAIGN_FORM_DATA } from "../constants";
import { getCampaignFormDataForLicense } from "../helpers";
import type { CampaignFormData } from "../types";

const MODEL_KEYS = ["text_model", "image_model", "text_tier", "image_tier", "textModel", "imageModel", "textTier", "imageTier"];

describe("flattenCampaign — no model or tier on the wire", () => {
  it("sends the providers and fallbacks and no model or tier key", () => {
    const form: CampaignFormData = {
      ...DEFAULT_CAMPAIGN_FORM_DATA,
      intelligence: {
        ...DEFAULT_CAMPAIGN_FORM_DATA.intelligence,
        textProvider: "anthropic",
        imageProvider: "openai",
        fallbackTextProvider: "openai",
        fallbackImageProvider: "gemini",
      },
    };
    const out = flattenCampaign(form);

    expect(out).toMatchObject({
      text_provider: "anthropic",
      image_provider: "openai",
      fallback_text_provider: "openai",
      fallback_image_provider: "gemini",
    });
    for (const key of MODEL_KEYS) expect(out).not.toHaveProperty(key);
  });

  it("the license-seeded one-off form flattens without a model or tier on every plan", () => {
    for (const seed of [
      { isPaidLicense: true, isLicensed: true },
      { isPaidLicense: false, isLicensed: true },
      { isPaidLicense: false, isLicensed: false },
    ]) {
      const out = flattenCampaign(getCampaignFormDataForLicense(seed));
      for (const key of MODEL_KEYS) expect(out).not.toHaveProperty(key);
    }
  });

  it("a Run again replay of an older snapshot that stored a model and a tier sends neither", () => {
    const legacy = {
      ...DEFAULT_CAMPAIGN_FORM_DATA,
      intelligence: {
        ...DEFAULT_CAMPAIGN_FORM_DATA.intelligence,
        textModel: "claude-opus-5-5",
        textTier: "top",
        imageModel: "gpt-image-2",
        imageTier: "top",
      },
    } as unknown as CampaignFormData;
    const out = flattenCampaign(legacy);
    for (const key of MODEL_KEYS) expect(out).not.toHaveProperty(key);
  });
});
