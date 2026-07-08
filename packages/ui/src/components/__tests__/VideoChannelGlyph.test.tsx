import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VideoChannelGlyph } from "../VideoChannelGlyph";

describe("VideoChannelGlyph", () => {
  it("renders a decorative currentColor mark (no platform branding)", () => {
    const { container } = render(<VideoChannelGlyph className="size-5" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
    expect(svg!.getAttribute("class")).toContain("size-5");
    // The frame strokes and the wedge fills with currentColor so the
    // parent tile's tint applies in both modes.
    expect(container.innerHTML).toContain('stroke="currentColor"');
    expect(container.innerHTML).toContain('fill="currentColor"');
  });
});
