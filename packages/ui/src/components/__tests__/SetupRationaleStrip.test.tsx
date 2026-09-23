import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SetupRationaleStrip, type SetupRationaleItem } from "../SetupRationaleStrip";

const ITEMS: SetupRationaleItem[] = [
  { icon: "globe", key: "language_from_site", text: "Writing in German, your site's language." },
  { icon: "layers", key: "overlap_sibling_campaign", text: "Another campaign already covers seasonal topics." },
  { icon: "trending-up", key: "approach_authority_low_footprint", text: "Builds topical authority first." },
  { icon: "calendar-clock", key: "rhythm_shared_cadence", text: "This site publishes 4 posts a week." },
  { icon: "target", key: "approach_conversion_objective", text: "Aims at conversions." },
  { icon: "refresh-cw", key: "footprint_refreshed", text: "Footprint refreshed today." },
];

describe("SetupRationaleStrip", () => {
  it("renders a labelled section with one list item per rationale line", () => {
    render(<SetupRationaleStrip title="Why these settings" items={ITEMS.slice(0, 3)} />);
    const section = screen.getByRole("region", { name: "Why these settings" });
    const items = within(section).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(ITEMS.slice(0, 3).map((i) => i.text));
    // Icons are decorative; the sentence carries the meaning.
    expect(section.querySelectorAll("svg[aria-hidden='true']").length).toBeGreaterThanOrEqual(4);
  });

  it("keeps only the first maxItems lines in code order (default five)", () => {
    const { rerender } = render(<SetupRationaleStrip title="Why these settings" items={ITEMS} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByText("Footprint refreshed today.")).toBeNull();
    rerender(<SetupRationaleStrip title="Why these settings" items={ITEMS} maxItems={2} />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      ITEMS[0].text,
      ITEMS[1].text,
    ]);
  });

  it("shows three skeleton lines and no list while loading", () => {
    render(<SetupRationaleStrip title="Why these settings" items={ITEMS} loading footer="Footer" />);
    const section = screen.getByRole("region", { name: "Why these settings" });
    expect(section).toHaveAttribute("aria-busy", "true");
    expect(within(section).queryByRole("list")).toBeNull();
    expect(screen.getByTestId("setup-rationale-skeleton").children).toHaveLength(3);
    expect(screen.queryByText("Footer")).toBeNull();
  });

  it("renders the footer line when given", () => {
    render(
      <SetupRationaleStrip
        title="Why these settings"
        items={ITEMS.slice(0, 2)}
        footer="Structura decided these from your site. Change anything."
      />
    );
    expect(
      screen.getByText("Structura decided these from your site. Change anything.")
    ).toBeInTheDocument();
  });
});
