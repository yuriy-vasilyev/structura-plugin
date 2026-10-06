import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AiGeneratedBadge } from "../AiGeneratedBadge";

/** The visible pill inside the official 1789.84 x 566.93 artwork (measured 2026-10-05). */
const PILL_VIEWBOX = "207 144 1385 267";

function pill(name = "EU AI generated badge") {
  return screen.getByRole("img", { name });
}

describe("AiGeneratedBadge", () => {
  it("exposes the pill as a labelled image", () => {
    render(<AiGeneratedBadge variant="black" label="EU AI generated badge" />);
    expect(pill()).toBeInTheDocument();
    expect(pill().tagName.toLowerCase()).toBe("svg");
  });

  it("crops the official artwork to the visible pill", () => {
    render(<AiGeneratedBadge variant="black" label="EU AI generated badge" />);
    expect(pill().getAttribute("viewBox")).toBe(PILL_VIEWBOX);
  });

  it("sizes by height and keeps the pill's aspect ratio", () => {
    render(<AiGeneratedBadge variant="black" height={20} label="EU AI generated badge" />);
    expect(pill().getAttribute("height")).toBe("20");
    // 1385 / 267 * 20 = 103.7…
    expect(Number(pill().getAttribute("width"))).toBeCloseTo(103.75, 1);
  });

  it("defaults to a 24px pill", () => {
    render(<AiGeneratedBadge variant="white" label="EU AI generated badge" />);
    expect(pill().getAttribute("height")).toBe("24");
  });

  it("black: black pill, white letters (the official black file)", () => {
    const { container } = render(
      <AiGeneratedBadge variant="black" label="EU AI generated badge" />
    );
    const paths = Array.from(container.querySelectorAll("path"));
    // One pill plus the eleven letter outlines of "AI GENERATED".
    expect(paths).toHaveLength(12);
    expect(paths[0].getAttribute("fill")).toBe("#000");
    for (const letter of paths.slice(1)) expect(letter.getAttribute("fill")).toBe("#fff");
  });

  it("white: white pill, near-black letters (the official white file)", () => {
    const { container } = render(
      <AiGeneratedBadge variant="white" label="EU AI generated badge" />
    );
    const paths = Array.from(container.querySelectorAll("path"));
    expect(paths).toHaveLength(12);
    expect(paths[0].getAttribute("fill")).toBe("#fff");
    for (const letter of paths.slice(1)) expect(letter.getAttribute("fill")).toBe("#1d1d1b");
  });

  it("passes className through", () => {
    render(
      <AiGeneratedBadge
        variant="black"
        label="EU AI generated badge"
        className="hidden dark:block"
      />
    );
    expect(pill().getAttribute("class")).toContain("dark:block");
  });
});
