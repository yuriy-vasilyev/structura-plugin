import { describe, expect, it } from "vitest";

import { HOUSE_SIGNATURE_ID, VISUAL_SIGNATURES, effectiveMedium, getSignatureMeta, isSignatureId } from "../signatures";
import { NEUTRAL_PALETTE, luminance, mix, normaliseHex, resolvePaletteRoles } from "../palette";

describe("the library", () => {
  it("has six signatures with unique ids, exactly one house signature, and the house one first", () => {
    expect(VISUAL_SIGNATURES).toHaveLength(6);
    expect(new Set(VISUAL_SIGNATURES.map((s) => s.id)).size).toBe(6);
    expect(VISUAL_SIGNATURES.filter((s) => s.house).map((s) => s.id)).toEqual([HOUSE_SIGNATURE_ID]);
    expect(VISUAL_SIGNATURES[0]!.id).toBe(HOUSE_SIGNATURE_ID);
  });

  it("gives every signature a version of at least 1, a medium, roles and two thumbnails", () => {
    for (const s of VISUAL_SIGNATURES) {
      expect(s.version).toBeGreaterThanOrEqual(1);
      expect(["photography", "illustration", "3d_render"]).toContain(s.medium);
      expect(s.roles.length).toBeGreaterThan(0);
      expect(s.thumbnail.small).toMatch(new RegExp(`/${s.id}-640\\.webp$`));
      expect(s.thumbnail.large).toMatch(new RegExp(`/${s.id}-1280\\.webp$`));
    }
  });

  it("narrows ids", () => {
    expect(isSignatureId("paper-cut")).toBe(true);
    expect(isSignatureId("clueso")).toBe(false);
    expect(getSignatureMeta("miniature-world")?.medium).toBe("3d_render");
    expect(getSignatureMeta("nope")).toBeUndefined();
  });
});

describe("palette roles", () => {
  const BRAND = ["#2F6B4F", "#C8553D", "#A3C585", "#F2E8CF", "#1F2A24"]; // the handoff's Northfield Garden

  it("maps a brand palette: accent first, primary second, lightest as background, darkest as ink", () => {
    expect(resolvePaletteRoles(BRAND, ["background", "surface", "primary", "accent", "ink"])).toEqual({
      accent: "#2F6B4F",
      primary: "#C8553D",
      background: "#F2E8CF",
      ink: "#1F2A24",
      surface: mix("#F2E8CF", "#1F2A24", 0.07),
    });
  });

  it("derives background and ink from the accent when the brand has no light or dark colour", () => {
    const roles = resolvePaletteRoles(["#4C3EE8", "#818CF8"], ["background", "ink", "accent", "primary"]);
    expect(roles.accent).toBe("#4C3EE8");
    expect(roles.primary).toBe("#818CF8");
    expect(luminance(roles.background!)).toBeGreaterThan(0.8);
    expect(luminance(roles.ink!)).toBeLessThan(0.05);
  });

  it("returns only the requested roles and the neutral set for an empty or junk palette", () => {
    expect(resolvePaletteRoles([], ["background", "accent"])).toEqual({
      background: NEUTRAL_PALETTE.background,
      accent: NEUTRAL_PALETTE.accent,
    });
    expect(resolvePaletteRoles(["red", "#12"], ["ink"])).toEqual({ ink: NEUTRAL_PALETTE.ink });
    expect(resolvePaletteRoles(undefined, ["primary"])).toEqual({ primary: NEUTRAL_PALETTE.primary });
  });

  it("is deterministic and upper-cases hexes", () => {
    const a = resolvePaletteRoles(["#2f6b4f", "#c8553d"], ["accent", "primary", "surface"]);
    const b = resolvePaletteRoles(["#2F6B4F", "#C8553D"], ["accent", "primary", "surface"]);
    expect(a).toEqual(b);
    expect(a.accent).toBe("#2F6B4F");
    expect(normaliseHex(" #abcdef ")).toBe("#ABCDEF");
    expect(normaliseHex("#abc")).toBeNull();
  });
});

describe("effectiveMedium", () => {
  it("follows the signature before the stored medium, and defaults to photography", () => {
    expect(effectiveMedium({ signature: { kind: "curated", id: "miniature-world" }, medium: "photography" })).toBe("3d_render");
    expect(effectiveMedium({ signature: { kind: "custom", medium: "illustration" }, medium: "photography" })).toBe("illustration");
    expect(effectiveMedium({ signature: { kind: "curated", id: "unknown" }, medium: "illustration" })).toBe("illustration");
    expect(effectiveMedium({ medium: "illustration" })).toBe("illustration");
    expect(effectiveMedium({})).toBe("photography");
  });
});
