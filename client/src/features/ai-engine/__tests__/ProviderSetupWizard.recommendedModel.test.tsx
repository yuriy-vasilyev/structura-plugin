/**
 * The provider wizard's "Use recommended model" switch (owner review
 * 2026-10-06, specs/open-providers.md).
 *
 * The configure step hides the model dropdowns behind a switch that is on
 * by default. On, the wizard saves the provider's recommended TIER with the
 * model it maps to today (`text_tier` + `text_model`), so the site default
 * follows the catalog when that tier's model moves. Off reveals the
 * dropdown and saves the picked model with an empty tier. Anonymous sites
 * see that images are not available on their plan instead of an image
 * dropdown. Gemini has no recommended text model, so its text switch
 * carries no "Recommended" chip.
 *
 * The real wizard and the real bundled catalog run; only the key save,
 * pulse, served model list and the settings write (network edges) are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  _x: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%[sd]/g, () => String(args[i++]));
  },
}));

const { updateMutate } = vi.hoisted(() => ({ updateMutate: vi.fn() }));
vi.mock("../api/useSaveKey", () => ({
  useSaveKey: () => ({
    mutate: (_vars: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.(),
    isPending: false,
  }),
}));
vi.mock("../api/useProviderPulse", () => ({
  useProviderPulse: () => ({ isOnline: true, latency: 120, isChecking: false, checkPulse: vi.fn() }),
}));
vi.mock("../api/useAvailableModelsQuery", () => ({
  useAvailableModelsQuery: () => ({
    data: {
      text: [
        { id: "gpt-6-astra", name: "GPT-6 Astra", provider: "openai" },
        { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", provider: "openai", recommended: true },
        { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", provider: "gemini" },
        { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", provider: "gemini" },
        { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", provider: "anthropic", recommended: true },
      ],
      image: [
        { id: "gpt-image-2", name: "GPT Image 2", provider: "openai", recommended: true },
        { id: "gpt-image-1-mini", name: "GPT Image 1 Mini", provider: "openai" },
        { id: "gemini-3.1-flash-image", name: "Gemini Flash Image", provider: "gemini", recommended: true },
      ],
      defaults: {
        openai: { text: "gpt-5.6-sol", image: "gpt-image-1-mini" },
        gemini: { text: "gemini-3.8-flash", image: "gemini-3.1-flash-image" },
        anthropic: { text: "claude-sonnet-5-5" },
      },
    },
  }),
}));
vi.mock("../api/useRefreshModels", () => ({
  useRefreshModels: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../api/useUpdateAiSettings", () => ({
  useUpdateAiSettings: () => ({ mutate: updateMutate, isPending: false }),
}));

import { ProviderSetupWizard } from "../components/ProviderSetupWizard";

beforeEach(() => updateMutate.mockReset());

type Props = Partial<React.ComponentProps<typeof ProviderSetupWizard>>;

const NAMES: Record<string, string> = { openai: "OpenAI", gemini: "Google Gemini", anthropic: "Anthropic Claude" };

const renderWizard = (props: Props = {}) =>
  render(
    <ProviderSetupWizard
      open
      onClose={vi.fn()}
      providerId="openai"
      providerName={NAMES[props.providerId ?? "openai"]}
      description="Text and images"
      capabilities={["text", "image"]}
      keyUrl="https://example.test/keys"
      {...props}
    />
  );

/** Connect a new key and reach the configure step. */
const connectAndConfigure = (props: Props = {}) => {
  renderWizard(props);
  fireEvent.click(screen.getByRole("button", { name: /Get Started/ }));
  fireEvent.change(screen.getByLabelText(/API Key/), { target: { value: "sk-proj-valid-key" } });
  fireEvent.click(screen.getByRole("button", { name: /Save & Test/ }));
  fireEvent.click(screen.getByRole("button", { name: /Configure/ }));
};

const section = (name: "text" | "image") => screen.getByTestId(`wizard-${name}-model`);
const recommendedSwitch = (name: "text" | "image") =>
  within(section(name)).getByRole("switch", { name: "Use recommended model" });
const saved = () => updateMutate.mock.calls[0]?.[0]?.ai ?? {};
const finish = () =>
  fireEvent.click(screen.getByRole("button", { name: /Finish Setup|Save Changes/ }));

