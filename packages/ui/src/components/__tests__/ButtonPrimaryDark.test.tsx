import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "../Button";

/**
 * White on brand-500 is 4.47:1, under AA for 14px bold, so the dark primary
 * keeps the light brand-600 fill (specs/article-delivery-connect-flow.md §7).
 */
describe("Button primary in dark mode", () => {
  it("fills with brand-600 and has no brand-500 dark override", () => {
    render(<Button>Send test article</Button>);
    const button = screen.getByRole("button", { name: "Send test article" });
    expect(button).toHaveClass("bg-brand-600");
    expect(button.className).not.toMatch(/dark:bg-brand-500\b/);
    expect(button.className).not.toMatch(/dark:hover:bg-brand-400\b/);
  });
});
