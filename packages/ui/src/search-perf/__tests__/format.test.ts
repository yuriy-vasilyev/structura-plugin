import { describe, expect, it } from "vitest";

import {
  countDelta,
  formatCtr,
  formatMetricCount,
  formatPosition,
  positionDelta,
} from "../index";

describe("formatMetricCount", () => {
  it("uses locale digits below 10k and compact notation above", () => {
    expect(formatMetricCount(1284, "en")).toBe("1,284");
    expect(formatMetricCount(48912, "en")).toBe("48.9K");
    expect(formatMetricCount(1284, "de")).toBe("1.284");
  });
});

describe("formatCtr", () => {
  it("renders the wire's 0..1 fraction as a one-decimal percent", () => {
    expect(formatCtr(0.026, "en")).toBe("2.6%");
    // German uses a comma decimal separator and a spaced percent sign.
    expect(formatCtr(0.026, "de")).toMatch(/2,6\s?%/);
  });
});

describe("formatPosition", () => {
  it("one decimal; em dash when there were no impressions", () => {
    expect(formatPosition(8.43, "en")).toBe("8.4");
    expect(formatPosition(0, "en")).toBe("—");
  });
});

describe("countDelta", () => {
  it("classifies growth as good with a signed percent label", () => {
    expect(countDelta(1284, 1088, "en")).toEqual({ tone: "good", label: "+18%" });
  });

  it("classifies decline as bad", () => {
    expect(countDelta(880, 1000, "en")).toEqual({ tone: "bad", label: "-12%" });
  });

  it("small moves are flat — no green/red drama on noise", () => {
    expect(countDelta(102, 100, "en").tone).toBe("flat");
  });

  it("tiny baselines produce no label at all", () => {
    expect(countDelta(9, 3, "en")).toEqual({ tone: "flat", label: null });
  });
});

describe("positionDelta", () => {
  it("lower position is BETTER — returns goodness, never a signed number", () => {
    expect(positionDelta(8.4, 10.5, "en")).toEqual({
      direction: "better",
      magnitude: "2.1",
    });
    expect(positionDelta(10.5, 8.4, "en")).toEqual({
      direction: "worse",
      magnitude: "2.1",
    });
  });

  it("sub-threshold wiggle and unknown positions are flat", () => {
    expect(positionDelta(8.4, 8.5, "en").direction).toBe("flat");
    expect(positionDelta(0, 8.4, "en").direction).toBe("flat");
  });
});
