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
});
