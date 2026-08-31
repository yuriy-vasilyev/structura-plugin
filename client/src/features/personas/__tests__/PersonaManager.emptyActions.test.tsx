/**
 * PersonaManager — top actions row vs the empty-state CTAs.
 *
 * Regression (2026-07-20 fresh-install QA): when the library is empty the
 * full `EmptyState` renders its OWN New/Templates buttons, so the top actions
 * row ("Templates" + "New Persona") duplicated them. The top row must hide
 * while the empty state is showing, and reappear once a voice is present.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({ __: (t: string) => t }));

const personasMock = vi.hoisted(() => ({
  current: { data: [] as unknown[], isLoading: false },
}));
vi.mock("../api/usePersonasQuery", () => ({
  usePersonasQuery: () => personasMock.current,
  useWpUsersQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock("../api/usePersonaMutations", () => ({
  usePersonaMutations: () => ({ savePersona: vi.fn() }),
}));

vi.mock("../components/PersonaCard", () => ({
  PersonaCard: ({ persona }: { persona: { name: string } }) => (
    <div>{persona.name}</div>
  ),
}));
vi.mock("../components/PersonaEditor", () => ({ PersonaEditor: () => null }));
vi.mock("../components/TemplateLibrary", () => ({ TemplateLibrary: () => null }));

vi.mock("@structura/ui", () => ({
  Button: ({ children }: { children?: unknown }) => (
    <button type="button">{children as never}</button>
  ),
  PageLoader: () => <div>loading</div>,
  EmptyState: ({ action }: { action?: unknown }) => (
    <div>{action as never}</div>
  ),
}));

import { PersonaManager } from "../components/PersonaManager";

describe("PersonaManager — empty-state action de-duplication", () => {
  it("hides the top actions row when the empty state is showing", () => {
    personasMock.current = { data: [], isLoading: false };
    render(<PersonaManager memberIds={[]} />);

    // Only the EmptyState CTA — not the top row too.
    expect(screen.getAllByText("New Persona")).toHaveLength(1);
  });

  it("shows the top actions row once a voice is bound", () => {
    personasMock.current = {
      data: [{ id: "hv1", name: "House voice", tone: "professional" }],
      isLoading: false,
    };
    render(<PersonaManager memberIds={["hv1"]} />);

    // Bound voice renders; the top actions row is back.
    expect(screen.getByText("House voice")).toBeInTheDocument();
    expect(screen.getByText("New Persona")).toBeInTheDocument();
    expect(screen.getByText("Templates")).toBeInTheDocument();
  });
});
