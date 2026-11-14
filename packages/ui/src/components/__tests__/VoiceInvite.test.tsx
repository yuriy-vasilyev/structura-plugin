import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { VoiceInvite } from "../VoiceInvite";

/** Handoff persona voice, 2c and 2h: the whole nudge for a persona with no writing read. */
describe("VoiceInvite", () => {
  it("is one dashed invitation with a title, one sentence and Add your writing", () => {
    const onAdd = vi.fn();
    const { container } = render(
      <VoiceInvite
        title="Make it sound like you"
        body="Add a few links, files or a pasted piece of your writing."
        action="Add your writing"
        onAction={onAdd}
      />,
    );
    expect(screen.getByText("Make it sound like you")).toBeInTheDocument();
    expect((container.firstElementChild as HTMLElement).className).toMatch(/border-dashed/);
    fireEvent.click(screen.getByRole("button", { name: "Add your writing" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
