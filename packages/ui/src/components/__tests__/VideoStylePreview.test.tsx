import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  readableOn,
  STOCK_VIDEO_ACCENT,
  VideoStylePreview,
  type VideoStyleKind,
} from "../VideoStylePreview";

/** Renders a preview and returns its root element. */
function renderPreview(props: { kind: VideoStyleKind; accent?: string }) {
  const { container } = render(<VideoStylePreview {...props} />);
  return container.firstElementChild as HTMLElement;
}

describe("readableOn", () => {
  // Copper #B36D33 (the handoff's demo accent) MUST resolve to white —
  // the boards render the Kinetic chip's "3×" in white on copper.
  it.each([
    ["#5B3FE5", "#ffffff"], // stock brand indigo
    ["#B36D33", "#ffffff"], // demo copper accent
    ["#111111", "#ffffff"],
    ["#0a0a0a", "#ffffff"],
    ["#F9F9F9", "#0a0a0a"], // pale paper
    ["#FBF8F4", "#0a0a0a"], // warm beige
    ["#FFFFFF", "#0a0a0a"],
    ["#FFD700", "#0a0a0a"], // bright gold — dark text
  ])("picks a readable text color on %s", (accent, expected) => {
    expect(readableOn(accent)).toBe(expected);
  });

  it("accepts 3-digit and un-prefixed hex", () => {
    expect(readableOn("#fff")).toBe("#0a0a0a");
    expect(readableOn("fff")).toBe("#0a0a0a");
    expect(readableOn("5B3FE5")).toBe("#ffffff");
  });

  it("falls back to white on unparsable input", () => {
    // Accents default toward the dark stock indigo, so white is the
    // safer failure mode.
    expect(readableOn("not-a-color")).toBe("#ffffff");
    expect(readableOn("")).toBe("#ffffff");
  });
});

describe("VideoStylePreview", () => {
  it("exposes the stock brand-indigo accent constant", () => {
    expect(STOCK_VIDEO_ACCENT).toBe("#5B3FE5");
  });

  describe("fixed art (all kinds)", () => {
    it.each(["clean", "bold", "kinetic"] as const)(
      "renders the %s art as decorative (aria-hidden) with the warm footage gradient",
      (kind) => {
        const root = renderPreview({ kind });
        expect(root).toHaveAttribute("aria-hidden", "true");
        expect(root).toHaveAttribute("data-kind", kind);
        // Identical in light & dark — the gradient is inline style, no
        // dark: variants inside the art.
        expect(root.getAttribute("style")).toContain("linear-gradient(160deg");
        expect(root.className).not.toContain("dark:");
      }
    );

    it.each(["clean", "bold", "kinetic"] as const)(
      "renders the bottom scrim on the %s art",
      (kind) => {
        const root = renderPreview({ kind });
        expect(root.querySelector('[class*="from-neutral-950/30"]')).not.toBeNull();
      }
    );

    it("fills its container (aspect is the consumer's thumb slot)", () => {
      const root = renderPreview({ kind: "clean" });
      expect(root.className).toContain("h-full");
      expect(root.className).toContain("w-full");
    });
  });

  describe("clean", () => {
    it("renders a small semibold caption on a dark scrim pill (matches the render)", () => {
      // Production (Shotstack, CSS2.1) drops text-shadow — the real
      // videos use a scrim pill, and the preview must not overpromise.
      const root = renderPreview({ kind: "clean" });
      expect(root.textContent).toContain("grows 3× faster");
      const caption = root.querySelector<HTMLElement>('[class*="font-semibold"]');
      expect(caption).not.toBeNull();
      expect(caption!.style.backgroundColor).not.toBe("");
      expect(caption!.style.textShadow).toBe("");
    });
  });

  describe("bold", () => {
    it("renders the black-weight uppercase two-liner", () => {
      const root = renderPreview({ kind: "bold" });
      expect(root.textContent).toContain("GROWS");
      expect(root.textContent).toContain("3× FASTER");
      const caption = root.querySelector<HTMLElement>('[class*="font-black"]');
      expect(caption).not.toBeNull();
      expect(caption!.className).toContain("uppercase");
      expect(caption!.style.backgroundColor).not.toBe("");
    });

    it("renders a 3px accent underline bar tinted with the accent", () => {
      const root = renderPreview({ kind: "bold", accent: "#B36D33" });
      const bar = root.querySelector<HTMLElement>('[class*="h-[3px]"]');
      expect(bar).not.toBeNull();
      expect(bar).toHaveStyle({ backgroundColor: "rgb(179, 109, 51)" });
    });

    it("defaults the accent to stock brand indigo", () => {
      const root = renderPreview({ kind: "bold" });
      const bar = root.querySelector<HTMLElement>('[class*="h-[3px]"]');
      expect(bar).toHaveStyle({ backgroundColor: "rgb(91, 63, 229)" });
    });
  });

  describe("kinetic", () => {
    it("renders an accent-filled chip and a neutral-950/85 chip", () => {
      const root = renderPreview({ kind: "kinetic", accent: "#B36D33" });
      expect(root.textContent).toContain("3×");
      expect(root.textContent).toContain("faster");
      const darkChip = root.querySelector<HTMLElement>('[class*="bg-neutral-950/85"]');
      expect(darkChip).not.toBeNull();
      expect(darkChip!.className).toContain("text-white");
    });

    it("keeps white chip text on dark accents (copper)", () => {
      const root = renderPreview({ kind: "kinetic", accent: "#B36D33" });
      const chips = root.querySelectorAll<HTMLElement>("span[style]");
      const accentChip = Array.from(chips).find(
        (c) => c.style.backgroundColor === "rgb(179, 109, 51)"
      );
      expect(accentChip).toBeDefined();
      expect(accentChip!.style.color).toBe("rgb(255, 255, 255)");
    });

    it("flips to dark chip text on light accents", () => {
      const root = renderPreview({ kind: "kinetic", accent: "#F9F9F9" });
      const chips = root.querySelectorAll<HTMLElement>("span[style]");
      const accentChip = Array.from(chips).find(
        (c) => c.style.backgroundColor === "rgb(249, 249, 249)"
      );
      expect(accentChip).toBeDefined();
      expect(accentChip!.style.color).toBe("rgb(10, 10, 10)");
    });
  });
});
