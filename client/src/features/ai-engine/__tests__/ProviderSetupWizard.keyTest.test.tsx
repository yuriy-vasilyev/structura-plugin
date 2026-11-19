/**
 * The key wizard live-tests a pasted key before saving it
 * (specs/provider-key-test.md §3). Until 2026-11-18 the plugin saved keys
 * untested: a key with no credit got "Key authenticated and encrypted" and
 * "Connection successful", then failed at the first generation. A failed
 * test shows the provider's own message, with its links, under the field.
 *
 * `apiFetch` is the network edge; the real `useTestKey` runs behind it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  _x: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%[sd]/g, () => String(args[i++]));
  },
}));

const { apiFetchMock, saveKeyMutate } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  saveKeyMutate: vi.fn(),
}));
vi.mock("@wordpress/api-fetch", () => ({ default: apiFetchMock }));
vi.mock("../api/useSaveKey", () => ({
  useSaveKey: () => ({ mutate: saveKeyMutate, isPending: false }),
}));
vi.mock("../api/useProviderPulse", () => ({
  useProviderPulse: () => ({ isOnline: false, latency: null, isChecking: false, checkPulse: vi.fn() }),
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

import { ProviderSetupWizard } from "../components/ProviderSetupWizard";

const NO_CREDIT =
  "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.";

beforeEach(() => {
  apiFetchMock.mockReset();
  saveKeyMutate.mockReset();
});

const submitKey = (key = "sk-proj-no-credit") => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
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
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: /Get Started/ }));
  fireEvent.change(screen.getByLabelText(/API Key/), { target: { value: key } });
  fireEvent.click(screen.getByRole("button", { name: /Save & Test/ }));
};

describe("<ProviderSetupWizard> live key test", () => {
  it("tests the pasted key, then shows the provider's message with its link and saves nothing", async () => {
    apiFetchMock.mockResolvedValue({
      ok: false,
      latencyMs: 2133,
      errorCode: "rate_limit",
      providerMessage: NO_CREDIT,
    });
    submitKey(" sk-proj-no-credit ");

    const link = await screen.findByRole("link", {
      name: "https://platform.openai.com/settings/organization/billing/ (opens in a new tab)",
    });
    expect(link).toHaveAttribute("href", "https://platform.openai.com/settings/organization/billing/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(apiFetchMock).toHaveBeenCalledWith({
      path: "/structura/v1/keys/test",
      method: "POST",
      data: { provider: "openai", key: "sk-proj-no-credit" },
    });
    expect(screen.queryByText(/rate-limiting the test/)).toBeNull();
    expect(saveKeyMutate).not.toHaveBeenCalled();
  });

  it("falls back to the copy for the error code when the provider sent no message", async () => {
    apiFetchMock.mockResolvedValue({ ok: false, latencyMs: 10000, errorCode: "timeout" });
    submitKey();

    expect(await screen.findByText("The provider took too long to respond. Try again.")).toBeInTheDocument();
    expect(saveKeyMutate).not.toHaveBeenCalled();
  });

  it("shows the network copy when the test itself could not run", async () => {
    apiFetchMock.mockRejectedValue({ code: "cloud_test_failed", message: "cURL error 28" });
    submitKey();

    expect(
      await screen.findByText("Couldn't reach the provider. Check your connection and try again.")
    ).toBeInTheDocument();
    expect(saveKeyMutate).not.toHaveBeenCalled();
  });

  it("clears the failure when the key changes", async () => {
    apiFetchMock.mockResolvedValue({ ok: false, latencyMs: 0, errorCode: "auth" });
    submitKey();
    await screen.findByText("That key was rejected. Double-check it and try again.");

    fireEvent.change(screen.getByLabelText(/API Key/), { target: { value: "sk-proj-other" } });
    expect(screen.queryByText("That key was rejected. Double-check it and try again.")).toBeNull();
  });

  it("saves the key once the test passes", async () => {
    apiFetchMock.mockResolvedValue({ ok: true, latencyMs: 412 });
    submitKey("sk-proj-valid");

    await vi.waitFor(() =>
      expect(saveKeyMutate).toHaveBeenCalledWith(
        { provider: "openai", key: "sk-proj-valid" },
        expect.anything()
      )
    );
  });
});
