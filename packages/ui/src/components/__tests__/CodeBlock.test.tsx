import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CodeBlock } from "../CodeBlock";

const PROMPT =
  "Create a Supabase Edge Function named structura-articles.\nIt accepts POST requests.";

describe("CodeBlock panel layout (title)", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the chip layout with an icon-only button when no title is set", () => {
    render(<CodeBlock value="ST-KEY" copyLabel="Copy key" />);
    const button = screen.getByRole("button", { name: "Copy key" });
    expect(button).toHaveTextContent("");
    expect(document.querySelector("pre")).toBeNull();
  });

  it("renders the title and a copy button whose visible text is copyLabel", () => {
    render(<CodeBlock value={PROMPT} title="Prompt for Lovable" copyLabel="Copy prompt" />);
    expect(screen.getByText("Prompt for Lovable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy prompt" })).toHaveTextContent("Copy prompt");
    expect(document.querySelector("pre")).toHaveTextContent(/structura-articles/);
  });

  it("copies the full value and announces the copied label through a live region", async () => {
    render(
      <CodeBlock value={PROMPT} title="Prompt" copyLabel="Copy prompt" copiedLabel="Copied" />
    );
    const live = document.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live).toHaveTextContent("");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(PROMPT);
    expect(live).toHaveTextContent("Copied");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("returns to the idle label after resetMs", async () => {
    vi.useFakeTimers();
    render(
      <CodeBlock value="x" title="Prompt" copyLabel="Copy" copiedLabel="Copied" resetMs={300} />
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("wraps by default and has no extra tab stop when nothing scrolls", () => {
    render(<CodeBlock value={PROMPT} title="Prompt" />);
    expect(document.querySelector("pre")).toHaveClass("whitespace-pre-wrap");
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("maxHeight makes a focusable scroller named by the title", () => {
    render(<CodeBlock value={PROMPT} title="Prompt for Lovable" maxHeight={200} />);
    const region = screen.getByRole("region", { name: "Prompt for Lovable" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveClass("overflow-auto");
    expect(region.style.maxHeight).toBe("200px");
    const titleId = region.getAttribute("aria-labelledby");
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId as string)).toHaveTextContent("Prompt for Lovable");
  });

  it("wrap={false} keeps white-space: pre and scrolls sideways", () => {
    render(<CodeBlock value={PROMPT} title="Prompt" wrap={false} />);
    expect(document.querySelector("pre")).toHaveClass("whitespace-pre");
    expect(document.querySelector("pre")).not.toHaveClass("whitespace-pre-wrap");
    const region = screen.getByRole("region", { name: "Prompt" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveClass("overflow-auto");
  });
});
