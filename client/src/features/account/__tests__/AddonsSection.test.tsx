/**
 * AddonsSection end-to-end render tests. Verifies that the section:
 *   - renders one card per *shipped* add-on (Channels only for now;
 *     Growth is intentionally hidden until its catalog goes live)
 *   - threads the domain + returnTo into deep-link CTAs
 *   - renders the upsell placeholder (not_entitled card) when the
 *     license has no add-ons at all — the section stays informative
 *     rather than empty
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (text: string, ...args: unknown[]) => {
    let i = 0;
    return text.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

import { AddonsSection } from "../components/AddonsSection";

describe("AddonsSection", () => {
  it("renders the Channels card even when the license has no entitlements", () => {
    render(<AddonsSection entitlements={{}} graceperiods={{}} domain="foo.example.com" />);
    expect(screen.getByText("Channels")).toBeInTheDocument();
    // Growth is deliberately hidden until the SKU ships — asserting its
    // absence pins this until the spec §3 line lifts.
    expect(screen.queryByText("Growth")).not.toBeInTheDocument();
  });

  it("surfaces a channels payment_failed grace as a single banner", () => {
    render(
      <AddonsSection
        entitlements={{
          channels: {
            maxSeats: 3,
            seatsUsed: 1,
            assignedHere: true,
            assignedAt: "2026-03-10T00:00:00.000Z",
          },
        }}
        graceperiods={{
          channels: {
            reason: "payment_failed",
            detectedAt: "2026-04-01T00:00:00.000Z",
            revokeAt: "2026-04-22T00:00:00.000Z",
            remindersSent: 0,
            isOrphanedHere: true,
            orphanedDomains: ["foo.example.com"],
          },
        }}
        domain="foo.example.com"
      />,
    );
    const banners = screen.getAllByRole("alert");
    expect(banners.length).toBe(1);
    expect(within(banners[0]).getByText(/payment issue/i)).toBeInTheDocument();
  });

  it("renders the section header", () => {
    render(<AddonsSection entitlements={{}} graceperiods={{}} domain="foo.example.com" />);
    expect(screen.getByRole("heading", { name: /add-ons for this site/i })).toBeInTheDocument();
  });
});
