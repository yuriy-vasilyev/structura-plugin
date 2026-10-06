/**
 * The wp-admin provider advice (2026-10-02, specs/byok-ai-guidance.md §3, §5).
 *
 * Runs the REAL `adviceFor` resolver from `@structura/model-catalog` and the
 * REAL `InlineAdvice` from `@structura/ui`; only the data edges (license,
 * connected keys, AI settings) and the plugin's provider setup wizard (a
 * separate modal with its own tests) are stubbed.
 *
 * Pinned:
 *   - the three situations of the spec §3 table, on BYOK, Free and anonymous
 *     alike (rows 4 and 5 retired 2026-10-06);
 *   - nothing on managed plans, nothing for a non-caution provider;
 *   - Switch: provider + recommended tier, confirmation, Undo focused and
 *     announced; Undo restores, refocuses the provider control and
 *     announces the notice again;
 *   - hide: collapses, focus to Show advice; Show: expands, focus to the
 *     first action; no × without `onHide` (generate page);
 *   - Connect opens the setup wizard on the provider; Upgrade is a new-tab
 *     link to the customer portal;
 *   - picking Gemini announces lead and reason; page load announces nothing.
 */
import { useRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const env = vi.hoisted(() => ({
  plan: "byok",
  connected: ["gemini"] as string[],
}));

vi.mock("@/features/settings", () => ({
  useLicense: () => ({ plan: env.plan }),
  useAiConnections: () => ({ textProviders: env.connected }),
}));

vi.mock("@/features/ai-engine", () => ({
  useAiSettingsQuery: () => ({
    data: {
      catalog: {
        anthropic: {
          name: "Anthropic",
          description: "Claude models",
          capabilities: ["text"],
          key_url: "https://console.anthropic.com",
        },
        openai: {
          name: "OpenAI",
          description: "GPT models",
          capabilities: ["text", "image"],
          key_url: "https://platform.openai.com",
        },
      },
      providers: {},
      defaults: {},
    },
  }),
}));

vi.mock("@/features/ai-engine/components/ProviderSetupWizard", () => ({
  ProviderSetupWizard: ({ providerId, onClose }: { providerId: string; onClose: () => void }) => (
    <div role="dialog" aria-label={`Set up ${providerId}`}>
      <button type="button" onClick={onClose}>
        Close wizard
      </button>
    </div>
  ),
}));

import { ProviderAdvice } from "../components/ProviderAdvice";
import type { AIProvider } from "../types";

const LEAD = "Gemini isn’t recommended for writing.";
const REASON = "In our tests, its posts contained more invented details.";

/** A form stand-in: holds the provider and tier, and a focusable provider control. */
function Harness({
  initial = "gemini",
  withHide = true,
}: {
  initial?: AIProvider;
  withHide?: boolean;
}) {
  const [provider, setProvider] = useState<AIProvider>(initial);
  const [tier, setTier] = useState<string>("top");
  const [hidden, setHidden] = useState(false);
  const controlRef = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button type="button" ref={controlRef} data-testid="provider-control">
        {provider}/{tier}
      </button>
      <button type="button" onClick={() => setProvider("gemini")}>
        pick gemini
      </button>
      <button type="button" onClick={() => setProvider("openai")}>
        pick openai
      </button>
      <ProviderAdvice
        provider={provider}
        hidden={hidden}
        onSwitch={(to, nextTier) => {
          const previous = { provider, tier };
          setProvider(to);
          setTier(nextTier);
          return () => {
            setProvider(previous.provider);
            setTier(previous.tier);
            controlRef.current?.focus();
          };
        }}
        {...(withHide ? { onHide: () => setHidden(true), onShow: () => setHidden(false) } : {})}
      />
    </div>
  );
}

const status = () => screen.getByRole("status");

beforeEach(() => {
  env.plan = "byok";
  env.connected = ["gemini"];
});

