import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PresetRadioCard, PresetRadioCardGroup } from "../PresetRadioCard";

const PRESETS = [
  { value: "clean", name: "Clean", description: "Minimal captions, soft fades" },
  { value: "bold", name: "Bold", description: "High-contrast, punchy cuts" },
  { value: "kinetic", name: "Kinetic", description: "Word-by-word motion" },
];

function renderGroup(opts?: {
  value?: string;
  onValueChange?: (v: string) => void;
}) {
  const onValueChange = opts?.onValueChange ?? vi.fn();
  render(
    <PresetRadioCardGroup
      aria-label="Visual style"
      value={opts?.value ?? "clean"}
      onValueChange={onValueChange}
    >
      {PRESETS.map((p) => (
        <PresetRadioCard
          key={p.value}
          value={p.value}
          name={p.name}
          description={p.description}
          thumbnailSrc={`https://cdn.example.com/${p.value}.png`}
          thumbnailAlt=""
        />
      ))}
    </PresetRadioCardGroup>
  );
  return { onValueChange };
}

/** Controlled harness so arrow-key selection actually moves. */
function ControlledGroup() {
  const [value, setValue] = useState("clean");
  return (
    <PresetRadioCardGroup aria-label="Visual style" value={value} onValueChange={setValue}>
      {PRESETS.map((p) => (
        <PresetRadioCard key={p.value} value={p.value} name={p.name} description={p.description} />
      ))}
    </PresetRadioCardGroup>
  );
}

