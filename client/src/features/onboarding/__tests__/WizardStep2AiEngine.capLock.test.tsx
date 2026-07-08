/**
 * WizardStep2AiEngine — pre-emptive provider cap locking.
 *
 * Regression (Yurii wp.org testing 2026-07-08): on a `none` tier
 * (provider cap 1) with nothing connected yet, BOTH OpenAI and Gemini
 * rendered as freely connectable — implying the user could connect two —
 * and Gemini only flipped to the "Free License" cap-lock AFTER OpenAI was
 * connected. The cap lock now applies up front: the first `slotsLeft`
 * tier-eligible providers (catalog order) stay connectable; the rest read
 * as cap-locked from the start.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({ __: (t: string) => t }));
vi.mock("@structura/types", () => ({
  isManagedPlan: (p: string) => p === "cloud" || p === "cloud_pro",
}));
vi.mock("@structura/ui", () => ({
  Badge: ({ children }: { children?: unknown }) => <span>{children as never}</span>,
  PageLoader: () => <div>loading</div>,
}));

const licenseMock = vi.hoisted(() => ({
  current: { plan: "none" as string, providerCountCap: 1 },
}));
vi.mock("@/features/settings", () => ({ useLicense: () => licenseMock.current }));

const settingsMock = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/features/ai-engine", () => ({
  useAiSettingsQuery: () => ({ data: settingsMock.current, isLoading: false }),
}));

// Expose the props the cap logic drives as data attributes so we can
// assert them directly.
vi.mock("@/features/ai-engine/components/AvailableProviderCard", () => ({
  AvailableProviderCard: ({
    id,
    available,
    lockReason,
  }: {
    id: string;
    available: boolean;
    lockReason: string;
  }) => (
    <div
      data-testid={`avail-${id}`}
      data-available={String(available)}
      data-lock={lockReason}
    />
  ),
}));
vi.mock("@/features/ai-engine/components/InstalledProviderCard", () => ({
  InstalledProviderCard: () => <div />,
}));
vi.mock("@/features/ai-engine/components/ProviderSetupWizard", () => ({
  ProviderSetupWizard: () => <div />,
}));
vi.mock("@/features/ai-engine/components/ProviderUpgradeDialog", () => ({
  ProviderUpgradeDialog: () => <div />,
}));
vi.mock("@/features/ai-engine/components/WorkspaceKeysPicker", () => ({
  WorkspaceKeysPicker: () => <div />,
}));

const storeState = { setStepValid: vi.fn(), setStep2Draft: vi.fn() };
vi.mock("../state/wizardStore", () => ({
  useWizardStore: (sel: (s: typeof storeState) => unknown) => sel(storeState),
}));

import { WizardStep2AiEngine } from "../components/WizardStep2AiEngine";

const meta = (name: string) => ({
  name,
  description: `${name} desc`,
  capabilities: ["text"],
  min_tier: name === "Anthropic Claude" ? "byok" : "free",
  key_url: "",
});

/** catalog = all providers; providers = the tier-filtered subset. */
const settings = (opts: {
  cap: number;
  tierProviders: string[];
  connected?: string[];
}) => {
  const connected = new Set(opts.connected ?? []);
  const catalogEntries: Record<string, unknown> = {
    openai: meta("OpenAI"),
    gemini: meta("Google Gemini"),
    anthropic: meta("Anthropic Claude"),
  };
  const providers: Record<string, unknown> = {};
  for (const id of opts.tierProviders) {
    providers[id] = {
      connected: connected.has(id),
      capabilities: ["text"],
    };
  }
  return { catalog: catalogEntries, providers, defaults: { text_provider: "", image_provider: "" } };
};

beforeEach(() => {
  licenseMock.current = { plan: "none", providerCountCap: 1 };
});

describe("WizardStep2AiEngine — cap locking", () => {
  it("none tier (cap 1): OpenAI connectable, Gemini cap-locked from the start", () => {
    licenseMock.current = { plan: "none", providerCountCap: 1 };
    settingsMock.current = settings({ cap: 1, tierProviders: ["openai", "gemini"] });

    render(<WizardStep2AiEngine />);

    expect(screen.getByTestId("avail-openai").getAttribute("data-available")).toBe("true");
    // The bug: Gemini used to be `true` here until OpenAI was connected.
    expect(screen.getByTestId("avail-gemini").getAttribute("data-available")).toBe("false");
    expect(screen.getByTestId("avail-gemini").getAttribute("data-lock")).toBe("cap");
    // Anthropic is a tier lock (not offered at all on `none`), not a cap lock.
    expect(screen.getByTestId("avail-anthropic").getAttribute("data-available")).toBe("false");
    expect(screen.getByTestId("avail-anthropic").getAttribute("data-lock")).toBe("tier");
  });

  it("free tier (cap 2): both OpenAI and Gemini stay connectable", () => {
    licenseMock.current = { plan: "free", providerCountCap: 2 };
    settingsMock.current = settings({ cap: 2, tierProviders: ["openai", "gemini"] });

    render(<WizardStep2AiEngine />);

    expect(screen.getByTestId("avail-openai").getAttribute("data-available")).toBe("true");
    expect(screen.getByTestId("avail-gemini").getAttribute("data-available")).toBe("true");
  });
});
