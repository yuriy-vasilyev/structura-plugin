/**
 * Tests for the BYOK model-TIER picker in `<CampaignAiEngineSection>`.
 *
 * The campaign engine section shows a top/mid quality-TIER dropdown for
 * non-managed (BYOK/free) plans — the tier-based replacement for the old
 * concrete-model dropdown. The campaign stores the tier (`textTier`/`imageTier`)
 * and the cloud resolves the concrete model at generation time; `textModel`/
 * `imageModel` are kept as the concrete mirror for display/back-compat. Managed
 * (Cloud) plans show no selector — the model is owned server-side.
 *
 * These are REAL tests: the component runs against the REAL
 * `@structura/model-catalog` registry (NOT mocked) — so the option labels and
 * the mirrored model id are exactly what production resolves. Only the data
 * edges (license / providers / settings / form context) are mocked.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import { getRegistryModel, getRegistryModelId } from "@structura/model-catalog";

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
vi.mock("@/features/campaigns/context/CampaignContext", () => ({
  useCampaignForm: useCampaignFormMock,
}));

import { CampaignAiEngineSection } from "../components/CampaignAiEngineSection";

// Real registry labels, so the test breaks loudly if a model is retired/renamed.
const GEMINI_TEXT_TOP = getRegistryModel("gemini", "text", "top")!.name; // "Gemini 3.1 Pro"
const GEMINI_TEXT_MID = getRegistryModel("gemini", "text", "mid")!.name; // "Gemini 3.5 Flash"
const GEMINI_IMAGE_TOP = getRegistryModel("gemini", "image", "top")!.name; // "Gemini 3 Pro Image"
const GEMINI_TEXT_MID_ID = getRegistryModelId("gemini", "text", "mid")!; // "gemini-3.5-flash"

function setup(opts: {
  isCloud?: boolean;
  textTier?: "top" | "mid";
  imageTier?: "top" | "mid";
  /**
   * Legacy pre-tier campaign shape: NO `textTier`/`imageTier` on the doc,
   * only the concrete stored models. Overrides `textTier`/`imageTier`.
   */
  legacyModels?: { textModel: string; imageModel: string };
}) {
  const { isCloud = false, textTier = "top", imageTier = "top", legacyModels } = opts;
  const updateForm = vi.fn();

  useLicenseMock.mockReturnValue({
    isLicensed: true,
    plan: isCloud ? "cloud" : "byok",
    isPaidLicense: true,
  });
  useDefaultProvidersMock.mockReturnValue({
    isCloud,
    isProviderIncomplete: () => false,
  });
  useAiSettingsQueryMock.mockReturnValue({ data: { providers: {} } });
  useCampaignFormMock.mockReturnValue({
    formData: {
      intelligence: {
        textProvider: "gemini",
        imageProvider: "gemini",
        textModel: legacyModels?.textModel ?? getRegistryModelId("gemini", "text", textTier),
        imageModel: legacyModels?.imageModel ?? getRegistryModelId("gemini", "image", imageTier),
        ...(legacyModels ? {} : { textTier, imageTier }),
        fallbackTextProvider: null,
        fallbackImageProvider: null,
      },
      schedule: { pregenerationEnabled: true },
      structure: { featuredImage: true, bodyImages: false },
    },
    updateForm,
  });

  render(
    <CampaignAiEngineSection
      availableTextProviders={["gemini", "openai"]}
      availableImageProviders={["gemini", "openai"]}
    />,
  );

  return { updateForm };
}

