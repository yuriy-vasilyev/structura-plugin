import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import {
  ReferralLinksEditor,
  type ReferralLinkValue,
} from "../ReferralLinksEditor";

/** Controlled harness — the editor is presentational; the parent owns the list. */
function Harness({ initial = [] as ReferralLinkValue[] }: { initial?: ReferralLinkValue[] }) {
  const [value, setValue] = useState<ReferralLinkValue[]>(initial);
  return (
    <>
      <ReferralLinksEditor value={value} onChange={setValue} binding="campaign" />
      {/* Mirror the current value so assertions can read persisted state. */}
      <pre data-testid="state">{JSON.stringify(value)}</pre>
    </>
  );
}

const state = () => JSON.parse(screen.getByTestId("state").textContent || "[]") as ReferralLinkValue[];

describe("ReferralLinksEditor", () => {
  it("renders the empty state with an add affordance when there are no links", () => {
    render(<Harness />);
    expect(screen.getByText(/No referral links yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add referral link/i })).toBeInTheDocument();
  });

  it("adds an empty row when 'Add referral link' is clicked", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Add referral link/i }));
    expect(state()).toHaveLength(1);
    // Row fields are now present.
    expect(screen.getByRole("textbox", { name: /Label/i })).toBeInTheDocument();
  });

  it("round-trips label + URL edits to the value", () => {
    render(<Harness initial={[{ url: "", label: "", relevanceKeywords: [] }]} />);

    fireEvent.change(screen.getByRole("textbox", { name: /Label/i }), {
      target: { value: "Acme Boards" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Destination URL/i }), {
      target: { value: "https://acme.example/go?ref=abc123&utm=x" },
    });

    const [row] = state();
    expect(row.label).toBe("Acme Boards");
    // Tracking params preserved verbatim.
    expect(row.url).toBe("https://acme.example/go?ref=abc123&utm=x");
  });

  it("adds a relevance keyword chip on Enter and removes it via its X", () => {
    render(<Harness initial={[{ url: "", label: "Acme", relevanceKeywords: [] }]} />);

    const kwInput = screen.getByRole("textbox", { name: /Add a relevance keyword/i });
    fireEvent.change(kwInput, { target: { value: "project management" } });
    fireEvent.keyDown(kwInput, { key: "Enter" });

    expect(state()[0].relevanceKeywords).toEqual(["project management"]);

    fireEvent.click(screen.getByRole("button", { name: /Remove project management/i }));
    expect(state()[0].relevanceKeywords).toEqual([]);
  });

  it("validates a missing label on blur", () => {
    render(<Harness initial={[{ url: "", label: "", relevanceKeywords: [] }]} />);
    const label = screen.getByRole("textbox", { name: /Label/i });
    fireEvent.blur(label);
    expect(screen.getByRole("alert")).toHaveTextContent(/Label is required/i);
  });

  it("validates a malformed URL on blur but accepts a full https URL", () => {
    render(<Harness initial={[{ url: "", label: "Acme", relevanceKeywords: [] }]} />);
    const url = screen.getByRole("textbox", { name: /Destination URL/i });

    fireEvent.change(url, { target: { value: "acme.com" } });
    fireEvent.blur(url);
    expect(screen.getByRole("alert")).toHaveTextContent(/full URL, including https/i);

    fireEvent.change(url, { target: { value: "https://acme.com/go?ref=1" } });
    fireEvent.blur(url);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reveals the anchor override field only after the disclosure is clicked", () => {
    render(<Harness initial={[{ url: "", label: "Acme", relevanceKeywords: [] }]} />);
    expect(screen.queryByRole("textbox", { name: /Exact anchor text/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Exact anchor text/i }));
    const anchor = screen.getByRole("textbox", { name: /Exact anchor text/i });
    fireEvent.change(anchor, { target: { value: "the Acme app" } });
    expect(state()[0].anchorText).toBe("the Acme app");
  });

  it("removes a row via its remove button", () => {
    render(
      <Harness
        initial={[
          { url: "https://a.example", label: "A", relevanceKeywords: [] },
          { url: "https://b.example", label: "B", relevanceKeywords: [] },
        ]}
      />,
    );
    expect(state()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Remove A/i }));
    const remaining = state();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].label).toBe("B");
  });

  it("renders the FTC disclosure link when a target is provided", () => {
    const { container } = render(
      <ReferralLinksEditor
        value={[]}
        onChange={() => {}}
        binding="site"
        disclosureHref="/settings#disclosure"
      />,
    );
    const link = within(container).getByRole("link", { name: /affiliate disclosure setting/i });
    expect(link).toHaveAttribute("href", "/settings#disclosure");
  });
});
