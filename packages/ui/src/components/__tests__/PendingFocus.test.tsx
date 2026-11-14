import { describe, expect, it } from "vitest";
import { useRef, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { usePendingFocus } from "../PendingFocus";

/**
 * A redraft's Undo, as the real backend orders it (2026-11-14, persona voice
 * e2e): the click that ends the draft asks for focus on Undo, a render ends
 * the busy state without it, and Undo only mounts on a later render. Focus
 * used to be spent on the first render and fell to the page.
 */
function LateTarget() {
  const [stage, setStage] = useState(0);
  const [focusable, setFocusable] = useState(false);
  const undoRef = useRef<HTMLButtonElement>(null);
  const lineRef = useRef<HTMLParagraphElement>(null);
  const focusWhenReady = usePendingFocus<"undo" | "line">((target) =>
    target === "undo" ? undoRef.current : lineRef.current,
  );
  return (
    <>
      <input aria-label="Elsewhere" />
      <button
        type="button"
        onClick={() => {
          focusWhenReady("undo");
          setStage(1);
        }}
      >
        Finish draft
      </button>
      <button type="button" onClick={() => setStage(2)}>
        Show Undo
      </button>
      {stage >= 2 ? (
        <button ref={undoRef} type="button">
          Undo
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => {
          focusWhenReady("line");
          setStage(3);
        }}
      >
        Undo it
      </button>
      <button type="button" onClick={() => setFocusable(true)}>
        Make line focusable
      </button>
      <p ref={lineRef} tabIndex={focusable ? -1 : undefined}>
        Restored the previous version.
      </p>
      <span data-testid="stage">{stage}</span>
    </>
  );
}

describe("usePendingFocus", () => {
  it("focuses a target that mounts one or more renders after the request", () => {
    render(<LateTarget />);
    fireEvent.click(screen.getByRole("button", { name: "Finish draft" }));
    // A render without the target: nothing to focus yet, the request waits.
    expect(screen.getByTestId("stage")).toHaveTextContent("1");
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    // The target mounts on a later render, not one the request caused.
    act(() => screen.getByRole("button", { name: "Show Undo" }).click());
    expect(screen.getByRole("button", { name: "Undo" })).toHaveFocus();
  });

  it("waits for a target that is on the page but cannot take focus yet", () => {
    render(<LateTarget />);
    fireEvent.click(screen.getByRole("button", { name: "Undo it" }));
    const line = screen.getByText("Restored the previous version.");
    expect(line).not.toHaveFocus();
    act(() => screen.getByRole("button", { name: "Make line focusable" }).click());
    expect(line).toHaveFocus();
  });

  it("never pulls focus back from where the customer moved it", () => {
    render(<LateTarget />);
    fireEvent.click(screen.getByRole("button", { name: "Finish draft" }));
    const elsewhere = screen.getByRole("textbox", { name: "Elsewhere" });
    fireEvent.pointerDown(elsewhere);
    act(() => elsewhere.focus());
    act(() => screen.getByRole("button", { name: "Show Undo" }).click());
    expect(elsewhere).toHaveFocus();
  });

  it("a key press drops the request too", () => {
    render(<LateTarget />);
    fireEvent.click(screen.getByRole("button", { name: "Finish draft" }));
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => screen.getByRole("button", { name: "Show Undo" }).click());
    expect(screen.getByRole("button", { name: "Undo" })).not.toHaveFocus();
  });

  it("focus moved by code, such as a dialog's focus trap, keeps the request", () => {
    render(<LateTarget />);
    fireEvent.click(screen.getByRole("button", { name: "Finish draft" }));
    act(() => screen.getByRole("textbox", { name: "Elsewhere" }).focus());
    act(() => screen.getByRole("button", { name: "Show Undo" }).click());
    expect(screen.getByRole("button", { name: "Undo" })).toHaveFocus();
  });

  it("a newer request replaces the older one", () => {
    render(<LateTarget />);
    fireEvent.click(screen.getByRole("button", { name: "Finish draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo it" }));
    act(() => screen.getByRole("button", { name: "Make line focusable" }).click());
    expect(screen.getByText("Restored the previous version.")).toHaveFocus();
    act(() => screen.getByRole("button", { name: "Show Undo" }).click());
    expect(screen.getByText("Restored the previous version.")).toHaveFocus();
  });
});
