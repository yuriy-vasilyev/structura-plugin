import { describe, expect, it, vi } from "vitest";

vi.mock("@wordpress/i18n", () => ({
  __: (t: string) => t,
  _n: (single: string, plural: string, n: number) => (n === 1 ? single : plural),
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

import { resolveNewCampaignBlockedReason } from "../routes/CampaignsPage";

/**
 * Regression — wp.org first-impression QA round 5, 2026-09-03.
 *
 * An anonymous install's campaign cap resolves to 0, so `used >= cap`
 * was true at 0/0 and the at-cap branch preempted the license message:
 * the disabled "New Campaign" tooltip read "You're using 0 of 0
 * campaigns on your plan. Pause or delete one, or contact us for more."
 * Runs the REAL resolver — license gate must win for unlicensed
 * installs.
 */
describe("resolveNewCampaignBlockedReason", () => {
  it("explains the license gate for unlicensed installs — never '0 of 0 campaigns'", () => {
    const reason = resolveNewCampaignBlockedReason({
      isLicensed: false,
      atCampaignCap: true, // 0 >= 0 — the exact state that misfired
      usedCampaigns: 0,
      campaignCap: 0,
      engineBlockedReason: undefined,
    });
    expect(reason).toBe("Campaigns need a license — claim a free one to schedule posts.");
  });

  it("prefers the missing-provider reason when an unlicensed install also lacks AI", () => {
    const reason = resolveNewCampaignBlockedReason({
      isLicensed: false,
      atCampaignCap: true,
      usedCampaigns: 0,
      campaignCap: 0,
      engineBlockedReason: "Connect an AI provider in the AI Engine settings first.",
    });
    expect(reason).toBe("Connect an AI provider in the AI Engine settings first.");
  });

  it("keeps the real cap copy for licensed installs at their limit", () => {
    const reason = resolveNewCampaignBlockedReason({
      isLicensed: true,
      atCampaignCap: true,
      usedCampaigns: 2,
      campaignCap: 2,
      engineBlockedReason: undefined,
    });
    expect(reason).toContain("2 of 2 campaigns");
  });

  it("returns nothing for a licensed, under-cap, AI-ready install", () => {
    const reason = resolveNewCampaignBlockedReason({
      isLicensed: true,
      atCampaignCap: false,
      usedCampaigns: 1,
      campaignCap: 5,
      engineBlockedReason: undefined,
    });
    expect(reason).toBeUndefined();
  });
});
