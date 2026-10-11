/**
 * Favicon asks Google's S2 service for a size it actually serves. S2 answers
 * an unsupported `sz` with its 16px default even for domains that have real
 * icons (checked 2026-10-09: wikipedia.org and kew.org return 16x16 for
 * sz=36, 32x32 for 32, 40x40 for 40), and the component treats a 16px
 * response as "no favicon". At size 18 (campaign authority tiles) every real
 * favicon turned into the Globe fallback.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Favicon } from "../Favicon";

/** Sizes S2 serves as requested (probed 2026-10-09); anything else comes back 16px. */
const S2_SERVED = [16, 24, 28, 32, 40, 48, 64, 96, 128];

function requestedSize(size?: number): number {
  const { container } = render(<Favicon domain="kew.org" size={size} />);
  const src = container.querySelector("img")!.getAttribute("src")!;
  return Number(new URL(src).searchParams.get("sz"));
}

describe("Favicon S2 size", () => {
  it("requests 40px for the 18px authority tiles, not the unsupported 36px", () => {
    expect(requestedSize(18)).toBe(40);
  });

  it("keeps the 32px request for the default 14px size", () => {
    expect(requestedSize()).toBe(32);
  });

  it("always requests a size S2 serves, at least 2x and never below 32px", () => {
    for (let size = 1; size <= 64; size++) {
      const sz = requestedSize(size);
      expect(S2_SERVED, `size ${size} -> sz ${sz}`).toContain(sz);
      expect(sz).toBeGreaterThanOrEqual(Math.min(Math.max(size * 2, 32), 128));
    }
  });
});
