import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { X } from "lucide-react";

import {
  AttachmentIconButton,
  AttachmentReadyDisc,
  AttachmentRetryButton,
  AttachmentRow,
  AttachmentTile,
} from "../AttachmentRow";

/**
 * The row anatomy shared by ResearchAttachments and the persona voice
 * sources (design handoff persona voice, 4c): one tile, a title line, a
 * state-dependent line under it and the row's controls.
 */
describe("AttachmentRow", () => {
  it("busy: shows an indeterminate runner and the progress label", () => {
    render(
      <AttachmentRow
        state="busy"
        tile={<AttachmentTile>PDF</AttachmentTile>}
        title="notes.pdf"
        meta="Uploading and reading…"
        actions={
          <AttachmentIconButton label="Stop adding notes.pdf" onClick={() => {}}>
            <X />
          </AttachmentIconButton>
        }
      />,
    );
    const bar = screen.getByRole("progressbar");
    // Indeterminate: no aria-valuenow.
    expect(bar).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByText("Uploading and reading…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop adding notes.pdf" })).toBeInTheDocument();
  });

  it("ready: renders meta, the neutral note and the sr-only ready signal", () => {
    render(
      <AttachmentRow
        state="ready"
        tile={<AttachmentTile>MD</AttachmentTile>}
        title="Talk notes.md"
        meta="14 KB"
        note="Short. Longer pieces give a closer match."
        actions={<AttachmentReadyDisc label="Ready" />}
      />,
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("14 KB")).toBeInTheDocument();
    const note = screen.getByText("Short. Longer pieces give a closer match.");
    // Information, not a warning: the note never takes the error tone.
    expect(note.parentElement?.className).not.toMatch(/red|amber/);
    expect(screen.getByText("Ready")).toHaveClass("sr-only");
  });

  it("failed: the reason replaces the meta in the error tone and the controls fire", () => {
    const retry = vi.fn();
    const remove = vi.fn();
    render(
      <AttachmentRow
        state="failed"
        tile={<AttachmentTile failed>PDF</AttachmentTile>}
        title="scan.pdf"
        meta="We couldn't find any text in this file."
        actions={
          <>
            <AttachmentRetryButton label="Try again: scan.pdf" onClick={retry}>
              Try again
            </AttachmentRetryButton>
            <AttachmentIconButton label="Remove scan.pdf" onClick={remove} danger>
              <X />
            </AttachmentIconButton>
          </>
        }
      />,
    );
    const reason = screen.getByText("We couldn't find any text in this file.");
    expect(reason.className).toMatch(/text-red-600/);
    fireEvent.click(screen.getByRole("button", { name: "Try again: scan.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove scan.pdf" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("muted: an item that will not be used gets the quiet title tone", () => {
    render(
      <AttachmentRow
        state="ready"
        density="compact"
        muted
        tile={<AttachmentTile density="compact">C</AttachmentTile>}
        title="Sleep, worry and the 3 a.m. brain"
        meta="claranovak.com · 1,105 words"
      />,
    );
    const title = screen.getByText("Sleep, worry and the 3 a.m. brain");
    expect(title.className).toMatch(/text-neutral-500/);
    expect(title.className).toMatch(/font-medium/);
  });

  // Regression 2026-11-14: at 360px "claranovak.substack.com · 1,340 words"
  // painted over the ready disc. jsdom has no layout, so this pins the
  // classes that keep row text inside its column; the browser check measures it.
  it.each(["comfortable", "compact"] as const)(
    "%s: text without break points wraps inside its column, clear of the controls",
    (density) => {
      const { container } = render(
        <AttachmentRow
          state="ready"
          density={density}
          tile={<AttachmentTile density={density}>C</AttachmentTile>}
          title="Letters sunday"
          meta="claranovak.substack.com · 1,340 words"
          note="Short. Longer pieces give a closer match."
          actions={<AttachmentReadyDisc label="Ready" />}
        />,
      );
      const [, column] = Array.from((container.firstElementChild as HTMLElement).children);
      expect(column).toHaveClass("min-w-0", "flex-1");
      expect(screen.getByText("claranovak.substack.com · 1,340 words")).toHaveClass(
        "[overflow-wrap:anywhere]",
      );
      expect(screen.getByText("Short. Longer pieces give a closer match.").closest("p")).toHaveClass(
        "[overflow-wrap:anywhere]",
      );
    },
  );

  it("compact: the controls keep their width and a URL title uses both phone lines", () => {
    const { container } = render(
      <AttachmentRow
        state="failed"
        density="compact"
        tile={<AttachmentTile density="compact" failed>C</AttachmentTile>}
        title="members.claranovak.com/course/week-1"
        meta="Couldn’t read this page."
        actions={
          <AttachmentIconButton label="Remove" onClick={() => {}} danger>
            <X />
          </AttachmentIconButton>
        }
      />,
    );
    const [, , controls] = Array.from((container.firstElementChild as HTMLElement).children);
    expect(controls).toHaveClass("shrink-0");
    // Without it the title broke at the hyphen: "members.claranovak.com/c…" over a lone "1".
    expect(screen.getByText("members.claranovak.com/course/week-1")).toHaveClass(
      "max-sm:[overflow-wrap:anywhere]",
    );
  });

  it("compact density uses the tighter row and the square 36px tile", () => {
    const { container } = render(
      <AttachmentRow
        state="ready"
        density="compact"
        tile={<AttachmentTile density="compact">DOCX</AttachmentTile>}
        title="Chapter 2.docx"
      />,
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toMatch(/px-3 /);
    expect(row.className).toMatch(/py-2\.5/);
    expect(screen.getByText("DOCX").className).toMatch(/size-9/);
  });
});
