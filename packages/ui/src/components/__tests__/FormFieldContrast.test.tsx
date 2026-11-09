/**
 * Form field text meets WCAG AA in both themes. Found 2026-11-08 in the
 * /partners handoff contrast audit: the Select placeholder was gray-400
 * (2.6:1 on white), input placeholders were gray-400 / dark gray-600, and the
 * TextArea error was `text-sm text-red-600` with no dark tone (3.96:1 on dark
 * cards) and no `role="alert"`, unlike InputField. Also affects
 * /contact-sales and /support.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { InputField } from "../InputField";
import { Select } from "../Select";
import { TextArea } from "../TextArea";
import {
  formFieldDescriptionVariants,
  formFieldElementVariants,
  formFieldGroupVariants,
} from "../../variants/form-field";

const PLACEHOLDER_CLASSES = ["placeholder:text-gray-500", "dark:placeholder:text-gray-400"];

/** The class tokens of a cva output. */
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean);

// jsdom has no ResizeObserver; Headless UI's Listbox reaches for it.
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

describe("TextArea error", () => {
  it("is announced and uses the shared error tone, like InputField", () => {
    render(<TextArea label="Your audience" error="Tell us who reads your site." />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Tell us who reads your site.");
    expect(alert).toHaveClass(...tokens(formFieldDescriptionVariants({ intent: "error" })));
    expect(screen.getByLabelText("Your audience")).toHaveAccessibleDescription(
      "Tell us who reads your site."
    );
  });

  it("renders no alert without an error", () => {
    render(<TextArea label="Your audience" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Select placeholder", () => {
  it("uses gray-500, dark gray-400", () => {
    render(
      <Select options={[{ value: "blog", label: "Blog" }]} onValueChange={vi.fn()}>
        <Select.Trigger placeholder="Pick a channel" />
        <Select.Content />
      </Select>
    );
    const placeholder = within(screen.getByRole("button")).getByText("Pick a channel");
    expect(placeholder).toHaveClass("text-gray-500", "dark:text-gray-400");
    expect(placeholder).not.toHaveClass("text-gray-400", "dark:text-gray-500");
  });
});

describe("input placeholders", () => {
  it("the default group and the element variant both use gray-500, dark gray-400", () => {
    for (const classes of [formFieldGroupVariants({ intent: "default" }), formFieldElementVariants()]) {
      expect(tokens(classes)).toEqual(expect.arrayContaining(PLACEHOLDER_CLASSES));
      expect(tokens(classes)).not.toContain("placeholder:text-gray-400");
    }
  });

  it("reach the rendered InputField and TextArea controls", () => {
    render(
      <>
        <InputField label="Website" placeholder="https://example.com" />
        <TextArea label="Notes" placeholder="Anything else" />
      </>
    );
    expect(screen.getByLabelText("Website")).toHaveClass(...PLACEHOLDER_CLASSES);
    expect(screen.getByLabelText("Notes")).toHaveClass(...PLACEHOLDER_CLASSES);
  });
});
