/**
 * AddonCard rendering tests.
 *
 * The card is pure view — given a state object it picks a badge, an
 * optional CTA, and (for grace_orphan) renders the warning banner.
 * Channels is bundled into every paid plan, so the card has no per-site
 * management CTAs anymore. We verify:
 *   - bundled_included → "Included" badge + usage line, no management CTA
 *   - not_entitled → upsell to the public pricing page
 *   - grace_orphan → the dunning banner (no per-card Resolve CTA; the
 *     global AddonOrphanBanner owns that action)
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

import { AddonCard } from "../components/AddonCard";
import { getAddonCatalogEntry } from "../addonCatalog";
import type { AddonCardState } from "../addonCardState";

const domain = "foo.example.com";
const returnTo = "https://foo.example.com/wp-admin/admin.php?page=structura";
const channelsCatalog = getAddonCatalogEntry("channels");

function renderCard(state: AddonCardState) {
  return render(
    <AddonCard state={state} catalog={channelsCatalog} domain={domain} returnTo={returnTo} />,
  );
}

describe("AddonCard", () => {
  describe("not_entitled", () => {
    it("renders the upsell CTA pointing at the public pricing page", () => {
      renderCard({ kind: "not_entitled", addon: "channels" });
      const link = screen.getByRole("link", { name: /upgrade/i });
      const href = link.getAttribute("href") ?? "";
      // Pricing page is the single upsell truth — portal entry requires an
      // authenticated session the customer doesn't have yet. The URL is
      // built through `buildMarketingPricingUrl`, so it carries the locale
      // segment (`/en/pricing`), the `intent=unlock_addon` query that ties
      // analytics back to this surface, and the catalog's `pricingAnchor`.
      const parsed = new URL(href);
      expect(parsed.host).toBe("www.structurawp.com");
      expect(parsed.pathname).toMatch(/\/(en|de|es|fr)\/pricing$/);
      expect(parsed.searchParams.get("intent")).toBe("unlock_addon");
      expect(parsed.searchParams.get("source")).toBe("plugin");
      expect(parsed.searchParams.get("domain")).toBe(domain);
      expect(parsed.hash).toBe(channelsCatalog.pricingAnchor);
      expect(href).not.toContain("app.structurawp.com");
    });

    it("does NOT render the seat-usage line when there's nothing to count", () => {
      renderCard({ kind: "not_entitled", addon: "channels" });
      expect(screen.queryByText(/seats used/i)).not.toBeInTheDocument();
    });
  });

  describe("bundled_included", () => {
    it("renders the 'Included' badge", () => {
      renderCard({
        kind: "bundled_included",
        addon: "channels",
        entitlement: { maxSeats: 7, seatsUsed: 3, assignedHere: true, assignedAt: null },
      });
      expect(screen.getByText(/^included$/i)).toBeInTheDocument();
    });

    it("renders the seats-used line alongside 'Active on this site' when the entitlement is present", () => {
      renderCard({
        kind: "bundled_included",
        addon: "channels",
        entitlement: { maxSeats: 7, seatsUsed: 3, assignedHere: true, assignedAt: null },
      });
      expect(screen.getByText(/3 of 7 seats used/i)).toBeInTheDocument();
      expect(screen.getByText(/active on this site/i)).toBeInTheDocument();
    });

    it("renders a short 'Active on this site' line when the entitlement hasn't landed yet", () => {
      // First paint after a fresh paid upgrade — the webhook is still in
      // flight. We omit the numeric meter and fall back to the plain
      // inclusion statement rather than showing "0 of 0 seats used".
      renderCard({
        kind: "bundled_included",
        addon: "channels",
        entitlement: null,
      });
      expect(screen.getByText(/active on this site/i)).toBeInTheDocument();
      expect(screen.queryByText(/seats used/i)).not.toBeInTheDocument();
    });

    it("does NOT render any Enable / Disable / Reassign / Add-seats CTA", () => {
      // The whole reason this state exists is to suppress per-site
      // management CTAs. Any regression that brings back a portal deep-link
      // would route customers to a flow that no longer applies.
      renderCard({
        kind: "bundled_included",
        addon: "channels",
        entitlement: { maxSeats: 7, seatsUsed: 3, assignedHere: true, assignedAt: null },
      });
      expect(screen.queryByRole("link", { name: /enable on this site/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /disable/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /reassign/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /add seats/i })).not.toBeInTheDocument();
      // And no portal launch hand-off anywhere on the card.
      expect(screen.queryByText(/app\.structurawp\.com/)).not.toBeInTheDocument();
    });
  });

  describe("grace_orphan", () => {
    it("renders the payment_failed banner title with a revoke-date deadline", () => {
      renderCard({
        kind: "grace_orphan",
        addon: "channels",
        entitlement: {
          maxSeats: 3,
          seatsUsed: 3,
          assignedHere: true,
          assignedAt: "2026-03-10T00:00:00.000Z",
        },
        grace: {
          reason: "payment_failed",
          detectedAt: "2026-04-01T00:00:00.000Z",
          revokeAt: "2026-04-22T00:00:00.000Z",
          remindersSent: 1,
          isOrphanedHere: true,
          orphanedDomains: [domain],
        },
      });
      const banner = screen.getByRole("alert");
      expect(within(banner).getByText(/payment issue/i)).toBeInTheDocument();
      // Locale-dependent formatting — assert the year made it into the copy.
      expect(within(banner).getByText(/2026/)).toBeInTheDocument();
    });

    it("renders the downgrade_orphaned banner with its own copy", () => {
      renderCard({
        kind: "grace_orphan",
        addon: "channels",
        entitlement: null,
        grace: {
          reason: "downgrade_orphaned",
          detectedAt: "2026-04-01T00:00:00.000Z",
          revokeAt: "2026-04-22T00:00:00.000Z",
          remindersSent: 0,
          isOrphanedHere: true,
          orphanedDomains: [domain],
        },
      });
      const banner = screen.getByRole("alert");
      expect(within(banner).getByText(/plan downgrade/i)).toBeInTheDocument();
    });

    it("does NOT render a per-card Resolve CTA (the global banner owns that action)", () => {
      renderCard({
        kind: "grace_orphan",
        addon: "channels",
        entitlement: null,
        grace: {
          reason: "downgrade_orphaned",
          detectedAt: "2026-04-01T00:00:00.000Z",
          revokeAt: "2026-04-22T00:00:00.000Z",
          remindersSent: 0,
          isOrphanedHere: true,
          orphanedDomains: [domain],
        },
      });
      expect(screen.queryByRole("link", { name: /resolve/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/app\.structurawp\.com/)).not.toBeInTheDocument();
    });
  });
});
