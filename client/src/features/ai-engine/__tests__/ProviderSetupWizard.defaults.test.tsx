/**
 * Connecting a provider writes a text default only when the customer
 * switches "Default for text generation" on (2026-10-02). The toggle used
 * to start on for every new connection, so finishing the wizard saved an
 * explicit default nobody chose, which outranked the best connected
 * provider (specs/byok-ai-guidance.md §9). The image toggle is unchanged.
 *
 * The real wizard runs; only the key save, pulse, model catalog and the
 * settings write (the network edges) are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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
      text: [{ id: "gpt-5.6-sol", name: "GPT-5.6 Sol", provider: "openai", recommended: true }],
      image: [{ id: "gpt-image-1-mini", name: "GPT Image 1 Mini", provider: "openai" }],
      defaults: { openai: { text: "gpt-5.6-sol", image: "gpt-image-1-mini" } },
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

const connectAndReachModels = () => {
  render(
    <ProviderSetupWizard
      open
      onClose={vi.fn()}
      providerId="openai"
      providerName="OpenAI"
      description="desc"
      capabilities={["text", "image"]}
      keyUrl="https://platform.openai.com/api-keys"
      keyPrefix="sk-"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Get Started/ }));
  fireEvent.change(screen.getByLabelText(/API Key/), { target: { value: "sk-proj-valid-key" } });
  fireEvent.click(screen.getByRole("button", { name: /Save & Test/ }));
  fireEvent.click(screen.getByRole("button", { name: /Configure/ }));
};

const savedDefaults = () => updateMutate.mock.calls[0]?.[0]?.ai?.defaults ?? {};

describe("<ProviderSetupWizard> default provider toggles on a new connection", () => {
  it("Finish without touching the text toggle writes no text default", () => {
    connectAndReachModels();
    fireEvent.click(screen.getByRole("button", { name: /Finish Setup/ }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(savedDefaults()).not.toHaveProperty("text_provider");
    expect(savedDefaults().image_provider).toBe("openai");
  });

  it("switching the text toggle on writes the text default", () => {
    connectAndReachModels();
    fireEvent.click(screen.getByLabelText("Default for text generation"));
    fireEvent.click(screen.getByRole("button", { name: /Finish Setup/ }));

    expect(savedDefaults().text_provider).toBe("openai");
  });
});
