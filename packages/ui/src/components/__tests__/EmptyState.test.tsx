import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { EmptyState } from "../EmptyState";

describe("EmptyState icon tone", () => {
  it("defaults to the brand tile", () => {
    render(<EmptyState icon={<svg data-testid="icon" />} title="No personas yet" />);
    expect(screen.getByTestId("icon").parentElement?.className).toMatch(/bg-brand-50/);
  });

  // The failed persona draft (handoff persona voice, 1s) isn't dangerous:
  // its icon sits on a neutral tile, not brand and not red.
  it("neutral puts the icon on a neutral tile", () => {
    render(
      <EmptyState icon={<svg data-testid="icon" />} iconTone="neutral" title="We couldn’t draft a persona" />,
    );
    const tile = screen.getByTestId("icon").parentElement!;
    expect(tile.className).toMatch(/bg-neutral-100/);
    expect(tile.className).not.toMatch(/brand|red/);
  });
});
