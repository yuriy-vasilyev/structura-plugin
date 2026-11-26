/**
 * Which plans generate images: every plan but anonymous (`none`), unchanged
 * when every provider opened to every plan (2026-10-06).
 */
import { describe, expect, it } from "vitest";

import { planHasImageGeneration } from "../helpers";

describe("planHasImageGeneration", () => {
  it("is false on anonymous (`none`) and true on every other plan", () => {
    expect(planHasImageGeneration("none")).toBe(false);
    for (const plan of ["free", "byok", "cloud"]) expect(planHasImageGeneration(plan)).toBe(true);
  });
});
