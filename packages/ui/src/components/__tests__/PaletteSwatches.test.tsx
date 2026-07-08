import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaletteSwatches } from "../PaletteSwatches";

const COLORS = ["#F9F9F9", "#111111", "#B36D33"];

function swatches() {
  return Array.from(screen.getByRole("img").querySelectorAll<HTMLElement>("span"));
}

describe("PaletteSwatches", () => {
  it("exposes the stack as a labelled image", () => {
    render(<PaletteSwatches colors={COLORS} label="Preset palette" />);
    expect(screen.getByRole("img", { name: "Preset palette" })).toBeInTheDocument();
  });

  it("renders one aria-hidden circle per color, tinted via backgroundColor", () => {
    render(<PaletteSwatches colors={COLORS} label="Preset palette" />);
    const dots = swatches();
    expect(dots).toHaveLength(3);
    dots.forEach((dot) => expect(dot).toHaveAttribute("aria-hidden", "true"));
    expect(dots[2]).toHaveStyle({ backgroundColor: "rgb(179, 109, 51)" });
  });

  it("caps at 5 swatches by default", () => {
    render(
      <PaletteSwatches
        colors={["#111", "#222", "#333", "#444", "#555", "#666", "#777"]}
        label="Preset palette"
      />
    );
    expect(swatches()).toHaveLength(5);
  });

  it("respects a custom max", () => {
    render(<PaletteSwatches colors={COLORS} max={2} label="Preset palette" />);
    expect(swatches()).toHaveLength(2);
  });

  it("applies the inset ring in both modes", () => {
    render(<PaletteSwatches colors={COLORS} label="Preset palette" />);
    for (const dot of swatches()) {
      expect(dot.className).toContain("ring-1");
      expect(dot.className).toContain("ring-inset");
      expect(dot.className).toContain("ring-black/10");
      expect(dot.className).toContain("dark:ring-white/20");
    }
  });

  it("defaults to 16px circles that overlap by 6px", () => {
    render(<PaletteSwatches colors={COLORS} label="Preset palette" />);
    const dots = swatches();
    expect(dots[0].style.width).toBe("16px");
    expect(dots[0].style.height).toBe("16px");
    expect(dots[0].style.marginLeft).toBe("");
    expect(dots[1].style.marginLeft).toBe("-6px");
  });

  it("scales the overlap with a custom size", () => {
    render(<PaletteSwatches colors={COLORS} size={24} label="Preset palette" />);
    const dots = swatches();
    expect(dots[0].style.width).toBe("24px");
    expect(dots[1].style.marginLeft).toBe("-9px");
  });
});
