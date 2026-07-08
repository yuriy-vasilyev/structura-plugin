/**
 * NoPersonasBlocker tests.
 *
 * The blocker is the UX half of the zero-personas hard block (the cloud
 * `postCampaign` and plugin `generate_single_post` enforce the same
 * server-side). Coverage:
 *   - Hidden while the persona list is loading (no disabled→enabled flash).
 *   - Hidden when 1+ personas exist (the soft advisory takes over at 1).
 *   - Visible with a "create a persona" CTA when zero personas exist.
 *   - CTA navigates to the personas page.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
}));

const h = vi.hoisted(() => ({
  personas: undefined as unknown[] | undefined,
  isLoading: false,
  navigate: vi.fn(),
}));

vi.mock("@/features/personas", () => ({
  usePersonasQuery: () => ({ data: h.personas, isLoading: h.isLoading }),
}));

vi.mock("react-router", () => ({
  useNavigate: () => h.navigate,
}));

import { NoPersonasBlocker } from "../NoPersonasBlocker";

beforeEach(() => {
  h.personas = undefined;
  h.isLoading = false;
  h.navigate = vi.fn();
});

describe("NoPersonasBlocker", () => {
  it("renders nothing while the persona list is loading", () => {
    h.isLoading = true;
    const { container } = render(<NoPersonasBlocker />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when at least one persona exists", () => {
    h.personas = [{ id: "p1", name: "House voice" }];
    const { container } = render(<NoPersonasBlocker />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the blocker when zero personas exist", () => {
    h.personas = [];
    render(<NoPersonasBlocker />);
    expect(screen.getByText(/Add a persona to continue/i)).toBeInTheDocument();
  });

  it("treats an undefined (not-yet-resolved) list as zero once not loading", () => {
    // `usePersonasQuery` can briefly return `data: undefined` after the
    // loading flag flips; `count = personas?.length ?? 0` must still
    // resolve to the blocked state rather than crash on `.length`.
    h.personas = undefined;
    h.isLoading = false;
    render(<NoPersonasBlocker />);
    expect(screen.getByText(/Add a persona to continue/i)).toBeInTheDocument();
  });

  it("navigates to the personas page from the CTA", () => {
    h.personas = [];
    render(<NoPersonasBlocker />);
    fireEvent.click(screen.getByRole("button", { name: /create a persona/i }));
    expect(h.navigate).toHaveBeenCalledWith("/personas");
  });
});
