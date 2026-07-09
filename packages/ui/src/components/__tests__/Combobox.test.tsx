import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Combobox, type ComboboxGroup } from "../Combobox";

// jsdom has no scrollIntoView; the component guards the call, but stubbing
// it lets us assert the "selected option scrolled into view on open" behavior.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const GROUPS: ComboboxGroup[] = [
  {
    id: "openai",
    label: "OpenAI",
    options: [
      { id: "openai:nova", label: "Nova", description: "Warm · Conversational" },
      { id: "openai:onyx", label: "Onyx", description: "Deep · Authoritative" },
      { id: "openai:shimmer", label: "Shimmer", description: "Bright · Energetic" },
    ],
  },
  {
    id: "gemini",
    label: "Gemini",
    options: [
      { id: "gemini:Zephyr", label: "Zephyr", description: "Bright · Energetic", badge: "Default" },
      { id: "gemini:Sulafat", label: "Sulafat", description: "Warm · Rich" },
    ],
  },
];

function renderCombobox(props?: Partial<React.ComponentProps<typeof Combobox>>) {
  const onChange = vi.fn();
  render(
    <Combobox
      value="openai:nova"
      onChange={onChange}
      groups={GROUPS}
      placeholder="Search 5 voices…"
      footnote="Samples are English; videos follow your post language."
      {...props}
    />
  );
  return { onChange };
}

const openPopover = () => {
  fireEvent.click(screen.getByRole("combobox"));
  return screen.getByRole("listbox");
};

const searchInput = () => screen.getByPlaceholderText("Search 5 voices…");

const activeDescendant = () => {
  const id = searchInput().getAttribute("aria-activedescendant");
  return id ? document.getElementById(id) : null;
};

