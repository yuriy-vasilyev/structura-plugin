/**
 * Tier-adaptive copy + CTA tests for the Overview's third-column upsell.
 *
 * We pin:
 *   - `none` renders the "create your free account" variant
 *   - `free` renders the capability-unlock Pro variant
 *   - both CTAs deep-link to the portal with the `general_upgrade`
 *     intent and carry the originating plan
 *   - the card self-hides while the license tier is still resolving so a
 *     Free user never flashes the anonymous "create account" copy
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
}));

const useLicenseMock = vi.fn();
vi.mock("@/features/settings", () => ({
  useLicense: () => useLicenseMock(),
}));

import { UpgradeCard } from "../components/UpgradeCard";

describe("UpgradeCard — none (anonymous) tier", () => {
  it("renders the create-account variant and a general_upgrade CTA", () => {
    useLicenseMock.mockReturnValue({ plan: "none", loading: false });

    render(<UpgradeCard />);

    expect(screen.getByText("Get started")).toBeTruthy();
    expect(screen.getByText("Create your free account")).toBeTruthy();

    const cta = screen.getByRole("link", { name: /Get Free License/ });
    const href = cta.getAttribute("href") ?? "";
    expect(href).toContain("https://app.structurawp.com/");
    expect(href).toContain("intent=general_upgrade");
    expect(href).toContain("plan=none");
    expect(cta.getAttribute("target")).toBe("_blank");
  });
});

describe("UpgradeCard — free tier", () => {
  it("renders the capability-unlock Pro variant and a general_upgrade CTA", () => {
    useLicenseMock.mockReturnValue({ plan: "free", loading: false });

    const { container } = render(<UpgradeCard />);

    expect(screen.getByText("Go Pro")).toBeTruthy();
    expect(screen.getByText("Unlock the full engine")).toBeTruthy();
    // Capability angle: name the engine features Free can't reach.
    expect(screen.getByText(/SEO protocol/)).toBeTruthy();
    // Purple left rail is the load-bearing visual cue tying it to the
    // paid-tier IntelligenceUsage card that shares the slot.
    expect(container.querySelector(".border-l-purple-500")).toBeTruthy();

    const cta = screen.getByRole("link", { name: /See Pro plans/ });
    const href = cta.getAttribute("href") ?? "";
    expect(href).toContain("intent=general_upgrade");
    expect(href).toContain("plan=free");
  });
});

describe("UpgradeCard — loading", () => {
  it("renders nothing until the license tier resolves", () => {
    useLicenseMock.mockReturnValue({ plan: "none", loading: true });

    const { container } = render(<UpgradeCard />);

    expect(container).toBeEmptyDOMElement();
  });
});
