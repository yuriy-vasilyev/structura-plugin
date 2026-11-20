/**
 * Switch passes a caller's `aria-describedby` to the control. A row that
 * shows its label and hint outside the Switch (`hiddenLabel`) had no way to
 * tie the hint to it, so a screen reader heard "References list, switch,
 * dimmed" without the reason it was disabled (customer portal, 2026-11-20).
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Switch } from "../Switch";

describe("Switch aria-describedby", () => {
  it("describes the control by the caller's hint, also when disabled", () => {
    render(
      <>
        <Switch
          label="References list"
          hiddenLabel
          checked={false}
          onChange={vi.fn()}
          disabled
          aria-describedby="refs-hint"
        />
        <p id="refs-hint">Turn on authority links to use this.</p>
      </>
    );
    const control = screen.getByRole("switch", { name: "References list" });
    expect(control).toHaveAccessibleDescription("Turn on authority links to use this.");
    expect(control).toBeDisabled();
  });

  it("adds no description when none is passed", () => {
    render(<Switch label="Disable emojis" hiddenLabel checked onChange={vi.fn()} />);
    expect(screen.getByRole("switch", { name: "Disable emojis" })).not.toHaveAttribute(
      "aria-describedby"
    );
  });

  it("stays a non-submitting button that toggles, inside a form too", () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Switch
          label="References list"
          hiddenLabel
          checked={false}
          onChange={onChange}
          aria-describedby="refs-hint"
        />
        <p id="refs-hint">Lists the studies and sources a post cites.</p>
      </form>
    );
    const control = screen.getByRole("switch", { name: "References list" });
    expect(control).toHaveAttribute("type", "button");
    expect(control).toHaveAttribute("aria-checked", "false");
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
