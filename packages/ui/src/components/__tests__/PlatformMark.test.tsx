import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PLATFORMS, PlatformMark, type Platform } from "../PlatformMark";
import { PlatformChip } from "../PlatformChip";

const IDS = Object.keys(PLATFORMS) as Platform[];

/** Platforms drawn as their brand's own mark in `currentColor`. */
const CURRENT_COLOR_MARKS = [
  "bolt",
  "v0",
  "replit",
  "wordpress",
  "nextjs",
  "astro",
  "nuxt",
  "sveltekit",
] as const satisfies readonly Platform[];

describe("PLATFORMS", () => {
  it("lists every site platform with its owner's spelling", () => {
    expect(PLATFORMS).toEqual({
      lovable: "Lovable",
      bolt: "Bolt",
      v0: "v0",
      replit: "Replit",
      custom: "Custom",
      wordpress: "WordPress",
      nextjs: "Next.js",
      astro: "Astro",
      nuxt: "Nuxt",
      sveltekit: "SvelteKit",
      framework: "Another framework or app",
      backend: "My own backend",
    });
  });
});

describe("PlatformMark", () => {
  it.each(IDS)("renders a decorative %s mark at 32px by default", (platform) => {
    const { container } = render(<PlatformMark platform={platform} />);
    const svg = container.querySelector("svg") as SVGElement;
    expect(svg).toHaveAttribute("data-platform", platform);
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "32");
    expect(svg).toHaveAttribute("height", "32");
  });

  it("renders at 16px when asked", () => {
    const { container } = render(<PlatformMark platform="bolt" size={16} />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "16");
  });

  // 22px is the wizard header and result-card size (handoff "Assets — platform marks").
  it.each(IDS)("renders the %s mark at 22px when asked", (platform) => {
    const { container } = render(<PlatformMark platform={platform} size={22} />);
    const svg = container.querySelector("svg") as SVGElement;
    expect(svg).toHaveAttribute("width", "22");
    expect(svg).toHaveAttribute("height", "22");
  });

  it.each(CURRENT_COLOR_MARKS)(
    "draws the %s mark as a filled currentColor path with no text node",
    (platform) => {
      const { container } = render(<PlatformMark platform={platform} />);
      const svg = container.querySelector("svg") as SVGElement;
      expect(svg).toHaveAttribute("fill", "currentColor");
      expect(svg.querySelector("path")?.getAttribute("d")).toBeTruthy();
      expect(container.textContent).toBe("");
    }
  );

  it("draws a different path for every brand", () => {
    const paths = [...CURRENT_COLOR_MARKS, "lovable" as const].map((platform) => {
      const { container } = render(<PlatformMark platform={platform} />);
      return container.querySelector("path")?.getAttribute("d");
    });
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("draws the Lovable mark in its own gradient", () => {
    const { container } = render(<PlatformMark platform="lovable" />);
    const svg = container.querySelector("svg") as SVGElement;
    const gradient = svg.querySelector("linearGradient") as SVGElement;
    expect(gradient).not.toBeNull();
    expect(svg.getAttribute("fill")).toBe(`url(#${gradient.id})`);
    expect(svg.querySelectorAll("stop")).toHaveLength(3);
    expect(container.textContent).toBe("");
  });

  it("gives each Lovable mark on a page its own gradient id", () => {
    const { container } = render(
      <>
        <PlatformMark platform="lovable" />
        <PlatformMark platform="lovable" size={16} />
      </>
    );
    const ids = Array.from(container.querySelectorAll("linearGradient")).map((g) => g.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("cuts the Bolt glyph out of its tile so the background shows through", () => {
    const { container } = render(<PlatformMark platform="bolt" />);
    const svg = container.querySelector("svg") as SVGElement;
    expect(svg).toHaveAttribute("fill-rule", "evenodd");
    expect(svg.querySelector("path")?.getAttribute("d")).toMatch(/^M4 0h8a4 4 0 0 1 4 4/);
  });

  it.each([
    ["custom", "lucide-code-xml"],
    ["framework", "lucide-braces"],
    ["backend", "lucide-server"],
  ] as const)("uses a Lucide glyph for %s (%s)", (platform, glyphClass) => {
    const { container } = render(<PlatformMark platform={platform} className="extra" />);
    const svg = container.querySelector("svg") as SVGElement;
    expect(svg).toHaveClass(glyphClass, "shrink-0", "extra");
    expect(svg).toHaveAttribute("data-platform", platform);
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});

describe("PlatformChip", () => {
  it.each(IDS)("shows the %s name as real text beside a 16px mark", (platform) => {
    const { container } = render(<PlatformChip platform={platform} />);
    // The mark adds no text, so the chip reads as exactly the name.
    expect(container.textContent).toBe(PLATFORMS[platform]);
    const svg = container.querySelector("svg") as SVGElement;
    expect(svg).toHaveAttribute("width", "16");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("names an onboarding-only platform in full beside its glyph", () => {
    render(<PlatformChip id="chip" platform="framework" />);
    const chip = document.getElementById("chip") as HTMLElement;
    expect(chip).toHaveTextContent(/^Another framework or app$/);
    expect(chip.querySelector("svg")).toHaveAttribute("data-platform", "framework");
  });

  it("can be referenced by aria-describedby and reads as the builder name", () => {
    render(
      <>
        <input aria-label="Name" aria-describedby="chip" />
        <PlatformChip id="chip" platform="lovable" />
      </>
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveAccessibleDescription("Lovable");
  });

  it("uses the pill tokens in both modes", () => {
    render(<PlatformChip id="chip" platform="v0" />);
    expect(document.getElementById("chip")).toHaveClass(
      "rounded-full",
      "border-neutral-200",
      "bg-neutral-50",
      "text-xs",
      "font-semibold",
      "dark:border-neutral-700",
      "dark:bg-neutral-900",
      "dark:text-neutral-200"
    );
  });
});
