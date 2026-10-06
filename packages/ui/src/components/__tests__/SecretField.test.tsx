/**
 * SecretField: a value shown once (an access token, a signing secret) with
 * a copy button. Spec: the Assistant access handoff, "New shared
 * primitives". The value is never masked, selects in full on focus, and a
 * blocked clipboard falls back to a selected value plus an instruction.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SecretField } from "../SecretField";

const SECRET = "stpat_9fK2mQ7vXr4LpZ8wNc3HbT6yJd1sAe5GuVkR0oWi";

const writeText = vi.fn();

function renderField(onCopied = vi.fn()) {
  render(
    <SecretField
      value={SECRET}
      label="Access token"
      badge="Shown once"
      copyLabel="Copy"
      copiedLabel="Copied"
      copiedAnnouncement="Token copied to clipboard"
      copyFailedMessage="Couldn't copy automatically. The token is selected: press Ctrl+C."
      onCopied={onCopied}
    />
  );
  return { onCopied };
}

function selectedText(): string {
  return window.getSelection()?.toString() ?? "";
}

async function clickCopy(name = "Copy") {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  window.getSelection()?.removeAllRanges();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SecretField", () => {
  it("shows the value in full, unmasked, as a read-only textbox named by the label", () => {
    renderField();
    const box = screen.getByRole("textbox", { name: "Access token" });
    expect(box).toHaveAttribute("aria-readonly", "true");
    expect(box).toHaveTextContent(SECRET);
    expect(box.tagName).not.toBe("INPUT");
    expect(screen.getByText("Shown once")).toBeInTheDocument();
  });

  it("keeps password managers away from the value", () => {
    renderField();
    const box = screen.getByRole("textbox", { name: "Access token" });
    expect(box).toHaveAttribute("autocomplete", "off");
    expect(box).toHaveAttribute("data-1p-ignore");
  });

  it("selects the whole value when it receives focus", () => {
    renderField();
    const box = screen.getByRole("textbox", { name: "Access token" });
    expect(box).toHaveAttribute("tabindex", "0");
    fireEvent.focus(box);
    expect(selectedText()).toBe(SECRET);
  });

  it("copies the value, swaps the button label, announces politely and reports the copy", async () => {
    const { onCopied } = renderField();
    const live = document.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live).toHaveTextContent("");

    await clickCopy();

    expect(writeText).toHaveBeenCalledWith(SECRET);
    expect(onCopied).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(live).toHaveTextContent("Token copied to clipboard");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("returns to the idle label after resetMs", async () => {
    vi.useFakeTimers();
    render(
      <SecretField
        value={SECRET}
        label="Access token"
        copyLabel="Copy"
        copiedLabel="Copied"
        copiedAnnouncement="Token copied"
        copyFailedMessage="Press Ctrl+C"
        resetMs={300}
      />
    );
    await clickCopy();
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("falls back when the clipboard refuses: selects the value and shows the shortcut assertively", async () => {
    writeText.mockRejectedValue(new Error("NotAllowedError"));
    const { onCopied } = renderField();

    await clickCopy();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/press Ctrl\+C/);
    expect(selectedText()).toBe(SECRET);
    expect(onCopied).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Access token" })).toHaveAttribute(
      "aria-describedby",
      alert.id
    );
  });

  it("falls back the same way when the browser has no clipboard API", async () => {
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    const { onCopied } = renderField();

    await clickCopy();

    expect(screen.getByRole("alert")).toHaveTextContent(/press Ctrl\+C/);
    expect(selectedText()).toBe(SECRET);
    expect(onCopied).not.toHaveBeenCalled();
  });
});
