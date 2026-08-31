/**
 * flattenCampaign — schedule-less single-post snapshot ("Run again").
 *
 * Regression (2026-07-20): a single-post ("Generate post now") run stores an
 * inputSnapshot with NO `schedule` cluster. "Run again" replays that snapshot
 * straight through `flattenCampaign`, which dereferenced `schedule.cron` and
 * threw "Cannot read properties of undefined (reading 'cron')" — surfaced as
 * the "Action Failed: Cannot read properties of undefined (reading 'cron')"
 * toast. The flatten now defaults the schedule cluster; the `/post/generate`
 * endpoint never reads these fields, so the ad-hoc replay is harmless.
 */
import { describe, it, expect } from "vitest";

import { flattenCampaign } from "../api/useCampaignMutations";
import { DEFAULT_CAMPAIGN_FORM_DATA } from "../constants";
import type { CampaignFormData } from "../types";

describe("flattenCampaign — schedule-less snapshot", () => {
  it("does not throw and supplies safe schedule defaults when schedule is absent", () => {
    // Mirror a real single-post inputSnapshot: every cluster EXCEPT schedule.
    const { schedule: _omit, ...scheduleLess } = DEFAULT_CAMPAIGN_FORM_DATA;

    expect(() =>
      flattenCampaign(scheduleLess as CampaignFormData),
    ).not.toThrow();

    const out = flattenCampaign(scheduleLess as CampaignFormData);
    expect(out.cron_schedule).toBe("");
    expect(out.end_mode).toBe("infinite");
    expect(out.pregeneration_enabled).toBe(true);
  });

  it("still passes a real schedule through for campaign create/update", () => {
    const out = flattenCampaign(DEFAULT_CAMPAIGN_FORM_DATA);
    expect(out.cron_schedule).toBe(DEFAULT_CAMPAIGN_FORM_DATA.schedule.cron);
  });
});
