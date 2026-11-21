/**
 * The Switch thumb keeps the same gap to the track's edge when off as when
 * on. Off was offset 4px inside the track's 2px border, on sat flush against
 * it, so an off switch showed a 6px gap on the left where an on switch showed
 * 2px on the right (customer portal, 2026-11-20).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Switch } from "../Switch";
import { matchedDeclarations } from "./tailwind-rules";

/** The thumb inside the switch control. */
function thumbOf(label: string): Element {
  return screen.getByRole("switch", { name: label }).querySelector("span")!;
}

describe("Switch thumb offset", () => {
  it("sits flush against the track's border when off", async () => {
    render(<Switch label="References list" checked={false} onChange={vi.fn()} />);
    expect(await matchedDeclarations(thumbOf("References list"), "--tw-translate-x")).toEqual([
      "calc(var(--spacing) * 0)",
    ]);
  });

  it("moves to the far end of the track when on", async () => {
    render(<Switch label="References list" checked onChange={vi.fn()} />);
    expect(
      (await matchedDeclarations(thumbOf("References list"), "--tw-translate-x")).at(-1)
    ).toBe("calc(var(--spacing) * 5) !important");
  });
});
