/**
 * SiteSubNav — tab strip for the `/site` route.
 *
 * The strip is the only navigation between the five `/site/*` tabs,
 * so the tests pin:
 *
 *   1. All five tabs render with the canonical paths.
 *   2. Tab labels resolve through `__()` (i18n) and exist in the DOM.
 *   3. Each tab is a real `<a>` so middle-click / copy-link work.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@wordpress/i18n", () => ({
  __: (text: string) => text,
}));

import { SiteSubNav } from "../components/SiteSubNav";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SiteSubNav />
    </MemoryRouter>,
  );
}

describe("SiteSubNav", () => {
  it("renders all tabs with canonical paths", () => {
    renderAt("/site/info");
    // MemoryRouter renders relative hrefs (no `#` prefix). The
    // production HashRouter prepends `#` but that's react-router's
    // concern, not ours — we just check `to` resolves to the right
    // path. Keywords + Authority moved to the campaign level.
    const expectedPaths = [
      ["/site/info", "Info"],
      ["/site/competitors", "Competitors"],
      ["/site/settings", "Settings"],
    ] as const;
    for (const [path, label] of expectedPaths) {
      const link = screen.getByRole("link", { name: new RegExp(label, "i") });
      expect(link).toHaveAttribute("href", path);
    }
  });

  it("renders the labels for every tab", () => {
    renderAt("/site/competitors");
    expect(screen.getByText("Info")).toBeInTheDocument();
    expect(screen.getByText("Competitors")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    // Keywords + Authority tabs were removed (campaign-scoped now).
    expect(screen.queryByText("Keywords")).toBeNull();
    expect(screen.queryByText("Authority")).toBeNull();
  });

  it("uses an a11y-labelled <nav> landmark so screen readers can jump to the strip", () => {
    renderAt("/site/info");
    const nav = screen.getByRole("navigation", { name: "Site sections" });
    expect(nav).toBeInTheDocument();
  });
});
