/**
 * Tests for the model-quality TIER picker in `<ProviderToggle>`.
 *
 * ProviderToggle is the shared provider + model chooser used by the campaign
 * create steps (StepObjective / SimpleStepStrategy / CreateCampaignPage) and the
 * one-off "Generate a Post" flow. A user never sees a raw model list: the only
 * model choice is a top/mid quality TIER, labeled with the resolved model name.
 * Managed plans (consumer passes `showTierSelectors={false}`) show no tier at all.
 *
 * REAL test: runs against the REAL `@structura/model-catalog` registry (NOT
 * mocked), so the option labels + fired tier are exactly what production uses.
 * Only the license / provider-config edges are mocked.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import { getRegistryModel } from "@structura/model-catalog";

const useLicenseMock = vi.hoisted(() => vi.fn());
const useDefaultProvidersMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/settings", () => ({
  useLicense: useLicenseMock,
  useDefaultProviders: useDefaultProvidersMock,
}));

import { ProviderToggle } from "../components/ProviderToggle";

// Real registry labels — the test breaks loudly if a model is retired/renamed.
const GEMINI_TEXT_TOP = getRegistryModel("gemini", "text", "top")!.name; // "Gemini 3.1 Pro"
const GEMINI_TEXT_MID = getRegistryModel("gemini", "text", "mid")!.name; // "Gemini 3.5 Flash"

function renderToggle(props: Partial<React.ComponentProps<typeof ProviderToggle>> = {}) {
  useLicenseMock.mockReturnValue({ isLicensed: true, plan: "byok", isPaidLicense: true });
  useDefaultProvidersMock.mockReturnValue({ isProviderIncomplete: () => false });

  const onTextTierChange = vi.fn();
  const onImageTierChange = vi.fn();

  render(
    <ProviderToggle
      textProvider="gemini"
      imageProvider="gemini"
      onTextProviderChange={vi.fn()}
      onImageProviderChange={vi.fn()}
      availableTextProviders={["gemini", "openai"]}
      availableImageProviders={["gemini", "openai"]}
      showTierSelectors
      textTier="top"
      imageTier="top"
      onTextTierChange={onTextTierChange}
      onImageTierChange={onImageTierChange}
      {...props}
    />,
  );

  return { onTextTierChange, onImageTierChange };
}

describe("<ProviderToggle> model tier picker", () => {
  it("labels the tier with the real model name (BYOK)", () => {
    renderToggle();
    expect(
      screen.getByRole("button", { name: new RegExp(`Top \\(${GEMINI_TEXT_TOP}\\)`) }),
    ).toBeInTheDocument();
  });

  it("fires onTextTierChange('mid') when Standard is picked", () => {
    const { onTextTierChange } = renderToggle();

    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`Top \\(${GEMINI_TEXT_TOP}\\)`) }),
    );
    const listbox = screen.getByRole("listbox");
    fireEvent.click(within(listbox).getByText(new RegExp(`Standard \\(${GEMINI_TEXT_MID}\\)`)));

    expect(onTextTierChange).toHaveBeenCalledWith("mid");
  });

  it("renders NO tier selector when showTierSelectors is false (managed)", () => {
    renderToggle({ showTierSelectors: false });
    expect(
      screen.queryByRole("button", { name: new RegExp(`\\(${GEMINI_TEXT_TOP}\\)`) }),
    ).not.toBeInTheDocument();
  });
});
