import { describe, expect, it } from "vitest";
import {
  DARK_BG,
  PAPER_BG,
  accentSet,
  contrast,
  guardOn,
  inkOn,
  mix,
} from "../accent";

describe("accent contrast guard", () => {
  it("leaves an already-legible accent untouched on dark", () => {
    expect(guardOn("#e8590c", DARK_BG)).toBe("#e8590c");
  });

  it("lightens a dark accent until ≥3:1 on the dark surface", () => {
    const guarded = guardOn("#1a1a2e", DARK_BG);
    expect(guarded).not.toBe("#1a1a2e");
    expect(contrast(guarded, DARK_BG)).toBeGreaterThanOrEqual(3);
  });

  it("darkens the design-proof lemon swatch on paper", () => {
    // #D9E13B is the guard-proof swatch from the handoff Tweaks panel.
    const guarded = guardOn("#D9E13B", PAPER_BG);
    expect(contrast(guarded, PAPER_BG)).toBeGreaterThanOrEqual(3);
  });

  it("picks white ink on dark accents, near-black on light ones", () => {
    expect(inkOn("#0b1120")).toBe("#ffffff");
    expect(inkOn("#D9E13B")).toBe("#14161c");
  });

  it("accentSet exposes raw + both guarded variants", () => {
    const set = accentSet("#1a1a2e");
    expect(set.raw).toBe("#1a1a2e");
    expect(contrast(set.onDark, DARK_BG)).toBeGreaterThanOrEqual(3);
    expect(contrast(set.onPaper, PAPER_BG)).toBeGreaterThanOrEqual(3);
  });

  it("mix endpoints return the inputs", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
  });
});
