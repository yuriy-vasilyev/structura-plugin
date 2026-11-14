import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { VoiceSourceRef } from "@structura/types";

import { VoiceBasis, type VoiceBasisLabels } from "../VoiceBasis";

const LABELS: VoiceBasisLabels = {
  overline: (name) => `What ${name} is based on`,
  articles: (n) => (n === 1 ? "Based on one of your articles" : `Based on ${n} of your articles`),
  writing: (n) =>
    n === 1 ? "Based on one piece of your writing" : `Based on ${n} pieces of your writing`,
  homepage: "Based on your homepage",
  profile: "Based on your business details",
  howWriting: "We read these and described how you write.",
  howHomepage: (domain) => `There are no articles on ${domain} yet.`,
  howProfile: (domain) => `We couldn’t reach ${domain}.`,
  draftedOn: (date) => `Drafted ${date.toISOString().slice(0, 10)}`,
  add: "Add your writing",
  change: "Change",
  changeLabel: (name) => `Change what ${name} is based on`,
  pastedText: "Pasted text",
  words: (n) => `${n} words`,
  pages: (n) => `${n} pages`,
  fileDeleted: "File deleted after 90 days",
  newTab: "(opens in a new tab)",
};

const ARTICLES: VoiceSourceRef[] = [
  { kind: "article", url: "https://claranovak.com/blog/a", title: "When anxiety talks louder", words: 1480 },
  { kind: "article", url: "https://claranovak.com/blog/b", title: "Why just relax never works", words: 1260 },
];

describe("VoiceBasis list", () => {
  it("only site articles: newspaper summary, overline named for the persona, links that say they open a new tab", () => {
    const onAction = vi.fn();
    render(
      <VoiceBasis
        variant="list"
        basis="writing"
        items={ARTICLES}
        domain="claranovak.com"
        personaName="The Warm Realist"
        action="change"
        onAction={onAction}
        labels={LABELS}
      />,
    );
    const section = screen.getByRole("region", { name: "Based on 2 of your articles" });
    expect(within(section).getByText("What The Warm Realist is based on")).toBeInTheDocument();
    const list = within(section).getByRole("list", { name: "Based on 2 of your articles" });
    const link = within(list).getByRole("link", {
      name: "When anxiety talks louder (opens in a new tab)",
    });
    expect(link).toHaveAttribute("href", "https://claranovak.com/blog/a");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    // Meta: the domain, not the word count, in the list.
    expect(within(list).getAllByText("claranovak.com")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Change what The Warm Realist is based on" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("any customer piece switches the summary to pieces of your writing", () => {
    const items: VoiceSourceRef[] = [
      { kind: "link", url: "https://claranovak.substack.com/p/x", title: "Letters to my Sunday self" },
      {
        kind: "file",
        name: "Chapter 2.docx",
        ext: "docx",
        pages: 14,
        attachmentId: "att-1",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      { kind: "text", words: 412 },
      ...ARTICLES,
    ];
    render(
      <VoiceBasis variant="list" basis="writing" items={items} personaName="P" labels={LABELS} />,
    );
    expect(screen.getByRole("heading", { name: "Based on 5 pieces of your writing" })).toBeInTheDocument();
    expect(screen.getByText("14 pages")).toBeInTheDocument();
    expect(screen.getByText("Pasted text")).toBeInTheDocument();
    expect(screen.getByText("412 words")).toBeInTheDocument();
  });

  it("an expired upload keeps its name and says the file was deleted", () => {
    const items: VoiceSourceRef[] = [
      {
        kind: "file",
        name: "Chapter 2.docx",
        ext: "docx",
        pages: 14,
        attachmentId: "att-1",
        expiresAt: "2026-02-01T00:00:00.000Z",
      },
    ];
    render(
      <VoiceBasis
        variant="list"
        basis="writing"
        items={items}
        personaName="P"
        now={Date.parse("2026-11-14T00:00:00.000Z")}
        labels={LABELS}
      />,
    );
    expect(screen.getByText("Chapter 2.docx")).toBeInTheDocument();
    expect(screen.getByText("File deleted after 90 days")).toBeInTheDocument();
    expect(screen.queryByText("14 pages")).toBeNull();
  });

  it("homepage: no list, the invitation action, no warning tone", () => {
    render(
      <VoiceBasis
        variant="list"
        basis="homepage"
        domain="claranovak.com"
        personaName="The Calm Guide"
        action="add"
        onAction={() => {}}
        labels={LABELS}
      />,
    );
    expect(screen.getByRole("heading", { name: "Based on your homepage" })).toBeInTheDocument();
    expect(screen.getByText("There are no articles on claranovak.com yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("button", { name: "Add your writing" })).toBeInTheDocument();
    expect(screen.getByRole("region").className).not.toMatch(/amber|red/);
  });

  it("the editor variant: no persona overline, the draft date after the title, an h3", () => {
    render(
      <VoiceBasis
        variant="list"
        basis="profile"
        domain="claranovak.com"
        personaName="P"
        showOverline={false}
        draftedAt={new Date("2026-11-13T10:00:00.000Z")}
        headingLevel={3}
        labels={LABELS}
      />,
    );
    expect(screen.queryByText("What P is based on")).toBeNull();
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveTextContent("Based on your business details");
    expect(heading).toHaveTextContent("Drafted 2026-11-13");
  });

  it("renders the status slot above the overline", () => {
    render(
      <VoiceBasis
        variant="list"
        basis="writing"
        items={ARTICLES}
        personaName="P"
        status={<p>Restored the previous version.</p>}
        labels={LABELS}
      />,
    );
    const status = screen.getByText("Restored the previous version.");
    const overline = screen.getByText("What P is based on");
    expect(status.compareDocumentPosition(overline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("VoiceBasis line", () => {
  it("is one muted line with the shared summary", () => {
    render(<VoiceBasis variant="line" basis="writing" items={ARTICLES} labels={LABELS} />);
    expect(screen.getByText("Based on 2 of your articles")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
