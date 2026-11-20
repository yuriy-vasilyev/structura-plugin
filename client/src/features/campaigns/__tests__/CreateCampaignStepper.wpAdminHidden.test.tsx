/**
 * New-campaign stepper — nothing that must reappear above `sm` uses the
 * bare `hidden` class (2026-11-20).
 *
 * wp-admin ships an unlayered `.hidden { display: none }`; it beats the
 * layered `sm:block` our Tailwind build emits, so `hidden sm:block` stays
 * hidden at every width inside wp-admin. The connector lines vanished on
 * desktop that way. `max-sm:hidden` never emits a `.hidden` selector. jsdom
 * applies no stylesheets, so this pins the classes; the layout was measured
 * in Chromium with WordPress's stylesheets loaded.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MessageSquare } from "lucide-react";

import { HorizontalStepper } from "../routes/CreateCampaignPage";

const STEPS = ["setup", "keywords", "authority", "rhythm", "summary"].map((id) => ({
  id,
  label: id,
  icon: MessageSquare,
}));

describe("New-campaign stepper in wp-admin", () => {
  it("hides its connector lines below sm without the bare `hidden` class", () => {
    const { container } = render(
      <HorizontalStepper
        steps={STEPS}
        activeStep="authority"
        completedSteps={new Set(["setup"])}
        skippedSteps={new Set(["keywords"])}
        visitedSteps={new Set(["setup", "keywords", "authority"])}
        onStepClick={() => {}}
      />
    );

    expect(container.querySelectorAll(".hidden")).toHaveLength(0);
    const lines = container.querySelectorAll(".h-0\\.5");
    expect(lines).toHaveLength(STEPS.length - 1);
    lines.forEach((line) => expect(line).toHaveClass("max-sm:hidden"));
  });
});
