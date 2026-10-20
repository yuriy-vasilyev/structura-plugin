import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanCard, type PlanCardProps } from "../PlanCard";

const BASE: PlanCardProps = {
  name: "Cloud",
  price: 39,
  currency: "eur",
  description: "Managed AI, fully hosted.",
  features: ["Managed AI", "30 posts per site / month"],
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

/**
 * Cloud volume design (2026-10-12, specs/cloud-volume-pricing-design.md): the
 * card reads eyebrow → name → description → before-price control → price →
 * billing detail → CTA → allowances → features. The managed card no longer
 * uses the gold premium treatment.
 */
describe("PlanCard — design stack and optional slots", () => {
  const follows = (a: HTMLElement, b: HTMLElement) =>
    // eslint-disable-next-line no-bitwise
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("renders the slots in reading order", () => {
    render(
      <PlanCard
        {...BASE}
        currency="usd"
        price={119}
        strikePrice={149}
        eyebrow="Managed plan"
        tag="AI included"
        beforePrice={<label htmlFor="v">Posts per site per month</label>}
        priceNote="$1,428 per site, billed yearly"
        allowancesLabel="Included per site, every month"
        allowances={[
          { value: "100", label: "posts" },
          { value: "150", label: "images" },
          { value: "40", label: "AI videos" },
        ]}
        featuresLabel="Everything you need"
        ctaPlacement="top"
      />,
    );
    const order = [
      screen.getByText("Managed plan"),
      screen.getByRole("heading", { name: "Cloud" }),
      screen.getByText("Managed AI, fully hosted."),
      screen.getByText("Posts per site per month"),
      screen.getByText("$119"),
      screen.getByText("$1,428 per site, billed yearly"),
      screen.getByRole("link", { name: "Generate posts in the cloud" }),
      screen.getByText("Included per site, every month"),
      screen.getByText("Everything you need"),
      screen.getByText("30 posts per site / month"),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(follows(order[i - 1], order[i]), `slot ${i} out of order`).toBe(true);
    }
    expect(screen.getByText("AI included")).toBeInTheDocument();
  });

  it("pairs each allowance value with its label in a definition list", () => {
    render(
      <PlanCard
        {...BASE}
        allowances={[
          { value: "30", label: "posts" },
          { value: "90", label: "images" },
        ]}
      />,
    );
    const terms = screen.getAllByRole("term").map((t) => t.textContent);
    const values = screen.getAllByRole("definition").map((d) => d.textContent);
    expect(terms).toEqual(["posts", "images"]);
    expect(values).toEqual(["30", "90"]);
  });

  it("names the struck price for screen readers when a label is given", () => {
    render(
      <PlanCard
        {...BASE}
        currency="usd"
        price={39}
        strikePrice={49}
        labels={{ unit: "/ site / month", strikePrice: "Monthly billing rate" }}
      />,
    );
    const struck = screen.getByText("$49");
    expect(struck.tagName).toBe("S");
    expect(struck.parentElement).toHaveTextContent("Monthly billing rate $49");
  });

  it("keeps the CTA free of the gold premium gradient unless `premium` is set", () => {
    const { rerender } = render(<PlanCard {...BASE} recommended ctaPlacement="top" />);
    const cta = () => screen.getByRole("link", { name: "Generate posts in the cloud" });
    expect(cta().className).not.toMatch(/gold/);
    rerender(<PlanCard {...BASE} premium ctaPlacement="top" />);
    expect(cta().className).toMatch(/from-gold-400/);
  });
});
