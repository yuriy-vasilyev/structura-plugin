import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { VoiceSample } from "@structura/types";

import { VoiceExcerpts, type VoiceExcerptsLabels } from "../VoiceExcerpts";

const LABELS: VoiceExcerptsLabels = {
  title: "Style excerpts",
  help: "Short passages from your writing that show the writer how you sound.",
  from: (source) => <>From {source}</>,
  more: "Show all",
  less: "Show less",
  remove: (source) => `Remove excerpt from ${source}`,
  removed: "Excerpt removed.",
  undo: "Undo",
  none: "No excerpts left. Posts follow the voice description only.",
  pastedText: "Pasted text",
  newTab: "(opens in a new tab)",
};

const SAMPLES: VoiceSample[] = [
  {
    text: "It usually starts with something small.\n\nThat voice isn’t lying to you on purpose.",
    source: { kind: "article", url: "https://claranovak.com/blog/a", title: "When anxiety talks louder" },
  },
  {
    text: "Strength, the way most of us learned it, means not needing anything.",
    source: {
      kind: "file",
      name: "Chapter 2.docx",
      ext: "docx",
      attachmentId: "att-1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    },
  },
];

/** The dialog owns the removals; this harness stands in for it. */
function Harness({ samples = SAMPLES }: { samples?: VoiceSample[] }) {
  const [removed, setRemoved] = useState<ReadonlySet<number>>(new Set());
  return (
    <VoiceExcerpts
      samples={samples}
      removed={removed}
      onRemove={(i) => setRemoved((s) => new Set(s).add(i))}
      onUndo={(i) =>
        setRemoved((s) => {
          const next = new Set(s);
          next.delete(i);
          return next;
        })
      }
      labels={LABELS}
    />
  );
}

describe("VoiceExcerpts", () => {
  it("quotes each excerpt with where it came from; a web page source is a link, a file is plain", () => {
    render(<Harness />);
    const figures = screen.getAllByRole("figure");
    expect(figures).toHaveLength(2);
    expect(
      within(figures[0]).getByRole("link", { name: "When anxiety talks louder (opens in a new tab)" }),
    ).toHaveAttribute("href", "https://claranovak.com/blog/a");
    expect(within(figures[1]).getByText(/Chapter 2\.docx/)).toBeInTheDocument();
    expect(within(figures[1]).queryByRole("link")).toBeNull();
    // Collapsed: paragraphs run on as one block.
    expect(figures[0].querySelector("blockquote")?.textContent).toBe(
      "It usually starts with something small. That voice isn’t lying to you on purpose.",
    );
    // Count of what the persona keeps.
    expect(screen.getByRole("heading", { name: /Style excerpts/ })).toHaveTextContent("2");
  });

  it("× leaves an Excerpt removed row with Undo in its slot, moves focus to Undo and announces it", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Remove excerpt from When anxiety talks louder" }));
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo).toHaveFocus();
    expect(screen.getAllByText("Excerpt removed.").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("figure")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: /Style excerpts/ })).toHaveTextContent("1");
    // No edit affordance anywhere on an excerpt.
    expect(screen.queryByRole("textbox")).toBeNull();

    fireEvent.click(undo);
    expect(screen.getAllByRole("figure")).toHaveLength(2);
  });

  it("with no excerpts says posts follow the description only", () => {
    render(<Harness samples={[]} />);
    expect(screen.getByText("No excerpts left. Posts follow the voice description only.")).toBeInTheDocument();
  });

  describe("Show all only when the text is actually clamped", () => {
    let clamped = true;
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
        return this.tagName === "BLOCKQUOTE" && clamped ? 200 : 0;
      });
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
        return this.tagName === "BLOCKQUOTE" ? 100 : 0;
      });
    });
    afterEach(() => vi.restoreAllMocks());

    it("expands in place with aria-expanded, keeps the original line breaks, and collapses again", () => {
      render(<Harness samples={[SAMPLES[0]]} />);
      const more = screen.getByRole("button", { name: "Show all" });
      expect(more).toHaveAttribute("aria-expanded", "false");
      const quote = screen.getByRole("figure").querySelector("blockquote")!;
      expect(more).toHaveAttribute("aria-controls", quote.id);

      act(() => {
        fireEvent.click(more);
      });
      const less = screen.getByRole("button", { name: "Show less" });
      expect(less).toHaveAttribute("aria-expanded", "true");
      expect(quote.textContent).toContain("\n\n");
      fireEvent.click(less);
      expect(screen.getByRole("button", { name: "Show all" })).toBeInTheDocument();
    });

    it("hides Show all when the excerpt fits in four lines", () => {
      clamped = false;
      render(<Harness samples={[SAMPLES[1]]} />);
      expect(screen.queryByRole("button", { name: "Show all" })).toBeNull();
      clamped = true;
    });
  });
});
