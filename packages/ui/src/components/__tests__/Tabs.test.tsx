/**
 * Tabs — per-item `disabled` + `icon` extensions (post-view handoff,
 * marketing/design_handoff_post_view/README.md "Tab strip").
 *
 * Back-compat is the contract: existing usages pass only `id`/`label`
 * (+`badge`) and must render exactly as before. The new axes:
 *   - `icon`      — optional leading node, decorative (aria-hidden).
 *   - `disabled`  — coming-soon slots: aria-disabled, tabindex -1, not
 *                   clickable, skipped by ←/→/Home/End.
 *   - `badgeTone` — "neutral" for count/SOON pills (default stays the
 *                   emerald emphasis pill).
 *   - `title`     — native tooltip ("Analytics is coming soon").
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Tabs, type TabItem } from "../Tabs";

const items: TabItem[] = [
  { id: "overview", label: "Overview" },
  { id: "channels", label: "Channels", badge: "4", badgeTone: "neutral" },
  {
    id: "analytics",
    label: "Analytics",
    disabled: true,
    badge: "Soon",
    badgeTone: "neutral",
    title: "Analytics is coming soon",
  },
];

function tablist() {
  return screen.getByRole("tablist");
}

describe("Tabs — back-compat", () => {
  it("renders plain items and moves selection with arrow keys (existing behavior)", () => {
    const onChange = vi.fn();
    render(
      <Tabs
        items={[
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ]}
        value="a"
        onChange={onChange}
        aria-label="Sections"
      />
    );
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    fireEvent.click(screen.getByRole("tab", { name: "B" }));
    expect(onChange).toHaveBeenCalledWith("b");
    fireEvent.keyDown(tablist(), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("keeps the emphasis (emerald) badge as the default tone", () => {
    render(
      <Tabs
        items={[{ id: "a", label: "A", badge: "Detected" }]}
        value="a"
        onChange={() => undefined}
      />
    );
    const badge = screen.getByText("Detected");
    expect(badge.className).toContain("bg-emerald-100");
  });
});

describe("Tabs — icon extension", () => {
  it("renders the icon inside the tab, decoratively", () => {
    render(
      <Tabs
        items={[{ id: "a", label: "A", icon: <svg data-testid="a-icon" /> }]}
        value="a"
        onChange={() => undefined}
      />
    );
    const tab = screen.getByRole("tab", { name: "A" });
    const icon = screen.getByTestId("a-icon");
    expect(tab.contains(icon)).toBe(true);
    // Decorative: the wrapper is hidden from the a11y tree.
    expect(icon.closest("[aria-hidden='true']")).not.toBeNull();
  });
});

describe("Tabs — disabled extension", () => {
  it("marks the tab aria-disabled, unfocusable, with a native tooltip", () => {
    render(<Tabs items={items} value="overview" onChange={() => undefined} />);
    const analytics = screen.getByRole("tab", { name: /Analytics/ });
    expect(analytics).toHaveAttribute("aria-disabled", "true");
    expect(analytics).toHaveAttribute("tabindex", "-1");
    expect(analytics).toHaveAttribute("title", "Analytics is coming soon");
  });

  it("does not fire onChange when a disabled tab is clicked", () => {
    const onChange = vi.fn();
    render(<Tabs items={items} value="overview" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: /Analytics/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ArrowRight from the last enabled tab skips the disabled one and wraps", () => {
    const onChange = vi.fn();
    render(<Tabs items={items} value="channels" onChange={onChange} />);
    fireEvent.keyDown(tablist(), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("overview");
  });

  it("ArrowLeft from the first enabled tab skips the disabled one backwards", () => {
    const onChange = vi.fn();
    render(<Tabs items={items} value="overview" onChange={onChange} />);
    fireEvent.keyDown(tablist(), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("channels");
  });

  it("Home/End jump to the first/last enabled tab", () => {
    const onChange = vi.fn();
    // Disabled tab first + last so both edges need skipping.
    const edged: TabItem[] = [
      { id: "x", label: "X", disabled: true },
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "y", label: "Y", disabled: true },
    ];
    render(<Tabs items={edged} value="b" onChange={onChange} />);
    fireEvent.keyDown(tablist(), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("a");
    fireEvent.keyDown(tablist(), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("b");
  });

  it("renders the neutral badge tone for count/SOON pills", () => {
    render(<Tabs items={items} value="overview" onChange={() => undefined} />);
    const count = screen.getByText("4");
    expect(count.className).toContain("bg-neutral-200/80");
    expect(count.className).not.toContain("bg-emerald-100");
  });
});

describe("Tabs — size='xs' + stretch (platform-captions handoff)", () => {
  // marketing/design_handoff_platform_captions/README.md "Switcher":
  // the in-card platform switcher is the same anatomy scaled down, with
  // NEUTRAL active text so it stays subordinate to page-level tabs.
  const xsItems: TabItem[] = [
    { id: "yt", label: "Shorts" },
    { id: "tt", label: "TikTok" },
  ];

  it("keeps the default size untouched (back-compat)", () => {
    render(<Tabs items={xsItems} value="yt" onChange={() => undefined} />);
    expect(tablist().className).toContain("p-1");
    expect(tablist().className).toContain("rounded-xl");
    const tab = screen.getByRole("tab", { name: "Shorts" });
    expect(tab.className).toContain("px-3");
  });

  it("renders the scaled-down xs track and cells", () => {
    render(
      <Tabs size="xs" items={xsItems} value="yt" onChange={() => undefined} />
    );
    expect(tablist().className).toContain("p-0.5");
    expect(tablist().className).toContain("rounded-lg");
    const active = screen.getByRole("tab", { name: "Shorts" });
    expect(active.className).toContain("text-[11px]");
    expect(active.className).toContain("rounded-md");
    // Neutral (not brand) active text — deliberately quieter than page tabs.
    expect(active.className).toContain("text-neutral-800");
  });

  it("stretch spreads the track full-width with equal flex cells", () => {
    render(
      <Tabs
        size="xs"
        stretch
        items={xsItems}
        value="yt"
        onChange={() => undefined}
      />
    );
    expect(tablist().className).toContain("w-full");
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.className).toContain("flex-1");
    }
  });

  it("xs keeps the tabs keyboard-operable", () => {
    const onChange = vi.fn();
    render(<Tabs size="xs" items={xsItems} value="yt" onChange={onChange} />);
    fireEvent.keyDown(tablist(), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("tt");
  });
});
