/**
 * `<CampaignAiEngineSection>` after the owner decision of 2026-11-25
 * (specs/byok-ai-guidance.md §2.2): no plan picks a model or a tier, and none
 * sees one named. Each row keeps its provider and fallback controls; the
 * read-only "Model" cell that replaced the Top / Standard dropdown that
 * morning went the same day, and nothing a change here writes carries a
 * model or a tier. Managed (Cloud) plans show no row.
 *
 * The component runs for real; the data edges (license, providers,
 * settings, served catalog, form context) are mocked. The catalog answers,
 * so a section that read it again would have names to show.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

const useLicenseMock = vi.hoisted(() => vi.fn());
const useDefaultProvidersMock = vi.hoisted(() => vi.fn());
const useAiSettingsQueryMock = vi.hoisted(() => vi.fn());
const useCampaignFormMock = vi.hoisted(() => vi.fn());

const connectedMock = vi.hoisted(() => ({ text: ["gemini", "openai"] as string[] }));
vi.mock("@/features/settings", () => ({
  useLicense: useLicenseMock,
  useDefaultProviders: useDefaultProvidersMock,
  // The provider advice reads the site's connected text providers.
  useAiConnections: () => ({ textProviders: connectedMock.text }),
}));
vi.mock("@/features/ai-engine", () => ({
  useAiSettingsQuery: useAiSettingsQueryMock,
}));
// The served catalog the plugin relays: one text and one image model per provider.
vi.mock("@/features/ai-engine/api/useAvailableModelsQuery", () => ({
  useAvailableModelsQuery: () => ({
    data: {
      text: [
        { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", provider: "gemini" },
        { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", provider: "openai" },
        { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", provider: "anthropic" },
      ],
      image: [
        { id: "gemini-3.1-flash-image", name: "Gemini 3.1 Flash Image", provider: "gemini" },
        { id: "gpt-image-2.6-flare", name: "GPT Image 2.6 Flare", provider: "openai" },
      ],
      defaults: {
        gemini: { text: "gemini-3.8-flash", fast: "", image: "gemini-3.1-flash-image" },
        openai: { text: "gpt-5.6-sol", fast: "", image: "gpt-image-2.6-flare" },
        anthropic: { text: "claude-sonnet-5-5", fast: "", image: "" },
      },
    },
  }),
}));
vi.mock("@/features/campaigns/context/CampaignContext", () => ({
  useCampaignForm: useCampaignFormMock,
}));

import { CampaignAiEngineSection } from "../components/CampaignAiEngineSection";
import { MODEL_NAME } from "@/test/modelNames";

function setup(opts: { isCloud?: boolean; imageProvider?: "gemini" | "openai" } = {}) {
  const { isCloud = false, imageProvider = "gemini" } = opts;
  const updateForm = vi.fn();

  useLicenseMock.mockReturnValue({
    isLicensed: true,
    plan: isCloud ? "cloud" : "byok",
    isPaidLicense: true,
  });
  useDefaultProvidersMock.mockReturnValue({ isCloud });
  useAiSettingsQueryMock.mockReturnValue({
    data: {
      providers: {
        gemini: { connected: true, capabilities: ["text", "image"] },
        openai: { connected: true, capabilities: ["text", "image"] },
      },
    },
  });
  useCampaignFormMock.mockReturnValue({
    formData: {
      intelligence: {
        textProvider: "gemini",
        imageProvider,
        fallbackTextProvider: null,
        fallbackImageProvider: null,
      },
      schedule: { pregenerationEnabled: true },
      structure: { featuredImage: true, bodyImages: false },
    },
    updateForm,
  });

  const { container } = render(
    <CampaignAiEngineSection
      availableTextProviders={["gemini", "openai"]}
      availableImageProviders={["gemini", "openai"]}
    />,
  );

  return { updateForm, container };
}

describe("<CampaignAiEngineSection> no model choice and no model name (2026-11-25)", () => {
  it("own-key: provider and fallback per row, no model cell and no model name", () => {
    const { container } = setup({ imageProvider: "openai" });

    expect(screen.getAllByText("Provider")).toHaveLength(2);
    expect(screen.getAllByText("Fallback")).toHaveLength(2);
    expect(screen.queryByText("Model")).toBeNull();
    expect(container.textContent).not.toMatch(MODEL_NAME);
    expect(screen.queryByRole("button", { name: /^(Top|Standard) \(/ })).toBeNull();
    expect(screen.queryByText(/Select model/)).toBeNull();
  });

  it("changing the provider writes the provider only, never a model or a tier", () => {
    const { updateForm } = setup();

    fireEvent.click(screen.getAllByRole("button", { name: /^Gemini/ })[0]);
    fireEvent.click(within(screen.getByRole("listbox")).getByText("OpenAI"));

    expect(updateForm).toHaveBeenCalledWith("intelligence", { textProvider: "openai" });
  });

  it("managed (Cloud): no model name at all", () => {
    const { container } = setup({ isCloud: true });
    expect(container.textContent).not.toMatch(MODEL_NAME);
  });
});

describe("<CampaignAiEngineSection> text provider row by plan (2026-10-01)", () => {
  // Managed plans write with one lineup chosen by Structura: no text
  // provider or text fallback picker (specs/managed-ai-lineup.md §3.3).
  // Flipped 2026-10-06: the image row goes too; Structura binds one image
  // model on managed plans, so no image provider, model or fallback.
  it("managed: renders no text row and no image row", () => {
    setup({ isCloud: true });
    expect(screen.queryByText("Text")).not.toBeInTheDocument();
    expect(screen.queryByText("Image")).not.toBeInTheDocument();
    expect(screen.queryByText("Provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Model")).not.toBeInTheDocument();
    expect(screen.queryByText("Fallback")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(Gemini|OpenAI)/ })).not.toBeInTheDocument();
  });

  it("BYOK: renders both the text and the image row", () => {
    setup({ isCloud: false });
    expect(screen.getByText("Text")).toBeInTheDocument();
    expect(screen.getByText("Image")).toBeInTheDocument();
    expect(screen.getAllByText("Provider")).toHaveLength(2);
  });
});

// ─── AI guidance: labels and advice (2026-10-02) ─────────────────────────────
//
// specs/byok-ai-guidance.md §5 (wp-admin): text provider options best first,
// "Recommended" on the recommended provider (option and closed trigger); none
// on the image row or the fallback. The provider advice sits after the text
// provider and before the text fallback (after the text model until that
// cell went on 2026-11-25), Switch sets the provider (no tier since
// 2026-11-25), × writes `aiAdvice.hidden` through the form.

function setupGuidance(opts: {
  textProvider: "gemini" | "openai" | "anthropic";
  connected: string[];
  fallbackTextProvider?: "gemini" | "openai" | "anthropic" | null;
  aiAdvice?: { hidden: { textProvider: "gemini" | "openai" | "anthropic" } | null };
}) {
  const updateForm = vi.fn();
  connectedMock.text = opts.connected;
  useLicenseMock.mockReturnValue({ isLicensed: true, plan: "byok", isPaidLicense: true });
  useDefaultProvidersMock.mockReturnValue({ isCloud: false });
  useAiSettingsQueryMock.mockReturnValue({ data: { providers: {} } });
  useCampaignFormMock.mockReturnValue({
    formData: {
      intelligence: {
        textProvider: opts.textProvider,
        imageProvider: "gemini",
        fallbackTextProvider: opts.fallbackTextProvider ?? null,
        fallbackImageProvider: null,
      },
      schedule: { pregenerationEnabled: true },
      structure: { featuredImage: true, bodyImages: false },
      ...(opts.aiAdvice ? { aiAdvice: opts.aiAdvice } : {}),
    },
    updateForm,
  });

  render(
    <CampaignAiEngineSection
      availableTextProviders={["gemini", "openai", "anthropic"]}
      availableImageProviders={["gemini", "openai"]}
    />,
  );
  return { updateForm };
}

describe("<CampaignAiEngineSection> AI guidance labels (2026-10-02)", () => {
  it("orders text providers best first and labels Anthropic in the list and the closed trigger", () => {
    setupGuidance({ textProvider: "anthropic", connected: ["anthropic", "openai", "gemini"] });

    const trigger = screen.getByRole("button", { name: /^Claude/ });
    expect(within(trigger).getByText("Recommended")).toBeInTheDocument();

    fireEvent.click(trigger);
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Claude Recommended", "OpenAI", "Gemini"]);
  });

  it("puts no label on the image row or the fallback select", () => {
    setupGuidance({ textProvider: "anthropic", connected: ["anthropic", "openai", "gemini"] });

    // One chip only: the closed Anthropic trigger.
    expect(screen.getAllByText("Recommended")).toHaveLength(1);

    // Text fallback options carry no chip.
    fireEvent.click(screen.getAllByRole("button", { name: /None/ })[0]);
    expect(within(screen.getByRole("listbox")).queryByText("Recommended")).toBeNull();
  });
});

describe("<CampaignAiEngineSection> provider advice (2026-10-02)", () => {
  it("shows the advice for Gemini text between the provider and the fallback", () => {
    setupGuidance({ textProvider: "gemini", connected: ["gemini", "openai"] });

    const advice = screen.getByText("Gemini isn’t recommended for writing.");
    const fallbackLabel = screen.getAllByText("Fallback")[0];
    const providerLabel = screen.getAllByText("Provider")[0];
    // DOM order: provider → advice → fallback.
    expect(providerLabel.compareDocumentPosition(advice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(advice.compareDocumentPosition(fallbackLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Switch sets the provider and clears an equal fallback, with no model or tier", () => {
    const { updateForm } = setupGuidance({
      textProvider: "gemini",
      connected: ["gemini", "openai"],
      fallbackTextProvider: "openai",
    });

    fireEvent.click(screen.getByRole("button", { name: "Switch to OpenAI" }));
    expect(updateForm).toHaveBeenCalledWith("intelligence", {
      textProvider: "openai",
      fallbackTextProvider: null,
    });
  });

  it("× writes aiAdvice.hidden for the current provider, marked to save", () => {
    const { updateForm } = setupGuidance({ textProvider: "gemini", connected: ["gemini", "openai"] });

    fireEvent.click(screen.getByRole("button", { name: "Hide this advice for this campaign" }));
    expect(updateForm).toHaveBeenCalledWith("aiAdvice", {
      hidden: { textProvider: "gemini" },
      dirty: true,
    });
  });

  it("a campaign hidden for Gemini opens collapsed; Show advice marks it to save", () => {
    const { updateForm } = setupGuidance({
      textProvider: "gemini",
      connected: ["gemini", "openai"],
      aiAdvice: { hidden: { textProvider: "gemini" } },
    });

    expect(screen.queryByRole("button", { name: "Switch to OpenAI" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show advice" }));
    expect(updateForm).toHaveBeenCalledWith("aiAdvice", { hidden: null, dirty: true });
  });

  it("an old campaign without aiAdvice (older cloud or plugin) shows the advice open", () => {
    setupGuidance({ textProvider: "gemini", connected: ["gemini", "openai"] });
    expect(screen.getByRole("button", { name: "Switch to OpenAI" })).toBeInTheDocument();
  });

  it("managed plans see no advice and no labels", () => {
    setup({ isCloud: true });
    expect(screen.queryByText("Gemini isn’t recommended for writing.")).toBeNull();
    expect(screen.queryByText("Recommended")).toBeNull();
  });
});

describe("<CampaignAiEngineSection> fallback controls on managed plans (2026-10-02)", () => {
  // Managed plans: every provider, model and fallback control and the
  // fallback footnote go (image provider too since 2026-10-06); stored
  // values are left untouched.
  const FOOTNOTE = /we'll retry once through the fallback/;

  it("managed: no image provider or fallback, no footnote, stored image fields not cleared", () => {
    const updateForm = vi.fn();
    connectedMock.text = [];
    useLicenseMock.mockReturnValue({ isLicensed: true, plan: "cloud", isPaidLicense: true });
    useDefaultProvidersMock.mockReturnValue({ isCloud: true });
    useAiSettingsQueryMock.mockReturnValue({ data: { providers: {} } });
    useCampaignFormMock.mockReturnValue({
      formData: {
        intelligence: {
          textProvider: "gemini",
          imageProvider: "gemini",
          fallbackTextProvider: null,
          fallbackImageProvider: "openai",
        },
        schedule: { pregenerationEnabled: true },
        structure: { featuredImage: true, bodyImages: false },
      },
      updateForm,
    });
    render(
      <CampaignAiEngineSection
        availableTextProviders={["gemini", "openai", "anthropic"]}
        availableImageProviders={["gemini", "openai"]}
      />,
    );

    expect(screen.queryByText("Image")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Gemini/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Fallback")).not.toBeInTheDocument();
    expect(screen.queryByText(FOOTNOTE)).not.toBeInTheDocument();
    expect(updateForm).not.toHaveBeenCalled();
  });

  it("BYOK keeps both fallback controls and the footnote", () => {
    setup({});
    expect(screen.getAllByText("Fallback")).toHaveLength(2);
    expect(screen.getByText(FOOTNOTE)).toBeInTheDocument();
  });
});
