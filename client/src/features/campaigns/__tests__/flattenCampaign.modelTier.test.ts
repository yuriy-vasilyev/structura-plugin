/**
 * flattenCampaign — model quality tier (top | mid) wire contract.
 *
 * BYOK campaigns store a `textTier`/`imageTier` that the cloud resolves to a
 * concrete model at generation time (preferring the tier over text_model/
 * image_model). The flatten forwards the tier ONLY when set — matching the
 * plugin validator's omit-when-absent contract so a tier-less campaign never
 * writes a tier and a partial save can't wipe a stored one (rollout §10).
 */
import { describe, it, expect } from "vitest";

import { flattenCampaign } from "../api/useCampaignMutations";
import { DEFAULT_CAMPAIGN_FORM_DATA } from "../constants";
import { getCampaignFormDataForLicense } from "../helpers";
import type { CampaignFormData } from "../types";

const withIntelligence = (patch: Partial<CampaignFormData["intelligence"]>): CampaignFormData => ({
  ...DEFAULT_CAMPAIGN_FORM_DATA,
  intelligence: { ...DEFAULT_CAMPAIGN_FORM_DATA.intelligence, ...patch },
});

describe("flattenCampaign — model tier", () => {
  it("sends text_tier / image_tier when the campaign carries a tier", () => {
    const out = flattenCampaign(withIntelligence({ textTier: "top", imageTier: "mid" }));

    expect(out.text_tier).toBe("top");
    expect(out.image_tier).toBe("mid");
  });

  it("OMITS the tier keys entirely when no tier is set", () => {
    // A tier-less campaign leaves the tier unset — the flatten must not emit
    // the key at all, so the cloud keeps resolving off the concrete model and a
    // PATCH can't clear a tier.
    const out = flattenCampaign(withIntelligence({ textTier: undefined, imageTier: undefined }));

    expect(out).not.toHaveProperty("text_tier");
    expect(out).not.toHaveProperty("image_tier");
  });

  it("the one-off Generate-a-Post form carries the tier through to the wire", () => {
    // Regression guard: single-post-gen (GeneratePostPage) seeds its form from
    // getCampaignFormDataForLicense and uses the SAME top/mid tier picker as the
    // campaign. An earlier slice stripped the tier there; it must NOT — the
    // real license-seeded form must flatten to a tier the cloud can resolve.
    // Default is MID (2026-07-23): the cost runs on the user's own key, so Top
    // is an explicit opt-in, never a default.
    for (const seed of [
      { isPaidLicense: true, isLicensed: true },
      { isPaidLicense: false, isLicensed: false },
    ]) {
      const form = getCampaignFormDataForLicense(seed);
      expect(form.intelligence.textTier).toBe("mid");
      expect(form.intelligence.imageTier).toBe("mid");

      const out = flattenCampaign(form);
      expect(out.text_tier).toBe("mid");
      expect(out.image_tier).toBe("mid");
    }
  });
});
