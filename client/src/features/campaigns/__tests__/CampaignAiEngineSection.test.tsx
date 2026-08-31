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

vi.mock("@/features/settings", () => ({
  useLicense: useLicenseMock,
  useDefaultProviders: useDefaultProvidersMock,
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
