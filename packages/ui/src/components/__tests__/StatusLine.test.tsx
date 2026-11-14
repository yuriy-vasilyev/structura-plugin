import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { StatusLine } from "../StatusLine";

/** Handoff persona voice, 4d: busy, done with Undo, restored, failed with Try again. */
describe("StatusLine", () => {
  it("done: the action fires and carries its own name", () => {
    const undo = vi.fn();
    render(
      <StatusLine tone="done" action={{ label: "Undo", onClick: undo, icon: "undo" }}>
        Redrafted from 5 pieces of your writing.
      </StatusLine>,
    );
    expect(screen.getByText("Redrafted from 5 pieces of your writing.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("error: the text takes the error tone, never colour alone (it says why in words)", () => {
    render(<StatusLine tone="error">Couldn’t write a new draft.</StatusLine>);
    const text = screen.getByText("Couldn’t write a new draft.");
    expect(text.closest("p")?.className).toMatch(/text-red-600/);
  });

  it("busy: the spinner is decorative and there is no action without one", () => {
    const { container } = render(<StatusLine tone="busy">Writing a new draft…</StatusLine>);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("can be the focus target itself (focus stays on the line after Undo)", () => {
    render(
      <StatusLine tone="done" focusable>
        Restored the previous version.
      </StatusLine>,
    );
    const line = screen.getByText("Restored the previous version.").closest("p")!;
    expect(line).toHaveAttribute("tabindex", "-1");
  });
});
