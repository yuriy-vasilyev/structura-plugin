/**
 * TextArea `description` and `labelAdornment` (handoffs/visual-signatures/
 * README.md §5, "Builder fields"): each builder field has a help line that
 * must reach assistive tech, and a "Drafted" badge after its label that must
 * not become part of the field's name.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TextArea } from "../TextArea";
import { formFieldDescriptionVariants, formFieldLabelRowVariants } from "../../variants/form-field";

const HELP = "Materials, line and light: how the images are made.";

/** The class tokens of a cva output. */
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean);

describe("TextArea description", () => {
  it("renders the help line under the control and describes the control with it", () => {
    render(<TextArea label="Technique" description={HELP} />);
    const control = screen.getByRole("textbox", { name: "Technique" });
    const help = screen.getByText(HELP);
    expect(control).toHaveAccessibleDescription(HELP);
    expect(control.getAttribute("aria-describedby")?.split(" ")).toContain(help.id);
    expect(control.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(help).toHaveClass(...tokens(formFieldDescriptionVariants({ intent: "default" })));
    expect(help).toHaveClass("text-xs");
    expect(help).not.toHaveClass("font-medium");
  });

  it("is a quiet help line, not an alert", () => {
    render(<TextArea label="Technique" description={HELP} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("joins the error and the description in aria-describedby", () => {
    render(<TextArea label="Technique" description={HELP} error="Describe the technique." />);
    const control = screen.getByRole("textbox", { name: "Technique" });
    const ids = control.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(ids).toHaveLength(2);
    expect(ids).toEqual(
      expect.arrayContaining([screen.getByText(HELP).id, screen.getByRole("alert").id])
    );
  });

  it("adds no description without one", () => {
    render(<TextArea label="Technique" />);
    expect(screen.getByRole("textbox", { name: "Technique" })).not.toHaveAttribute(
      "aria-describedby"
    );
  });
});

/**
 * TextArea `counter` (customer report 2026-11-13): positioning answers were
 * cut at a limit no field showed. A bounded field now shows a live count
 * under its right edge, in the error tone once over the bound.
 */
describe("TextArea counter", () => {
  it("renders the count under the control and describes the control with it", () => {
    render(<TextArea label="What you do" counter={{ text: "12 / 3,000" }} />);
    const control = screen.getByRole("textbox", { name: "What you do" });
    const counter = screen.getByText("12 / 3,000");
    expect(control).toHaveAccessibleDescription("12 / 3,000");
    expect(control.compareDocumentPosition(counter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(counter).toHaveClass(...tokens(formFieldDescriptionVariants({ intent: "default" })));
    expect(counter).toHaveClass("tabular-nums");
  });

  it("is quiet: not an alert, not a live region", () => {
    render(<TextArea label="What you do" counter={{ text: "12 / 3,000" }} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("12 / 3,000")).not.toHaveAttribute("aria-live");
  });

  it("turns to the error tone over the bound", () => {
    render(<TextArea label="What you do" counter={{ text: "3,001 / 3,000", over: true }} />);
    expect(screen.getByText("3,001 / 3,000")).toHaveClass(
      ...tokens(formFieldDescriptionVariants({ intent: "error" }))
    );
  });

  it("sits beside the error and the help line, all three describing the control", () => {
    render(
      <TextArea
        label="What you do"
        description={HELP}
        error="Keep this to 3,000 characters or fewer."
        counter={{ text: "3,001 / 3,000", over: true }}
      />
    );
    const control = screen.getByRole("textbox", { name: "What you do" });
    const counter = screen.getByText("3,001 / 3,000");
    const ids = control.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(ids).toHaveLength(3);
    expect(ids).toEqual(
      expect.arrayContaining([screen.getByText(HELP).id, screen.getByRole("alert").id, counter.id])
    );
    // One row: the messages on the left, the count on the right.
    expect(counter.parentElement).toBe(screen.getByRole("alert").parentElement?.parentElement);
  });
});

describe("TextArea labelAdornment", () => {
  it("renders the adornment after the label text, outside the label", () => {
    render(
      <TextArea
        label="Technique"
        labelStyle="prominent"
        labelAdornment={<span data-testid="drafted">Drafted</span>}
      />
    );
    // The field keeps its plain name: the badge is not part of the label.
    const control = screen.getByRole("textbox", { name: "Technique" });
    expect(control).toBeInTheDocument();
    const label = screen.getByText("Technique");
    const adornment = screen.getByTestId("drafted");
    expect(label.tagName).toBe("LABEL");
    expect(label.contains(adornment)).toBe(false);
    expect(
      label.compareDocumentPosition(adornment) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(label.parentElement).toBe(adornment.parentElement);
  });

  it("moves the label's bottom margin onto the row, per label style", () => {
    const { rerender } = render(
      <TextArea label="Technique" labelStyle="prominent" labelAdornment={<span>Drafted</span>} />
    );
    let label = screen.getByText("Technique");
    expect(label.parentElement).toHaveClass(
      ...tokens(formFieldLabelRowVariants({ labelStyle: "prominent" }))
    );
    expect(label).toHaveClass("mb-0");

    rerender(<TextArea label="Technique" labelAdornment={<span>Drafted</span>} />);
    label = screen.getByText("Technique");
    expect(label.parentElement).toHaveClass(
      ...tokens(formFieldLabelRowVariants({ labelStyle: "default" }))
    );
  });

  it("leaves the label where it was without an adornment", () => {
    render(<TextArea label="Technique" labelStyle="prominent" />);
    const label = screen.getByText("Technique");
    expect(label).toHaveClass("mb-1.5");
    expect(label.parentElement?.querySelector("textarea")).not.toBeNull();
  });
});
