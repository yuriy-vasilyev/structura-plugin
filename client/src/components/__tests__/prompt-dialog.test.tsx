import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PromptDialog } from "@structura/ui";

/**
 * PromptDialog — the app-wide gating/upsell explainer added 2026-09-03
 * (tier-gating work: a blocked action opens an explanation with a way
 * forward instead of sitting disabled and mute). Renders the REAL
 * primitive from @structura/ui; pins the CTA contract both surfaces
 * rely on.
 */
describe("PromptDialog", () => {
  it("renders title, description, and fires both CTAs", () => {
    const onUpgrade = vi.fn();
    const onClose = vi.fn();
    render(
      <PromptDialog
        open
        onClose={onClose}
        title="Campaign limit reached"
        description="You're using 1 of 1 campaigns on your plan."
        bullets={["Full 20+ point SEO protocol", "Cancel anytime"]}
        primaryAction={{ label: "Upgrade", onClick: onUpgrade }}
        secondaryAction={{ label: "Maybe later" }}
      />
    );
    expect(screen.getByText("Campaign limit reached")).toBeInTheDocument();
    // Upsell bullets render as a check-list between description and CTAs.
    expect(screen.getByText("Full 20+ point SEO protocol")).toBeInTheDocument();
    expect(screen.getByText("Cancel anytime")).toBeInTheDocument();
    expect(screen.getByText("You're using 1 of 1 campaigns on your plan.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Upgrade" }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);

    // Secondary defaults its click to onClose — "Maybe later" just closes.
    fireEvent.click(screen.getByRole("button", { name: "Maybe later" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when closed", () => {
    render(
      <PromptDialog
        open={false}
        onClose={() => {}}
        title="Hidden"
        description="Should not be visible"
      />
    );
    expect(screen.queryByText("Hidden")).toBeNull();
  });
});
