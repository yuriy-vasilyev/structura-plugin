import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { DraftSteps } from "../DraftSteps";

const LABELS = { srDone: "Done:", srActive: "In progress:", srNext: "Next:" };

/** Handoff persona voice, 4b: two real steps, each tied to one call. */
describe("DraftSteps", () => {
  it("renders an ordered list whose steps carry a hidden state prefix (never colour alone)", () => {
    render(
      <DraftSteps
        labels={LABELS}
        steps={[
          { state: "active", label: "Looking for articles on claranovak.com" },
          { state: "next", label: "Writing the persona from your articles" },
        ]}
      />,
    );
    const list = screen.getByRole("list");
    expect(list.tagName).toBe("OL");
    const [first, second] = within(list).getAllByRole("listitem");
    expect(first).toHaveTextContent("In progress: Looking for articles on claranovak.com");
    expect(second).toHaveTextContent("Next: Writing the persona from your articles");
    // The number stands in the next step's disc; it is decorative.
    expect(within(second).getByText("2").closest("[aria-hidden]")).not.toBeNull();
  });

  it("lists the found titles as plain text under a finished step", () => {
    render(
      <DraftSteps
        labels={LABELS}
        steps={[
          {
            state: "done",
            label: "Found 2 articles on claranovak.com",
            detail: ["When anxiety talks louder than you do", "Sleep, worry and the 3 a.m. brain"],
          },
          { state: "active", label: "Writing the persona from your articles" },
        ]}
      />,
    );
    const [first] = screen.getAllByRole("listitem").filter((li) => li.parentElement?.tagName === "OL");
    expect(first).toHaveTextContent("Done: Found 2 articles on claranovak.com");
    const titles = within(first).getByRole("list");
    expect(within(titles).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "When anxiety talks louder than you do",
      "Sleep, worry and the 3 a.m. brain",
    ]);
    // Titles are not links during the wait.
    expect(within(first).queryByRole("link")).toBeNull();
  });
});
