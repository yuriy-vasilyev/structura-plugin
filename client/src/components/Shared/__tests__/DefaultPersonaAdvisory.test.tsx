/**
 * DefaultPersonaAdvisory — single-persona advisory copy.
 *
 * Regression (2026-07-08): the advisory used to assert the one persona
 * on file was the auto-seeded "House voice" default. That's wrong — a
 * user who picks ONE persona from the onboarding templates lands here
 * too, and being told they're on an "auto-seeded default" they never
 * chose reads as a bug. The copy now names the actual persona and makes
 * no origin claim.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({
  __: (t: string) => t,
  sprintf: (t: string, ...args: unknown[]) =>
    t.replace(/%s/g, () => String(args.shift())),
}));

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
}));

const personasMock = vi.hoisted(() => ({
  current: { data: [] as Array<{ id: string; name: string }>, isLoading: false },
}));
vi.mock("@/features/personas", () => ({
  usePersonasQuery: () => personasMock.current,
}));

import { DefaultPersonaAdvisory } from "../DefaultPersonaAdvisory";

beforeEach(() => {
  personasMock.current = { data: [], isLoading: false };
});

describe("DefaultPersonaAdvisory", () => {
  it("names the user's single persona and makes no auto-seeded/default claim", () => {
    personasMock.current = {
      data: [{ id: "p1", name: "Warm Coach" }],
      isLoading: false,
    };
    render(<DefaultPersonaAdvisory />);

    // The persona the user actually chose is named…
    expect(screen.getByText(/Warm Coach/)).toBeInTheDocument();
    // …and the old, wrong "auto-seeded House voice default" framing is gone.
    expect(screen.queryByText(/House voice/)).toBeNull();
    expect(screen.queryByText(/auto-seeded/i)).toBeNull();
    expect(screen.queryByText(/default persona/i)).toBeNull();
  });

  it("renders nothing while loading", () => {
    personasMock.current = { data: [], isLoading: true };
    const { container } = render(<DefaultPersonaAdvisory />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing with zero or multiple personas", () => {
    personasMock.current = { data: [], isLoading: false };
    const { container: none } = render(<DefaultPersonaAdvisory />);
    expect(none).toBeEmptyDOMElement();

    personasMock.current = {
      data: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      isLoading: false,
    };
    const { container: many } = render(<DefaultPersonaAdvisory />);
    expect(many).toBeEmptyDOMElement();
  });
});
