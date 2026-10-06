/**
 * AI Engine page on own-key plans (2026-10-06, specs/open-providers.md).
 *
 * Every plan, anonymous included, may connect every provider: no card is
 * locked, providers list Claude, OpenAI, Gemini, and the capability chips
 * show what a provider can do (OpenAI and Gemini keep "Image" on
 * anonymous, where the plan itself has no image generation). The wizard
 * gets the full capabilities and is told whether the plan makes images.
 * Only the data hooks and the card internals are stubbed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@wordpress/i18n", () => ({ __: (t: string) => t, _x: (t: string) => t }));

const planMock = vi.hoisted(() => ({ plan: "none" }));
vi.mock("@/features/settings", () => ({
  useLicense: () => ({ plan: planMock.plan }),
}));

const meta = (name: string, capabilities: string[]) => ({ name, description: "d", capabilities, key_url: "" });
vi.mock("@/features/ai-engine", () => ({
  useAiSettingsQuery: () => ({
    isLoading: false,
    data: {
      providers: {
        openai: { connected: true, capabilities: ["text", "image"], text_model: "m", image_model: "i" },
        gemini: { connected: false, capabilities: ["text", "image"] },
        anthropic: { connected: false, capabilities: ["text"] },
      },
      catalog: {
        openai: meta("OpenAI", ["text", "image"]),
        gemini: meta("Google Gemini", ["text", "image"]),
        anthropic: meta("Anthropic Claude", ["text"]),
      },
      defaults: { text_provider: "openai", image_provider: "" },
      has_text: true,
    },
  }),
}));

vi.mock("../components/InstalledProviderCard", () => ({
  InstalledProviderCard: ({ id, capabilities }: { id: string; capabilities: string[] }) => (
    <div data-testid="installed" data-id={id} data-caps={capabilities.join(",")} />
  ),
}));
vi.mock("../components/AvailableProviderCard", () => ({
  AvailableProviderCard: (props: { id: string; capabilities: string[]; onSetUp: () => void }) => (
    <button
      type="button"
      data-testid="avail"
      data-id={props.id}
      data-caps={props.capabilities.join(",")}
      data-locked={String("available" in props || "lockReason" in props)}
      onClick={props.onSetUp}
    />
  ),
}));
vi.mock("../components/WorkspaceKeysPicker", () => ({ WorkspaceKeysPicker: () => null }));
vi.mock("../components/ProviderSetupWizard", () => ({
  ProviderSetupWizard: (p: { providerId: string; capabilities: string[]; imagesAvailable?: boolean }) => (
    <div
      role="dialog"
      data-provider={p.providerId}
      data-caps={p.capabilities.join(",")}
      data-images={String(p.imagesAvailable)}
    />
  ),
}));

import { AiEngine } from "../routes/AiEngine";

const renderPage = () =>
  render(
    <MemoryRouter>
      <AiEngine />
    </MemoryRouter>
  );

beforeEach(() => {
  planMock.plan = "none";
});

describe("AiEngine — every provider on every plan", () => {
  it.each(["none", "free", "byok"])("%s: Claude then Gemini available, nothing locked, image chips kept", (plan) => {
    planMock.plan = plan;
    renderPage();

    const avail = screen.getAllByTestId("avail").map((el) => [el.dataset.id, el.dataset.caps, el.dataset.locked]);
    expect(avail).toEqual([
      ["anthropic", "text", "false"],
      ["gemini", "text,image", "false"],
    ]);
    expect(screen.getByTestId("installed").dataset.caps).toBe("text,image");
  });

  it("anonymous: the wizard shows Gemini's image capability but knows the plan makes no images", () => {
    renderPage();
    fireEvent.click(screen.getAllByTestId("avail")[1]);

    const wizard = screen.getByRole("dialog");
    expect(wizard.dataset.provider).toBe("gemini");
    expect(wizard.dataset.caps).toBe("text,image");
    expect(wizard.dataset.images).toBe("false");
  });

  it("Free: the wizard may offer images", () => {
    planMock.plan = "free";
    renderPage();
    fireEvent.click(screen.getAllByTestId("avail")[1]);

    expect(screen.getByRole("dialog").dataset.images).toBe("true");
  });
});
