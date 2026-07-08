import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PlacementRadio, type CaptionPlacement } from "../PlacementRadio";

const LABELS = { top: "Top", middle: "Middle", bottom: "Bottom" };

function renderRadio(opts?: {
  value?: CaptionPlacement;
  onValueChange?: (v: CaptionPlacement) => void;
}) {
  const onValueChange = opts?.onValueChange ?? vi.fn();
  const { container } = render(
    <PlacementRadio
      aria-label="Caption placement"
      value={opts?.value ?? "bottom"}
      onValueChange={onValueChange}
      labels={LABELS}
    />
  );
  return { onValueChange, container };
}

/** Controlled harness so arrow-key selection actually moves. */
function ControlledRadio() {
  const [value, setValue] = useState<CaptionPlacement>("top");
  return (
    <PlacementRadio
      aria-label="Caption placement"
      value={value}
      onValueChange={setValue}
      labels={LABELS}
    />
  );
}

describe("PlacementRadio", () => {
  describe("roles and attributes", () => {
    it("renders a labelled radiogroup with Top/Middle/Bottom radios in order", () => {
      renderRadio();
      expect(screen.getByRole("radiogroup", { name: "Caption placement" })).toBeInTheDocument();
      const radios = screen.getAllByRole("radio");
      expect(radios).toHaveLength(3);
      expect(radios[0]).toHaveTextContent("Top");
      expect(radios[1]).toHaveTextContent("Middle");
      expect(radios[2]).toHaveTextContent("Bottom");
    });

    it("marks only the selected option aria-checked", () => {
      renderRadio({ value: "middle" });
      expect(screen.getByRole("radio", { name: /Middle/ })).toHaveAttribute(
        "aria-checked",
        "true"
      );
      expect(screen.getByRole("radio", { name: /Top/ })).toHaveAttribute("aria-checked", "false");
      expect(screen.getByRole("radio", { name: /Bottom/ })).toHaveAttribute(
        "aria-checked",
        "false"
      );
    });

    it("uses a roving tabindex — only the selected option is tabbable", () => {
      renderRadio({ value: "middle" });
      expect(screen.getByRole("radio", { name: /Middle/ })).toHaveAttribute("tabindex", "0");
      expect(screen.getByRole("radio", { name: /Top/ })).toHaveAttribute("tabindex", "-1");
    });

    it("shows a check icon only on the selected option", () => {
      renderRadio({ value: "bottom" });
      expect(screen.getByRole("radio", { name: /Bottom/ }).querySelector("svg")).not.toBeNull();
      expect(screen.getByRole("radio", { name: /Top/ }).querySelector("svg")).toBeNull();
    });

    it("applies the brand ring/glow selected treatment in both modes", () => {
      renderRadio({ value: "bottom" });
      const selected = screen.getByRole("radio", { name: /Bottom/ });
      expect(selected.className).toContain("border-brand-600");
      expect(selected.className).toContain("bg-brand-50/60");
      expect(selected.className).toContain("shadow-glow-brand");
      expect(selected.className).toContain("dark:border-brand-400");
      expect(selected.className).toContain("dark:bg-brand-500/10");
    });
  });

  describe("9:16 schematic", () => {
    it("renders an aria-hidden 26×44 frame in every option", () => {
      renderRadio();
      for (const radio of screen.getAllByRole("radio")) {
        const frame = radio.querySelector('[aria-hidden="true"]');
        expect(frame).not.toBeNull();
        expect(frame!.className).toContain("h-11");
        expect(frame!.className).toContain("w-[26px]");
        expect(frame!.className).toContain("rounded-[4px]");
      }
    });

    it("positions the 3px caption band per option (top / middle / bottom)", () => {
      renderRadio();
      const band = (name: RegExp) =>
        screen
          .getByRole("radio", { name })
          .querySelector<HTMLElement>('[aria-hidden="true"] > span')!;
      expect(band(/Top/).style.top).toBe("5px");
      expect(band(/Middle/).style.top).toBe("50%");
      expect(band(/Middle/).style.marginTop).toBe("-1.5px");
      expect(band(/Bottom/).style.bottom).toBe("5px");
    });

    it("tints the selected option's frame and band with brand tokens", () => {
      renderRadio({ value: "top" });
      const frame = screen
        .getByRole("radio", { name: /Top/ })
        .querySelector('[aria-hidden="true"]')!;
      expect(frame.className).toContain("border-brand-400/70");
      const band = frame.querySelector("span")!;
      expect(band.className).toContain("bg-brand-600");
      expect(band.className).toContain("dark:bg-brand-400");
    });
  });

  describe("interaction", () => {
    it("selects an option on click", () => {
      const { onValueChange } = renderRadio({ value: "bottom" });
      fireEvent.click(screen.getByRole("radio", { name: /Top/ }));
      expect(onValueChange).toHaveBeenCalledWith("top");
    });

    it("ArrowRight moves selection and focus to the next option", () => {
      render(<ControlledRadio />);
      const top = screen.getByRole("radio", { name: /Top/ });
      top.focus();
      fireEvent.keyDown(top, { key: "ArrowRight" });
      const middle = screen.getByRole("radio", { name: /Middle/ });
      expect(middle).toHaveAttribute("aria-checked", "true");
      expect(middle).toHaveFocus();
    });

    it("ArrowLeft wraps from the first to the last option", () => {
      render(<ControlledRadio />);
      const top = screen.getByRole("radio", { name: /Top/ });
      top.focus();
      fireEvent.keyDown(top, { key: "ArrowLeft" });
      expect(screen.getByRole("radio", { name: /Bottom/ })).toHaveAttribute(
        "aria-checked",
        "true"
      );
    });

    it("Home and End jump to the first and last option", () => {
      render(<ControlledRadio />);
      const top = screen.getByRole("radio", { name: /Top/ });
      top.focus();
      fireEvent.keyDown(top, { key: "End" });
      const bottom = screen.getByRole("radio", { name: /Bottom/ });
      expect(bottom).toHaveAttribute("aria-checked", "true");
      fireEvent.keyDown(bottom, { key: "Home" });
      expect(screen.getByRole("radio", { name: /Top/ })).toHaveAttribute("aria-checked", "true");
    });
  });

  describe("responsive layout", () => {
    it("wraps 1-per-row below 420px container width via container query", () => {
      const { container } = renderRadio();
      expect((container.firstElementChild as HTMLElement).className).toContain("@container");
      const group = screen.getByRole("radiogroup");
      expect(group.className).toContain("grid-cols-3");
      expect(group.className).toContain("@max-[420px]:grid-cols-1");
    });
  });
});
