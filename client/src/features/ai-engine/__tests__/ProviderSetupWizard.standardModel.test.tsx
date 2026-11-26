/**
 * The provider wizard's configure step after the owner decision of
 * 2026-11-25 (specs/byok-ai-guidance.md §2.2): no customer picks a model or
 * a tier, and none sees one named. The "Use recommended model" switch and
 * the model dropdowns went that morning; the read-only Text Model / Image
 * Model names that replaced them went the same day. Finish saves only the
 * default provider choices. The wizard renders only on own-key plans (the
 * AI Engine page sends managed plans away, onboarding skips the step, and
 * the provider advice is never shown on Cloud).
 *
 * The real wizard runs; only the key save, key test, pulse, served model
 * list and the settings write (network edges) are mocked. The served list
 * answers, so a step that read names from it again would show them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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
vi.mock("../api/useTestKey", () => ({
  useTestKey: () => ({
    mutateAsync: () => Promise.resolve({ ok: true, latencyMs: 120 }),
    isPending: false,
  }),
}));
vi.mock("../api/useProviderPulse", () => ({
  useProviderPulse: () => ({ isOnline: true, latency: 120, isChecking: false, checkPulse: vi.fn() }),
}));
// The served shape since 2026-11-25: one text and one image model per provider.
vi.mock("../api/useAvailableModelsQuery", () => ({
  useAvailableModelsQuery: () => ({
    data: {
      text: [
        { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", provider: "openai", recommended: true },
        { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", provider: "gemini" },
        { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", provider: "anthropic", recommended: true },
      ],
      image: [
        { id: "gpt-image-2.6-flare", name: "GPT Image 2.6 Flare", provider: "openai" },
        { id: "gemini-3.1-flash-image", name: "Gemini 3.1 Flash Image", provider: "gemini", recommended: true },
      ],
      defaults: {
        openai: { text: "gpt-5.6-sol", fast: "gpt-5.4-mini", image: "gpt-image-2.6-flare" },
        gemini: { text: "gemini-3.8-flash", fast: "gemini-3.5-flash", image: "gemini-3.1-flash-image" },
        anthropic: { text: "claude-sonnet-5-5", fast: "claude-haiku-4-5-20251001", image: "" },
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
import { MODEL_NAME } from "@/test/modelNames";

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
const connectAndConfigure = async (props: Props = {}) => {
  renderWizard(props);
  fireEvent.click(screen.getByRole("button", { name: /Get Started/ }));
  fireEvent.change(screen.getByLabelText(/API Key/), { target: { value: "sk-proj-valid-key" } });
  fireEvent.click(screen.getByRole("button", { name: /Save & Test/ }));
  // The key is live-tested before it is saved, so the step changes async.
  fireEvent.click(await screen.findByRole("button", { name: /Configure/ }));
};

const dialogText = () => screen.getByRole("dialog").textContent ?? "";
const savedAi = () => updateMutate.mock.calls[0]?.[0]?.ai ?? {};
const finish = () =>
  fireEvent.click(screen.getByRole("button", { name: /Finish Setup|Save Changes/ }));

describe("<ProviderSetupWizard> configure step: no model choice and no model name (2026-11-25)", () => {
  it("names no model, with no model heading, switch or dropdown", async () => {
    await connectAndConfigure();

    expect(screen.getByText("Configure provider")).toBeInTheDocument();
    expect(screen.queryByText("Text Model")).toBeNull();
    expect(screen.queryByText("Image Model")).toBeNull();
    expect(screen.queryByText(/models this provider runs/)).toBeNull();
    expect(dialogText()).not.toMatch(MODEL_NAME);

    expect(screen.queryByRole("switch", { name: "Use recommended model" })).toBeNull();
    expect(screen.queryByText("Use recommended model")).toBeNull();
    expect(screen.queryByText(/Pick models/)).toBeNull();
  });

  it("the default-provider switches still work and Finish saves only them", async () => {
    await connectAndConfigure();
    fireEvent.click(screen.getByRole("switch", { name: "Default for text generation" }));
    finish();

    const ai = savedAi();
    expect(ai.defaults).toEqual({ text_provider: "openai", image_provider: "openai" });
    expect(ai).not.toHaveProperty("openai");
    expect(JSON.stringify(ai)).not.toMatch(/_model|_tier/);
  });

  it("re-opening a connected provider saves only the default-provider choices", () => {
    renderWizard({ isConnected: true, isDefaultText: true, isDefaultImage: true });

    expect(dialogText()).not.toMatch(MODEL_NAME);
    fireEvent.click(screen.getByRole("switch", { name: "Default for text generation" }));
    finish();

    expect(savedAi()).toEqual({ defaults: { text_provider: "", image_provider: "openai" } });
  });

  it("Anthropic: the text default only, and no model name", async () => {
    await connectAndConfigure({ providerId: "anthropic", capabilities: ["text"] });

    expect(screen.getByRole("switch", { name: "Default for text generation" })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Default for image generation" })).toBeNull();
    expect(dialogText()).not.toMatch(MODEL_NAME);
  });

  it("anonymous: the step says images are not available and names no model", async () => {
    await connectAndConfigure({ imagesAvailable: false });

    expect(
      screen.getByText("Image generation is not available on your current plan.")
    ).toBeInTheDocument();
    expect(dialogText()).not.toMatch(MODEL_NAME);
    expect(screen.queryByLabelText("Default for image generation")).toBeNull();
    finish();

    expect(savedAi().defaults ?? {}).not.toHaveProperty("image_provider");
  });

  it("the connection step no longer promises a model choice", async () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /Get Started/ }));
    fireEvent.change(screen.getByLabelText(/API Key/), { target: { value: "sk-proj-valid-key" } });
    fireEvent.click(screen.getByRole("button", { name: /Save & Test/ }));
    await screen.findByRole("button", { name: /Configure/ });

    expect(screen.queryByText(/choose your preferred models/)).toBeNull();
  });

  it("the overview lists Image Generation for OpenAI on every plan, anonymous included", () => {
    renderWizard({ imagesAvailable: false });
    expect(screen.getByText("Image Generation")).toBeInTheDocument();
    expect(screen.getByText("Text Generation")).toBeInTheDocument();
  });
});
