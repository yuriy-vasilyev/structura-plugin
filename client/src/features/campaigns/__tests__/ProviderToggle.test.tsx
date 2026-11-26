/**
 * `<ProviderToggle>`, the provider chooser of the campaign create inline
 * setup and the one-off "Generate a Post" page, after the owner decision of
 * 2026-11-25 (specs/byok-ai-guidance.md §2.2): no plan picks a model or a
 * tier, and none sees one named. The Top / Standard dropdowns went that
 * morning and the read-only "Engine" names that replaced them went the same
 * day. Managed plans (Cloud) see nothing.
 *
 * The component runs for real; the license, provider and served-catalog
 * edges are mocked (the catalog answers, so a toggle that read it again
 * would have names to show).
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

const useLicenseMock = vi.hoisted(() => vi.fn());
const useDefaultProvidersMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/settings", () => ({
  useLicense: useLicenseMock,
  useDefaultProviders: useDefaultProvidersMock,
}));
// The served catalog the plugin relays: one text and one image model per provider.
vi.mock("@/features/ai-engine/api/useAvailableModelsQuery", () => ({
  useAvailableModelsQuery: () => ({
    data: {
      text: [
        { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", provider: "gemini" },
        { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", provider: "openai" },
      ],
      image: [
        { id: "gemini-3.1-flash-image", name: "Gemini 3.1 Flash Image", provider: "gemini" },
        { id: "gpt-image-2.6-flare", name: "GPT Image 2.6 Flare", provider: "openai" },
      ],
      defaults: {
        gemini: { text: "gemini-3.8-flash", fast: "", image: "gemini-3.1-flash-image" },
        openai: { text: "gpt-5.6-sol", fast: "", image: "gpt-image-2.6-flare" },
      },
    },
  }),
}));

import { ProviderToggle } from "../components/ProviderToggle";
import { MODEL_NAME } from "@/test/modelNames";

function renderToggle(
  props: Partial<React.ComponentProps<typeof ProviderToggle>> = {},
  { isCloud = false }: { isCloud?: boolean } = {},
) {
  useLicenseMock.mockReturnValue({
    isLicensed: true,
    plan: isCloud ? "cloud" : "byok",
    isPaidLicense: true,
  });
  useDefaultProvidersMock.mockReturnValue({ isCloud });

  const onTextProviderChange = vi.fn();
  const onImageProviderChange = vi.fn();

  const { container } = render(
    <ProviderToggle
      textProvider="gemini"
      imageProvider="openai"
      onTextProviderChange={onTextProviderChange}
      onImageProviderChange={onImageProviderChange}
      availableTextProviders={["gemini", "openai"]}
      availableImageProviders={["gemini", "openai"]}
      {...props}
    />,
  );

  return { onTextProviderChange, onImageProviderChange, container };
}

describe("<ProviderToggle> no model choice and no model name (2026-11-25)", () => {
  it("own-key: the provider buttons, and no model label or name", () => {
    const { container } = renderToggle();

    expect(screen.getByText("Text Provider")).toBeInTheDocument();
    expect(screen.getByText("Image Provider")).toBeInTheDocument();
    for (const label of ["Engine", "Text Model", "Image Model"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(container.textContent).not.toMatch(MODEL_NAME);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /^(Top|Standard) \(/ })).toBeNull();
  });

  it("the provider buttons still choose the provider", () => {
    const { onTextProviderChange } = renderToggle();
    fireEvent.click(document.querySelector<HTMLButtonElement>('[data-text-provider="openai"]')!);
    expect(onTextProviderChange).toHaveBeenCalledWith("openai");
  });

  it("managed (Cloud): nothing at all", () => {
    const { container } = renderToggle({}, { isCloud: true });
    expect(container.textContent).not.toMatch(MODEL_NAME);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("<ProviderToggle> text provider section by plan (2026-10-01)", () => {
  // Managed plans never pick or see a text provider (specs/managed-ai-lineup.md
  // §3.3). Flipped 2026-10-06: nor an image provider; Structura binds one
  // image model on managed plans, so the toggle renders nothing.
  it("managed: no text and no image provider section", () => {
    renderToggle({}, { isCloud: true });
    expect(screen.queryByText("Text Provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Image Provider")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("BYOK: text and image provider sections both render", () => {
    renderToggle();
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
      availableTextProviders: ["gemini", "openai", "anthropic"],
      availableImageProviders: ["gemini", "openai"],
    });

    const textButtons = Array.from(document.querySelectorAll<HTMLElement>("[data-text-provider]"));
    expect(textButtons.map((b) => b.dataset.textProvider)).toEqual(["anthropic", "openai", "gemini"]);
    expect(within(textButtons[0]).getByText("Recommended")).toBeInTheDocument();
    expect(screen.getAllByText("Recommended")).toHaveLength(1);
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

  it("no text row without a text provider; the image row stays, with no model name", () => {
    const { container } = render(
      <ProviderToggleNoKeys availableTextProviders={[]} availableImageProviders={["openai"]} />,
    );
    expect(screen.queryByText("Text Provider")).not.toBeInTheDocument();
    expect(screen.getByText("Image Provider")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(MODEL_NAME);
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
  useDefaultProvidersMock.mockReturnValue({ isCloud: false });
  return (
    <ProviderToggle
      textProvider="gemini"
      imageProvider="openai"
      onTextProviderChange={vi.fn()}
      onImageProviderChange={vi.fn()}
      {...props}
    />
  );
}

describe("<ProviderToggle> hideSingleProviderRow (Generate a Post, 2026-10-06)", () => {
  it("renders nothing for one provider per capability", () => {
    const { container } = renderToggle({
      availableTextProviders: ["gemini"],
      availableImageProviders: ["gemini"],
      hideSingleProviderRow: true,
    });
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText("Text Provider")).toBeNull();
    expect(screen.queryByText("Image Provider")).toBeNull();
    expect(screen.queryByText("Engine")).toBeNull();
  });

  // "Model not selected" was the only reason a lone provider kept its row;
  // no model is selected since 2026-11-25, so a connected provider is never
  // incomplete.
  it("never shows a model-not-selected warning", () => {
    renderToggle({
      availableTextProviders: ["gemini"],
      availableImageProviders: [],
      hideSingleProviderRow: true,
    });
    expect(screen.queryByText(/Model not selected/)).toBeNull();
    expect(screen.queryByText("Text Provider")).toBeNull();
  });
});
