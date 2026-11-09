import { describe, expect, it } from "vitest";
import { graduatedBrackets, graduatedTotal } from "../graduated";

// Cloud bills graduated (`tiers_mode: "graduated"`, functions/src/billing/catalog/apply.ts):
// each rate covers only the sites inside its bracket. Ten sites are not 10 × the
// third rate, they are 4 + 5 + 1 across three rates.
const tiered = {
  unitAmount: 4900,
  tiers: [
    { upTo: 4, unitAmount: 4900 },
    { upTo: 9, unitAmount: 4300 },
    { upTo: 24, unitAmount: 3700 },
    { upTo: "inf" as const, unitAmount: 3600 },
  ],
};

describe("graduatedBrackets", () => {
  it("splits ten sites 4 / 5 / 1 across the first three brackets", () => {
    expect(graduatedBrackets(tiered, 10)).toEqual([
      { start: 1, end: 4, count: 4, unitAmount: 4900, total: 19_600 },
      { start: 5, end: 9, count: 5, unitAmount: 4300, total: 21_500 },
      { start: 10, end: 10, count: 1, unitAmount: 3700, total: 3_700 },
    ]);
  });

  it("keeps a count inside the first bracket as one bracket", () => {
    expect(graduatedBrackets(tiered, 3)).toEqual([{ start: 1, end: 3, count: 3, unitAmount: 4900, total: 14_700 }]);
  });

  it("reaches the open-ended bracket past the last finite bound", () => {
    expect(graduatedBrackets(tiered, 26).at(-1)).toEqual({ start: 25, end: 26, count: 2, unitAmount: 3600, total: 7_200 });
  });

  it("prices a cell without tiers flat", () => {
    expect(graduatedBrackets({ unitAmount: 1500 }, 8)).toEqual([
      { start: 1, end: 8, count: 8, unitAmount: 1500, total: 12_000 },
    ]);
  });

  it("treats an empty tier list as flat", () => {
    expect(graduatedBrackets({ unitAmount: 1500, tiers: [] }, 2)).toEqual([
      { start: 1, end: 2, count: 2, unitAmount: 1500, total: 3_000 },
    ]);
  });

  it("returns no brackets for zero sites", () => {
    expect(graduatedBrackets(tiered, 0)).toEqual([]);
    expect(graduatedBrackets({ unitAmount: 1500 }, 0)).toEqual([]);
  });
});

describe("graduatedTotal", () => {
  it("sums every bracket", () => {
    expect(graduatedTotal(tiered, 10)).toBe(44_800);
    expect(graduatedTotal({ unitAmount: 1500 }, 1)).toBe(1_500);
    expect(graduatedTotal(tiered, 0)).toBe(0);
  });
});
