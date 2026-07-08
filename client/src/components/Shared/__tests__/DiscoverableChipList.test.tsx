/**
 * DiscoverableChipList — the shared keyword/competitor/authority picker, now in
 * `@structura/ui`. Pins the interaction contract every surface relies on. Run
 * here (client Vitest) because the package itself has no test runner.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { Tag } from "lucide-react";
import { DiscoverableChipList } from "@structura/ui";

function setup(overrides = {}) {
  const props = {
    kind: "text" as const,
    leadingIcon: Tag,
    added: [{ value: "alpha", label: "alpha" }],
    suggested: [
      { value: "beta", label: "beta", tooltip: "because" },
      { value: "gamma", label: "gamma" },
    ],
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onAddAll: vi.fn(),
    onAddManual: vi.fn(),
    inputPlaceholder: "type here",
    ariaLabel: "Things",
    ...overrides,
  };
  render(<DiscoverableChipList {...props} />);
  return props;
}

describe("DiscoverableChipList", () => {
  it("renders added items, suggested items, and the input", () => {
    setup();
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(screen.getByText("gamma")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("type here")).toBeInTheDocument();
  });

  it("fires onAdd with the value when a suggested chip is clicked", () => {
    const props = setup();
    fireEvent.click(screen.getByText("beta"));
    expect(props.onAdd).toHaveBeenCalledWith("beta");
  });

  it("fires onRemove when an added chip's remove button is clicked", () => {
    const props = setup();
    fireEvent.click(screen.getByLabelText("Remove alpha"));
    expect(props.onRemove).toHaveBeenCalledWith("alpha");
  });

  it("fires onAddAll from the suggested header", () => {
    const props = setup();
    fireEvent.click(screen.getByText("Add all"));
    expect(props.onAddAll).toHaveBeenCalled();
  });

  it("fires onAddManual on Enter and clears the input on success", () => {
    const onAddManual = vi.fn();
    setup({ onAddManual });
    const input = screen.getByPlaceholderText("type here") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "delta" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAddManual).toHaveBeenCalledWith("delta");
    expect(input.value).toBe("");
  });

  it("keeps the input when onAddManual returns false (validation failure)", () => {
    const onAddManual = vi.fn().mockReturnValue(false);
    setup({ onAddManual });
    const input = screen.getByPlaceholderText("type here") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "bad" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAddManual).toHaveBeenCalledWith("bad");
    expect(input.value).toBe("bad");
  });

  it("renders the dimmed inline count on a suggested chip", () => {
    setup({
      suggested: [{ value: "nerdwallet.com", label: "nerdwallet.com", count: 39125 }],
    });
    expect(screen.getByText("· 39k")).toBeInTheDocument();
  });

  it("renders a favicon img for domain kind and falls back to an icon on error", () => {
    const { container } = render(
      <DiscoverableChipList
        kind="domain"
        added={[{ value: "https://x.io", label: "x.io" }]}
        suggested={[]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onAddManual={vi.fn()}
      />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    // After the error the favicon swaps to a lucide svg fallback.
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("blocks adds when disabled", () => {
    const onAdd = vi.fn();
    setup({ disabled: true, onAdd });
    fireEvent.click(screen.getByText("beta"));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("shows the empty-state text when there are no added items", () => {
    setup({ added: [], emptyText: "nothing yet" });
    expect(screen.getByText("nothing yet")).toBeInTheDocument();
  });

  it("renders a per-chip metric badge from chipBadges (portal parity)", () => {
    setup({
      added: [{ value: "saas onboarding", label: "saas onboarding" }],
      chipBadges: { "saas onboarding": { label: "1.9k/mo", tone: "high" } },
    });
    expect(screen.getByText("1.9k/mo")).toBeInTheDocument();
  });
});
