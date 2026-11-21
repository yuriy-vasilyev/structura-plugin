/**
 * PresetLibraryDialog — the Visuals page's "Switch preset" popup, shared by
 * the customer portal and wp-admin (2026-11-21). Presentational: rows arrive
 * mapped and in order, the dialog owns only the search.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  PresetLibraryDialog,
  formatEditedDate,
  type PresetLibraryDialogProps,
  type PresetLibraryRow,
} from "../PresetLibraryDialog";

const LABELS: PresetLibraryDialogProps["labels"] = {
  title: "Switch preset",
  close: "Close",
  search: "Search by name or site",
  useHere: "Use here",
  duplicate: "Duplicate",
  delete: "Delete",
  palette: "Brand colors",
  empty: "No other presets in your library.",
  noMatches: "No presets match your search.",
  loadError: "Couldn't load your presets.",
  retry: "Try again",
};

const ROWS: PresetLibraryRow[] = [
  {
    id: "p-unicon",
    name: "Uniconfoto",
    thumbnailSrc: "https://img.test/editorial-640.webp",
    thumbnailSrcSet: "https://img.test/editorial-640.webp 1x, https://img.test/editorial-1280.webp 2x",
    look: "Editorial reportage",
    palette: ["#2F6B4F", "#C8553D", "#A3C585"],
    usage: "Used by uniconfoto.com",
    searchText: "uniconfoto.com",
  },
  {
    id: "p-default",
    name: "Default",
    look: "Free prompt",
    usage: "Not used · edited Sep 12",
    canDelete: true,
  },
  {
    id: "p-pulse",
    name: "Pulse sketchbook",
    look: "Pulse ink",
    palette: [],
    usage: "Used by dailysheetpulse.com",
    searchText: "dailysheetpulse.com",
  },
];

function renderDialog(props: Partial<PresetLibraryDialogProps> = {}) {
  const handlers = { onClose: vi.fn(), onUse: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn(), onRetry: vi.fn() };
  const view = render(<PresetLibraryDialog open rows={ROWS} labels={LABELS} {...handlers} {...props} />);
  return { ...handlers, ...view };
}

const list = () => screen.getByRole("list");
const rowNames = () =>
  within(list())
    .getAllByRole("listitem")
    .map((item) => item.querySelector("[data-slot='preset-name']")?.textContent);
const row = (name: string) =>
  within(list())
    .getAllByRole("listitem")
    .find((item) => item.querySelector("[data-slot='preset-name']")?.textContent === name)!;
const search = () => screen.getByRole("searchbox", { name: "Search by name or site" });

describe("PresetLibraryDialog", () => {
  it("titles the dialog, focuses the search and renders the rows in the given order", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Switch preset" })).toBeInTheDocument();
    expect(search()).toHaveAttribute("placeholder", "Search by name or site");
    expect(search()).toHaveAttribute("data-autofocus");
    expect(rowNames()).toEqual(["Uniconfoto", "Default", "Pulse sketchbook"]);
  });

  it("shows each row's look, palette swatches and usage, with a thumbnail or a text tile", () => {
    renderDialog();
    const unicon = row("Uniconfoto");
    expect(unicon).toHaveTextContent("Editorial reportage");
    expect(unicon).toHaveTextContent("Used by uniconfoto.com");
    expect(within(unicon).getByRole("img", { name: "Brand colors" }).children).toHaveLength(3);
    const thumb = unicon.querySelector("img[src='https://img.test/editorial-640.webp']");
    expect(thumb).toHaveAttribute("alt", "");
    expect(thumb).toHaveAttribute("srcset", ROWS[0]!.thumbnailSrcSet);

    const plain = row("Default");
    expect(plain).toHaveTextContent("Free prompt");
    expect(plain).toHaveTextContent("Not used · edited Sep 12");
    expect(plain.querySelector("img")).toBeNull();
    expect(plain.querySelector("[data-slot='preset-tile'] svg")).toHaveClass("lucide-type");
    // An empty palette draws no swatches.
    expect(within(row("Pulse sketchbook")).queryByRole("img", { name: "Brand colors" })).toBeNull();
  });

  it("filters by name and by the row's search text, ignoring case, and says when nothing matches", () => {
    renderDialog();
    fireEvent.change(search(), { target: { value: "PULSE" } });
    expect(rowNames()).toEqual(["Pulse sketchbook"]);

    fireEvent.change(search(), { target: { value: "uniconfoto.COM" } });
    expect(rowNames()).toEqual(["Uniconfoto"]);

    fireEvent.change(search(), { target: { value: "nothing like this" } });
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("No presets match your search.");

    fireEvent.change(search(), { target: { value: "  " } });
    expect(rowNames()).toHaveLength(3);
  });

  it("starts with an empty search each time it opens", () => {
    const { rerender, ...handlers } = renderDialog();
    fireEvent.change(search(), { target: { value: "pulse" } });
    const props = { rows: ROWS, labels: LABELS, ...handlers };
    rerender(<PresetLibraryDialog open={false} {...props} />);
    rerender(<PresetLibraryDialog open {...props} />);
    expect(search()).toHaveValue("");
    expect(rowNames()).toHaveLength(3);
  });

  it("says so when the library is empty", () => {
    renderDialog({ rows: [] });
    expect(screen.getByText("No other presets in your library.")).toBeInTheDocument();
    expect(screen.queryByText("No presets match your search.")).toBeNull();
  });

  it("shows skeleton rows while loading, and neither rows nor the empty line", () => {
    renderDialog({ rows: [], loading: true });
    expect(document.querySelectorAll("[data-slot='preset-skeleton']").length).toBeGreaterThan(0);
    expect(document.querySelector("[data-slot='preset-library-body']")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText("No other presets in your library.")).toBeNull();
  });

  it("shows the load error with a retry", () => {
    const { onRetry } = renderDialog({ rows: [], error: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your presets.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("No other presets in your library.")).toBeNull();
  });

  it("calls the row's actions with its id; each action is described by the preset's name", () => {
    const { onUse, onDuplicate, onDelete } = renderDialog();
    const pulse = within(row("Pulse sketchbook"));
    fireEvent.click(pulse.getByRole("button", { name: "Use here" }));
    expect(onUse).toHaveBeenCalledWith("p-pulse");
    fireEvent.click(pulse.getByRole("button", { name: "Duplicate" }));
    expect(onDuplicate).toHaveBeenCalledWith("p-pulse");
    expect(pulse.getByRole("button", { name: "Use here" })).toHaveAccessibleDescription("Pulse sketchbook");

    fireEvent.click(within(row("Default")).getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("p-default");
  });

  it("offers Delete only on rows that can be deleted", () => {
    renderDialog();
    expect(within(row("Default")).getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(within(row("Uniconfoto")).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(within(row("Pulse sketchbook")).queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("while one action runs, its button shows loading and every other action is disabled", () => {
    renderDialog({ pending: { id: "p-default", action: "use" } });
    const busy = within(row("Default")).getByRole("button", { name: /Use here/ });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toBeDisabled();
    expect(within(row("Default")).getByRole("button", { name: "Duplicate" })).toBeDisabled();
    expect(within(row("Default")).getByRole("button", { name: "Delete" })).toBeDisabled();
    for (const name of ["Uniconfoto", "Pulse sketchbook"]) {
      expect(within(row(name)).getByRole("button", { name: "Use here" })).toBeDisabled();
      expect(within(row(name)).getByRole("button", { name: "Use here" })).not.toHaveAttribute("aria-busy");
      expect(within(row(name)).getByRole("button", { name: "Duplicate" })).toBeDisabled();
    }
    // The search and the close button stay usable.
    expect(search()).toBeEnabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
  });

  it("closes from the close button and renders the footer", () => {
    const { onClose } = renderDialog({ footer: <a href="/library">Manage library →</a> });
    expect(screen.getByRole("link", { name: "Manage library →" })).toHaveAttribute("href", "/library");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // wp-admin's unlayered `p` and `li` margins beat layered utilities, so the
  // rows use no element the host styles (KeywordBankList's rule).
  it("renders no paragraph, heading other than the title, or list element a host page styles", () => {
    renderDialog({ footer: <span>footer</span> });
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelectorAll("p, ul, ol, li")).toHaveLength(0);
    expect(dialog.querySelectorAll("h1, h2, h3, h4, h5, h6")).toHaveLength(1);
  });
});

describe("formatEditedDate", () => {
  const now = new Date(2026, 10, 21, 12);

  it("gives month and day for a date this year", () => {
    expect(formatEditedDate(new Date(2026, 8, 12, 9).toISOString(), "en-US", now)).toBe("Sep 12");
  });

  it("adds the year for another year", () => {
    expect(formatEditedDate(new Date(2025, 8, 12, 9).toISOString(), "en-US", now)).toBe("Sep 12, 2025");
  });

  it("follows the locale", () => {
    expect(formatEditedDate(new Date(2026, 8, 12, 9).toISOString(), "de", now)).toBe("12. Sept.");
  });

  it("returns an empty string for a missing or unreadable date", () => {
    expect(formatEditedDate("", "en-US", now)).toBe("");
    expect(formatEditedDate("not a date", "en-US", now)).toBe("");
  });
});
