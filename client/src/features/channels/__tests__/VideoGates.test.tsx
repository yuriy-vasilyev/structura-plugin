/**
 * Video channel gates & empty states — design handoff §4.
 *
 *   - First-run empty state on Activity (video connected, nothing rendered
 *     yet): tinted video tile, "on its way" copy, Configure CTA.
 *   - Deep-link upgrade gate for non-Cloud-Pro users landing on a video
 *     connection URL: lock tile, explainer, "Upgrade plan" primary routed
 *     to the marketing pricing page with the NEW `unlock_video` intent,
 *     transparent "Back to Store".
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
  sprintf: (format: string, ...args: unknown[]) => {
    let i = 0;
    return format.replace(/%(\d+\$)?[sd]/g, () => String(args[i++]));
  },
}));

import { VideoFirstRunEmptyState, VideoUpgradeGate } from "../components/VideoGates";

const renderWithRouter = (node: ReactNode) =>
  render(<MemoryRouter initialEntries={["/channels"]}>{node}</MemoryRouter>);

describe("VideoFirstRunEmptyState", () => {
  it("renders the reassurance copy and a Configure Video CTA", () => {
    renderWithRouter(<VideoFirstRunEmptyState />);

    expect(
      screen.getByText("Your first video is on its way"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "It will appear here after your next post publishes. Rendering takes a few minutes — you’ll see live progress.",
      ),
    ).toBeInTheDocument();

    const cta = screen.getByRole("link", { name: /configure video/i });
    expect(cta).toHaveAttribute("href", "/channels/connections");
  });

  it("uses the video channel glyph, not a platform logo", () => {
    const { container } = renderWithRouter(<VideoFirstRunEmptyState />);
    expect(container.querySelector("svg rect[rx='4.7']")).toBeTruthy();
  });
});

describe("VideoUpgradeGate", () => {
  it("routes Upgrade plan to the pricing page with the unlock_video intent", () => {
    renderWithRouter(<VideoUpgradeGate />);

    expect(
      screen.getByText("Video is a Cloud Pro feature"),
    ).toBeInTheDocument();

    const upgrade = screen.getByRole("link", { name: /upgrade plan/i });
    const href = new URL(upgrade.getAttribute("href") ?? "");
    expect(href.host).toBe("www.structurawp.com");
    expect(href.pathname).toMatch(/\/(en|de|es|fr)\/pricing$/);
    expect(href.searchParams.get("intent")).toBe("unlock_video");
    expect(href.searchParams.get("source")).toBe("plugin");
    expect(upgrade).toHaveAttribute("target", "_blank");
  });

  it("offers a transparent Back to Store escape hatch", () => {
    renderWithRouter(<VideoUpgradeGate />);
    const back = screen.getByRole("link", { name: /back to store/i });
    expect(back).toHaveAttribute("href", "/channels/store");
  });
});
