/**
 * PersonaEditor — Magic Suggest paid gate.
 *
 * Regression (2026-07-09, wp.org none-tier testing): the "Magic Suggest"
 * trigger in the Create/Edit Persona dialog ran the cloud AI suggestion
 * ("Reading your site… / Architecting…") on a none-tier install. It's now
 * a disabled "Pro" hint for non-paid, and only functional for paid.
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

describe("PersonaEditor — Magic Suggest paid gate", () => {
  it("renders a disabled 'Pro' Magic Suggest for a non-paid tier and never calls suggest", () => {
    licenseMock.current = { isPaidLicense: false };
    render(
      <PersonaEditor persona={null} users={[]} onClose={noop} onSave={noop} />,
    );

    const btn = screen.getByRole("button", { name: /Magic Suggest/ });
    expect(btn).toBeDisabled();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    // No provider picker on the locked variant.
    expect(screen.queryByTestId("provider-pill")).toBeNull();

    fireEvent.click(btn);
    expect(suggestMock).not.toHaveBeenCalled();
  });

  it("renders the functional Magic Suggest for a paid tier", () => {
    licenseMock.current = { isPaidLicense: true };
    render(
      <PersonaEditor persona={null} users={[]} onClose={noop} onSave={noop} />,
    );

    expect(screen.getByRole("button", { name: /Magic Suggest/ })).toBeEnabled();
    expect(screen.getByTestId("provider-pill")).toBeInTheDocument();
    expect(screen.queryByText("Pro")).toBeNull();
  });
});