describe("<CampaignAiEngineSection> model tier picker", () => {
  it("renders top/mid tier options labeled with the real model names (BYOK)", () => {
    setup({ textTier: "top", imageTier: "top" });

    // The trigger button shows the selected tier's label, built from the real
    // registry — "Top (Gemini 3.1 Pro)" for text, "Top (Gemini 3 Pro Image)"
    // for image. This is what proves buildTierOptions is wired to the catalog.
    expect(
      screen.getByRole("button", { name: new RegExp(`Top \\(${GEMINI_TEXT_TOP}\\)`) }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: new RegExp(`Top \\(${GEMINI_IMAGE_TOP}\\)`) }),
    ).toBeInTheDocument();
  });

  it("reflects a stored mid tier in the trigger label", () => {
    setup({ textTier: "mid" });
    expect(
      screen.getByRole("button", { name: new RegExp(`Standard \\(${GEMINI_TEXT_MID}\\)`) }),
    ).toBeInTheDocument();
  });

  it("stores the chosen tier AND mirrors its concrete model", () => {
    const { updateForm } = setup({ textTier: "top" });

    // Open the text tier dropdown and pick Standard (mid).
    const trigger = screen.getByRole("button", {
      name: new RegExp(`Top \\(${GEMINI_TEXT_TOP}\\)`),
    });
    fireEvent.click(trigger);

    const listbox = screen.getByRole("listbox");
    const midOption = within(listbox).getByText(new RegExp(`Standard \\(${GEMINI_TEXT_MID}\\)`));
    fireEvent.click(midOption);

    // Stores the TIER (source of truth) and mirrors the concrete model id
    // resolved from the real registry — not a hardcoded string.
    expect(updateForm).toHaveBeenCalledWith("intelligence", {
      textTier: "mid",
      textModel: GEMINI_TEXT_MID_ID,
    });
  });

  it("legacy tier-less campaign opens on its STORED model's tier, not Top (2026-07-23)", () => {
    // Regression: `intelligence.textTier ?? "top"` rendered "Top (Gemini 3.1
    // Pro)" for a pre-tier campaign whose stored model is the mid Flash — the
    // UI claimed Top while generation kept running Standard, and any save
    // silently migrated the doc to Top.
    setup({
      legacyModels: {
        textModel: getRegistryModelId("gemini", "text", "mid")!,
        imageModel: getRegistryModelId("gemini", "image", "mid")!,
      },
    });

    expect(
      screen.getByRole("button", { name: new RegExp(`Standard \\(${GEMINI_TEXT_MID}\\)`) }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: new RegExp(`Top \\(${GEMINI_TEXT_TOP}\\)`) }),
    ).not.toBeInTheDocument();
  });

  it("legacy campaign with a retired stored model falls back to Standard, not Top", () => {
    // A model id the live-confirmed bump removed from the registry — we can't
    // know its tier, so the picker opens on the cheaper Standard tier.
    setup({
      legacyModels: {
        textModel: "gemini-3-flash-preview",
        imageModel: "gemini-3.1-flash-image-preview",
      },
    });

    expect(
      screen.getByRole("button", { name: new RegExp(`Standard \\(${GEMINI_TEXT_MID}\\)`) }),
    ).toBeInTheDocument();
  });

  it("shows NO tier/model selector on a managed (Cloud) plan", () => {
    setup({ isCloud: true });
    // Managed owns the model server-side — no tier trigger is rendered.
    expect(
      screen.queryByRole("button", { name: new RegExp(`\\(${GEMINI_TEXT_TOP}\\)`) }),
    ).not.toBeInTheDocument();
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
// "Recommended" on the recommended provider (option and closed trigger) and on
// the recommended text tier option (never its closed trigger); none on the
// image row or the fallback. The provider advice sits after the text model and
// before the text fallback, Switch sets provider + recommended tier, × writes
// `aiAdvice.hidden` through the form.

function setupGuidance(opts: {
  textProvider: "gemini" | "openai" | "anthropic";
  textTier?: "top" | "mid";
  connected: string[];
  fallbackTextProvider?: "gemini" | "openai" | "anthropic" | null;
  aiAdvice?: { hidden: { textProvider: "gemini" | "openai" | "anthropic" } | null };
}) {
  const updateForm = vi.fn();
  connectedMock.text = opts.connected;
  useLicenseMock.mockReturnValue({ isLicensed: true, plan: "byok", isPaidLicense: true });
  useDefaultProvidersMock.mockReturnValue({ isCloud: false, isProviderIncomplete: () => false });
  useAiSettingsQueryMock.mockReturnValue({ data: { providers: {} } });
  useCampaignFormMock.mockReturnValue({
    formData: {
      intelligence: {
        textProvider: opts.textProvider,
        imageProvider: "gemini",
        textModel: getRegistryModelId(opts.textProvider, "text", opts.textTier ?? "mid"),
        imageModel: getRegistryModelId("gemini", "image", "mid"),
        textTier: opts.textTier ?? "mid",
        imageTier: "mid",
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

  it("labels the recommended text tier option but never the closed model trigger", () => {
    setupGuidance({ textProvider: "openai", connected: ["openai", "gemini"] });
    const OPENAI_MID = getRegistryModel("openai", "text", "mid")!.name;

    // Closed trigger: the tier name only.
    const tierTrigger = screen.getByRole("button", {
      name: new RegExp(`Standard \\(${OPENAI_MID}\\)`),
    });
    expect(within(tierTrigger).queryByText("Recommended")).toBeNull();
    // OpenAI is not the recommended provider: no chip on its trigger.
    expect(within(screen.getByRole("button", { name: /^OpenAI/ })).queryByText("Recommended")).toBeNull();

    fireEvent.click(tierTrigger);
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByRole("option", { name: /Standard.*Recommended/ })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: /^Top/ }).textContent).not.toContain(
      "Recommended",
    );
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
  it("shows the advice for Gemini text between the model and the fallback", () => {
    setupGuidance({ textProvider: "gemini", connected: ["gemini", "openai"] });

    const advice = screen.getByText("Gemini isn’t recommended for writing.");
    const fallbackLabel = screen.getAllByText("Fallback")[0];
    const modelLabel = screen.getAllByText("Model")[0];
    // DOM order: model → advice → fallback.
    expect(modelLabel.compareDocumentPosition(advice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(advice.compareDocumentPosition(fallbackLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Switch sets provider, recommended tier and model, and clears an equal fallback", () => {
    const { updateForm } = setupGuidance({
      textProvider: "gemini",
      connected: ["gemini", "openai"],
      textTier: "top",
      fallbackTextProvider: "openai",
    });

    fireEvent.click(screen.getByRole("button", { name: "Switch to OpenAI" }));
    expect(updateForm).toHaveBeenCalledWith("intelligence", {
      textProvider: "openai",
      textTier: "mid",
      textModel: getRegistryModelId("openai", "text", "mid"),
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
    useLicenseMock.mockReturnValue({ isLicensed: true, plan: "cloud_pro", isPaidLicense: true });
    useDefaultProvidersMock.mockReturnValue({ isCloud: true, isProviderIncomplete: () => false });
    useAiSettingsQueryMock.mockReturnValue({ data: { providers: {} } });
    useCampaignFormMock.mockReturnValue({
      formData: {
        intelligence: {
          textProvider: "gemini",
          imageProvider: "gemini",
          textModel: "",
          imageModel: "",
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