describe("<ProviderSetupWizard> Use recommended model", () => {
  it("is on by default for a new connection and hides both dropdowns", () => {
    connectAndConfigure();

    expect(recommendedSwitch("text")).toHaveAttribute("aria-checked", "true");
    expect(recommendedSwitch("image")).toHaveAttribute("aria-checked", "true");
    expect(within(section("text")).queryByRole("button", { name: /GPT|Select model/ })).toBeNull();
    expect(within(section("image")).queryByRole("button", { name: /GPT|Select model/ })).toBeNull();
    expect(within(section("text")).getByText("Recommended")).toBeInTheDocument();
    expect(
      screen.getByText(
        "We review new models regularly and move the recommendation when a better one proves itself. We suggest leaving this choice with us."
      )
    ).toBeInTheDocument();
  });

  it("saves the recommended tiers with the models they map to today", () => {
    connectAndConfigure();
    finish();

    expect(saved().openai).toEqual({
      text_model: "gpt-5.6-sol",
      text_tier: "mid",
      image_model: "gpt-image-1-mini",
      image_tier: "mid",
    });
  });

  it("switching it off reveals the dropdown and saves the picked model with no tier", () => {
    connectAndConfigure();
    fireEvent.click(recommendedSwitch("text"));

    const trigger = within(section("text")).getByRole("button", { name: /GPT-5.6 Sol/ });
    expect(trigger).toBeInTheDocument();
    finish();

    expect(saved().openai.text_tier).toBe("");
    expect(saved().openai.text_model).toBe("gpt-5.6-sol");
    // The image side stays on the recommendation.
    expect(saved().openai.image_tier).toBe("mid");
  });

  it("a connected site that picked a model opens with the switch off and keeps it", () => {
    renderWizard({ isConnected: true, currentTextModel: "gpt-6-astra", currentImageModel: "gpt-image-1-mini" });

    expect(recommendedSwitch("text")).toHaveAttribute("aria-checked", "false");
    expect(within(section("text")).getByRole("button", { name: /GPT-6 Astra/ })).toBeInTheDocument();
    // The stored image model IS the recommended one, so its switch is on.
    expect(recommendedSwitch("image")).toHaveAttribute("aria-checked", "true");
    finish();

    expect(saved().openai.text_model).toBe("gpt-6-astra");
    expect(saved().openai.text_tier).toBe("");
  });

  it("a stored tier opens with the switch on", () => {
    renderWizard({
      isConnected: true,
      currentTextModel: "gpt-6-astra",
      currentTextTier: "mid",
      currentImageModel: "gpt-image-1-mini",
    });

    expect(recommendedSwitch("text")).toHaveAttribute("aria-checked", "true");
  });

  it("Gemini: text switch without the Recommended chip, image switch with it", () => {
    connectAndConfigure({ providerId: "gemini" });

    expect(recommendedSwitch("text")).toHaveAttribute("aria-checked", "true");
    expect(within(section("text")).queryByText("Recommended")).toBeNull();
    expect(within(section("image")).getByText("Recommended")).toBeInTheDocument();
    finish();

    expect(saved().gemini).toEqual({
      text_model: "gemini-3.8-flash",
      text_tier: "mid",
      image_model: "gemini-3.1-flash-image",
      image_tier: "mid",
    });
  });

  it("anonymous: the image section says images are not available and saves nothing for images", () => {
    connectAndConfigure({ imagesAvailable: false });

    expect(
      within(section("image")).getByText("Image generation is not available on your current plan.")
    ).toBeInTheDocument();
    expect(within(section("image")).queryByRole("switch")).toBeNull();
    expect(screen.queryByLabelText("Default for image generation")).toBeNull();
    finish();

    expect(saved().openai).toEqual({ text_model: "gpt-5.6-sol", text_tier: "mid" });
    expect(saved().defaults ?? {}).not.toHaveProperty("image_provider");
  });

  it("the overview lists Image Generation for OpenAI on every plan, anonymous included", () => {
    renderWizard({ imagesAvailable: false });
    expect(screen.getByText("Image Generation")).toBeInTheDocument();
    expect(screen.getByText("Text Generation")).toBeInTheDocument();
  });
});