describe("Combobox", () => {
  describe("closed trigger", () => {
    it("shows the selected option's label and description in the trigger", () => {
      renderCombobox();
      const trigger = screen.getByRole("combobox");
      expect(trigger).toHaveTextContent("Nova");
      expect(trigger).toHaveTextContent("Warm · Conversational");
    });

    it("shows the trigger placeholder when the value matches no option", () => {
      renderCombobox({ value: undefined, triggerPlaceholder: "Pick a voice" });
      expect(screen.getByRole("combobox")).toHaveTextContent("Pick a voice");
    });

    it("resolves a value stored inside a gated group so the field never goes blank", () => {
      renderCombobox({
        value: "gemini:Zephyr",
        groups: [
          GROUPS[0],
          {
            ...GROUPS[1],
            gate: { text: "Connect a key", cta: { label: "Open AI keys", href: "/ai-keys" } },
          },
        ],
      });
      expect(screen.getByRole("combobox")).toHaveTextContent("Zephyr");
    });

    it("does not render the floating panel until opened (lazy mount)", () => {
      renderCombobox();
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  describe("trigger adornments", () => {
    it("renders leading and trailing adornments as siblings — never nested inside the trigger button", () => {
      renderCombobox({
        leadingAdornment: <span data-testid="provider-badge">OpenAI</span>,
        trailingAdornment: (
          <button type="button" aria-label="Play sample of Nova">
            ▶
          </button>
        ),
      });
      const trigger = screen.getByRole("combobox");
      const badge = screen.getByTestId("provider-badge");
      const play = screen.getByRole("button", { name: "Play sample of Nova" });
      expect(trigger.contains(badge)).toBe(false);
      expect(trigger.contains(play)).toBe(false);
      // Invalid HTML guard: a button must not be a descendant of another button.
      expect(play.parentElement?.closest("button")).toBeNull();
    });

    it("clicking the trailing adornment does not open the popover", () => {
      renderCombobox({
        trailingAdornment: (
          <button type="button" aria-label="Play sample of Nova">
            ▶
          </button>
        ),
      });
      fireEvent.click(screen.getByRole("button", { name: "Play sample of Nova" }));
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  describe("open state", () => {
    it("renders group headers with counts and all options", () => {
      renderCombobox();
      const listbox = openPopover();
      const openaiGroup = within(listbox).getByRole("group", { name: "OpenAI" });
      const geminiGroup = within(listbox).getByRole("group", { name: "Gemini" });
      expect(openaiGroup).toHaveTextContent("3");
      expect(geminiGroup).toHaveTextContent("2");
      expect(within(listbox).getAllByRole("option")).toHaveLength(5);
      expect(within(listbox).getByRole("option", { name: /Sulafat/ })).toHaveTextContent(
        "Warm · Rich"
      );
    });

    it("honors an explicit group count over options.length", () => {
      renderCombobox({ groups: [{ ...GROUPS[0], count: 9 }] });
      const listbox = openPopover();
      expect(within(listbox).getByRole("group", { name: "OpenAI" })).toHaveTextContent("9");
    });

    it("marks the selected option, focuses it via aria-activedescendant, and scrolls it into view", () => {
      renderCombobox();
      openPopover();
      const selected = screen.getByRole("option", { name: /Nova/ });
      expect(selected).toHaveAttribute("aria-selected", "true");
      expect(activeDescendant()).toBe(selected);
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });

    it("renders a string badge as an outline chip on its row", () => {
      renderCombobox();
      openPopover();
      expect(screen.getByRole("option", { name: /Zephyr/ })).toHaveTextContent("Default");
    });

    it("pins the footnote under the list", () => {
      renderCombobox();
      openPopover();
      expect(
        screen.getByText("Samples are English; videos follow your post language.")
      ).toBeInTheDocument();
    });

    it("renders per-row trailing slots as siblings of the option element", () => {
      renderCombobox({
        groups: [
          {
            id: "openai",
            label: "OpenAI",
            options: [
              {
                id: "openai:nova",
                label: "Nova",
                trailing: (
                  <button type="button" aria-label="Play sample of Nova">
                    ▶
                  </button>
                ),
              },
            ],
          },
        ],
      });
      openPopover();
      const option = screen.getByRole("option", { name: /Nova/ });
      const play = screen.getByRole("button", { name: "Play sample of Nova" });
      expect(option.contains(play)).toBe(false);
    });

    it("clicking a row's trailing action neither selects nor closes", () => {
      const onPlay = vi.fn();
      const { onChange } = renderCombobox({
        groups: [
          {
            id: "openai",
            label: "OpenAI",
            options: [
              {
                id: "openai:nova",
                label: "Nova",
                trailing: (
                  <button type="button" aria-label="Play sample of Nova" onClick={onPlay}>
                    ▶
                  </button>
                ),
              },
            ],
          },
        ],
      });
      openPopover();
      fireEvent.click(screen.getByRole("button", { name: "Play sample of Nova" }));
      expect(onPlay).toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });
  });

  describe("search", () => {
    it("filters on label OR description and shows 'n of total' header counts", () => {
      renderCombobox();
      const listbox = openPopover();
      fireEvent.change(searchInput(), { target: { value: "warm" } });
      expect(within(listbox).getByRole("group", { name: "OpenAI" })).toHaveTextContent("1 of 3");
      expect(within(listbox).getByRole("group", { name: "Gemini" })).toHaveTextContent("1 of 2");
      expect(screen.getByRole("option", { name: /Nova/ })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /Sulafat/ })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /Onyx/ })).not.toBeInTheDocument();
    });

    it("highlights the matched substring with <mark>", () => {
      renderCombobox();
      openPopover();
      fireEvent.change(searchInput(), { target: { value: "warm" } });
      const marks = Array.from(document.querySelectorAll("mark"));
      expect(marks.length).toBeGreaterThan(0);
      expect(marks.every((m) => /warm/i.test(m.textContent ?? ""))).toBe(true);
    });

    it("collapses a zero-match group to its header only", () => {
      renderCombobox();
      const listbox = openPopover();
      fireEvent.change(searchInput(), { target: { value: "deep" } });
      const gemini = within(listbox).getByRole("group", { name: "Gemini" });
      expect(gemini).toHaveTextContent("0 of 2");
      expect(within(gemini).queryAllByRole("option")).toHaveLength(0);
      expect(screen.getByRole("option", { name: /Onyx/ })).toBeInTheDocument();
    });

    it("supports a custom filter", () => {
      renderCombobox({ filter: (option, query) => option.id.includes(query) });
      openPopover();
      fireEvent.change(searchInput(), { target: { value: "gemini:" } });
      expect(screen.getAllByRole("option")).toHaveLength(2);
      expect(screen.queryByRole("option", { name: /Nova/ })).not.toBeInTheDocument();
    });

    it("shows the ✕ clear button while typing, and clearing restores the full list", () => {
      renderCombobox();
      openPopover();
      fireEvent.change(searchInput(), { target: { value: "warm" } });
      fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
      expect(searchInput()).toHaveValue("");
      expect(screen.getAllByRole("option")).toHaveLength(5);
    });

    it("renders the centered no-matches empty state with a working clear-search action", () => {
      renderCombobox();
      openPopover();
      fireEvent.change(searchInput(), { target: { value: "xylo" } });
      expect(screen.getByText(/No matches for/)).toBeInTheDocument();
      expect(screen.queryAllByRole("option")).toHaveLength(0);
      // Both the ✕ button and the empty-state link carry the same label.
      const clearButtons = screen.getAllByRole("button", { name: "Clear search" });
      fireEvent.click(clearButtons[clearButtons.length - 1]);
      expect(screen.getAllByRole("option")).toHaveLength(5);
      expect(screen.queryByText(/No matches for/)).not.toBeInTheDocument();
    });
  });

  describe("selection", () => {
    it("selects via click and closes the popover", async () => {
      const { onChange } = renderCombobox();
      openPopover();
      fireEvent.click(screen.getByRole("option", { name: /Onyx/ }));
      expect(onChange).toHaveBeenCalledWith("openai:onyx");
      await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    });

    it("navigates with ArrowDown/ArrowUp and selects with Enter", async () => {
      const { onChange } = renderCombobox();
      openPopover();
      const input = searchInput();
      // Opens on the selected option (Nova); ↓ moves to Onyx.
      fireEvent.keyDown(input, { key: "ArrowDown" });
      expect(activeDescendant()).toHaveTextContent("Onyx");
      fireEvent.keyDown(input, { key: "ArrowUp" });
      expect(activeDescendant()).toHaveTextContent("Nova");
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onChange).toHaveBeenCalledWith("openai:onyx");
      await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    });

    it("skips disabled options during keyboard navigation and ignores clicks on them", () => {
      const groups: ComboboxGroup[] = [
        {
          id: "openai",
          label: "OpenAI",
          options: [
            { id: "openai:nova", label: "Nova" },
            { id: "openai:onyx", label: "Onyx", disabled: true },
            { id: "openai:shimmer", label: "Shimmer" },
          ],
        },
      ];
      const { onChange } = renderCombobox({ groups });
      openPopover();
      fireEvent.keyDown(searchInput(), { key: "ArrowDown" });
      expect(activeDescendant()).toHaveTextContent("Shimmer");
      fireEvent.click(screen.getByRole("option", { name: /Onyx/ }));
      expect(onChange).not.toHaveBeenCalled();
    });

    it("closes on Escape without selecting", async () => {
      const { onChange } = renderCombobox();
      openPopover();
      fireEvent.keyDown(searchInput(), { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("Space plays the focused row's action", () => {
    it("fires onOptionAction for the focused row", () => {
      const onOptionAction = vi.fn();
      renderCombobox({ onOptionAction });
      openPopover();
      const input = searchInput();
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: " " });
      expect(onOptionAction).toHaveBeenCalledWith("openai:onyx");
    });

    it("acts on the initially-focused (selected) row right after opening", () => {
      const onOptionAction = vi.fn();
      renderCombobox({ onOptionAction });
      openPopover();
      fireEvent.keyDown(searchInput(), { key: " " });
      expect(onOptionAction).toHaveBeenCalledWith("openai:nova");
    });

    it("without onOptionAction, clicks the focused row's trailing button", () => {
      const onPlay = vi.fn();
      renderCombobox({
        groups: [
          {
            id: "openai",
            label: "OpenAI",
            options: [
              {
                id: "openai:nova",
                label: "Nova",
                trailing: (
                  <button type="button" aria-label="Play sample of Nova" onClick={onPlay}>
                    ▶
                  </button>
                ),
              },
            ],
          },
        ],
      });
      openPopover();
      fireEvent.keyDown(searchInput(), { key: " " });
      expect(onPlay).toHaveBeenCalled();
    });

    it("types a literal space while the user is typing a query, and re-arms after an arrow key", () => {
      const onOptionAction = vi.fn();
      renderCombobox({ onOptionAction });
      openPopover();
      const input = searchInput();
      fireEvent.change(input, { target: { value: "warm" } });
      const typing = fireEvent.keyDown(input, { key: " " });
      // Not preventDefault'ed — the browser would insert the space.
      expect(typing).toBe(true);
      expect(onOptionAction).not.toHaveBeenCalled();
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: " " });
      expect(onOptionAction).toHaveBeenCalled();
    });
  });

  describe("gated groups", () => {
    const gatedGroups: ComboboxGroup[] = [
      GROUPS[0],
      {
        ...GROUPS[1],
        count: 30,
        gate: {
          text: "Connect a Gemini API key to unlock 30 more voices.",
          cta: { label: "Open AI keys", href: "/settings/ai-keys" },
        },
      },
    ];

    it("renders the locked header with the full count and a teaser instead of options", () => {
      renderCombobox({ groups: gatedGroups });
      const listbox = openPopover();
      const gemini = within(listbox).getByRole("group", { name: "Gemini" });
      expect(gemini).toHaveTextContent("30");
      expect(gemini).toHaveTextContent("Connect a Gemini API key to unlock 30 more voices.");
      expect(within(gemini).queryAllByRole("option")).toHaveLength(0);
      const cta = within(gemini).getByRole("link", { name: "Open AI keys" });
      expect(cta).toHaveAttribute("href", "/settings/ai-keys");
    });

    it("arrow navigation never reaches the gated group (wraps within unlocked options)", () => {
      renderCombobox({ groups: gatedGroups });
      openPopover();
      const input = searchInput();
      const seen = new Set<string>();
      for (let i = 0; i < 6; i += 1) {
        fireEvent.keyDown(input, { key: "ArrowDown" });
        seen.add(activeDescendant()?.textContent ?? "");
      }
      expect([...seen].some((t) => /Zephyr|Sulafat/.test(t))).toBe(false);
      expect([...seen].some((t) => /Nova/.test(t))).toBe(true);
    });

    it("excludes gated options from search but keeps the locked header pinned after results", () => {
      renderCombobox({ groups: gatedGroups });
      const listbox = openPopover();
      // "Sulafat" only exists in the gated group — searching it is a no-match.
      fireEvent.change(searchInput(), { target: { value: "sulafat" } });
      expect(screen.getByText(/No matches for/)).toBeInTheDocument();
      expect(screen.queryAllByRole("option")).toHaveLength(0);
      const gemini = within(listbox).getByRole("group", { name: "Gemini" });
      expect(gemini).toHaveTextContent("30");
      expect(within(gemini).getByRole("link", { name: "Open AI keys" })).toBeInTheDocument();
    });
  });

  describe("i18n overrides", () => {
    it("uses the provided noMatchesLabel, clearSearchLabel, and searchCountLabel", () => {
      renderCombobox({
        noMatchesLabel: (q) => `Keine Treffer für „${q}“`,
        clearSearchLabel: "Suche löschen",
        searchCountLabel: (m, t) => `${m} von ${t}`,
      });
      const listbox = openPopover();
      fireEvent.change(searchInput(), { target: { value: "warm" } });
      expect(within(listbox).getByRole("group", { name: "OpenAI" })).toHaveTextContent("1 von 3");
      fireEvent.change(searchInput(), { target: { value: "xylo" } });
      expect(screen.getByText("Keine Treffer für „xylo“")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Suche löschen" }).length).toBeGreaterThan(0);
    });
  });
});
