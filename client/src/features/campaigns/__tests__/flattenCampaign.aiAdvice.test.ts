/**
 * flattenCampaign — provider advice hide / show (2026-10-02,
 * specs/byok-ai-guidance.md §4).
 *
 * The form sends `ai_advice` only when the user hid or showed the advice in
 * this session (`dirty`), so a save never re-stamps or wipes the stored
 * value, and a campaign loaded with a hidden advice re-sends nothing.
 */
import { describe, expect, it } from "vitest";

import { flattenCampaign } from "../api/useCampaignMutations";
import { DEFAULT_CAMPAIGN_FORM_DATA } from "../constants";

describe("flattenCampaign — ai_advice", () => {
  it("sends the hide when the user hid the advice", () => {
    const out = flattenCampaign({
      ...DEFAULT_CAMPAIGN_FORM_DATA,
      aiAdvice: { hidden: { textProvider: "gemini" }, dirty: true },
    });
    expect(out.ai_advice).toEqual({ hidden: { textProvider: "gemini" } });
  });

  it("sends hidden: null when the user showed it again", () => {
    const out = flattenCampaign({
      ...DEFAULT_CAMPAIGN_FORM_DATA,
      aiAdvice: { hidden: null, dirty: true },
    });
    expect(out.ai_advice).toEqual({ hidden: null });
  });

  it("omits ai_advice for a campaign loaded hidden but not touched", () => {
    const out = flattenCampaign({
      ...DEFAULT_CAMPAIGN_FORM_DATA,
      aiAdvice: { hidden: { textProvider: "gemini" } },
    });
    expect(out).not.toHaveProperty("ai_advice");
  });

  it("omits ai_advice when the form has none", () => {
    expect(flattenCampaign(DEFAULT_CAMPAIGN_FORM_DATA)).not.toHaveProperty("ai_advice");
  });
});
