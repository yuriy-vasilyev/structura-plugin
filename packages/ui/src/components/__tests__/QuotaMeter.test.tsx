import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuotaMeter } from "../QuotaMeter";

describe("QuotaMeter", () => {
  it("renders the caption label and forwards used/total to the progressbar", () => {
    render(<QuotaMeter used={12} total={20} label="12 of 20 videos this month" />);
    expect(screen.getByText("12 of 20 videos this month")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "12");
    expect(bar).toHaveAttribute("aria-valuemax", "20");
  });

  it("renders the optional right-aligned note", () => {
    render(<QuotaMeter used={12} total={20} label="12 of 20" note="Resets Aug 1" />);
    expect(screen.getByText("Resets Aug 1")).toBeInTheDocument();
  });

  it("omits the note element when no note is passed", () => {
    render(<QuotaMeter used={12} total={20} label="12 of 20" />);
    expect(screen.queryByText("Resets Aug 1")).not.toBeInTheDocument();
  });

  it("uses the brand fill while quota remains", () => {
    render(<QuotaMeter used={12} total={20} label="12 of 20" />);
    const fill = screen.getByRole("progressbar").firstElementChild as HTMLElement;
    expect(fill.className).toContain("bg-brand-600");
    expect(fill.className).not.toContain("bg-amber-500");
  });

  it("switches to the amber exhausted fill when used reaches total", () => {
    render(<QuotaMeter used={20} total={20} label="20 of 20" />);
    const fill = screen.getByRole("progressbar").firstElementChild as HTMLElement;
    expect(fill.className).toContain("bg-amber-500");
  });

  it("honors an explicit exhausted override", () => {
    render(<QuotaMeter used={2} total={20} exhausted label="2 of 20" />);
    const fill = screen.getByRole("progressbar").firstElementChild as HTMLElement;
    expect(fill.className).toContain("bg-amber-500");
  });

  it("accepts arbitrary react nodes for label and note (i18n happens in the apps)", () => {
    render(
      <QuotaMeter
        used={1}
        total={5}
        label={<span data-testid="label-node">1 von 5 Videos</span>}
        note={<span data-testid="note-node">Zurückgesetzt am 1. Aug.</span>}
      />
    );
    expect(screen.getByTestId("label-node")).toBeInTheDocument();
    expect(screen.getByTestId("note-node")).toBeInTheDocument();
  });
});
