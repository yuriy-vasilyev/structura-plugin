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
import { fireEvent, render, screen } from "@testing-library/react";

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
  window.localStorage.clear();
  window.structuraConfig = { activation_id: "act-site-a" } as typeof window.structuraConfig;
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

  // Owner review 2026-10-06: one persona is fine. The notice says so,
  // names the voice in the title, and can be closed for good on this site.
  it("reads as a calm note that names the voice", () => {
    personasMock.current = { data: [{ id: "p1", name: "House voice" }], isLoading: false };
    render(<DefaultPersonaAdvisory />);

    expect(screen.getByText("Writing as House voice")).toBeInTheDocument();
    expect(
      screen.getByText("Every post uses your only persona. Add more if you want to vary the tone.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Using your only persona")).toBeNull();
  });

  it("closes on Dismiss and stays closed on this site after a reload", () => {
    personasMock.current = { data: [{ id: "p1", name: "House voice" }], isLoading: false };
    const first = render(<DefaultPersonaAdvisory />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Writing as House voice")).toBeNull();
    first.unmount();

    const again = render(<DefaultPersonaAdvisory />);
    expect(again.container).toBeEmptyDOMElement();
  });

  it("still shows on another site opened in the same browser", () => {
    personasMock.current = { data: [{ id: "p1", name: "House voice" }], isLoading: false };
    const first = render(<DefaultPersonaAdvisory />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    first.unmount();

    window.structuraConfig = { activation_id: "act-site-b" } as typeof window.structuraConfig;
    render(<DefaultPersonaAdvisory />);
    expect(screen.getByText("Writing as House voice")).toBeInTheDocument();
  });
});
