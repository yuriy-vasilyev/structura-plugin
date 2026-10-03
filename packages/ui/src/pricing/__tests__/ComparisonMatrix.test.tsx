import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComparisonMatrix, type ComparisonMatrixProps } from "../ComparisonMatrix";

/**
 * The plan-comparison header follows the www heading rule (since 2026-09-26):
 * the keyword eyebrow is the `<h2>` that `aria-labelledby` points at, and the
 * big display line is a `<p>`. This file is the only place that rule is pinned
 * for a component living outside www, so it is cheap to regress by "fixing"
 * the markup back.
 */
const PROPS: ComparisonMatrixProps = {
  groups: [
    {
      id: "access",
      title: "Pricing & access",
      rows: [{ label: "Sites", wpOrg: "1", free: "1", byok: "Unlimited", cloud: "Unlimited" }],
    },
  ],
  labels: {
    eyebrow: "Plan comparison",
    title: "Full feature comparison",
    columns: { feature: "Feature", wpOrg: "wp.org", free: "Free", byok: "BYOK", cloud: "Cloud" },
    cellAria: { included: "Included", notIncluded: "Not included" },
  },
};

describe("ComparisonMatrix — header outline", () => {
  it("makes the eyebrow the h2 and the display line a paragraph", () => {
    render(<ComparisonMatrix {...PROPS} />);
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2).toHaveTextContent("Plan comparison");
    expect(h2).toHaveAttribute("id", "comparison-matrix-title");
    expect(screen.getByText("Full feature comparison").tagName).toBe("P");
  });
});
