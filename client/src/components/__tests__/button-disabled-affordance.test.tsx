import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@structura/ui";

/**
 * Regression — wp.org first-impression QA, 2026-09-02.
 *
 * Gated primary CTAs ("Generate Post", "New Campaign", "Connect
 * Account") read as enabled-but-broken: the Button primitive's disabled
 * state carried `disabled:pointer-events-none`, which suppressed BOTH
 * the `cursor-not-allowed` cursor and the `title` tooltip callers pass
 * to explain why the action is gated. A first-time anonymous user's
 * first real click produced zero feedback of any kind.
 *
 * Renders the REAL @structura/ui Button (nothing mocked) and pins the
 * contract: a disabled button keeps its explanatory title reachable —
 * no pointer-events suppression, not-allowed cursor present.
 */
describe("Button disabled affordance", () => {
  it("keeps the explanatory title tooltip and cursor reachable when disabled", () => {
    render(
      <Button disabled title="Connect an AI provider in the AI Engine settings first.">
        Generate Post
      </Button>
    );
    const btn = screen.getByRole("button", { name: "Generate Post" });
    expect(btn.hasAttribute("disabled")).toBe(true);
    expect(btn.getAttribute("title")).toBe(
      "Connect an AI provider in the AI Engine settings first."
    );
    // pointer-events-none is what made the title/cursor unreachable.
    expect(btn.className).not.toMatch(/pointer-events-none/);
    expect(btn.className).toMatch(/disabled:cursor-not-allowed/);
  });

  it("still suppresses hover/press motion while disabled", () => {
    render(
      <Button disabled title="why">
        Save
      </Button>
    );
    const btn = screen.getByRole("button", { name: "Save" });
    // The motion suppression that replaced pointer-events-none: a gated
    // button must not animate like a live one.
    expect(btn.className).toMatch(/disabled:hover:scale-100/);
    expect(btn.className).toMatch(/disabled:active:scale-100/);
  });
});
