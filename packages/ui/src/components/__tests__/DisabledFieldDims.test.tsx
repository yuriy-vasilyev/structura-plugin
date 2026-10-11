/**
 * Disabled form fields dim. Found 2026-10-09 while syncing the design system:
 * InputField and TextArea put `disabled:opacity-*` on Headless UI's
 * `<Field as="div">`, and `:disabled` never matches a div; Checkbox never
 * disabled its Field, so the label's `group-data-disabled:` had nothing to
 * key off. The rules are compiled from the real classes and matched against
 * the rendered DOM, so a variant that can't match fails here.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Checkbox } from "../Checkbox";
import { InputField } from "../InputField";
import { TextArea } from "../TextArea";
import { matchedDeclarations } from "./tailwind-rules";

/** The Headless UI Field wrapper around a labelled control. */
function fieldOf(label: string): Element {
  return screen.getByText(label).parentElement!;
}

describe("disabled form fields dim", () => {
  it("InputField dims its field when disabled", async () => {
    render(<InputField label="Site URL" disabled />);
    expect(await matchedDeclarations(fieldOf("Site URL"), "opacity")).toEqual([".4"]);
  });

  it("InputField stays at full opacity when enabled", async () => {
    render(<InputField label="Site URL" />);
    expect(await matchedDeclarations(fieldOf("Site URL"), "opacity")).toEqual([]);
  });

  it("TextArea dims its field when disabled", async () => {
    render(<TextArea label="Brand voice" disabled />);
    expect(await matchedDeclarations(fieldOf("Brand voice"), "opacity")).toEqual([".5"]);
  });

  it("TextArea dims its field while loading", async () => {
    render(<TextArea label="Brand voice" loading />);
    expect(await matchedDeclarations(fieldOf("Brand voice"), "opacity")).toEqual([".5"]);
  });

  it("Checkbox dims its label and description when disabled", async () => {
    render(
      <Checkbox
        label="Email me when a post is published"
        description="Sent to the workspace owner."
        checked={false}
        onChange={() => {}}
        disabled
      />
    );
    const label = screen.getByText("Email me when a post is published");
    const description = screen.getByText("Sent to the workspace owner.");
    expect(await matchedDeclarations(label, "opacity")).toEqual([".5"]);
    expect(await matchedDeclarations(description, "opacity")).toEqual([".5"]);
  });

  it("Checkbox keeps its label at full opacity when enabled", async () => {
    render(<Checkbox label="Email me when a post is published" checked={false} onChange={() => {}} />);
    const label = screen.getByText("Email me when a post is published");
    expect(await matchedDeclarations(label, "opacity")).toEqual([]);
  });
});
