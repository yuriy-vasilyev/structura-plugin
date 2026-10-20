import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { VolumeSelect, type VolumeSelectOption } from "../VolumeSelect";

// jsdom has no ResizeObserver; Headless UI uses it when the list closes after a pick.
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

const OPTIONS: VolumeSelectOption[] = [
  {
    value: 30,
    label: "30 posts",
    description: "90 images · 10 AI videos",
    recommended: { label: "Recommended", description: "Recommended starting point" },
  },
  { value: 100, label: "100 posts", description: "150 images · 40 AI videos" },
];
const HELPER = {
  recommended: "Recommended starting point",
  other: "More posts. Same Cloud features.",
};

/**
 * The Cloud volume picker (design handoff 2026-10-12): option identity is the
 * posts number, the recommendation is fixed to the 30-post option and never
 * follows the selection.
 */
describe("VolumeSelect", () => {
  it("shows a visible label and the selected option", () => {
    render(
      <VolumeSelect
        label="Posts per site per month"
        options={OPTIONS}
        value={30}
        onValueChange={vi.fn()}
      />
    );
    expect(screen.getByText("Posts per site per month")).toBeVisible();
    expect(screen.getByRole("button")).toHaveTextContent("30 posts");
  });

  it("lists each option's allowances and keeps the recommendation on 30 while 100 is selected", async () => {
    render(<VolumeSelect label="Posts" options={OPTIONS} value={100} onValueChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    const listbox = await screen.findByRole("listbox");
    const thirty = within(listbox).getByRole("option", { name: /30 posts Recommended/ });
    expect(thirty).toHaveAccessibleDescription("Recommended starting point");
    expect(within(thirty).getByText("90 images · 10 AI videos")).toBeInTheDocument();
    const hundred = within(listbox).getByRole("option", { name: /100 posts/ });
    expect(hundred).toHaveAttribute("aria-selected", "true");
    expect(within(hundred).queryByText("Recommended")).not.toBeInTheDocument();
  });

  it("reports the picked option as its posts number", async () => {
    const onValueChange = vi.fn();
    render(
      <VolumeSelect label="Posts" options={OPTIONS} value={30} onValueChange={onValueChange} />
    );
    fireEvent.click(screen.getByRole("button"));
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByRole("option", { name: /100 posts/ }));
    expect(onValueChange).toHaveBeenCalledWith(100);
  });

  it("shows the recommendation chip under the trigger only while the recommended option is selected", () => {
    const { rerender } = render(
      <VolumeSelect
        label="Posts"
        options={OPTIONS}
        value={30}
        onValueChange={vi.fn()}
        helper={HELPER}
      />
    );
    expect(screen.getByText("Recommended starting point")).toBeInTheDocument();
    expect(screen.queryByText(HELPER.other)).not.toBeInTheDocument();
    rerender(
      <VolumeSelect
        label="Posts"
        options={OPTIONS}
        value={100}
        onValueChange={vi.fn()}
        helper={HELPER}
      />
    );
    expect(screen.getByText(HELPER.other)).toBeInTheDocument();
    expect(screen.queryByText("Recommended starting point")).not.toBeInTheDocument();
  });

  it("keeps the shared Select's default resting border (owner review 2026-10-12)", () => {
    render(<VolumeSelect label="Posts" options={OPTIONS} value={30} onValueChange={vi.fn()} />);
    const trigger = screen.getByRole("button");
    expect(trigger).toHaveClass("border-gray-300", "dark:border-gray-700", "min-h-12");
    expect(trigger.className).not.toMatch(/border-neutral-500/);
  });
});
