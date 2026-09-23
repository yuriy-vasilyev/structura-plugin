/**
 * Stepper — reachability of the step strip.
 *
 * Regression net for 2026-09-22: in the campaign create wizard, clicking
 * back to "Interview" from "Discovery" greyed out every later step, because
 * clickability was derived from `activeIndex` alone. The user was stranded
 * on step 1 with only its AI-drafting CTA as a way forward.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Stepper } from "../Stepper";

const STEPS = ["Interview", "Strategy", "Discovery", "Rhythm", "Summary"].map(
  (label) => ({ id: label.toLowerCase(), label })
);

describe("Stepper", () => {
  it("keeps steps the user never reached unclickable", () => {
    render(<Stepper steps={STEPS} activeIndex={0} onStepClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Strategy/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Summary/ })).toBeDisabled();
  });

  it("lets the user jump forward again to a step already reached", () => {
    const onStepClick = vi.fn();
    // Walked as far as Rhythm, then stepped back to Interview.
    render(
      <Stepper
        steps={STEPS}
        activeIndex={0}
        reachedIndex={3}
        onStepClick={onStepClick}
      />
    );

    const strategy = screen.getByRole("button", { name: /Strategy/ });
    expect(strategy).toBeEnabled();
    fireEvent.click(strategy);
    expect(onStepClick).toHaveBeenCalledWith("strategy", 1);

    // Still nothing beyond the furthest point.
    expect(screen.getByRole("button", { name: /Summary/ })).toBeDisabled();
  });

  it("never makes a locked step clickable, reached or not", () => {
    const steps = STEPS.map((s) =>
      s.id === "summary" ? { ...s, locked: true } : s
    );
    render(
      <Stepper
        steps={steps}
        activeIndex={0}
        reachedIndex={4}
        onStepClick={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /Summary/ })).toBeDisabled();
  });

  it("shows the number, not a completed check, on a reached step still flagged incomplete", () => {
    const steps = STEPS.map((s) => (s.id === "strategy" ? { ...s, dot: true } : s));
    render(<Stepper steps={steps} activeIndex={0} reachedIndex={3} onStepClick={vi.fn()} />);

    // Emptying the campaign name after walking past Strategy must not leave
    // a green tick on the step that is blocking Launch.
    expect(screen.getByRole("button", { name: /Strategy/ })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /Discovery/ })).not.toHaveTextContent("3");
  });
});
