/**
 * ChipAddInput — the shared "+ Add" field. Pins the comma-separated batch
 * contract every per-item picker (keywords, authority domains, competitors)
 * relies on: one entry can carry several values, the button announces how
 * many, and rejected values stay in the field.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ChipAddInput, splitChipInput } from "../ChipAddInput";

describe("splitChipInput", () => {
  it("splits on commas and newlines, trims, drops blanks and duplicates", () => {
    expect(splitChipInput("  alpha ,beta,, gamma\n delta \n\nalpha,")).toEqual([
      "alpha",
      "beta",
      "gamma",
      "delta",
    ]);
  });

  it("keeps a single value intact (spaces inside are not separators)", () => {
    expect(splitChipInput("best wordpress seo plugins")).toEqual(["best wordpress seo plugins"]);
  });

  it("returns nothing for blank input", () => {
    expect(splitChipInput("  ,\n, ")).toEqual([]);
  });
});

describe("ChipAddInput", () => {
  it("submits every comma-separated value in one call and clears the field", () => {
    const onAdd = vi.fn();
    render(<ChipAddInput label="Add keyword" placeholder="type here" onAdd={onAdd} />);
    const input = screen.getByPlaceholderText("type here") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "alpha, beta ,gamma" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(["alpha", "beta", "gamma"]);
    expect(input.value).toBe("");
  });

  it("labels the button with the pending count so the batch is visible before submit", () => {
    render(<ChipAddInput label="Add keyword" placeholder="type here" onAdd={vi.fn()} />);
    const input = screen.getByPlaceholderText("type here");
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "alpha, beta, gamma" } });
    expect(screen.getByRole("button", { name: "Add 3" })).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "alpha" } });
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("keeps only the rejected values in the field", () => {
    const onAdd = vi.fn().mockReturnValue(["not a domain"]);
    render(<ChipAddInput label="Add domain" placeholder="type here" onAdd={onAdd} />);
    const input = screen.getByPlaceholderText("type here") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "moz.com, not a domain, ahrefs.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add 3" }));
    expect(onAdd).toHaveBeenCalledWith(["moz.com", "not a domain", "ahrefs.com"]);
    expect(input.value).toBe("not a domain");
    expect(input).toHaveFocus();
  });

  it("renders the separator hint and lets consumers translate or hide it", () => {
    const { rerender } = render(<ChipAddInput label="Add" onAdd={vi.fn()} />);
    expect(
      screen.getByText("Add several at once: separate them with commas."),
    ).toBeInTheDocument();
    rerender(
      <ChipAddInput
        label="Add"
        onAdd={vi.fn()}
        labels={{ separatorHint: "Mehrere durch Kommas trennen.", addCount: (n) => `${n} hinzufügen` }}
      />,
    );
    expect(screen.getByText("Mehrere durch Kommas trennen.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a, b" } });
    expect(screen.getByRole("button", { name: "2 hinzufügen" })).toBeInTheDocument();
    rerender(<ChipAddInput label="Add" onAdd={vi.fn()} labels={{ separatorHint: "" }} />);
    expect(screen.queryByText(/separate them/)).not.toBeInTheDocument();
  });

  it("does nothing on a blank submit or when disabled", () => {
    const onAdd = vi.fn();
    const { rerender } = render(
      <ChipAddInput label="Add" placeholder="type here" onAdd={onAdd} />,
    );
    fireEvent.keyDown(screen.getByPlaceholderText("type here"), { key: "Enter" });
    expect(onAdd).not.toHaveBeenCalled();
    rerender(<ChipAddInput label="Add" placeholder="type here" onAdd={onAdd} disabled />);
    fireEvent.change(screen.getByPlaceholderText("type here"), { target: { value: "x" } });
    fireEvent.keyDown(screen.getByPlaceholderText("type here"), { key: "Enter" });
    expect(onAdd).not.toHaveBeenCalled();
  });
});
