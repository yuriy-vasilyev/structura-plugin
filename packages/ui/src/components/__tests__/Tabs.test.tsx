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
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

describe("Tabs — panel wiring", () => {
  it("points each tab at the panel it controls when `controls` is set", () => {
    render(
      <Tabs
        items={[
          { id: "mine", label: "Mine", controls: "panel-tokens" },
          { id: "all", label: "All members", controls: "panel-tokens" },
          { id: "plain", label: "Plain" },
        ]}
        value="mine"
        onChange={() => undefined}
      />
    );
    expect(screen.getByRole("tab", { name: "Mine" })).toHaveAttribute("aria-controls", "panel-tokens");
    expect(screen.getByRole("tab", { name: "All members" })).toHaveAttribute(
      "aria-controls",
      "panel-tokens"
    );
    expect(screen.getByRole("tab", { name: "Plain" })).not.toHaveAttribute("aria-controls");
  });
});

describe("Tabs — radio semantics (visual-signatures handoff §5)", () => {
  // The builder's Medium picker is a form value, not a set of panels, so it
  // renders as a radiogroup with the same look and keys.
  const media: TabItem[] = [
    { id: "photography", label: "Photography", controls: "medium-help" },
    { id: "illustration", label: "Illustration" },
    { id: "3d_render", label: "3D render" },
  ];

  it("renders a labelled radiogroup of radios with aria-checked and no tab attributes", () => {
    render(
      <Tabs
        semantics="radio"
        items={media}
        value="illustration"
        onChange={() => undefined}
        aria-label="Medium"
      />
    );
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    const group = screen.getByRole("radiogroup", { name: "Medium" });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "Illustration" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Photography" })).toHaveAttribute("aria-checked", "false");
    for (const radio of radios) {
      expect(radio).not.toHaveAttribute("aria-selected");
      expect(radio).not.toHaveAttribute("aria-controls");
    }
  });

  it("keeps the roving tabindex and the arrow, Home and End keys", () => {
    const onChange = vi.fn();
    render(<Tabs semantics="radio" items={media} value="illustration" onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "Illustration" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Photography" })).toHaveAttribute("tabindex", "-1");
    const group = screen.getByRole("radiogroup");
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("3d_render");
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("photography");
    fireEvent.keyDown(group, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("3d_render");
    fireEvent.keyDown(group, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("photography");
  });

  it("also answers Up and Down, as a radio group does", () => {
    const onChange = vi.fn();
    render(<Tabs semantics="radio" items={media} value="illustration" onChange={onChange} />);
    const group = screen.getByRole("radiogroup");
    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith("3d_render");
    fireEvent.keyDown(group, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith("photography");
  });

  it("moves focus with the selection so the new choice is announced", () => {
    function Controlled() {
      const [value, setValue] = useState("photography");
      return <Tabs semantics="radio" items={media} value={value} onChange={setValue} />;
    }
    render(<Controlled />);
    const photography = screen.getByRole("radio", { name: "Photography" });
    photography.focus();
    fireEvent.keyDown(photography, { key: "ArrowRight" });
    const illustration = screen.getByRole("radio", { name: "Illustration" });
    expect(illustration).toHaveAttribute("aria-checked", "true");
    expect(illustration).toHaveFocus();
  });

  it("looks exactly like the tab strip", () => {
    const { unmount } = render(<Tabs items={media} value="illustration" onChange={() => undefined} />);
    const stripClass = screen.getByRole("tablist").className;
    const activeClass = screen.getByRole("tab", { name: "Illustration" }).className;
    const idleClass = screen.getByRole("tab", { name: "Photography" }).className;
    unmount();
    render(<Tabs semantics="radio" items={media} value="illustration" onChange={() => undefined} />);
    expect(screen.getByRole("radiogroup").className).toBe(stripClass);
    expect(screen.getByRole("radio", { name: "Illustration" }).className).toBe(activeClass);
    expect(screen.getByRole("radio", { name: "Photography" }).className).toBe(idleClass);
  });

  it("keeps tab semantics by default", () => {
    render(<Tabs items={media} value="photography" onChange={() => undefined} />);
    const tab = screen.getByRole("tab", { name: "Photography" });
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(tab).toHaveAttribute("aria-controls", "medium-help");
    expect(tab).not.toHaveAttribute("aria-checked");
  });
});

describe("Tabs — group disabled (builder drafting state)", () => {
  const media: TabItem[] = [
    { id: "photography", label: "Photography" },
    { id: "illustration", label: "Illustration" },
    { id: "3d_render", label: "3D render" },
  ];

  it("disables every item: aria-disabled, out of the tab order, clicks and keys ignored", () => {
    const onChange = vi.fn();
    render(
      <Tabs disabled semantics="radio" items={media} value="illustration" onChange={onChange} />
    );
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toHaveAttribute("aria-disabled", "true");
      expect(radio).toHaveAttribute("tabindex", "-1");
    }
    fireEvent.click(screen.getByRole("radio", { name: "Photography" }));
    const group = screen.getByRole("radiogroup");
    for (const key of ["ArrowRight", "ArrowLeft", "ArrowDown", "Home", "End"]) {
      fireEvent.keyDown(group, { key });
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps the selected item's chip and dims the whole strip", () => {
    render(<Tabs disabled items={media} value="illustration" onChange={() => undefined} />);
    expect(screen.getByRole("tablist")).toHaveClass("opacity-50");
    const active = screen.getByRole("tab", { name: "Illustration" });
    expect(active).toHaveAttribute("aria-selected", "true");
    expect(active).toHaveClass("bg-white", "shadow-sm", "cursor-not-allowed");
    expect(active).not.toHaveClass("text-neutral-300");
  });

  it("leaves the strip enabled by default", () => {
    render(<Tabs items={media} value="illustration" onChange={() => undefined} />);
    expect(screen.getByRole("tablist")).not.toHaveClass("opacity-50");
    expect(screen.getByRole("tab", { name: "Photography" })).not.toHaveAttribute("aria-disabled");
  });
});
