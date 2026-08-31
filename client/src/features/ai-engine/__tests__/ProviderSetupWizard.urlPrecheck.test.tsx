/**
 * URL-paste pre-check on the wizard's API key step.
 *
 * Ported from the portal after the 2026-07-18 incident: a fresh signup
 * pasted a URL (not a key) into the masked key field on mobile, got the
 * generic "key was rejected" error, and churned. The key step now
 * refuses URL-shaped input up front — targeted message, Save & Test
 * disabled, no save call — instead of storing a broken key that only
 * fails at the connection test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%[sd]/g, () => String(args[i++]));
  },
}));

const { saveKeyMutate } = vi.hoisted(() => ({ saveKeyMutate: vi.fn() }));
vi.mock("../api/useSaveKey", () => ({
  useSaveKey: () => ({ mutate: saveKeyMutate, isPending: false }),
}));
vi.mock("../api/useProviderPulse", () => ({
  useProviderPulse: () => ({
    isOnline: false,
    latency: null,
    isChecking: false,
    checkPulse: vi.fn(),
  }),
}));
vi.mock("../api/useAvailableModelsQuery", () => ({
  useAvailableModelsQuery: () => ({ data: undefined }),
}));
vi.mock("../api/useRefreshModels", () => ({
  useRefreshModels: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../api/useUpdateAiSettings", () => ({
  useUpdateAiSettings: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { looksLikeUrlNotApiKey } from "@/utils/providerMeta";
import { ProviderSetupWizard } from "../components/ProviderSetupWizard";

beforeEach(() => {
  saveKeyMutate.mockReset();
});

const renderWizard = () =>
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
    />
  );

const goToKeyStep = () => {
  fireEvent.click(screen.getByRole("button", { name: /Get Started/ }));
};

describe("looksLikeUrlNotApiKey", () => {
  it("flags URL-shaped input and accepts key shapes", () => {
    expect(looksLikeUrlNotApiKey("https://platform.openai.com/api-keys")).toBe(true);
    expect(looksLikeUrlNotApiKey("  http://example.com ")).toBe(true);
    expect(looksLikeUrlNotApiKey("www.openai.com")).toBe(true);
    expect(looksLikeUrlNotApiKey("sk-proj-abc123")).toBe(false);
    expect(looksLikeUrlNotApiKey("AIzaSyExample")).toBe(false);
    expect(looksLikeUrlNotApiKey("")).toBe(false);
  });
});

describe("<ProviderSetupWizard> URL pre-check", () => {
  it("refuses a pasted URL: targeted message, disabled button, no save call", () => {
    renderWizard();
    goToKeyStep();

    const input = screen.getByLabelText(/API Key/);
    fireEvent.change(input, {
      target: { value: "https://platform.openai.com/api-keys" },
    });

    expect(
      screen.getByText(
        'That looks like a web address, not an API key. Paste the key itself — it starts with "sk-".'
      )
    ).toBeInTheDocument();
    const saveTest = screen.getByRole("button", { name: /Save & Test/ });
    expect(saveTest).toBeDisabled();

    // Enter-to-submit must be guarded too — the button being disabled
    // isn't enough on its own.
    fireEvent.keyDown(input, { key: "Enter" });
    expect(saveKeyMutate).not.toHaveBeenCalled();
  });

  it("still saves a normally shaped key", () => {
    renderWizard();
    goToKeyStep();

    fireEvent.change(screen.getByLabelText(/API Key/), {
      target: { value: "sk-proj-valid-key" },
    });
    const saveTest = screen.getByRole("button", { name: /Save & Test/ });
    expect(saveTest).toBeEnabled();
    fireEvent.click(saveTest);

    expect(saveKeyMutate).toHaveBeenCalledWith(
      { provider: "openai", key: "sk-proj-valid-key" },
      expect.anything()
    );
  });
});
