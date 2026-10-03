import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PLATFORMS, PlatformMark, type Platform } from "../PlatformMark";
import { PlatformChip } from "../PlatformChip";

const IDS = Object.keys(PLATFORMS) as Platform[];

describe("PLATFORMS", () => {
  it("lists the five builders with their owners' spelling", () => {
    expect(PLATFORMS).toEqual({
      lovable: "Lovable",
      bolt: "Bolt",
      v0: "v0",
      replit: "Replit",
      custom: "Custom",
    });
  });
});

describe("PlatformMark", () => {
  it.each(IDS)("renders a decorative %s mark at 32px by default", (platform) => {
    const { container } = render(<PlatformMark platform={platform} />);
    const svg = container.querySelector("svg") as SVGElement;
    expect(svg).toHaveAttribute("data-platform", platform);
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "32");
    expect(svg).toHaveAttribute("height", "32");
  });

  it("renders at 16px when asked", () => {
    const { container } = render(<PlatformMark platform="bolt" size={16} />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "16");
  });

  it.each(["lovable", "bolt", "v0", "replit"] as const)(
    "draws the %s letterform as a currentColor path with no text node",
    (platform) => {
      const { container } = render(<PlatformMark platform={platform} />);
      const svg = container.querySelector("svg") as SVGElement;
      expect(svg).toHaveAttribute("stroke", "currentColor");
      expect(svg.querySelector("path")?.getAttribute("d")).toBeTruthy();
      expect(container.textContent).toBe("");
    }
  );

  it("uses the Lucide code glyph for custom", () => {
    const { container } = render(<PlatformMark platform="custom" />);
    expect(container.querySelector("svg")).toHaveClass("lucide-code-xml");
  });
});

describe("PlatformChip", () => {
  it.each(IDS)("shows the %s name as real text beside a 16px mark", (platform) => {
    const { container } = render(<PlatformChip platform={platform} />);
    // The mark adds no text, so the chip reads as exactly the name.
    expect(container.textContent).toBe(PLATFORMS[platform]);
    const svg = container.querySelector("svg") as SVGElement;
    expect(svg).toHaveAttribute("width", "16");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("can be referenced by aria-describedby and reads as the builder name", () => {
    render(
      <>
        <input aria-label="Name" aria-describedby="chip" />
        <PlatformChip id="chip" platform="lovable" />
      </>
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveAccessibleDescription("Lovable");
  });

  it("uses the pill tokens in both modes", () => {
    render(<PlatformChip id="chip" platform="v0" />);
    expect(document.getElementById("chip")).toHaveClass(
      "rounded-full",
      "border-neutral-200",
      "bg-neutral-50",
      "text-xs",
      "font-semibold",
      "dark:border-neutral-700",
      "dark:bg-neutral-900",
      "dark:text-neutral-200"
    );
  });
});
