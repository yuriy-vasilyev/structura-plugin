/**
 * InputField `description` and `labelAdornment` (handoffs/visual-signatures/
 * README.md §5): the builder's Name field has a hint under it, and fields
 * can carry a badge after the label without it entering the field's name.
 * The caller's own `aria-describedby` merge is covered in
 * InputFieldDescribedBy.test.tsx; here it has to survive the new hint too.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InputField } from "../InputField";
import { formFieldDescriptionVariants, formFieldLabelRowVariants } from "../../variants/form-field";

const HINT = "Shown on its card in your library.";

/** The class tokens of a cva output. */
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean);

describe("InputField description", () => {
  it("renders the hint under the control and describes the control with it", () => {
    render(<InputField label="Name" description={HINT} />);
    const input = screen.getByRole("textbox", { name: "Name" });
    const hint = screen.getByText(HINT);
    expect(input).toHaveAccessibleDescription(HINT);
    expect(input.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hint).toHaveClass(...tokens(formFieldDescriptionVariants({ intent: "default" })));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("joins the error, the hint and the caller's description", () => {
    render(
      <>
        <InputField
          label="Name"
          description={HINT}
          error="Name this signature to save it."
          aria-describedby="name-extra"
        />
        <span id="name-extra">Prefilled with your site name.</span>
      </>
    );
    const input = screen.getByRole("textbox", { name: "Name" });
    const ids = input.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(ids).toHaveLength(3);
    expect(ids).toEqual(
      expect.arrayContaining([screen.getByText(HINT).id, screen.getByRole("alert").id])
    );
    // The caller's id still comes last, after the field's own.
    expect(ids[2]).toBe("name-extra");
  });

  it("keeps the hint visible when the error shows as a tooltip", () => {
    render(<InputField label="Name" description={HINT} error="Too long." errorView="tooltip" />);
    expect(screen.getByText(HINT)).not.toHaveClass("sr-only");
    expect(screen.getByText(HINT)).not.toHaveClass("absolute");
  });
});

describe("InputField labelAdornment", () => {
  it("renders the adornment after the label text, outside the label", () => {
    render(
      <InputField
        label="Name"
        labelStyle="prominent"
        labelAdornment={<span data-testid="drafted">Drafted</span>}
      />
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
    const label = screen.getByText("Name");
    const adornment = screen.getByTestId("drafted");
    expect(label.tagName).toBe("LABEL");
    expect(label.contains(adornment)).toBe(false);
    expect(
      label.compareDocumentPosition(adornment) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(label.parentElement).toHaveClass(
      ...tokens(formFieldLabelRowVariants({ labelStyle: "prominent" }))
    );
  });
});
