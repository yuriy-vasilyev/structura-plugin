/**
 * PersonaEditor — Magic Suggest on every plan.
 *
 * 2026-07-09 the trigger became a disabled "Pro" hint on none/free after it
 * ran on a none-tier install. Since 2026-10-06 Magic suggest is open on every
 * plan (specs/open-providers.md §8): the dialog shows the working control
 * with no chip on every plan (owner report 2026-10-06: an anonymous site saw
 * "Magic suggest" with a PRO chip, disabled).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({ __: (t: string) => t }));

const suggestMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useMagicSuggest", () => ({
  useMagicSuggest: () => ({ suggest: suggestMock, isSuggesting: false }),
}));

const licenseMock = vi.hoisted(() => ({ current: { isPaidLicense: false } }));
vi.mock("@/features/settings", () => ({
  useDefaultProviders: () => ({ defaultTextProvider: "openai" }),
  useLicense: () => licenseMock.current,
}));

vi.mock("@/features/campaigns/components/ProviderPill", () => ({
  ProviderPill: () => <div data-testid="provider-pill" />,
}));
vi.mock("@/features/campaigns/components/MagicSuggestProgress", () => ({
  MagicSuggestProgress: () => <div />,
}));

vi.mock("@structura/ui", () => {
  const pass = ({ children }: { children?: unknown }) => <div>{children as never}</div>;
  const Select: any = ({ children }: { children?: unknown }) => <div>{children as never}</div>;
  Select.Label = pass;
  Select.Trigger = () => <button type="button" />;
  Select.Content = pass;
  Select.Item = pass;
  return {
    Dialog: { Root: pass, Content: pass, Header: pass, Title: pass, Body: pass, Footer: pass },
    Button: ({ children, ...p }: { children?: unknown } & Record<string, unknown>) => (
      <button {...(p as Record<string, never>)}>{children as never}</button>
    ),
    InputField: () => <input />,
    Select,
    TextArea: () => <textarea />,
    toast: { success: vi.fn(), error: vi.fn() },
  };
});

import { PersonaEditor } from "../components/PersonaEditor";

const noop = async () => {};

beforeEach(() => {
  suggestMock.mockReset();
  licenseMock.current = { isPaidLicense: false };
});

describe("PersonaEditor — Magic Suggest on every plan", () => {
  it.each([
    ["none", false],
    ["free", false],
    ["byok", true],
  ])("renders the working Magic Suggest with no chip on the %s plan", (_plan, isPaidLicense) => {
    licenseMock.current = { isPaidLicense };
    render(
      <PersonaEditor persona={null} users={[]} onClose={noop} onSave={noop} />,
    );

    const btn = screen.getByRole("button", { name: /Magic Suggest/ });
    expect(btn).toBeEnabled();
    expect(screen.getByTestId("provider-pill")).toBeInTheDocument();
    expect(screen.queryByText("Pro")).toBeNull();

    fireEvent.click(btn);
    expect(suggestMock).toHaveBeenCalledWith("persona", { provider: "openai" });
  });
});
