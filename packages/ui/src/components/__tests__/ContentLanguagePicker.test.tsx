import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import React, { useState } from "react";
import {
  ContentLanguagePicker,
  type ContentLanguagePickerLabels,
  type ContentLanguagePickerProps,
} from "../ContentLanguagePicker";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const LABELS: ContentLanguagePickerLabels = {
  alsoOnSite: "Also on your site",
  supported: "Supported",
  other: "Other…",
  otherCaption: "All WordPress languages",
  allWordPressLanguages: "All WordPress languages",
  searchPlaceholder: "Search languages…",
  noMatches: (q) => `No language matches "${q}"`,
  searchCount: (m, t) => `${m} of ${t}`,
  backToSupported: "Back to supported languages",
  aiOnlyNote: (name) =>
    `Search-volume data isn't available for ${name} yet. Topics come from AI research instead.`,
  pickSupported: "Pick a supported language",
  aiOnlyReassurance: "Everything else works the same: discovery, rhythm, publishing.",
};

/** Controlled harness — the picker is controlled, so state C needs a re-render with the new value. */
function Harness(props: Partial<ContentLanguagePickerProps> & { onChange?: (code: string) => void }) {
  const [value, setValue] = useState(props.value ?? "de");
  return (
    <ContentLanguagePicker
      uiLocale="en"
      labels={LABELS}
      {...props}
      value={value}
      onChange={(code) => {
        props.onChange?.(code);
        setValue(code);
      }}
    />
  );
}

const openPrimary = () => {
  fireEvent.click(screen.getByRole("combobox"));
  return screen.getByRole("listbox");
};

const catalogList = () => screen.queryByRole("listbox", { name: "All WordPress languages" });

describe("ContentLanguagePicker", () => {
  it("lists the three German entries in the supported group, labelled through Intl", () => {
    render(<Harness />);
    const listbox = openPrimary();
    const supported = within(listbox).getByRole("group", { name: "Supported" });
    const german = within(supported).getAllByRole("option", { name: /German/ });
    expect(german.map((o) => o.textContent)).toEqual([
      "German",
      "German (Austria)",
      "German (Switzerland)",
    ]);
    // Codes render right-aligned as siblings of the option (not in its name).
    for (const code of ["de", "de_AT", "de_CH"]) {
      expect(within(supported).getByText(code)).toBeInTheDocument();
    }
    expect(within(supported).getAllByRole("option")).toHaveLength(25);
    expect(within(supported).getByRole("option", { name: "German" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("pins additionalLanguages first under their own group and drops them from Supported", () => {
    render(<Harness additionalLanguages={["fr_FR", "de_AT"]} />);
    const listbox = openPrimary();
    const groups = within(listbox).getAllByRole("group");
    expect(groups[0]).toHaveAccessibleName("Also on your site");
    expect(within(groups[0]).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "French (France)",
      "German (Austria)",
    ]);
    const supported = within(listbox).getByRole("group", { name: "Supported" });
    expect(within(supported).queryByRole("option", { name: "German (Austria)" })).toBeNull();
    expect(within(supported).getAllByRole("option")).toHaveLength(24);
  });

  it("choosing Other… reveals the catalogue without calling onChange, and focuses its search", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(catalogList()).toBeNull();
    openPrimary();
    fireEvent.click(screen.getByRole("option", { name: /Other…/ }));
    expect(onChange).not.toHaveBeenCalled();
    expect(catalogList()).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveTextContent("Other…");
    const search = screen.getByRole("textbox", { name: "All WordPress languages" });
    expect(search).toHaveFocus();
    // Supported-base catalogue codes are not offered here; ai_only ones are.
    expect(within(catalogList()!).queryByText("de_DE_formal")).toBeNull();
    expect(within(catalogList()!).getByText("fa_IR")).toBeInTheDocument();
  });

  it("filters the catalogue on label, code and localized name", () => {
    render(<Harness />);
    openPrimary();
    fireEvent.click(screen.getByRole("option", { name: /Other…/ }));
    const search = screen.getByRole("textbox", { name: "All WordPress languages" });
    // "Urdu" only exists as the localized name — the native label is اردو.
    fireEvent.change(search, { target: { value: "urdu" } });
    const options = within(catalogList()!).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["اردوUrdu"]);
    fireEvent.change(search, { target: { value: "fa_" } });
    expect(within(catalogList()!).getAllByRole("option").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/of \d+$/)).toBeInTheDocument();
  });

  it("picking a catalogue entry calls onChange and shows the ai_only note with the language name", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} id="lang" />);
    openPrimary();
    fireEvent.click(screen.getByRole("option", { name: /Other…/ }));
    fireEvent.click(within(catalogList()!).getByRole("option", { name: /Persian \(Iran\)/ }));
    expect(onChange).toHaveBeenCalledWith("fa_IR");
    const note = document.getElementById("lang-note");
    expect(note).toHaveTextContent("Search-volume data isn't available for Persian (Iran) yet.");
    expect(note).toHaveTextContent("Everything else works the same");
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-describedby", "lang-note");
    // The catalogue stays revealed with the pick marked selected.
    expect(within(catalogList()!).getByRole("option", { name: /Persian \(Iran\)/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("Pick a supported language returns to the supported list without changing the value", () => {
    const onChange = vi.fn();
    render(<Harness value="fa_IR" onChange={onChange} />);
    // A catalogue value on mount starts in state B with the note.
    expect(catalogList()).toBeInTheDocument();
    expect(screen.getByText(/isn't available for Persian/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pick a supported language" }));
    expect(catalogList()).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("the catalogue empty state offers a way back to the supported list", () => {
    render(<Harness />);
    openPrimary();
    fireEvent.click(screen.getByRole("option", { name: /Other…/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "All WordPress languages" }), {
      target: { value: "zzzz" },
    });
    expect(screen.getByText('No language matches "zzzz"')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to supported languages" }));
    expect(catalogList()).toBeNull();
  });

  it("Escape in the catalogue search returns focus to the primary trigger", () => {
    render(<Harness />);
    openPrimary();
    fireEvent.click(screen.getByRole("option", { name: /Other…/ }));
    const search = screen.getByRole("textbox", { name: "All WordPress languages" });
    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.getByRole("combobox")).toHaveFocus();
    expect(catalogList()).toBeInTheDocument();
  });

  it("a supported value shows no note and no catalogue", () => {
    render(<Harness value="de_CH" id="lang" />);
    expect(document.getElementById("lang-note")).toBeNull();
    expect(catalogList()).toBeNull();
    expect(screen.getByRole("combobox")).toHaveTextContent("German (Switzerland)");
    expect(screen.getByRole("combobox")).not.toHaveAttribute("aria-describedby");
  });

  it("labels the supported group in the viewer's locale", () => {
    render(<Harness uiLocale="de" />);
    const listbox = openPrimary();
    const supported = within(listbox).getByRole("group", { name: "Supported" });
    expect(within(supported).getByRole("option", { name: "Deutsch (Österreich)" })).toBeInTheDocument();
  });
});
