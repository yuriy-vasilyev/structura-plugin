import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useRef, useState } from "react";
import { InlineAdvice, type InlineAdviceHandle, type InlineAdviceProps } from "../InlineAdvice";

const LEAD = "Gemini isn't recommended for writing.";
const REASON = "In our tests, its posts contained more invented details.";

const BASE = { lead: LEAD, reason: REASON } as const;

/** Elements reachable with Tab inside `root`, in DOM order (what the browser walks). */
function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex]")
  ).filter((el) => el.tabIndex >= 0);
}

// jsdom has no ResizeObserver; the hide control's Tooltip uses it while shown.
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("InlineAdvice: open", () => {
  it("renders the bold lead, the reason and both actions; actions fire", () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    render(
      <InlineAdvice
        {...BASE}
        state="open"
        primary={{ label: "Switch to Anthropic", onClick: onPrimary }}
        secondary={{ label: "Connect Anthropic for the best results", onClick: onSecondary }}
        onHide={vi.fn()}
        hideLabel="Hide this advice for this campaign"
      />
    );
    expect(screen.getByText(LEAD).tagName).toBe("STRONG");
    expect(screen.getByText(REASON, { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Switch to Anthropic" }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Connect Anthropic for the best results" }));
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it("names the hide control by its label, shows it as a tooltip, and calls onHide", () => {
    const onHide = vi.fn();
    render(
      <InlineAdvice
        {...BASE}
        state="open"
        primary={{ label: "Switch to OpenAI", onClick: vi.fn() }}
        onHide={onHide}
        hideLabel="Hide this advice for this campaign"
      />
    );
    const hide = screen.getByRole("button", { name: "Hide this advice for this campaign" });
    fireEvent.mouseEnter(hide);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Hide this advice for this campaign");
    fireEvent.click(hide);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("renders no hide control without onHide", () => {
    render(
      <InlineAdvice
        {...BASE}
        state="open"
        primary={{ label: "Switch to OpenAI", onClick: vi.fn() }}
      />
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button")).toHaveAccessibleName("Switch to OpenAI");
  });

  it("opens an external secondary link in a new tab safely, with a decorative arrow", () => {
    render(
      <InlineAdvice
        {...BASE}
        state="open"
        primary={{ label: "Connect an OpenAI key", onClick: vi.fn() }}
        secondary={{
          label: "Upgrade for Anthropic or managed AI",
          href: "https://app.example.test/plans",
          external: true,
        }}
      />
    );
    const link = screen.getByRole("link", { name: "Upgrade for Anthropic or managed AI" });
    expect(link).toHaveAttribute("href", "https://app.example.test/plans");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")?.split(" ")).toEqual(
      expect.arrayContaining(["noopener", "noreferrer"])
    );
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps an internal secondary link in the same tab", () => {
    render(
      <InlineAdvice
        {...BASE}
        state="open"
        secondary={{ label: "Review campaigns", href: "/sites/a/campaigns" }}
      />
    );
    const link = screen.getByRole("link", { name: "Review campaigns" });
    expect(link).not.toHaveAttribute("target");
    expect(link.querySelector("svg")).toBeNull();
  });

  it("shows the note in place of a primary action", () => {
    render(
      <InlineAdvice
        {...BASE}
        state="open"
        note="Ask a workspace admin to connect an Anthropic or OpenAI key."
        secondary={{ label: "Upgrade to Cloud, where we run the AI", onClick: vi.fn() }}
      />
    );
    expect(
      screen.getByText("Ask a workspace admin to connect an Anthropic or OpenAI key.")
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("lets the primary button wrap instead of truncating", () => {
    render(
      <InlineAdvice
        {...BASE}
        state="open"
        primary={{ label: "Eine Anthropic- oder OpenAI-Verbindung herstellen", onClick: vi.fn() }}
      />
    );
    const button = screen.getByRole("button");
    expect(button).toHaveClass("text-wrap");
    expect(button).not.toHaveClass("text-nowrap");
    expect(button).not.toHaveClass("truncate");
  });

  it("keeps the tab order lead/reason, primary, secondary, hide", () => {
    const { container } = render(
      <InlineAdvice
        {...BASE}
        state="open"
        primary={{ label: "Switch to OpenAI", onClick: vi.fn() }}
        secondary={{ label: "Connect Anthropic for the best results", onClick: vi.fn() }}
        onHide={vi.fn()}
        hideLabel="Hide this advice for this campaign"
      />
    );
    const order = tabbables(container);
    expect(order.map((el) => el.textContent || el.getAttribute("aria-label"))).toEqual([
      "Switch to OpenAI",
      "Connect Anthropic for the best results",
      "Hide this advice for this campaign",
    ]);
    // Text comes before every action in the DOM.
    const text = screen.getByText(LEAD);
    for (const el of order) {
      expect(text.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(order.every((el) => el.tabIndex === 0)).toBe(true);
  });
});

describe("InlineAdvice: collapsed and confirmed", () => {
  it("collapsed shows the collapsed text and a show button that fires onShow", () => {
    const onShow = vi.fn();
    render(
      <InlineAdvice
        {...BASE}
        state="collapsed"
        collapsedText="Gemini isn't recommended for writing (short)."
        onShow={onShow}
        showLabel="Show advice"
        primary={{ label: "Switch to OpenAI", onClick: vi.fn() }}
        onHide={vi.fn()}
        hideLabel="Hide this advice for this campaign"
      />
    );
    expect(screen.getByText("Gemini isn't recommended for writing (short).")).toBeInTheDocument();
    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Switch to OpenAI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hide this advice/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show advice" }));
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it("collapsed falls back to the lead when no collapsedText is given", () => {
    render(<InlineAdvice {...BASE} state="collapsed" onShow={vi.fn()} showLabel="Show advice" />);
    expect(screen.getByText(LEAD)).toBeInTheDocument();
  });

  it("confirmed shows the confirmation and an Undo button that fires onUndo", () => {
    const onUndo = vi.fn();
    render(
      <InlineAdvice
        {...BASE}
        state="confirmed"
        confirmation="Switched to Anthropic with its recommended model."
        onUndo={onUndo}
        undoLabel="Undo"
      />
    );
    expect(
      screen.getByText("Switched to Anthropic with its recommended model.")
    ).toBeInTheDocument();
    expect(screen.queryByText(LEAD)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});

describe("InlineAdvice: announcer", () => {
  it("renders one empty polite status region and does not make the notice live", () => {
    const { container } = render(
      <InlineAdvice {...BASE} state="open" primary={{ label: "Switch", onClick: vi.fn() }} />
    );
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toBeEmptyDOMElement();
    // Page load: the notice is read in reading order, nothing is announced.
    expect(within(status).queryByText(LEAD)).not.toBeInTheDocument();
    expect(container.querySelectorAll("[aria-live], [role=alert], [role=status]")).toHaveLength(1);
    expect(status.contains(screen.getByText(LEAD))).toBe(false);
  });

  it("writes only the announcement into the region, and each new one when it changes", () => {
    vi.useFakeTimers();
    const props: InlineAdviceProps = {
      ...BASE,
      state: "open",
      primary: { label: "Switch", onClick: vi.fn() },
      announcement: `${LEAD} ${REASON}`,
    };
    const { rerender } = render(<InlineAdvice {...props} />);
    const status = screen.getByRole("status");
    // Emptied first, then filled, so a region mounted with its first message still changes.
    expect(status).toBeEmptyDOMElement();
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(status.textContent).toBe(`${LEAD} ${REASON}`);

    rerender(
      <InlineAdvice
        {...props}
        state="confirmed"
        confirmation="Switched to Anthropic with its recommended model."
        announcement="Switched to Anthropic with its recommended model. Text model: Standard."
      />
    );
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByRole("status")).toBe(status);
    expect(status.textContent).toBe(
      "Switched to Anthropic with its recommended model. Text model: Standard."
    );

    rerender(<InlineAdvice {...props} announcement={undefined} />);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(status).toBeEmptyDOMElement();
  });
});

describe("InlineAdvice: focus", () => {
  it("never moves focus on mount", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    render(
      <InlineAdvice
        {...BASE}
        state="open"
        primary={{ label: "Switch", onClick: vi.fn() }}
        announcement={`${LEAD} ${REASON}`}
      />
    );
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("focusPrimary focuses the primary, else the secondary, else the hide control", () => {
    const ref = { current: null as InlineAdviceHandle | null };
    const { rerender } = render(
      <InlineAdvice
        ref={ref}
        {...BASE}
        state="open"
        primary={{ label: "Switch", onClick: vi.fn() }}
        secondary={{ label: "Connect", onClick: vi.fn() }}
        onHide={vi.fn()}
        hideLabel="Hide"
      />
    );
    act(() => ref.current?.focusPrimary());
    expect(screen.getByRole("button", { name: "Switch" })).toHaveFocus();

    rerender(
      <InlineAdvice
        ref={ref}
        {...BASE}
        state="open"
        note="Ask a workspace admin."
        secondary={{ label: "Upgrade", href: "/plans", external: true }}
        onHide={vi.fn()}
        hideLabel="Hide"
      />
    );
    act(() => ref.current?.focusPrimary());
    expect(screen.getByRole("link", { name: "Upgrade" })).toHaveFocus();

    rerender(
      <InlineAdvice
        ref={ref}
        {...BASE}
        state="open"
        note="Ask a workspace admin."
        onHide={vi.fn()}
        hideLabel="Hide"
      />
    );
    act(() => ref.current?.focusPrimary());
    expect(screen.getByRole("button", { name: "Hide" })).toHaveFocus();
  });

  /** Mirrors the handoff prototype: the caller changes state and asks for focus in one handler. */
  function Harness() {
    const ref = useRef<InlineAdviceHandle>(null);
    const [state, setState] = useState<"open" | "collapsed" | "confirmed">("open");
    return (
      <InlineAdvice
        ref={ref}
        {...BASE}
        state={state}
        primary={{
          label: "Switch to Anthropic",
          onClick: () => {
            setState("confirmed");
            ref.current?.focusUndo();
          },
        }}
        onHide={() => {
          setState("collapsed");
          ref.current?.focusShow();
        }}
        hideLabel="Hide this advice for this campaign"
        onShow={() => {
          setState("open");
          ref.current?.focusPrimary();
        }}
        showLabel="Show advice"
        confirmation="Switched to Anthropic with its recommended model."
        onUndo={() => setState("open")}
        undoLabel="Undo"
      />
    );
  }

  it("Switch then focusUndo lands on Undo after the state changes", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to Anthropic" }));
    expect(screen.getByRole("button", { name: "Undo" })).toHaveFocus();
  });

  it("hide lands on Show advice, and Show advice lands on the first action", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Hide this advice for this campaign" }));
    expect(screen.getByRole("button", { name: "Show advice" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Show advice" }));
    expect(screen.getByRole("button", { name: "Switch to Anthropic" })).toHaveFocus();
  });

  it("drops a focus request whose target is still missing after the next render", () => {
    const ref = { current: null as InlineAdviceHandle | null };
    const props = {
      ...BASE,
      primary: { label: "Switch", onClick: vi.fn() },
      confirmation: "Switched.",
      onUndo: vi.fn(),
      undoLabel: "Undo",
    };
    const { rerender } = render(<InlineAdvice ref={ref} {...props} state="open" />);
    act(() => ref.current?.focusUndo());
    rerender(<InlineAdvice ref={ref} {...props} state="open" />);
    rerender(<InlineAdvice ref={ref} {...props} state="confirmed" />);
    expect(screen.getByRole("button", { name: "Undo" })).not.toHaveFocus();
  });
});

describe("InlineAdvice: reduced motion", () => {
  it("renders every state fully when the user prefers reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: query.includes("prefers-reduced-motion"),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList
    );
    const { rerender, container } = render(
      <InlineAdvice {...BASE} state="open" primary={{ label: "Switch", onClick: vi.fn() }} />
    );
    expect(screen.getByRole("button", { name: "Switch" })).toBeVisible();
    // Every animated wrapper turns its transition off under reduced motion.
    const animated = container.querySelectorAll('[class*="transition-"]');
    expect(animated.length).toBeGreaterThan(0);
    for (const el of animated) {
      if (el.closest("button")) continue; // hover fades on controls are not motion
      expect(el).toHaveClass("motion-reduce:transition-none");
    }

    rerender(
      <InlineAdvice
        {...BASE}
        state="confirmed"
        confirmation="Switched."
        onUndo={vi.fn()}
        undoLabel="Undo"
      />
    );
    expect(screen.getByText("Switched.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Undo" })).toBeVisible();
  });
});
