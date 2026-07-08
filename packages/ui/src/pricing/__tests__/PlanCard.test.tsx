import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanCard, type PlanCardProps } from "../PlanCard";

const BASE: PlanCardProps = {
  name: "Cloud",
  price: 39,
  currency: "eur",
  description: "Managed AI, fully hosted.",
  features: ["Managed AI", "2M tokens"],
  labels: { unit: "/ site / month", mostPopular: "Most Popular", premiumBadge: "Top Tier" },
  ctaLabel: "Generate posts in the cloud",
  ctaHref: "https://app.example.com/checkout",
};

describe("PlanCard — founding treatment is opt-in (web unaffected)", () => {
  it("renders the founding badge only when `founding.badge` is passed (top placement)", () => {
    const { rerender } = render(<PlanCard {...BASE} ctaPlacement="top" />);
    expect(screen.queryByText("40% for life")).not.toBeInTheDocument();

    rerender(
      <PlanCard
        {...BASE}
        ctaPlacement="top"
        strikePrice={39}
        price={23.4}
        priceDisplay="23.40"
        founding={{ strikeLabel: "40% off for life", badge: "40% for life" }}
      />,
    );
    expect(screen.getByText("40% for life")).toBeInTheDocument();
  });

  it("Most Popular + founding badge coexist in the in-flow top row", () => {
    render(
      <PlanCard
        {...BASE}
        ctaPlacement="top"
        recommended
        strikePrice={39}
        price={23.4}
        priceDisplay="23.40"
        founding={{ strikeLabel: "40% off for life", badge: "40% for life" }}
      />,
    );
    expect(screen.getByText("Most Popular")).toBeInTheDocument();
    expect(screen.getByText("40% for life")).toBeInTheDocument();
  });

  it("renders the founding strike treatment (pill + discounted headline) when founding + strikePrice", () => {
    render(
      <PlanCard
        {...BASE}
        strikePrice={39}
        price={23.4}
        priceDisplay="23.40"
        founding={{ strikeLabel: "40% off for life" }}
      />,
    );
    // Discount pill beside the struck original.
    expect(screen.getByText("40% off for life")).toBeInTheDocument();
    // Discounted headline uses the preformatted decimals (symbol + digits).
    expect(screen.getByText("€23.40")).toBeInTheDocument();
    // Struck original is present.
    expect(screen.getByText("€39")).toBeInTheDocument();
  });

  it("without `founding`, a card with strikePrice renders the plain inline strike (no pill)", () => {
    render(<PlanCard {...BASE} price={39} strikePrice={49} />);
    // No founding discount pill.
    expect(screen.queryByText("40% off for life")).not.toBeInTheDocument();
    // The plain struck monthly rate is still shown (symbol + digits, one span).
    expect(screen.getByText("€49")).toBeInTheDocument();
  });

  it("a plain card with no strikePrice/founding renders exactly as before — no badge, no pill", () => {
    render(<PlanCard {...BASE} price={39} recommended />);
    expect(screen.queryByText(/for life|off for life/)).not.toBeInTheDocument();
    // Existing recommended badge path is untouched.
    expect(screen.getByText("Most Popular")).toBeInTheDocument();
  });

  it("premium badge still renders via the legacy path when not in founding mode", () => {
    render(<PlanCard {...BASE} premium />);
    expect(screen.getByText("Top Tier")).toBeInTheDocument();
  });
});
