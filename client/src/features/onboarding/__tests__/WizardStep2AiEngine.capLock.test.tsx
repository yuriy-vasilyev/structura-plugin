/**
 * WizardStep2AiEngine — no provider locks (2026-10-06, specs/open-providers.md).
 *
 * Until 2026-10-06 the anonymous (`none`) step offered OpenAI only and the
 * per-plan provider count cap locked the extras up front (wp.org testing
 * 2026-07-08). Every plan may now connect every provider: no card is
 * locked, providers list Claude, OpenAI, Gemini, and the capability chips
 * show what a provider can do, not what the plan allows (OpenAI and Gemini
 * keep "Images" on anonymous).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({ __: (t: string) => t, _x: (t: string) => t }));
vi.mock("@structura/types", () => ({
  isManagedPlan: (p: string) => p === "cloud" || p === "cloud_pro",
}));
vi.mock("@structura/ui", () => ({
  Badge: ({ children }: { children?: unknown }) => <span>{children as never}</span>,
  PageLoader: () => <div>loading</div>,
}));

const licenseMock = vi.hoisted(() => ({
  current: { plan: "none" as string },
}));
vi.mock("@/features/settings", () => ({ useLicense: () => licenseMock.current }));

const settingsMock = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/features/ai-engine", () => ({
  useAiSettingsQuery: () => ({ data: settingsMock.current, isLoading: false }),
}));

// Expose the props the cap logic drives as data attributes so we can
// assert them directly.
vi.mock("@/features/ai-engine/components/AvailableProviderCard", () => ({
  AvailableProviderCard: (props: { id: string; capabilities: string[] } & Record<string, unknown>) => (
    <div
      data-testid="avail"
      data-id={props.id}
      data-caps={props.capabilities.join(",")}
      data-locked={String("available" in props || "lockReason" in props)}
    />
  ),
}));
vi.mock("@/features/ai-engine/components/InstalledProviderCard", () => ({
  InstalledProviderCard: () => <div />,
}));
vi.mock("@/features/ai-engine/components/ProviderSetupWizard", () => ({
  ProviderSetupWizard: () => <div />,
}));
vi.mock("@/features/ai-engine/components/WorkspaceKeysPicker", () => ({
  WorkspaceKeysPicker: () => <div />,
}));

const storeState = { setStepValid: vi.fn(), setStep2Draft: vi.fn() };
vi.mock("../state/wizardStore", () => ({
  useWizardStore: (sel: (s: typeof storeState) => unknown) => sel(storeState),
}));

import { WizardStep2AiEngine } from "../components/WizardStep2AiEngine";

const meta = (name: string, capabilities: string[]) => ({
  name,
  description: `${name} desc`,
  capabilities,
  key_url: "",
});

/** The plugin's settings payload: every provider on every plan since 2026-10-06. */
const settings = (connected: string[] = []) => {
  const catalog: Record<string, ReturnType<typeof meta>> = {
    openai: meta("OpenAI", ["text", "image"]),
    gemini: meta("Google Gemini", ["text", "image"]),
    anthropic: meta("Anthropic Claude", ["text"]),
  };
  const providers: Record<string, unknown> = {};
  for (const [id, m] of Object.entries(catalog)) {
    providers[id] = { connected: connected.includes(id), capabilities: m.capabilities };
  }
  return { catalog, providers, defaults: { text_provider: "", image_provider: "" } };
};

const cards = () =>
  screen.getAllByTestId("avail").map((el) => ({
    id: el.getAttribute("data-id"),
    caps: el.getAttribute("data-caps"),
    locked: el.getAttribute("data-locked"),
  }));

beforeEach(() => {
  licenseMock.current = { plan: "none" };
});

describe("WizardStep2AiEngine — every provider on every plan", () => {
  it.each(["none", "free", "byok"])("%s: no card is locked and the order is Claude, OpenAI, Gemini", (plan) => {
    licenseMock.current = { plan };
    settingsMock.current = settings();

    render(<WizardStep2AiEngine />);

    expect(cards()).toEqual([
      { id: "anthropic", caps: "text", locked: "false" },
      { id: "openai", caps: "text,image", locked: "false" },
      { id: "gemini", caps: "text,image", locked: "false" },
    ]);
  });

  it("anonymous with OpenAI connected still offers Gemini and Claude", () => {
    settingsMock.current = settings(["openai"]);

    render(<WizardStep2AiEngine />);

    expect(cards().map((c) => c.id)).toEqual(["anthropic", "gemini"]);
    expect(cards().every((c) => c.locked === "false")).toBe(true);
  });
});
