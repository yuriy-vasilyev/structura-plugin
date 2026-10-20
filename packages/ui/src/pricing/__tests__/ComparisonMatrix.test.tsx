import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

// jsdom has no ResizeObserver; Headless UI uses it when the list closes after a pick.
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

/**
 * One Cloud column that follows the selected volume (design handoff
 * 2026-10-12); the Cloud Pro column is gone.
 */
describe("ComparisonMatrix — one Cloud column", () => {
  const withVolume = (onValueChange = vi.fn()): ComparisonMatrixProps => ({
    ...PROPS,
    includeWpOrg: false,
    groups: [
      {
        id: "ai",
        title: "AI & posts",
        rows: [{ label: "Posts / site / month", wpOrg: "—", free: "—", byok: "—", cloud: "100" }],
      },
    ],
    cloudVolume: {
      selector: {
        label: "Posts per site / month",
        value: 100,
        onValueChange,
        options: [
          { value: 30, label: "30 posts" },
          { value: 100, label: "100 posts" },
        ],
      },
      columnNote: "100 posts selected",
    },
  });

  it("renders Free, BYOK and Cloud columns only, with the selection under the Cloud header", () => {
    render(<ComparisonMatrix {...withVolume()} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Feature", "Free", "BYOK", "Cloud100 posts selected"]);
    expect(screen.queryByText(/Cloud Pro/)).not.toBeInTheDocument();
  });

  it("gives every phone value its plan label", () => {
    render(<ComparisonMatrix {...withVolume()} />);
    const block = screen.getAllByText("Posts / site / month").find((el) => el.tagName === "P")!;
    const terms = within(block.parentElement!)
      .getAllByRole("term")
      .map((t) => t.textContent);
    expect(terms).toEqual(["Free", "BYOK", "Cloud"]);
    const values = within(block.parentElement!)
      .getAllByRole("definition")
      .map((d) => d.textContent);
    expect(values).toEqual(["—", "—", "100"]);
  });

  it("drives the shared selection from its compact select", async () => {
    const onValueChange = vi.fn();
    render(<ComparisonMatrix {...withVolume(onValueChange)} />);
    expect(screen.getByText("Posts per site / month")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Posts per site/ }));
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByRole("option", { name: /30 posts/ }));
    expect(onValueChange).toHaveBeenCalledWith(30);
  });
});
