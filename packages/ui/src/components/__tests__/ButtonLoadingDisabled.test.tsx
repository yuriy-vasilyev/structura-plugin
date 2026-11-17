import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Button } from "../Button";

/**
 * A loading button is never clickable. The caller's `disabled` was spread
 * after the one `loading` sets, so `disabled={false}` made a busy button
 * clickable again and a second click repeated the action (portal Run now,
 * 2026-11-17).
 */
describe("Button loading and disabled", () => {
  it("loading with disabled={false}: disabled, busy, and a click does nothing", () => {
    const onClick = vi.fn();
    render(
      <Button loading disabled={false} onClick={onClick}>
        Run now
      </Button>
    );
    const button = screen.getByRole("button", { name: /Run now/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("not loading with disabled: disabled and not busy", () => {
    const onClick = vi.fn();
    render(
      <Button loading={false} disabled onClick={onClick}>
        Run now
      </Button>
    );
    const button = screen.getByRole("button", { name: "Run now" });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute("aria-busy");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("neither: enabled, and a click runs", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Run now</Button>);
    const button = screen.getByRole("button", { name: "Run now" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("asChild: loading disables the child as well, whatever `disabled` says", () => {
    render(
      <Button asChild loading disabled={false}>
        <button type="button">Save</button>
      </Button>
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
