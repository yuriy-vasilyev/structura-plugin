/**
 * `planCompetitorAdds` — the manual-add batch planner behind the Site →
 * Competitors picker. Pins what a pasted "a.com, b.com, junk" does against
 * the confirmed list and the 25-URL cap.
 */
import { describe, expect, it } from "vitest";

import { planCompetitorAdds } from "../competitorAdds";

describe("planCompetitorAdds", () => {
  it("normalises every entry to a full URL and keeps input order", () => {
    const plan = planCompetitorAdds(["rival.com", "https://peer.com/blog"], [], 25);
    expect(plan).toEqual({
      accepted: ["https://rival.com/", "https://peer.com/blog"],
      rejected: [],
      reason: null,
    });
  });

  it("hands invalid entries back and flags the reason, still adding the valid ones", () => {
    const plan = planCompetitorAdds(["rival.com", "not a url"], [], 25);
    expect(plan.accepted).toEqual(["https://rival.com/"]);
    expect(plan.rejected).toEqual(["not a url"]);
    expect(plan.reason).toBe("invalid");
  });

  it("drops duplicates silently unless nothing else was added", () => {
    const confirmed = ["https://rival.com/"];
    expect(planCompetitorAdds(["rival.com", "peer.com", "peer.com"], confirmed, 25)).toEqual({
      accepted: ["https://peer.com/"],
      rejected: [],
      reason: null,
    });
    expect(planCompetitorAdds(["rival.com"], confirmed, 25)).toEqual({
      accepted: [],
      rejected: [],
      reason: "duplicate",
    });
  });

  it("cuts the batch at the remaining cap and returns the overflow as rejected", () => {
    const plan = planCompetitorAdds(["a.com", "b.com", "c.com"], [], 2);
    expect(plan.accepted).toEqual(["https://a.com/", "https://b.com/"]);
    expect(plan.rejected).toEqual(["c.com"]);
    expect(plan.reason).toBe("cap");
  });
});
