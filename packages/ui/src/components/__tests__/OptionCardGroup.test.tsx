import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Crown, TrendingUp, Zap } from "lucide-react";
import { OptionCardGroup, type OptionCardOption } from "../OptionCardGroup";

type Mode = "traffic" | "quick" | "authority";

const OPTIONS: ReadonlyArray<OptionCardOption<Mode>> = [
  { value: "traffic", label: "Traffic Magnet", icon: TrendingUp },
  { value: "quick", label: "Quick Wins", icon: Zap, description: "Fast rankings" },
  { value: "authority", label: "Authority", icon: Crown },
];

/** Text-only options — the wp-admin CreateCampaignPage shape. */
const TEXT_OPTIONS: ReadonlyArray<OptionCardOption<Mode>> = OPTIONS.map(
  ({ value, label, description }) => ({ value, label, description })
);

function renderGroup(opts?: {
  value?: Mode;
  onChange?: (v: Mode) => void;
  options?: ReadonlyArray<OptionCardOption<Mode>>;
  disabled?: boolean;
}) {
  const onChange = opts?.onChange ?? vi.fn();
  render(
    <OptionCardGroup
      options={opts?.options ?? OPTIONS}
      value={opts?.value ?? "traffic"}
      onChange={onChange}
      ariaLabel="Writing approach"
      disabled={opts?.disabled}
    />
  );
  return { onChange };
}

/** Controlled harness so arrow-key selection actually moves. */
function ControlledGroup({ onChange }: { onChange?: (v: Mode) => void }) {
  const [value, setValue] = useState<Mode>("authority");
  return (
    <OptionCardGroup
      options={OPTIONS}
      value={value}
      onChange={(next) => {
        onChange?.(next);
        setValue(next);
      }}
      ariaLabel="Writing approach"
    />
  );
}

