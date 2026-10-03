import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecommendedLabel } from "../RecommendedLabel";

describe("RecommendedLabel", () => {
  it("renders the visible word with a decorative icon", () => {
    const { container } = render(<RecommendedLabel label="Recommended" />);
    const chip = screen.getByText("Recommended");
    expect(chip).toHaveTextContent(/^Recommended$/);
    const icon = container.querySelector("svg");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(chip).not.toHaveAttribute("aria-description");
  });

  it("exposes the description as aria-description on the chip", () => {
    render(
      <RecommendedLabel
        label="Recommended for text"
        description="Recommended provider for writing posts"
      />
    );
    expect(screen.getByText("Recommended for text")).toHaveAccessibleDescription(
      "Recommended provider for writing posts"
    );
  });

  it("is static: not focusable and not a control", () => {
    render(<RecommendedLabel label="Recommended" />);
    const chip = screen.getByText("Recommended");
    expect(chip).not.toHaveAttribute("tabindex");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
