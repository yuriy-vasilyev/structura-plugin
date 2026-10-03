/**
 * ProviderPill — hidden on managed plans (2026-10-01).
 *
 * The pill picks the provider for AI suggestions. Managed customers never
 * pick or see a text provider (specs/managed-ai-lineup.md §3.3), which
 * reverses the 2026-04-28 "always shown on managed" rule. BYOK keeps it.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({ __: (t: string) => t }));

const useDefaultProvidersMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/settings", () => ({
  useDefaultProviders: useDefaultProvidersMock,
}));

import { ProviderPill } from "../components/ProviderPill";

const setup = (isCloud: boolean) =>
  useDefaultProvidersMock.mockReturnValue({
    hasExplicitDefaults: isCloud,
    hasMultipleProviders: true,
    availableProviders: ["gemini", "openai", "anthropic"],
    isProviderIncomplete: () => false,
    isCloud,
  });

describe("<ProviderPill>", () => {
  it("managed: renders nothing, even when forced interactive", () => {
    setup(true);
    const { container } = render(
      <ProviderPill provider="gemini" onProviderChange={vi.fn()} forceInteractive />
    );
    expect(container.firstChild).toBeNull();
  });

  it("BYOK without explicit defaults: renders the provider picker", () => {
    setup(false);
    render(<ProviderPill provider="gemini" onProviderChange={vi.fn()} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
