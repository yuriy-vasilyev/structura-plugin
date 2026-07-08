/**
 * Breadcrumbs — new primitive (design-guide §5.15 lists it as missing;
 * first consumer is the portal post view's header,
 * marketing/design_handoff_post_view/README.md "Header").
 *
 * Router-agnostic: link items use `asChild` (Slot) so the portal can pass
 * a react-router <Link> while docs/marketing could pass a plain <a>.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Breadcrumbs } from "../Breadcrumbs";

function renderCrumbs() {
  return render(
    <Breadcrumbs aria-label="Breadcrumb">
      <Breadcrumbs.Item asChild>
        <a href="/sites/act-1">acme-blog.com</a>
      </Breadcrumbs.Item>
      <Breadcrumbs.Item asChild>
        <a href="/sites/act-1/posts">Posts</a>
      </Breadcrumbs.Item>
      <Breadcrumbs.Item current>The 2026 Guide</Breadcrumbs.Item>
    </Breadcrumbs>
  );
}

describe("Breadcrumbs", () => {
  it("renders a labelled navigation landmark with an ordered list", () => {
    renderCrumbs();
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(nav.querySelector("ol")).not.toBeNull();
  });

  it("renders link items via asChild, preserving hrefs", () => {
    renderCrumbs();
    expect(screen.getByRole("link", { name: "acme-blog.com" })).toHaveAttribute(
      "href",
      "/sites/act-1"
    );
    expect(screen.getByRole("link", { name: "Posts" })).toHaveAttribute(
      "href",
      "/sites/act-1/posts"
    );
  });

  it("marks the last segment as the current page and truncates it", () => {
    renderCrumbs();
    const current = screen.getByText("The 2026 Guide");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.className).toContain("truncate");
    // The current segment is text, not a link.
    expect(current.closest("a")).toBeNull();
  });

  it("inserts decorative separators between items (n-1 of them)", () => {
    const { container } = renderCrumbs();
    const separators = container.querySelectorAll("[data-breadcrumb-separator]");
    expect(separators).toHaveLength(2);
    separators.forEach((s) => expect(s).toHaveAttribute("aria-hidden", "true"));
  });
});
