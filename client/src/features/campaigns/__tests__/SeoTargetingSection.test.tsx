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
};

describe("<SeoTargetingSection>", () => {
  beforeEach(() => vi.clearAllMocks());

  // Owner review 2026-10-06: no locked teaser on None/Free; the page lists
  // what a paid plan adds in one card instead.
  it("renders nothing for None/Free — no teaser, no inputs", () => {
    const { container } = render(<SeoTargetingSection {...baseProps} isPaidLicense={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers DFS keyphrase discovery for paid tiers", () => {
    render(<SeoTargetingSection {...baseProps} isPaidLicense />);
    expect(
      screen.getByRole("button", { name: /Suggest keyphrases/i }),
    ).toBeInTheDocument();
    // Teaser is gone on the paid path.
    expect(screen.queryByText("Pro / Cloud Feature")).toBeNull();
  });
});
