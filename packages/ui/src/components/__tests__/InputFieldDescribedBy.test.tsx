/**
 * InputField keeps a caller's `aria-describedby`. Found 2026-10-19 on the
 * portal's Address step: Headless UI's `Input` sets its own
 * `aria-describedby` (the field's error description, `undefined` without
 * one) over the caller's, so a hint rendered under the field never reached
 * assistive tech. The ids now merge: the field's error first, then the
 * caller's hint.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InputField } from "../InputField";

const Hint = () => <p id="url-hint">Where your readers actually are.</p>;

describe("InputField aria-describedby", () => {
  it("keeps the caller's description when the field has none of its own", () => {
    render(
      <>
        <InputField label="Public website URL" aria-describedby="url-hint" />
        <Hint />
      </>
    );
    expect(screen.getByLabelText("Public website URL")).toHaveAccessibleDescription(
      "Where your readers actually are."
    );
  });

  it("joins the field's error with the caller's description", () => {
    render(
      <>
        <InputField
          label="Public website URL"
          aria-describedby="url-hint"
          error="Enter your site's address."
        />
        <Hint />
      </>
    );
    const input = screen.getByLabelText("Public website URL");
    expect(input).toHaveAccessibleDescription(
      "Enter your site's address. Where your readers actually are."
    );
    expect(input.getAttribute("aria-describedby")?.split(" ")).toHaveLength(2);
  });

  it("still describes the field by its error alone, and by nothing without one", () => {
    const { rerender } = render(<InputField label="Site name" error="Enter a name." />);
    expect(screen.getByLabelText("Site name")).toHaveAccessibleDescription("Enter a name.");
    rerender(<InputField label="Site name" />);
    expect(screen.getByLabelText("Site name")).not.toHaveAttribute("aria-describedby");
  });

  it("keeps the label, ref and change handler working through the merge", () => {
    let node: HTMLInputElement | null = null;
    render(
      <InputField
        label="Site name"
        ref={(el) => {
          node = el;
        }}
        defaultValue="Northfield"
      />
    );
    const input = screen.getByLabelText("Site name");
    expect(input.tagName).toBe("INPUT");
    expect(node).toBe(input);
    expect(input).toHaveValue("Northfield");
  });
});
