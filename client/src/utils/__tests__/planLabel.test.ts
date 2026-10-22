import { describe, expect, it } from "vitest";
import { formatPlanName } from "../planLabel";

/**
 * 2026-10-12 (specs/cloud-volume-pricing.md): Cloud Pro became the 100-post
 * option of Cloud and the `cloud_pro` id was retired. 2026-10-21
 * (specs/in-portal-billing-design.md §1): the label reads like the portal's,
 * "Cloud · 30 posts".
 */
describe("formatPlanName", () => {
  it("names the managed plan Cloud", () => {
    expect(formatPlanName("cloud")).toBe("Cloud");
  });

  it("adds the license's posts per site to a Cloud label when known", () => {
    expect(formatPlanName("cloud", 30)).toBe("Cloud · 30 posts");
    expect(formatPlanName("cloud", 100)).toBe("Cloud · 100 posts");
    expect(formatPlanName("cloud", 1)).toBe("Cloud · 1 post");
    expect(formatPlanName("cloud", null)).toBe("Cloud");
  });

  it("leaves the other plans unchanged and never adds posts to them", () => {
    expect(formatPlanName("free", 30)).toBe("Free");
    expect(formatPlanName("byok", 100)).toBe("BYOK");
    expect(formatPlanName("enterprise")).toBe("enterprise");
  });
});
