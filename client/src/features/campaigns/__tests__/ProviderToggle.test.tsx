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

function renderToggle(
  props: Partial<React.ComponentProps<typeof ProviderToggle>> = {},
  { isCloud = false }: { isCloud?: boolean } = {},
) {
  useLicenseMock.mockReturnValue({
    isLicensed: true,
    plan: isCloud ? "cloud" : "byok",
    isPaidLicense: true,
  });
  useDefaultProvidersMock.mockReturnValue({ isProviderIncomplete: () => false, isCloud });

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

describe("<ProviderToggle> text provider section by plan (2026-10-01)", () => {
  // Managed plans never pick or see a text provider; the image provider
  // choice stays (specs/managed-ai-lineup.md §3.3).
  it("managed: no text provider section, image provider buttons stay", () => {
    renderToggle({ showTierSelectors: false }, { isCloud: true });
    expect(screen.queryByText("Text Provider")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Claude|Anthropic/i })).not.toBeInTheDocument();
    expect(screen.getByText("Image Provider")).toBeInTheDocument();
    // Image row: one button per image provider.
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("BYOK: text and image provider sections both render", () => {
    renderToggle({ showTierSelectors: false });
    expect(screen.getByText("Text Provider")).toBeInTheDocument();
    expect(screen.getByText("Image Provider")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });
});

describe("<ProviderToggle> AI guidance labels (2026-10-02)", () => {
  // specs/byok-ai-guidance.md §5 (wp-admin). The text provider control here
  // is a button group, not a select: buttons are ordered best first and the
  // recommended provider's button carries the "Recommended" chip after its
  // name (part of the button's accessible name). Image buttons carry none.
  it("orders text buttons best first and labels the recommended provider", () => {
    renderToggle({
      showTierSelectors: false,
      availableTextProviders: ["gemini", "openai", "anthropic"],
      availableImageProviders: ["gemini", "openai"],
    });

    const textButtons = Array.from(document.querySelectorAll<HTMLElement>("[data-text-provider]"));
    expect(textButtons.map((b) => b.dataset.textProvider)).toEqual(["anthropic", "openai", "gemini"]);
    expect(within(textButtons[0]).getByText("Recommended")).toBeInTheDocument();
    expect(screen.getAllByText("Recommended")).toHaveLength(1);
  });

  it("puts no chip on a disabled (incomplete) recommended provider", () => {
    useLicenseMock.mockReturnValue({ isLicensed: true, plan: "byok", isPaidLicense: true });
    useDefaultProvidersMock.mockReturnValue({
      isProviderIncomplete: (p: string) => p === "anthropic",
      isCloud: false,
    });
    render(
      <ProviderToggle
        textProvider="openai"
        imageProvider="openai"
        onTextProviderChange={vi.fn()}
        onImageProviderChange={vi.fn()}
        availableTextProviders={["openai", "anthropic"]}
        availableImageProviders={["openai"]}
      />,
    );
    expect(screen.queryByText("Recommended")).toBeNull();
  });

  it("labels the recommended text tier option, not the image tier options", () => {
    renderToggle({ textProvider: "openai", imageProvider: "openai" });

    const OPENAI_MID = getRegistryModel("openai", "text", "mid")!.name;
    const OPENAI_TOP = getRegistryModel("openai", "text", "top")!.name;
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`Top \\(${OPENAI_TOP}\\)`) }));
    const list = screen.getByRole("listbox");
    expect(
      within(list).getByRole("option", { name: new RegExp(`Standard \\(${OPENAI_MID}\\).*Recommended`) }),
    ).toBeInTheDocument();
    fireEvent.keyDown(list, { key: "Escape" });

    const imageTop = getRegistryModel("openai", "image", "top")!.name;
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`Top \\(${imageTop}\\)`) }));
    expect(within(screen.getByRole("listbox")).queryByText("Recommended")).toBeNull();
  });
});

describe("<ProviderToggle> with no provider connected (2026-10-02)", () => {
  // Pickers describe a provider the customer has: with no key behind a
  // capability there is no row and no model picker for it.
  it("renders nothing when no text or image provider is connected", () => {
    const { container } = render(
      <ProviderToggleNoKeys availableTextProviders={[]} availableImageProviders={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("no text row or text model picker without a text provider; the image row stays", () => {
    render(<ProviderToggleNoKeys availableTextProviders={[]} availableImageProviders={["openai"]} />);
    expect(screen.queryByText("Text Provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Text Model")).not.toBeInTheDocument();
    expect(screen.getByText("Image Provider")).toBeInTheDocument();
    expect(screen.getByText("Image Model")).toBeInTheDocument();
  });
});

describe("<ProviderToggle> with one provider connected (2026-10-02)", () => {
  // With a single provider there is nothing to choose: the heading row shows
  // its name as plain text instead of standing empty. Two or more keep the
  // buttons.
  it("shows the single text and image provider by name, with no buttons", () => {
    render(<ProviderToggleNoKeys availableTextProviders={["gemini"]} availableImageProviders={["openai"]} />);
    const textRow = screen.getByText("Text Provider").parentElement!;
    const imageRow = screen.getByText("Image Provider").parentElement!;
    expect(within(textRow).getByText("Gemini")).toBeInTheDocument();
    expect(within(imageRow).getByText("OpenAI")).toBeInTheDocument();
    expect(document.querySelector("[data-text-provider]")).toBeNull();
  });

  it("keeps the buttons and no name text with two providers", () => {
    render(
      <ProviderToggleNoKeys
        availableTextProviders={["gemini", "openai"]}
        availableImageProviders={["gemini", "openai"]}
      />,
    );
    const textRow = screen.getByText("Text Provider").parentElement!;
    expect(within(textRow).queryByText("Gemini")).toBeNull();
    expect(document.querySelectorAll("[data-text-provider]")).toHaveLength(2);
  });
});

function ProviderToggleNoKeys(props: {
  availableTextProviders: string[];
  availableImageProviders: string[];
}) {
  useLicenseMock.mockReturnValue({ isLicensed: true, plan: "byok", isPaidLicense: true });
  useDefaultProvidersMock.mockReturnValue({ isProviderIncomplete: () => false, isCloud: false });
  return (
    <ProviderToggle
      textProvider="gemini"
      imageProvider="openai"
      onTextProviderChange={vi.fn()}
      onImageProviderChange={vi.fn()}
      showTierSelectors
      textTier="mid"
      imageTier="mid"
      onTextTierChange={vi.fn()}
      onImageTierChange={vi.fn()}
      {...props}
    />
  );
}
