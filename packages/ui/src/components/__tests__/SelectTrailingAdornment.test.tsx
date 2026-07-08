import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Select } from "../Select";

const OPTIONS = [
  { value: "ava", label: "Ava" },
  { value: "marcus", label: "Marcus" },
];

function renderSelect(ui?: {
  trailingAdornment?: React.ReactNode;
  onValueChange?: (v: string | number) => void;
}) {
  const onValueChange = ui?.onValueChange ?? vi.fn();
  render(
    <Select options={OPTIONS} value="ava" onValueChange={onValueChange}>
      <Select.Trigger trailingAdornment={ui?.trailingAdornment} />
      <Select.Content />
    </Select>
  );
  return { onValueChange };
}

describe("Select trailing adornment", () => {
  it("renders the adornment as a sibling — never nested inside the trigger button", () => {
    renderSelect({
      trailingAdornment: (
        <button type="button" aria-label="play-sample">
          ▶
        </button>
      ),
    });
    const adornment = screen.getByRole("button", { name: "play-sample" });
    // Invalid HTML guard: a button must not be a descendant of another button.
    expect(adornment.parentElement?.closest("button")).toBeNull();
  });

  it("keeps the trigger's accessible content free of the adornment", () => {
    renderSelect({
      trailingAdornment: (
        <button type="button" aria-label="play-sample">
          ▶
        </button>
      ),
    });
    const trigger = screen.getByRole("button", { name: /Ava/ });
    const adornment = screen.getByRole("button", { name: "play-sample" });
    expect(trigger.contains(adornment)).toBe(false);
  });

  it("clicking the adornment does not open the listbox", () => {
    renderSelect({
      trailingAdornment: (
        <button type="button" aria-label="play-sample">
          ▶
        </button>
      ),
    });
    fireEvent.click(screen.getByRole("button", { name: "play-sample" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("still opens the dropdown from the trigger with an adornment present", async () => {
    renderSelect({
      trailingAdornment: (
        <button type="button" aria-label="play-sample">
          ▶
        </button>
      ),
    });
    fireEvent.click(screen.getByRole("button", { name: /Ava/ }));
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: /Marcus/ })).toBeInTheDocument();
  });

  it("back-compat: renders and opens exactly as before when no adornment is passed", async () => {
    renderSelect();
    const trigger = screen.getByRole("button", { name: /Ava/ });
    fireEvent.click(trigger);
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });
});
