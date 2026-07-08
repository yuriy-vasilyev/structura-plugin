import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressBar } from "../ProgressBar";

describe("ProgressBar", () => {
  describe("determinate", () => {
    it("exposes progressbar semantics with aria-valuenow/min/max", () => {
      render(<ProgressBar value={12} max={20} />);
      const bar = screen.getByRole("progressbar");
      expect(bar).toHaveAttribute("aria-valuenow", "12");
      expect(bar).toHaveAttribute("aria-valuemin", "0");
      expect(bar).toHaveAttribute("aria-valuemax", "20");
    });

    it("defaults max to 100", () => {
      render(<ProgressBar value={40} />);
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "100");
    });

    it("sizes the fill as a percentage of max", () => {
      render(<ProgressBar value={12} max={20} data-testid="bar" />);
      const fill = screen.getByTestId("bar").firstElementChild as HTMLElement;
      expect(fill.style.width).toBe("60%");
    });

    it("clamps out-of-range values into [0, max]", () => {
      render(<ProgressBar value={45} max={20} data-testid="bar" />);
      const bar = screen.getByTestId("bar");
      expect(bar).toHaveAttribute("aria-valuenow", "20");
      expect((bar.firstElementChild as HTMLElement).style.width).toBe("100%");
    });

    it("does not animate the fill", () => {
      render(<ProgressBar value={5} max={10} data-testid="bar" />);
      const fill = screen.getByTestId("bar").firstElementChild as HTMLElement;
      expect(fill.className).not.toContain("animate-progress-runner");
    });
  });

  describe("indeterminate", () => {
    it("keeps the progressbar role but omits aria-valuenow", () => {
      render(<ProgressBar />);
      const bar = screen.getByRole("progressbar");
      expect(bar).not.toHaveAttribute("aria-valuenow");
      expect(bar).not.toHaveAttribute("aria-valuemax");
    });

    it("renders a looping runner that goes static under prefers-reduced-motion", () => {
      render(<ProgressBar data-testid="bar" />);
      const fill = screen.getByTestId("bar").firstElementChild as HTMLElement;
      expect(fill.className).toContain("animate-progress-runner");
      expect(fill.className).toContain("motion-reduce:animate-none");
    });
  });

  describe("appearance", () => {
    it("uses the neutral track and brand fill by default", () => {
      render(<ProgressBar value={5} max={10} data-testid="bar" />);
      const bar = screen.getByTestId("bar");
      expect(bar.className).toContain("bg-neutral-200");
      expect(bar.className).toContain("dark:bg-neutral-700");
      const fill = bar.firstElementChild as HTMLElement;
      expect(fill.className).toContain("bg-brand-600");
      expect(fill.className).toContain("dark:bg-brand-500");
    });

    it("switches to an amber fill for the warning intent", () => {
      render(<ProgressBar value={10} max={10} intent="warning" data-testid="bar" />);
      const fill = screen.getByTestId("bar").firstElementChild as HTMLElement;
      expect(fill.className).toContain("bg-amber-500");
      expect(fill.className).not.toContain("bg-brand-600");
    });

    it("merges custom track and fill classes", () => {
      render(
        <ProgressBar
          data-testid="bar"
          className="bg-brand-100 dark:bg-brand-500/20"
          fillClassName="bg-brand-500"
        />
      );
      const bar = screen.getByTestId("bar");
      expect(bar.className).toContain("bg-brand-100");
      expect(bar.className).not.toContain("bg-neutral-200");
      expect((bar.firstElementChild as HTMLElement).className).toContain("bg-brand-500");
    });
  });
});
