/**
 * "Recommended for text" on a CONNECTED provider card (2026-10-02). It used
 * to show only on available (not yet connected) cards, so a site with every
 * provider connected showed no recommendation on the AI Engine page.
 * copy.csv places the label on wp-admin provider cards.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@wordpress/i18n", () => ({
  __: (t: string) => t,
  _x: (t: string) => t,
  sprintf: (f: string) => f,
}));
vi.mock("../api/useProviderPulse", () => ({
  useProviderPulse: () => ({ isOnline: true, latency: 100, isChecking: false, checkPulse: vi.fn() }),
}));
vi.mock("../api/useDisconnectProvider", () => ({
  useDisconnectProvider: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { InstalledProviderCard } from "../components/InstalledProviderCard";

const renderCard = (id: string, isCloud = false) =>
  render(
    <InstalledProviderCard
      id={id}
      name={id}
      description="desc"
      capabilities={["text"]}
      maskedKey="masked"
      isCloud={isCloud}
      isDefaultText={false}
      isDefaultImage={false}
      onManage={vi.fn()}
    />,
  );

describe("<InstalledProviderCard> recommended label", () => {
  it("shows Recommended for text on the connected Anthropic card", () => {
    renderCard("anthropic");
    expect(screen.getByText("Recommended for text")).toBeInTheDocument();
  });

  it("shows no label on other connected providers", () => {
    renderCard("openai");
    expect(screen.queryByText("Recommended for text")).toBeNull();
  });

  it("shows no label on managed plans", () => {
    renderCard("anthropic", true);
    expect(screen.queryByText("Recommended for text")).toBeNull();
  });
});
