/**
 * LockedPanel — free-tier overlay wrapper for paid surfaces.
 *
 * Spec: `specs/seo-intelligence-plan.md` §3.1.
 *
 * Pinned behaviours:
 *   1. Preview children are decorative — `aria-hidden`, non-interactive
 *      (`pointer-events-none`) so screen readers and keyboard users
 *      don't get phantom buttons.
 *   2. The value statement renders as a heading inside the overlay so
 *      it's pickable by the a11y tree.
 *   3. The CTA is an external `<a>` with `target="_blank"` +
 *      `rel="noopener noreferrer"` (security default for external
 *      links).
 *   4. The CTA href carries the portal `intent` query so the portal
 *      lands the user on the matching upsell copy.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
}));

// Light mock of useLicense — we only need `plan` for the portal URL.
vi.mock("@/features/settings", () => ({
  useLicense: () => ({ plan: "free" }),
}));

import { LockedPanel } from "../components/LockedPanel";

describe("LockedPanel", () => {
  it("renders the value statement as a heading", () => {
    render(
      <LockedPanel
        valueStatement="Find keywords your site already ranks for."
        detail="Surface every term Google associates with your domain."
      >
        <div>preview content</div>
      </LockedPanel>,
    );
    expect(
      screen.getByRole("heading", {
        name: "Find keywords your site already ranks for.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Surface every term Google associates with your domain."),
    ).toBeInTheDocument();
  });

  it("hides preview children from the a11y tree", () => {
    render(
      <LockedPanel valueStatement="v">
        <button>Hidden Action</button>
      </LockedPanel>,
    );
    // Button still renders in the DOM (for the visual peek) but is
    // marked aria-hidden via the wrapper — RTL's accessible-name
    // queries must not surface it.
    expect(
      screen.queryByRole("button", { name: "Hidden Action" }),
    ).toBeNull();
  });

  it("links to the portal with the default keyword-bank intent", () => {
    render(
      <LockedPanel valueStatement="v">
        <div />
      </LockedPanel>,
    );
    const cta = screen.getByRole("link");
    const href = cta.getAttribute("href") ?? "";
    expect(href).toMatch(/intent=unlock_keyword_bank/);
    expect(href).toMatch(/source=plugin/);
    expect(cta).toHaveAttribute("target", "_blank");
    expect(cta).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("forwards a custom intent to the portal URL", () => {
    render(
      <LockedPanel valueStatement="v" intent="unlock_authority">
        <div />
      </LockedPanel>,
    );
    const href = screen.getByRole("link").getAttribute("href") ?? "";
    expect(href).toMatch(/intent=unlock_authority/);
  });
});
