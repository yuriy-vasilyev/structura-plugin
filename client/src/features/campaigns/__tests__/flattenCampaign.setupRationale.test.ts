/**
 * Wire contract — the campaign create/update body carries who chose the
 * writing approach and why the Setup step drafted what it did.
 *
 * `Campaign_Shape_Transformer` reads `campaign_mode_source` and
 * `setup_rationale` next to `campaign_mode` and maps them to
 * `identity.campaignModeSource` / `identity.setupRationale` on the cloud doc.
 * Both are optional for one release window (CLAUDE.md §10): a form without
 * them — an edit from an older surface, the single-post flow — must OMIT the
 * keys rather than send empties, or a save would wipe what the doc holds.
 */
import { describe, expect, it } from "vitest";

import { flattenCampaign } from "../api/useCampaignMutations";
import { DEFAULT_CAMPAIGN_FORM_DATA } from "../constants";
import type { CampaignFormData } from "../types";

const form = (identity: Partial<CampaignFormData["identity"]>): CampaignFormData => ({
  ...DEFAULT_CAMPAIGN_FORM_DATA,
  identity: { ...DEFAULT_CAMPAIGN_FORM_DATA.identity, ...identity },
});

describe("flattenCampaign — setup draft fields", () => {
  it("sends the inferred approach and the coded rationale", () => {
    const body = flattenCampaign(
      form({
        name: "Balkongarten",
        objective: "Practical balcony gardening for city dwellers.",
        campaignMode: "authority",
        campaignModeSource: "inferred",
        setupRationale: [
          { code: "language_from_site", params: { language: "de" } },
          { code: "approach_authority_low_footprint" },
        ],
      }),
    );

    expect(body.campaign_mode).toBe("authority");
    expect(body.campaign_mode_source).toBe("inferred");
    expect(body.setup_rationale).toEqual([
      { code: "language_from_site", params: { language: "de" } },
      { code: "approach_authority_low_footprint" },
    ]);
  });

  it("marks the approach as the user's once they override it", () => {
    const body = flattenCampaign(
      form({ campaignMode: "conversion", campaignModeSource: "user" }),
    );

    expect(body.campaign_mode_source).toBe("user");
  });

  it("omits both keys when the form has neither", () => {
    const body = flattenCampaign(form({ campaignMode: "traffic_magnet" }));

    expect("campaign_mode_source" in body).toBe(false);
    expect("setup_rationale" in body).toBe(false);
  });
});