describe("ProviderAdvice — the situations", () => {
  it("1 · BYOK with Anthropic connected: Switch to Claude, nothing else", () => {
    env.connected = ["gemini", "anthropic"];
    render(<Harness />);

    expect(screen.getByText(LEAD)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to Claude" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button", { name: /Connect/ })).toBeNull();
  });

  it("2 · BYOK with OpenAI, no Anthropic: Switch to OpenAI, Connect Claude for the best results", () => {
    env.connected = ["gemini", "openai"];
    render(<Harness />);

    expect(screen.getByRole("button", { name: "Switch to OpenAI" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect Claude for the best results" })
    ).toBeInTheDocument();
  });

  it("3 · BYOK with only Gemini: Connect a Claude or OpenAI key, Upgrade to Cloud", () => {
    render(<Harness />);

    expect(
      screen.getByRole("button", { name: "Connect a Claude or OpenAI key" })
    ).toBeInTheDocument();
    const upgrade = screen.getByRole("link", { name: /Upgrade to Cloud, where we run the AI/ });
    expect(upgrade).toHaveAttribute("target", "_blank");
    expect(upgrade.getAttribute("href")).toMatch(/^https:\/\/app\.structurawp\.com\/\?/);
    expect(upgrade.getAttribute("href")).toContain("intent=general_upgrade");
  });

  // 2026-10-06 (specs/open-providers.md): Free and anonymous may connect
  // Claude, so they get the same three situations as BYOK. The Free-only
  // rows ("Connect an OpenAI key", "Upgrade for Claude or managed AI") are gone.
  it.each(["free", "none"])("%s with Claude connected: Switch to Claude", (plan) => {
    env.plan = plan;
    env.connected = ["gemini", "openai", "anthropic"];
    render(<Harness />);

    expect(screen.getByRole("button", { name: "Switch to Claude" })).toBeInTheDocument();
    expect(screen.queryByText(/Upgrade for Claude/)).toBeNull();
  });

  it.each(["free", "none"])("%s with only Gemini: Connect a Claude or OpenAI key, Upgrade to Cloud", (plan) => {
    env.plan = plan;
    render(<Harness />);

    expect(screen.getByRole("button", { name: "Connect a Claude or OpenAI key" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect an OpenAI key" })).toBeNull();
    expect(screen.getByRole("link", { name: /Upgrade to Cloud, where we run the AI/ })).toBeInTheDocument();
  });
});

describe("ProviderAdvice — when it shows nothing", () => {
  it.each(["cloud", "cloud_pro"])("managed plan %s: no advice for Gemini", (plan) => {
    env.plan = plan;
    env.connected = ["gemini", "openai"];
    const { container } = render(<Harness />);
    expect(screen.queryByText(LEAD)).toBeNull();
    expect(container.querySelector("[role='status']")).toBeNull();
  });

  it("a non-caution provider gets no advice", () => {
    env.connected = ["gemini", "openai"];
    render(<Harness initial="openai" />);
    expect(screen.queryByText(LEAD)).toBeNull();
  });
});

describe("ProviderAdvice — Switch and Undo", () => {
  it("switches to the recommended tier, confirms, focuses Undo and announces", async () => {
    env.connected = ["gemini", "anthropic"];
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Switch to Claude" }));

    // Provider + its recommended tier (Standard).
    expect(screen.getByTestId("provider-control")).toHaveTextContent("anthropic/mid");
    expect(
      screen.getByText("Switched to Claude with its recommended model.")
    ).toBeInTheDocument();
    const undo = screen.getByRole("button", { name: "Undo" });
    await waitFor(() => expect(undo).toHaveFocus());
    await waitFor(() =>
      expect(status()).toHaveTextContent("Switched to Claude with its recommended model.")
    );
  });

  it("Undo restores provider and tier, refocuses the provider control and announces the notice", async () => {
    env.connected = ["gemini", "anthropic"];
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Switch to Claude" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(screen.getByTestId("provider-control")).toHaveTextContent("gemini/top");
    expect(screen.getByTestId("provider-control")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Switch to Claude" })).toBeInTheDocument();
    await waitFor(() => expect(status()).toHaveTextContent(`${LEAD} ${REASON}`));
  });

  it("a manual provider change ends the confirmation", () => {
    env.connected = ["gemini", "anthropic", "openai"];
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Switch to Claude" }));
    fireEvent.click(screen.getByRole("button", { name: "pick openai" }));
    expect(screen.queryByText(/Switched to/)).toBeNull();
  });
});

describe("ProviderAdvice — hide and show", () => {
  it("hide collapses and focuses Show advice; Show expands and focuses the first action", async () => {
    env.connected = ["gemini", "openai"];
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Hide this advice for this campaign" }));
    const show = screen.getByRole("button", { name: "Show advice" });
    expect(screen.getByText(LEAD)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Switch to OpenAI" })).toBeNull();
    await waitFor(() => expect(show).toHaveFocus());

    fireEvent.click(show);
    const primary = screen.getByRole("button", { name: "Switch to OpenAI" });
    await waitFor(() => expect(primary).toHaveFocus());
  });

  it("has no hide control without onHide (generate page)", () => {
    env.connected = ["gemini", "openai"];
    render(<Harness withHide={false} />);
    expect(screen.queryByRole("button", { name: "Hide this advice for this campaign" })).toBeNull();
  });
});

describe("ProviderAdvice — Connect and announcements", () => {
  it("Connect opens the setup wizard on the provider; closing returns focus to the first action", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Connect a Claude or OpenAI key" }));
    const wizard = screen.getByRole("dialog", { name: "Set up anthropic" });
    fireEvent.click(within(wizard).getByRole("button", { name: "Close wizard" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Connect a Claude or OpenAI key" })
      ).toHaveFocus()
    );
  });

  it("announces nothing on page load and lead + reason when Gemini is picked", async () => {
    env.connected = ["gemini", "openai"];
    render(<Harness initial="openai" />);
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "pick gemini" }));
    await waitFor(() => expect(status()).toHaveTextContent(`${LEAD} ${REASON}`));
  });

  it("page load with Gemini already picked announces nothing", async () => {
    render(<Harness />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(status()).toHaveTextContent("");
  });
});

describe("ProviderAdvice — no key behind the provider (2026-10-02)", () => {
  // Guidance describes a provider the customer has: Gemini as the default
  // before any key exists, or with keys for other providers only, gets none.
  it.each([[[] as string[]], [["openai"]], [["anthropic", "openai"]]])(
    "no advice for Gemini when the connected text providers are %j",
    (connected) => {
      env.connected = connected;
      render(<Harness />);
      expect(screen.queryByText(LEAD)).toBeNull();
    }
  );
});
