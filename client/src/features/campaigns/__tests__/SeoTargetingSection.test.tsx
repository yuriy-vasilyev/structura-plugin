import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SeoTargetingSection } from "@/features/campaigns/components/SeoTargetingSection";
import { DEFAULT_CAMPAIGN_FORM_DATA } from "@/features/campaigns/constants";

// The section pulls discovery from useCampaignMutations — stub it so the
// component renders without a query client / network.
const discoverKeywordsDetached = vi.fn();
const discoverAuthorityDetached = vi.fn();
vi.mock("@/features/campaigns/api/useCampaignMutations", () => ({
  useCampaignMutations: () => ({
    discoverKeywordsDetached,
    isDiscoveringKeywords: false,
    discoverAuthorityDetached,
    isDiscoveringDetached: false,
  }),
}));

const baseProps = {
  formData: { ...DEFAULT_CAMPAIGN_FORM_DATA, identity: { ...DEFAULT_CAMPAIGN_FORM_DATA.identity, objective: "A practical guide to headless WordPress" } },
  onChange: vi.fn(),
  plan: "free",
};

describe("<SeoTargetingSection>", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the locked Pro/Cloud teaser for None/Free — no inputs", () => {
    render(<SeoTargetingSection {...baseProps} isPaidLicense={false} isLicensed />);
    expect(screen.getByText("Pro / Cloud Feature")).toBeInTheDocument();
    // No keyphrase Suggest control in the locked state.
    expect(screen.queryByRole("button", { name: /Suggest keyphrases/i })).toBeNull();
  });

  it("offers DFS keyphrase discovery for paid tiers", () => {
    render(<SeoTargetingSection {...baseProps} isPaidLicense isLicensed />);
    expect(
      screen.getByRole("button", { name: /Suggest keyphrases/i }),
    ).toBeInTheDocument();
    // Teaser is gone on the paid path.
    expect(screen.queryByText("Pro / Cloud Feature")).toBeNull();
  });
});
