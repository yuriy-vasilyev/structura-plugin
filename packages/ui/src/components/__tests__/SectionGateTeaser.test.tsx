import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionGateTeaser } from "../SectionGateTeaser";

function renderTeaser(props?: Partial<React.ComponentProps<typeof SectionGateTeaser>>) {
  const { container } = render(
    <SectionGateTeaser
      title="Video styling"
      badge="Cloud Pro"
      line="Style presets, caption placement and brand-palette captions for every rendered video."
      cta={<button data-testid="cta">Upgrade plan</button>}
      {...props}
    />
  );
  return container.firstElementChild as HTMLElement;
}

describe("SectionGateTeaser", () => {
  it("renders title, value-prop line and the consumer's CTA", () => {
    renderTeaser();
    expect(screen.getByText("Video styling")).toBeInTheDocument();
    expect(screen.getByText(/brand-palette captions/)).toBeInTheDocument();
    expect(screen.getByTestId("cta")).toBeInTheDocument();
  });

  it("styles the title 14/700", () => {
    renderTeaser();
    const title = screen.getByText("Video styling");
    expect(title.className).toContain("text-sm");
    expect(title.className).toContain("font-bold");
  });

  it("renders a neutral lock tile by default", () => {
    const root = renderTeaser();
    const tile = root.querySelector('[class*="size-9"]');
    expect(tile).not.toBeNull();
    expect(tile!.className).toContain("rounded-xl");
    expect(tile!.querySelector("svg.lucide-lock")).not.toBeNull();
  });

  it("accepts an icon override in place of the lock", () => {
    const root = renderTeaser({ icon: <span data-testid="custom-icon" /> });
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
    expect(root.querySelector("svg.lucide-lock")).toBeNull();
  });

  it("wraps a string badge in a premium Badge", () => {
    renderTeaser();
    const badge = screen.getByText("Cloud Pro");
    expect(badge.className).toContain("bg-purple-50");
  });

  it("renders a ReactNode badge as-is", () => {
    renderTeaser({ badge: <span data-testid="badge-node">Agency</span> });
    expect(screen.getByTestId("badge-node")).toBeInTheDocument();
  });

  it("omits line, badge and CTA when not provided", () => {
    const { container } = render(<SectionGateTeaser title="Video styling" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.textContent).toBe("Video styling");
  });

  it("wraps gracefully on narrow containers (flex-wrap row)", () => {
    const root = renderTeaser();
    expect(root.className).toContain("flex-wrap");
    expect(root.className).toContain("rounded-xl");
  });
});