describe("PresetRadioCard", () => {
  describe("roles and attributes", () => {
    it("renders a labelled radiogroup with one radio per card", () => {
      renderGroup();
      const group = screen.getByRole("radiogroup", { name: "Visual style" });
      const radios = screen.getAllByRole("radio");
      expect(radios).toHaveLength(3);
      radios.forEach((r) => expect(group.contains(r)).toBe(true));
    });

    it("marks only the selected card aria-checked", () => {
      renderGroup({ value: "bold" });
      expect(screen.getByRole("radio", { name: /Bold/ })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByRole("radio", { name: /Clean/ })).toHaveAttribute("aria-checked", "false");
      expect(screen.getByRole("radio", { name: /Kinetic/ })).toHaveAttribute(
        "aria-checked",
        "false"
      );
    });

    it("uses a roving tabindex — only the selected card is tabbable", () => {
      renderGroup({ value: "bold" });
      expect(screen.getByRole("radio", { name: /Bold/ })).toHaveAttribute("tabindex", "0");
      expect(screen.getByRole("radio", { name: /Clean/ })).toHaveAttribute("tabindex", "-1");
    });

    it("shows a check icon only on the selected card", () => {
      renderGroup({ value: "bold" });
      const bold = screen.getByRole("radio", { name: /Bold/ });
      const clean = screen.getByRole("radio", { name: /Clean/ });
      expect(bold.querySelector("svg")).not.toBeNull();
      expect(clean.querySelector("svg")).toBeNull();
    });

    it("applies the selected border/tint/glow classes in both modes", () => {
      renderGroup({ value: "clean" });
      const selected = screen.getByRole("radio", { name: /Clean/ });
      expect(selected.className).toContain("border-brand-600");
      expect(selected.className).toContain("bg-brand-50/60");
      expect(selected.className).toContain("shadow-glow-brand");
      expect(selected.className).toContain("dark:border-brand-400");
      expect(selected.className).toContain("dark:bg-brand-500/10");
    });
  });

  describe("thumbnail", () => {
    it("renders an img from thumbnailSrc", () => {
      renderGroup();
      const clean = screen.getByRole("radio", { name: /Clean/ });
      const img = clean.querySelector("img");
      expect(img).toHaveAttribute("src", "https://cdn.example.com/clean.png");
    });

    it("renders a custom thumbnail slot instead of the img", () => {
      render(
        <PresetRadioCardGroup aria-label="Visual style" value="x" onValueChange={() => {}}>
          <PresetRadioCard
            value="x"
            name="Custom"
            thumbnail={<span data-testid="custom-thumb">sample</span>}
          />
        </PresetRadioCardGroup>
      );
      expect(screen.getByTestId("custom-thumb")).toBeInTheDocument();
      expect(screen.getByRole("radio").querySelector("img")).toBeNull();
    });
  });

  describe("interaction", () => {
    it("selects a card on click", () => {
      const { onValueChange } = renderGroup({ value: "clean" });
      fireEvent.click(screen.getByRole("radio", { name: /Kinetic/ }));
      expect(onValueChange).toHaveBeenCalledWith("kinetic");
    });

    it("ArrowRight moves selection and focus to the next card", () => {
      render(<ControlledGroup />);
      const clean = screen.getByRole("radio", { name: /Clean/ });
      clean.focus();
      fireEvent.keyDown(clean, { key: "ArrowRight" });
      const bold = screen.getByRole("radio", { name: /Bold/ });
      expect(bold).toHaveAttribute("aria-checked", "true");
      expect(bold).toHaveFocus();
    });

    it("ArrowDown behaves like ArrowRight", () => {
      render(<ControlledGroup />);
      const clean = screen.getByRole("radio", { name: /Clean/ });
      clean.focus();
      fireEvent.keyDown(clean, { key: "ArrowDown" });
      expect(screen.getByRole("radio", { name: /Bold/ })).toHaveAttribute("aria-checked", "true");
    });

    it("ArrowLeft wraps from the first to the last card", () => {
      render(<ControlledGroup />);
      const clean = screen.getByRole("radio", { name: /Clean/ });
      clean.focus();
      fireEvent.keyDown(clean, { key: "ArrowLeft" });
      const kinetic = screen.getByRole("radio", { name: /Kinetic/ });
      expect(kinetic).toHaveAttribute("aria-checked", "true");
      expect(kinetic).toHaveFocus();
    });

    it("ArrowRight wraps from the last back to the first card", () => {
      render(<ControlledGroup />);
      const clean = screen.getByRole("radio", { name: /Clean/ });
      clean.focus();
      fireEvent.keyDown(clean, { key: "ArrowLeft" }); // now on Kinetic (last)
      const kinetic = screen.getByRole("radio", { name: /Kinetic/ });
      fireEvent.keyDown(kinetic, { key: "ArrowRight" });
      expect(screen.getByRole("radio", { name: /Clean/ })).toHaveAttribute(
        "aria-checked",
        "true"
      );
    });

    it("Home and End jump to the first and last card", () => {
      render(<ControlledGroup />);
      const clean = screen.getByRole("radio", { name: /Clean/ });
      clean.focus();
      fireEvent.keyDown(clean, { key: "End" });
      const kinetic = screen.getByRole("radio", { name: /Kinetic/ });
      expect(kinetic).toHaveAttribute("aria-checked", "true");
      fireEvent.keyDown(kinetic, { key: "Home" });
      expect(screen.getByRole("radio", { name: /Clean/ })).toHaveAttribute(
        "aria-checked",
        "true"
      );
    });

    it("skips disabled cards during arrow navigation", () => {
      function Harness() {
        const [value, setValue] = useState("clean");
        return (
          <PresetRadioCardGroup aria-label="Visual style" value={value} onValueChange={setValue}>
            <PresetRadioCard value="clean" name="Clean" />
            <PresetRadioCard value="bold" name="Bold" disabled />
            <PresetRadioCard value="kinetic" name="Kinetic" />
          </PresetRadioCardGroup>
        );
      }
      render(<Harness />);
      const clean = screen.getByRole("radio", { name: /Clean/ });
      clean.focus();
      fireEvent.keyDown(clean, { key: "ArrowRight" });
      expect(screen.getByRole("radio", { name: /Kinetic/ })).toHaveAttribute(
        "aria-checked",
        "true"
      );
    });
  });
});
