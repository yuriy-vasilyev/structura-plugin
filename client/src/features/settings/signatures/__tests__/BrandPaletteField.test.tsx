/**
 * Brand palette (visual-signatures handoff §3.4): swatches with hex labels,
 * the accent first, an edit popover per swatch (hex validation, use as
 * accent, remove), the six-colour cap, and the empty and scanning states.
 * The wizard's read-only summary is at the bottom.
 */
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { BrandPaletteField, BrandPaletteSummary } from "../BrandPaletteField";

/** The field with real state, as the page holds it. */
function Harness({
  initial,
  onScan = vi.fn(),
  scanning = false,
}: {
  initial: string[];
  onScan?: () => void;
  scanning?: boolean;
}) {
  const [palette, setPalette] = useState(initial);
  return (
    <>
      <BrandPaletteField
        headingId="palette"
        palette={palette}
        onChange={setPalette}
        scanning={scanning}
        onScan={onScan}
      />
      <div data-testid="palette">{palette.join(",")}</div>
    </>
  );
}

const palette = () => screen.getByTestId("palette").textContent;
const swatch = (name: RegExp | string) => screen.getByRole("button", { name });

async function openEditor(name: RegExp | string) {
  fireEvent.click(swatch(name));
  return await screen.findByLabelText("Hex");
}

describe("BrandPaletteField", () => {
  it("lists the colours with hex labels, the first as the accent", () => {
    render(<Harness initial={["#2F6B4F", "#C8553D"]} />);
    const list = screen.getByRole("list", { name: "Brand colours" });
    expect(within(list).getByText("#2F6B4F")).toBeInTheDocument();
    expect(within(list).getByText("Accent")).toBeInTheDocument();
    expect(swatch("Edit colour #2F6B4F, accent")).toHaveAttribute("aria-expanded", "false");
    expect(swatch("Edit colour #C8553D")).toBeInTheDocument();
  });

  it("opens the editor with focus in Hex and applies a valid hex, normalised", async () => {
    render(<Harness initial={["#2F6B4F", "#C8553D"]} />);
    const hex = await openEditor("Edit colour #C8553D");
    expect(swatch("Edit colour #C8553D")).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(hex).toHaveFocus());

    fireEvent.change(hex, { target: { value: "#abc" } });
    expect(palette()).toBe("#2F6B4F,#AABBCC");
  });

  it("shows the hex error on an invalid value and keeps the colour", async () => {
    render(<Harness initial={["#2F6B4F", "#C8553D"]} />);
    const hex = await openEditor("Edit colour #C8553D");

    fireEvent.change(hex, { target: { value: "#12" } });
    fireEvent.blur(hex);

    expect(await screen.findByText("Use a hex colour like #2F6B4F.")).toBeInTheDocument();
    expect(palette()).toBe("#2F6B4F,#C8553D");
  });

  it("moves a colour to the front with Use as accent", async () => {
    render(<Harness initial={["#2F6B4F", "#C8553D", "#A3C585"]} />);
    await openEditor("Edit colour #A3C585");
    fireEvent.click(screen.getByRole("button", { name: "Use as accent" }));
    expect(palette()).toBe("#A3C585,#2F6B4F,#C8553D");
  });

  it("the accent's editor has no Use as accent", async () => {
    render(<Harness initial={["#2F6B4F", "#C8553D"]} />);
    await openEditor("Edit colour #2F6B4F, accent");
    expect(screen.queryByRole("button", { name: "Use as accent" })).toBeNull();
  });

  it("removes a colour", async () => {
    render(<Harness initial={["#2F6B4F", "#C8553D"]} />);
    await openEditor("Edit colour #C8553D");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(palette()).toBe("#2F6B4F");
  });

  it("adds a colour and opens its editor", async () => {
    render(<Harness initial={["#2F6B4F"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a colour" }));
    expect(palette()).toBe("#2F6B4F,#4B4B47");
    const hex = await screen.findByLabelText("Hex");
    expect(hex).toHaveValue("#4B4B47");
  });

  it("caps the palette at six colours", () => {
    render(
      <Harness initial={["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"]} />
    );
    expect(screen.getByRole("button", { name: "Add a colour" })).toBeDisabled();
    expect(screen.getByText("Up to six colours. Remove one to add another.")).toBeInTheDocument();
  });

  it("empty: the neutral set, the sentence, Scan my site and Add a colour", () => {
    const onScan = vi.fn();
    render(<Harness initial={[]} onScan={onScan} />);
    expect(screen.getByText("No brand colours yet.")).toBeInTheDocument();
    expect(
      screen.getByText(/Until you add some, images use the neutral set above\./)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Re-scan site/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Scan my site/ }));
    expect(onScan).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add a colour" }));
    expect(palette()).toBe("#4B4B47");
  });

  it("scanning: a status line instead of the swatches", () => {
    render(<Harness initial={["#2F6B4F"]} scanning />);
    // A polite live region announces the scan.
    expect(
      screen.getByText("Reading your homepage for colours…").closest('[role="status"]')
    ).not.toBeNull();
    expect(screen.queryByRole("list", { name: "Brand colours" })).toBeNull();
  });

  it("Re-scan site runs the scan", () => {
    const onScan = vi.fn();
    render(<Harness initial={["#2F6B4F"]} onScan={onScan} />);
    fireEvent.click(screen.getByRole("button", { name: /Re-scan site/ }));
    expect(onScan).toHaveBeenCalled();
  });

  it("Escape closes the editor and returns focus to the swatch", async () => {
    render(<Harness initial={["#2F6B4F", "#C8553D"]} />);
    const hex = await openEditor("Edit colour #C8553D");
    await waitFor(() => expect(hex).toHaveFocus());
    await act(async () => {
      fireEvent.keyDown(hex, { key: "Escape" });
    });
    await waitFor(() => expect(screen.queryByLabelText("Hex")).toBeNull());
    expect(swatch("Edit colour #C8553D")).toHaveFocus();
  });
});

describe("BrandPaletteSummary (wizard)", () => {
  it("shows the colours read-only with Re-scan and where to edit them", () => {
    const onScan = vi.fn();
    render(
      <BrandPaletteSummary palette={["#2F6B4F", "#C8553D"]} scanning={false} onScan={onScan} />
    );
    expect(
      within(screen.getByRole("list", { name: "Brand colours" })).getAllByRole("listitem")
    ).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Edit colour/ })).toBeNull();
    expect(
      screen.getByText(
        "Your colours are applied to the style you pick, in images and videos. Edit them later on the Visuals page."
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Re-scan/ }));
    expect(onScan).toHaveBeenCalled();
  });
});
