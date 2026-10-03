/**
 * DiscoverableChipList — the read-only variant (research handoff B1): chips
 * are external links to the page, with no remove button, no suggestions and
 * no add field. The editable variant is unchanged.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { DiscoverableChipList } from "../DiscoverableChipList";

const pages = [
  { value: "https://www.novocare.com/savings", label: "NovoCare", detail: "Wegovy savings offer", tooltip: "Read Sep 30" },
  { value: "https://medicare.gov/part-d", label: "Medicare.gov" },
];

describe("DiscoverableChipList readOnly", () => {
  it("renders each chip as an external link with site, title and no remove button", () => {
    render(<DiscoverableChipList kind="domain" readOnly added={pages} suggested={[]} ariaLabel="Official sources" />);
    const list = screen.getByRole("list", { name: "Official sources" });
    const links = within(list).getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "https://www.novocare.com/savings");
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(links[0]).toHaveAttribute("title", "Read Sep 30");
    expect(links[0]).toHaveTextContent("NovoCare· Wegovy savings offer");
    expect(links[1]).toHaveTextContent("Medicare.gov");
    expect(within(list).queryByRole("button")).toBeNull();
  });

  it("takes the favicon from the page URL's host, not the site name", () => {
    const { container } = render(<DiscoverableChipList kind="domain" readOnly added={pages} suggested={[]} />);
    expect(container.querySelector("img")?.getAttribute("src")).toContain("domain=novocare.com");
  });

  it("renders no suggestions and no add field even when the parent passes them", () => {
    render(
      <DiscoverableChipList
        kind="domain"
        readOnly
        added={pages}
        suggested={[{ value: "fda.gov", label: "fda.gov" }]}
        onDiscover={vi.fn()}
        onAddManual={vi.fn()}
      />,
    );
    expect(screen.queryByText("fda.gov")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("DiscoverableChipList editable (unchanged)", () => {
  it("still removes and adds through the callbacks", () => {
    const onRemove = vi.fn();
    const onAdd = vi.fn();
    render(
      <DiscoverableChipList
        kind="text"
        added={[{ value: "a", label: "Alpha" }]}
        suggested={[{ value: "b", label: "Beta" }]}
        onAdd={onAdd}
        onRemove={onRemove}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: /Beta/ }));
    expect(onRemove).toHaveBeenCalledWith("a");
    expect(onAdd).toHaveBeenCalledWith("b");
  });
});
