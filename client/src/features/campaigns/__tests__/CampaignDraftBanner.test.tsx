/**
 * Tests for `<CampaignDraftBanner>`.
 *
 * The banner is the user's only visible signal that an in-progress
 * /campaigns/new draft is sitting in localStorage. The render branches
 * worth pinning are:
 *   - Hidden when `lastUpdatedAt === null` (no real draft yet — only
 *     defaults). Otherwise visible.
 *   - Discard wipes the draft (covered by the store's own tests; here
 *     we just verify the button is wired up).
 *   - Resume navigates to /campaigns/new.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { CampaignDraftBanner } from "../components/CampaignDraftBanner";
import { useCampaignDraftStore } from "../context/draftStore";
import { DEFAULT_CAMPAIGN_FORM_DATA } from "../constants";

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const resetStore = () => {
  useCampaignDraftStore.setState({
    formData: DEFAULT_CAMPAIGN_FORM_DATA,
    activeStep: "interview",
    completedSteps: [],
    skippedSteps: [],
    lastUpdatedAt: null,
  });
};

beforeEach(() => {
  navigateMock.mockReset();
  localStorage.clear();
  resetStore();
});

afterEach(() => {
  localStorage.clear();
  resetStore();
});

const renderBanner = () =>
  render(
    <MemoryRouter>
      <CampaignDraftBanner />
    </MemoryRouter>
  );

describe("<CampaignDraftBanner>", () => {
  it("renders nothing when the draft is untouched (lastUpdatedAt === null)", () => {
    const { container } = renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the campaign name and step label when a draft exists", () => {
    useCampaignDraftStore.setState({
      formData: {
        ...DEFAULT_CAMPAIGN_FORM_DATA,
        identity: { ...DEFAULT_CAMPAIGN_FORM_DATA.identity, name: "Spring SEO Push" },
      },
      activeStep: "keywords",
      completedSteps: ["interview", "strategy"],
      skippedSteps: [],
      lastUpdatedAt: new Date().toISOString(),
    });

    renderBanner();

    expect(screen.getByText(/Spring SEO Push/)).toBeInTheDocument();
    expect(screen.getByText(/Keywords/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resume/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Discard/i })).toBeInTheDocument();
  });

  it("falls back to 'Untitled draft' when the user has not entered a name yet", () => {
    useCampaignDraftStore.setState({
      formData: DEFAULT_CAMPAIGN_FORM_DATA,
      activeStep: "interview",
      completedSteps: [],
      skippedSteps: [],
      lastUpdatedAt: new Date().toISOString(),
    });

    renderBanner();

    expect(screen.getByText(/Untitled draft/i)).toBeInTheDocument();
  });

  it("Resume navigates to /campaigns/new", () => {
    useCampaignDraftStore.setState({
      formData: DEFAULT_CAMPAIGN_FORM_DATA,
      activeStep: "interview",
      completedSteps: [],
      skippedSteps: [],
      lastUpdatedAt: new Date().toISOString(),
    });

    renderBanner();
    screen.getByRole("button", { name: /Resume/i }).click();

    expect(navigateMock).toHaveBeenCalledWith("/campaigns/new");
  });

  it("Discard clears the draft so the banner disappears", () => {
    useCampaignDraftStore.setState({
      formData: DEFAULT_CAMPAIGN_FORM_DATA,
      activeStep: "interview",
      completedSteps: [],
      skippedSteps: [],
      lastUpdatedAt: new Date().toISOString(),
    });

    const { rerender } = renderBanner();
    screen.getByRole("button", { name: /Discard/i }).click();

    rerender(
      <MemoryRouter>
        <CampaignDraftBanner />
      </MemoryRouter>
    );

    expect(screen.queryByRole("button", { name: /Resume/i })).not.toBeInTheDocument();
    expect(useCampaignDraftStore.getState().lastUpdatedAt).toBeNull();
  });
});