describe("OptionCardGroup", () => {
  it("renders a radiogroup named by ariaLabel with one radio per option, in order", () => {
    renderGroup();
    const group = screen.getByRole("radiogroup", { name: "Writing approach" });
    expect(group).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual([
      "Traffic Magnet",
      "Quick WinsFast rankings",
      "Authority",
    ]);
  });

  it("marks the selected card aria-checked and shows the check indicator on it only", () => {
    renderGroup({ value: "quick", options: TEXT_OPTIONS });
    const selected = screen.getByRole("radio", { name: /Quick Wins/ });
    expect(selected).toHaveAttribute("aria-checked", "true");
    // Text-only options: the sole svg on the selected card is the Check badge.
    expect(selected.querySelector("svg")).not.toBeNull();
    for (const other of screen.getAllByRole("radio").filter((r) => r !== selected)) {
      expect(other).toHaveAttribute("aria-checked", "false");
      expect(other.querySelector("svg")).toBeNull();
    }
  });

  it("keeps the check visible alongside an option icon (never color-alone)", () => {
    renderGroup({ value: "quick" });
    // Icon (left) + Check badge (top-right) = two svgs on the selected card.
    expect(screen.getByRole("radio", { name: /Quick Wins/ }).querySelectorAll("svg")).toHaveLength(
      2
    );
  });

  it("renders the description line only when provided", () => {
    renderGroup();
    expect(screen.getByText("Fast rankings")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Authority" }).textContent).toBe("Authority");
  });

  it("selects on click", () => {
    const { onChange } = renderGroup({ value: "traffic" });
    fireEvent.click(screen.getByRole("radio", { name: "Authority" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("authority");
  });

  it("ArrowRight from the last option wraps to the first, selecting and focusing it", () => {
    const onChange = vi.fn();
    render(<ControlledGroup onChange={onChange} />);
    const last = screen.getByRole("radio", { name: "Authority" });
    last.focus();
    fireEvent.keyDown(last, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("traffic");
    const first = screen.getByRole("radio", { name: "Traffic Magnet" });
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("aria-checked", "true");
  });

  it("ArrowLeft moves selection backwards; Home/End jump to the edges", () => {
    render(<ControlledGroup />);
    const authority = screen.getByRole("radio", { name: "Authority" });
    authority.focus();
    fireEvent.keyDown(authority, { key: "ArrowLeft" });
    expect(screen.getByRole("radio", { name: /Quick Wins/ })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    fireEvent.keyDown(screen.getByRole("radio", { name: /Quick Wins/ }), { key: "End" });
    expect(screen.getByRole("radio", { name: "Authority" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    fireEvent.keyDown(screen.getByRole("radio", { name: "Authority" }), { key: "Home" });
    expect(screen.getByRole("radio", { name: "Traffic Magnet" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("roving tabindex: exactly the selected card is tabbable", () => {
    renderGroup({ value: "quick" });
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("keeps the first card tabbable when value matches no option, so the group stays reachable", () => {
    render(
      <OptionCardGroup
        options={OPTIONS}
        value={"unset" as Mode}
        onChange={vi.fn()}
        ariaLabel="Writing approach"
      />
    );
    expect(screen.getAllByRole("radio").map((r) => r.tabIndex)).toEqual([0, -1, -1]);
  });

  it("disabled blocks click and keyboard selection", () => {
    const { onChange } = renderGroup({ value: "traffic", disabled: true });
    const first = screen.getByRole("radio", { name: "Traffic Magnet" });
    expect(first).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Authority" }));
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders descriptions at 12px neutral-500 (the 10px neutral-400 line failed contrast)", () => {
    renderGroup();
    const description = screen.getByText("Fast rankings");
    expect(description).toHaveClass("text-xs", "text-neutral-500", "dark:text-neutral-400");
    expect(description).not.toHaveClass("text-[10px]", "text-neutral-400");
  });

  it("borders unselected cards with neutral-700 in dark, so they stay visible on a neutral-800 dialog (2026-09-30)", () => {
    // Regression: the Article delivery connect dialog (bg neutral-800) drew
    // neutral-800 card borders, so its platform and check cards vanished in dark.
    renderGroup({ value: "quick" });
    const unselected = screen
      .getAllByRole("radio")
      .filter((radio) => radio.getAttribute("aria-checked") === "false");
    expect(unselected.length).toBeGreaterThan(0);
    for (const radio of unselected) {
      expect(radio).toHaveClass("dark:border-neutral-700", "dark:hover:border-neutral-600");
      expect(radio).not.toHaveClass("dark:border-neutral-800");
    }
  });

  it("keeps the card layout by default: 2/4-column grid and a top-right check", () => {
    renderGroup({ value: "quick" });
    expect(screen.getByRole("radiogroup")).toHaveClass("grid-cols-2", "sm:grid-cols-4");
    const selected = screen.getByRole("radio", { name: /Quick Wins/ });
    expect(selected).toHaveClass("flex-col");
    expect(selected.querySelector("svg.absolute")).not.toBeNull();
  });

  describe("media slot", () => {
    const MEDIA_OPTIONS: ReadonlyArray<OptionCardOption<Mode>> = [
      { value: "traffic", label: "Traffic Magnet", icon: TrendingUp, media: <i data-testid="mark-a" /> },
      { value: "quick", label: "Quick Wins", icon: Zap },
      { value: "authority", label: "Authority" },
    ];

    it("renders media in a 32px decorative tile before the label, in place of the icon", () => {
      renderGroup({ options: MEDIA_OPTIONS, value: "quick" });
      const card = screen.getByRole("radio", { name: "Traffic Magnet" });
      const tile = card.querySelector('[data-slot="media"]') as HTMLElement;
      expect(tile).not.toBeNull();
      expect(tile).toHaveClass("size-8");
      expect(tile).toHaveAttribute("aria-hidden", "true");
      expect(tile).toContainElement(screen.getByTestId("mark-a"));
      // The icon is replaced, not stacked: the unselected card has no svg.
      expect(card.querySelector("svg")).toBeNull();
      // Tile comes before the label in DOM order.
      const label = screen.getByText("Traffic Magnet");
      expect(tile.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("leaves options without media on their icon", () => {
      renderGroup({ options: MEDIA_OPTIONS, value: "traffic" });
      const quick = screen.getByRole("radio", { name: "Quick Wins" });
      expect(quick.querySelector('[data-slot="media"]')).toBeNull();
      expect(quick.querySelector("svg")).not.toBeNull();
    });
  });

  describe('layout="row"', () => {
    function renderRow(value: Mode = "quick") {
      render(
        <OptionCardGroup
          options={OPTIONS}
          value={value}
          onChange={vi.fn()}
          ariaLabel="Writing approach"
          layout="row"
        />
      );
    }

    it("stacks options in one column as 56px-minimum rows", () => {
      renderRow();
      const group = screen.getByRole("radiogroup");
      expect(group).toHaveClass("grid-cols-1");
      expect(group).not.toHaveClass("grid-cols-2");
      for (const radio of screen.getAllByRole("radio")) {
        expect(radio).toHaveClass("min-h-14", "flex-row", "items-center");
      }
    });

    it("puts the check last in the row instead of pinning it top-right", () => {
      renderRow("quick");
      const selected = screen.getByRole("radio", { name: /Quick Wins/ });
      const svgs = selected.querySelectorAll("svg");
      const check = svgs[svgs.length - 1];
      expect(selected.lastElementChild).toBe(check);
      expect(check).not.toHaveClass("absolute");
    });

    it("keeps the radiogroup keyboard contract", () => {
      renderRow("quick");
      expect(screen.getAllByRole("radio").map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    });
  });
});
