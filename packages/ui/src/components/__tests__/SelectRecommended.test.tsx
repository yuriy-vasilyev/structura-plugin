import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Select, type SelectOption } from "../Select";

const DESCRIPTION = "Recommended provider for writing posts";
const RECOMMENDED = { label: "Recommended", description: DESCRIPTION };

const PROVIDERS: SelectOption[] = [
  { value: "anthropic", label: "Anthropic", recommended: RECOMMENDED },
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Gemini" },
];

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

/**
 * Renders the select without a visible label, so the trigger's accessible
 * name is its content. (With `Select.Label`, Headless UI points
 * `aria-labelledby` at the label AND the trigger itself; browsers then read
 * "label + content", but jsdom's name computation drops the self-reference.
 * The last test covers that wiring.)
 */
function renderSelect(opts: {
  options?: SelectOption[];
  value?: string;
  recommendedInTrigger?: boolean;
}) {
  render(
    <Select
      options={opts.options ?? PROVIDERS}
      value={opts.value ?? "anthropic"}
      onValueChange={vi.fn()}
      recommendedInTrigger={opts.recommendedInTrigger}
    >
      <Select.Trigger />
      <Select.Content />
    </Select>
  );
  return screen.getByRole("button");
}

async function openList(trigger: HTMLElement) {
  fireEvent.click(trigger);
  return screen.findByRole("listbox");
}

describe("Select recommended option", () => {
  it("shows the label after the option's name in the open list, as part of its name", async () => {
    const listbox = await openList(renderSelect({}));
    const option = within(listbox).getByRole("option", { name: "Anthropic Recommended" });
    expect(option).toHaveAccessibleDescription(DESCRIPTION);
    expect(within(listbox).getByRole("option", { name: "OpenAI" })).not.toHaveAttribute(
      "aria-description"
    );
  });

  it("keeps the closed trigger plain unless recommendedInTrigger is set", () => {
    const trigger = renderSelect({});
    expect(trigger).toHaveAccessibleName("Anthropic");
    expect(trigger).not.toHaveAttribute("aria-description");
    expect(within(trigger).queryByText("Recommended")).not.toBeInTheDocument();
  });

  it("repeats the label in the trigger when asked and the selected option is recommended", () => {
    const trigger = renderSelect({ recommendedInTrigger: true });
    expect(trigger).toHaveAccessibleName("Anthropic Recommended");
    expect(trigger).toHaveAccessibleDescription(DESCRIPTION);
    // The value truncates; the chip never shrinks (handoff: value min-w-0 truncate, label shrink-0).
    expect(within(trigger).getByText("Anthropic")).toHaveClass("min-w-0", "truncate");
    expect(within(trigger).getByText("Recommended")).toHaveClass("shrink-0");
  });

  it("shows no label in the trigger when the selected option is not recommended", () => {
    const trigger = renderSelect({ recommendedInTrigger: true, value: "gemini" });
    expect(trigger).toHaveAccessibleName("Gemini");
    expect(trigger).not.toHaveAttribute("aria-description");
  });

  it("never shows the label on a disabled option", async () => {
    const options: SelectOption[] = [
      { value: "openai", label: "OpenAI" },
      { value: "anthropic", label: "Anthropic", disabled: true, recommended: RECOMMENDED },
    ];
    const listbox = await openList(renderSelect({ options, value: "openai" }));
    const option = within(listbox).getByRole("option", { name: "Anthropic" });
    expect(option).toHaveAttribute("aria-disabled", "true");
    expect(option).not.toHaveAttribute("aria-description");
    expect(within(option).queryByText("Recommended")).not.toBeInTheDocument();
  });

  it("lets the badge win: a locked Pro option keeps Pro and gets no label", async () => {
    const options: SelectOption[] = [
      { value: "openai", label: "OpenAI" },
      {
        value: "anthropic",
        label: "Anthropic",
        disabled: true,
        badge: "Pro",
        recommended: RECOMMENDED,
      },
      { value: "custom", label: "Custom", badge: "Beta", recommended: RECOMMENDED },
    ];
    const listbox = await openList(renderSelect({ options, value: "openai" }));
    expect(within(listbox).getByRole("option", { name: "Anthropic Pro" })).toBeInTheDocument();
    const custom = within(listbox).getByRole("option", { name: "Custom Beta" });
    expect(within(custom).queryByText("Recommended")).not.toBeInTheDocument();
    expect(within(listbox).queryByText("Recommended")).not.toBeInTheDocument();
  });

  it("does not repeat a badge-suppressed recommendation in the trigger", () => {
    const options: SelectOption[] = [
      { value: "custom", label: "Custom", badge: "Beta", recommended: RECOMMENDED },
    ];
    const trigger = renderSelect({ options, value: "custom", recommendedInTrigger: true });
    expect(trigger).toHaveAccessibleName("Custom");
  });

  it("supports the label on explicit Select.Item children (wp-admin usage)", async () => {
    render(
      <Select options={PROVIDERS} value="openai" onValueChange={vi.fn()}>
        <Select.Trigger />
        <Select.Content>
          <Select.Item value="anthropic" recommended={RECOMMENDED}>
            Anthropic
          </Select.Item>
          <Select.Item value="openai">OpenAI</Select.Item>
        </Select.Content>
      </Select>
    );
    const listbox = await openList(screen.getByRole("button", { name: /OpenAI/ }));
    expect(
      within(listbox).getByRole("option", { name: "Anthropic Recommended" })
    ).toHaveAccessibleDescription(DESCRIPTION);
  });

  it("still selects a recommended option by click", async () => {
    const onValueChange = vi.fn();
    render(
      <Select options={PROVIDERS} value="gemini" onValueChange={onValueChange}>
        <Select.Trigger />
        <Select.Content />
      </Select>
    );
    const listbox = await openList(screen.getByRole("button", { name: /Gemini/ }));
    fireEvent.click(within(listbox).getByRole("option", { name: "Anthropic Recommended" }));
    expect(onValueChange).toHaveBeenCalledWith("anthropic");
  });

  it("with a visible label, keeps the trigger's own content in its aria-labelledby", () => {
    render(
      <Select options={PROVIDERS} value="anthropic" onValueChange={vi.fn()} recommendedInTrigger>
        <Select.Label>Text provider</Select.Label>
        <Select.Trigger />
        <Select.Content />
      </Select>
    );
    const trigger = screen.getByRole("button");
    const ids = (trigger.getAttribute("aria-labelledby") ?? "").split(" ");
    expect(ids).toContain(trigger.id);
    expect(document.getElementById(ids[0])).toHaveTextContent("Text provider");
    expect(trigger).toHaveTextContent("Anthropic Recommended");
  });
});
