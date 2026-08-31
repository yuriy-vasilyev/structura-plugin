/**
 * flattenCampaign — research attachments wire shape.
 *
 * Pins the single-post "Research material" contract (2026-08-01): a
 * top-level `researchAttachments` cluster on the form data must reach the
 * wire as snake_case `research_attachments` (max 5, `{id, name}` only — the
 * exact shape `Rest_Api::generate_single_post` validates and re-stamps on
 * the ephemeral campaign; see GenerateSinglePostResearchAttachmentsTest on
 * the PHP side). Absent / empty input must not emit the key at all so
 * attachment-less requests stay byte-identical to the pre-feature payload.
 */
import { describe, it, expect } from "vitest";

import { flattenCampaign } from "../api/useCampaignMutations";
import { DEFAULT_CAMPAIGN_FORM_DATA } from "../constants";
import type { CampaignFormData } from "../types";

describe("flattenCampaign — research attachments", () => {
  it("emits research_attachments as {id, name} refs when present", () => {
    const out = flattenCampaign({
      ...DEFAULT_CAMPAIGN_FORM_DATA,
      researchAttachments: [
        { id: "att-1", name: "market-research-q3.pdf" },
        { id: "att-2", name: "interview-notes.docx" },
      ],
    });

    expect(out.research_attachments).toEqual([
      { id: "att-1", name: "market-research-q3.pdf" },
      { id: "att-2", name: "interview-notes.docx" },
    ]);
  });

  it("strips extra keys a replayed snapshot might carry and caps at 5", () => {
    // A "Run again" replay feeds the run's inputSnapshot back through the
    // flatten; the snapshot's refs could grow fields cloud-side. Only id +
    // name may reach the wire, and never more than the plugin's cap of 5.
    const refs = Array.from({ length: 6 }, (_, i) => ({
      id: `att-${i}`,
      name: `doc-${i}.pdf`,
      extractedChars: 12345,
    }));
    const out = flattenCampaign({
      ...DEFAULT_CAMPAIGN_FORM_DATA,
      researchAttachments: refs,
    } as CampaignFormData);

    expect(out.research_attachments).toHaveLength(5);
    expect(out.research_attachments?.[0]).toEqual({ id: "att-0", name: "doc-0.pdf" });
  });

  it("omits the key entirely when absent or empty", () => {
    expect("research_attachments" in flattenCampaign(DEFAULT_CAMPAIGN_FORM_DATA)).toBe(
      false,
    );
    expect(
      "research_attachments" in
        flattenCampaign({ ...DEFAULT_CAMPAIGN_FORM_DATA, researchAttachments: [] }),
    ).toBe(false);
  });
});
