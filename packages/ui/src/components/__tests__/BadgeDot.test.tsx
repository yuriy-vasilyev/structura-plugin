import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "../Badge";

const getDot = (badge: HTMLElement) =>
  badge.querySelector<HTMLElement>("[data-badge-dot]");

describe("Badge dot variant", () => {
  it("renders no dot by default (back-compat)", () => {
    render(<Badge data-testid="badge">Ready</Badge>);
    expect(getDot(screen.getByTestId("badge"))).toBeNull();
  });

  it("renders a decorative leading 6px dot when dot is set", () => {
    render(
      <Badge data-testid="badge" dot>
        Rendering
      </Badge>
    );
    const badge = screen.getByTestId("badge");
    const dot = getDot(badge);
    expect(dot).not.toBeNull();
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot?.className).toContain("size-1.5");
    expect(dot?.className).toContain("rounded-full");
    expect(dot?.className).toContain("bg-current");
    // Leading: the dot precedes the label text.
    expect(badge.firstElementChild).toBe(dot);
    // Not pulsing unless asked.
    expect(dot?.className).not.toContain("animate-pulse-dot");
  });

  it("pulses when dotPulse is set, and goes static under prefers-reduced-motion", () => {
    render(
      <Badge data-testid="badge" dotPulse>
        Rendering
      </Badge>
    );
    const dot = getDot(screen.getByTestId("badge"));
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain("animate-pulse-dot");
    expect(dot?.className).toContain("motion-reduce:animate-none");
  });

  it("still renders children and intent classes alongside the dot", () => {
    render(
      <Badge data-testid="badge" intent="indigo" dotPulse>
        Rendering
      </Badge>
    );
    const badge = screen.getByTestId("badge");
    expect(badge).toHaveTextContent("Rendering");
    expect(badge.className).toContain("bg-brand-50");
  });
});
