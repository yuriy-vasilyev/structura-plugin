/**
 * Persona prompt bound in the wp-admin editor (2026-11-12 cost audit): on
 * managed AI (Cloud), where Structura pays for the prompt tokens, the
 * Intelligence Directive takes at most 8,000 characters and the cloud cuts a
 * longer one. Own-key plans (BYOK, Free, no license) have no bound: the
 * 59,044-character prompt measured on 2026-11-13 belongs to such a site.
 *
 * The real editor and the real `@structura/ui` primitives. Mocked: the
 * license and provider hooks, Magic Suggest and the provider pill.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({ __: (t: string) => t }));

const licenseMock = vi.hoisted(() => ({ current: { plan: "cloud" } as Record<string, unknown> }));
vi.mock("@/features/settings", () => ({
  useDefaultProviders: () => ({ defaultTextProvider: "openai" }),
  useLicense: () => licenseMock.current,
}));
vi.mock("@/hooks/useMagicSuggest", () => ({
  useMagicSuggest: () => ({ suggest: vi.fn(), isSuggesting: false }),
}));
vi.mock("@/features/campaigns/components/ProviderPill", () => ({
  ProviderPill: () => <div />,
}));
vi.mock("@/features/campaigns/components/MagicSuggestProgress", () => ({
  MagicSuggestProgress: () => <div />,
}));

import { PersonaEditor } from "../components/PersonaEditor";

const noop = async () => {};
const directive = () =>
  screen.getByLabelText("Intelligence Directive (System Prompt)") as HTMLTextAreaElement;

beforeEach(() => {
  licenseMock.current = { plan: "cloud" };
});

describe("PersonaEditor — prompt bound on managed AI", () => {
  it("cloud: the directive takes at most 8,000 characters", () => {
    render(<PersonaEditor persona={null} users={[]} onClose={noop} onSave={noop} />);
    expect(directive().maxLength).toBe(8000);
  });

  it.each(["byok", "free", "none"])("%s: the directive has no bound", (plan) => {
    licenseMock.current = { plan };
    render(<PersonaEditor persona={null} users={[]} onClose={noop} onSave={noop} />);
    expect(directive().hasAttribute("maxlength")).toBe(false);
  });
});
