/**
 * ToggleChip: the builder's phrase chips (handoffs/visual-signatures/README.md
 * §3.5 "Chip", §6 dark, §10 targets). The off chip is DiscoverableChipList's
 * dashed suggestion chip; the on chip is solid brand tint with a check.
 */
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ToggleChip } from "../ToggleChip";

const LABEL = "Add “Soft window light” to Technique";

function Controlled({ initial = false }: { initial?: boolean }) {
  const [pressed, setPressed] = useState(initial);
  return (
    <ToggleChip pressed={pressed} onPressedChange={setPressed} aria-label={LABEL}>
      Soft window light
    </ToggleChip>
  );
}

describe("ToggleChip", () => {
  it("is a toggle button named by aria-label that shows its phrase", () => {
    render(
      <ToggleChip pressed={false} onPressedChange={vi.fn()} aria-label={LABEL}>
        Soft window light
      </ToggleChip>
    );
    const chip = screen.getByRole("button", { name: LABEL });
    expect(chip).toHaveAttribute("type", "button");
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(chip).toHaveTextContent("Soft window light");
  });

  it("is named by its phrase without an aria-label", () => {
    render(
      <ToggleChip pressed onPressedChange={vi.fn()}>
        Soft window light
      </ToggleChip>
    );
    expect(screen.getByRole("button", { name: "Soft window light" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("asks for the opposite state on click", () => {
    const onPressedChange = vi.fn();
    const { rerender } = render(
      <ToggleChip pressed={false} onPressedChange={onPressedChange}>
        Soft window light
      </ToggleChip>
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onPressedChange).toHaveBeenLastCalledWith(true);

    rerender(
      <ToggleChip pressed onPressedChange={onPressedChange}>
        Soft window light
      </ToggleChip>
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onPressedChange).toHaveBeenLastCalledWith(false);
  });

  it("toggles aria-pressed and swaps the plus for a check", () => {
    render(<Controlled />);
    const chip = screen.getByRole("button", { name: LABEL });
    expect(chip.querySelector("svg.lucide-plus")).toHaveAttribute("aria-hidden", "true");
    expect(chip.querySelector("svg.lucide-check")).toBeNull();

    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip.querySelector("svg.lucide-check")).toHaveAttribute("aria-hidden", "true");
    expect(chip.querySelector("svg.lucide-plus")).toBeNull();

    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("puts the icon after the phrase", () => {
    render(<Controlled />);
    const chip = screen.getByRole("button", { name: LABEL });
    expect(chip.lastElementChild).toHaveClass("lucide-plus");
  });

  it("off: dashed neutral outline with a neutral-500 plus, in both modes", () => {
    render(<Controlled />);
    const chip = screen.getByRole("button", { name: LABEL });
    expect(chip).toHaveClass(
      "inline-flex",
      "min-h-7",
      "rounded-full",
      "text-xs",
      "border-dashed",
      "border-neutral-300",
      "bg-white",
      "text-neutral-700",
      "dark:border-neutral-600",
      "dark:bg-neutral-900",
      "dark:text-neutral-300"
    );
    expect(chip.querySelector("svg.lucide-plus")).toHaveClass("text-neutral-500");
  });

  it("on: solid brand tint, in both modes", () => {
    render(<Controlled initial />);
    const chip = screen.getByRole("button", { name: LABEL });
    expect(chip).toHaveClass(
      "border-solid",
      "border-brand-200",
      "bg-brand-50",
      "text-brand-800",
      "dark:border-brand-800",
      "dark:bg-brand-950",
      "dark:text-brand-200"
    );
    expect(chip).not.toHaveClass("border-dashed");
  });

  it("grows to a 32px target on phones", () => {
    render(<Controlled />);
    expect(screen.getByRole("button", { name: LABEL })).toHaveClass("max-sm:min-h-8");
  });

  it("ignores clicks while disabled, and dims", () => {
    const onPressedChange = vi.fn();
    render(
      <ToggleChip pressed={false} onPressedChange={onPressedChange} disabled>
        Soft window light
      </ToggleChip>
    );
    const chip = screen.getByRole("button");
    expect(chip).toBeDisabled();
    expect(chip).toHaveClass("disabled:opacity-50");
    fireEvent.click(chip);
    expect(onPressedChange).not.toHaveBeenCalled();
  });

  it("merges className and forwards the ref to the button", () => {
    let node: HTMLButtonElement | null = null;
    render(
      <ToggleChip
        pressed={false}
        onPressedChange={vi.fn()}
        className="max-w-full"
        ref={(el) => {
          node = el;
        }}
      >
        Soft window light
      </ToggleChip>
    );
    const chip = screen.getByRole("button");
    expect(chip).toHaveClass("max-w-full");
    expect(node).toBe(chip);
  });
});
