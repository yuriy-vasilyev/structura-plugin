import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgencyVolumeStrip, type AgencyVolumeStripProps } from "../AgencyVolumeStrip";

const PROPS: AgencyVolumeStripProps = {
  currency: "usd",
  interval: "year",
  contactHref: "/en/contact-sales",
  tiers: [
    {
      id: "tier1",
      rangeLabel: "Sites 1–4",
      usdMonthly: 149,
      usdYearly: 119,
      eurMonthly: 149,
      eurYearly: 119,
    },
    {
      id: "tier2",
      rangeLabel: "Sites 5–9",
      usdMonthly: 131,
      usdYearly: 105,
      eurMonthly: 131,
      eurYearly: 105,
    },
    {
      id: "tier3",
      rangeLabel: "Sites 10–24",
      usdMonthly: 112,
      usdYearly: 90,
      eurMonthly: 112,
      eurYearly: 90,
    },
    {
      id: "tier4",
      rangeLabel: "25+ sites",
      usdMonthly: null,
      usdYearly: null,
      eurMonthly: null,
      eurYearly: null,
    },
  ],
  labels: {
    eyebrow: "Volume pricing",
    title: "Cloud",
    titleDetail: "100 posts",
    unit: "Per site / month · billed yearly",
    contactCta: "Contact sales",
    caption: "Each rate applies to the sites in that bracket.",
  },
};

/**
 * One strip for the selected Cloud option and interval (design handoff
 * 2026-10-12). Until then the strip printed both intervals per plan.
 */
describe("AgencyVolumeStrip", () => {
  it("shows one rate per bracket for the selected interval", () => {
    const { rerender } = render(<AgencyVolumeStrip {...PROPS} />);
    const rates = () => screen.getAllByRole("definition").map((d) => d.textContent);
    expect(rates()).toEqual(["$119", "$105", "$90", "Contact sales"]);
    rerender(<AgencyVolumeStrip {...PROPS} interval="month" currency="eur" />);
    expect(rates()).toEqual(["€149", "€131", "€112", "Contact sales"]);
  });

  it("labels brackets as site ranges and routes 25+ sites to sales", () => {
    render(<AgencyVolumeStrip {...PROPS} />);
    expect(screen.getAllByRole("term").map((t) => t.textContent)).toEqual([
      "Sites 1–4",
      "Sites 5–9",
      "Sites 10–24",
      "25+ sites",
    ]);
    expect(screen.getByRole("link", { name: "Contact sales" })).toHaveAttribute(
      "href",
      "/en/contact-sales"
    );
    expect(screen.getByText("Each rate applies to the sites in that bracket.")).toBeInTheDocument();
  });

  it("makes the eyebrow the section heading and names the selected option", () => {
    render(<AgencyVolumeStrip {...PROPS} />);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveTextContent("Volume pricing");
    expect(screen.getByRole("region", { name: "Volume pricing" })).toHaveTextContent(
      "Cloud · 100 posts"
    );
  });
});
