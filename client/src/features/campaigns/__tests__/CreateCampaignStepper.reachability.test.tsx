/**
 * New-campaign stepper — which steps you can click.
 *
 * Regression net for 2026-09-22: a step is only flagged complete/skipped
 * when the user leaves it FORWARD, so clicking back up the strip stranded
 * them — the step they had been standing on (Keywords, in the report) was
 * neither complete nor behind the cursor, so it went unreachable and the
 * only way back was to walk the whole flow again.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MessageSquare } from "lucide-react";

import { HorizontalStepper } from "../routes/CreateCampaignPage";

const STEPS = ["interview", "strategy", "keywords", "rhythm", "summary"].map((id) => ({
  id,
  label: id,
  icon: MessageSquare,
}));

/** The strip as it renders after stepping back to Interview from Keywords. */
function renderStrip(visited: string[], onStepClick = vi.fn()) {
  render(
    <HorizontalStepper
      steps={STEPS}
      activeStep="interview"
      // Strategy earned its check on the way through; Keywords never did.
      completedSteps={new Set(["interview", "strategy"])}
      skippedSteps={new Set<string>()}
      visitedSteps={new Set(visited)}
      onStepClick={onStepClick}
    />
  );
  return onStepClick;
}

const stepButton = (label: string) => screen.getByRole("button", { name: new RegExp(label) });

describe("New-campaign stepper reachability", () => {
  it("lets the user back into the step they were standing on", () => {
    const onStepClick = renderStrip(["interview", "strategy", "keywords"]);

    const keywords = stepButton("keywords");
    expect(keywords).toBeEnabled();
    fireEvent.click(keywords);
    expect(onStepClick).toHaveBeenCalledWith("keywords");
  });

  it("still keeps steps the user has never opened out of reach", () => {
    renderStrip(["interview", "strategy", "keywords"]);

    expect(stepButton("rhythm")).toBeDisabled();
    expect(stepButton("summary")).toBeDisabled();
  });

  it("keeps completed steps clickable on their own", () => {
    // Visited is additive, not a replacement: a resumed draft starts with
    // only the active step in the set and must still offer the green ones.
    renderStrip(["interview"]);

    expect(stepButton("strategy")).toBeEnabled();
    expect(stepButton("keywords")).toBeDisabled();
  });
});
