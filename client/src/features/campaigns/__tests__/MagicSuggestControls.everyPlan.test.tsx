/**
 * Magic suggest on every plan (2026-10-06, specs/open-providers.md §8).
 *
 * The shared suggest controls (`MagicSuggestButton` on the campaign strategy
 * steps and the Generate page, `SuggestStrategySection` on the Visuals page
 * and the wizard's Visuals step) rendered a disabled "Pro" hint on none and
 * Free. They now work on every plan with no chip. The real components and
 * the real `@structura/ui` primitives render; the license and provider hooks
 * are the mocked edges.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({ __: (t: string) => t }));

const license = vi.hoisted(() => ({ current: { plan: "none", isPaidLicense: false } as Record<string, unknown> }));
vi.mock("@/features/settings", () => ({
  useLicense: () => license.current,
  useDefaultProviders: () => ({
    defaultTextProvider: "openai",
    hasExplicitDefaults: false,
    hasMultipleProviders: false,
    availableProviders: ["openai"],
    isProviderIncomplete: () => false,
    isCloud: false,
  }),
}));

import { MagicSuggestButton } from "../components/MagicSuggestButton";
import { SuggestStrategySection } from "../components/SuggestStrategySection";

beforeEach(() => {
  license.current = { plan: "none", isPaidLicense: false };
});

describe.each(["none", "free"])("Magic suggest controls on the %s plan", (plan) => {
  beforeEach(() => {
    license.current = { plan, isPaidLicense: false };
  });

  it("MagicSuggestButton is a working trigger with no Pro chip or upgrade line", () => {
    const onTrigger = vi.fn();
    render(<MagicSuggestButton isLoading={false} onTrigger={onTrigger} ctaLabel="Suggest Strategy" />);

    const btn = screen.getByRole("button", { name: /Suggest Strategy/ });
    expect(btn).toBeEnabled();
    expect(screen.queryByText("Pro")).toBeNull();
    expect(screen.queryByText(/available on Pro/)).toBeNull();

    fireEvent.click(btn);
    expect(onTrigger).toHaveBeenCalledWith("openai");
  });

  it("SuggestStrategySection opens and generates with no Pro chip", () => {
    const onGenerate = vi.fn();
    render(
      <SuggestStrategySection
        isStrategizing={false}
        onGenerate={onGenerate}
        toggleButtonLabel="Suggest Image Style"
        contextFieldLabel="Brand Resources"
        addSourceLabel="Add Resource"
        ctaButtonLabel="Generate Image Style"
        placeholder={{ title: "Company logo", url: "https://acme.test/logo.png" }}
      />,
    );

    const toggle = screen.getByRole("button", { name: /Suggest Image Style/ });
    expect(toggle).toBeEnabled();
    expect(screen.queryByText("Pro")).toBeNull();

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: /Generate Image Style/ }));
    expect(onGenerate).toHaveBeenCalled();
  });
});
