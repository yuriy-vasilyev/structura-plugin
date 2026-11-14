import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import {
  VoiceSources,
  type VoiceSourceRow,
  type VoiceSourcesLabels,
  type VoiceSourcesProps,
} from "../VoiceSources";

const LABELS: VoiceSourcesLabels = {
  title: "Your writing",
  intro: "Add pieces you wrote yourself.",
  found: "Found on claranovak.com",
  foundFill: "We use these to make up 5 pieces in all. What you add comes first.",
  foundNone: "No articles on claranovak.com yet.",
  foundUnreachable: "We couldn’t reach claranovak.com to look for articles.",
  foundLoading: "Looking for articles on claranovak.com",
  notRead: "Not read",
  notReadHint: "You added enough of your own, so this article isn’t read.",
  restore: (n) => `Restore ${n} removed article${n === 1 ? "" : "s"}`,
  yours: "Added by you",
  addLabel: "Add your writing as",
  tabLink: "Link",
  tabFile: "File",
  tabText: "Text",
  willRead: (n) => `The draft will read ${n} pieces of your writing.`,
  willReadHomepage: "Nothing to read yet. The draft will use your homepage.",
  cancel: "Cancel",
  redraft: "Redraft persona",
  draft: "Draft persona",
  reading: "Reading…",
  uploading: "Uploading and reading…",
  remove: (name) => `Remove ${name}`,
  stopAdding: (name) => `Stop adding ${name}`,
  retry: "Try again",
  short: "Short. Longer pieces give a closer match.",
  removed: (name) => `Removed ${name}.`,
  srReady: "Ready",
  pastedText: "Pasted text",
  words: (n) => `${n} words`,
  pages: (n) => `${n} pages`,
  newTab: "(opens in a new tab)",
  linkLabel: "Link to a page you wrote",
  linkPlaceholder: "https://",
  linkAdd: "Add link",
  linkHint: "Any public page: your blog, a newsletter archive, a guest post.",
  linkCount: (n, max) => `${n} of ${max} links`,
  linkInvalid: "Enter a full web address that starts with https://.",
  linkDuplicate: "That page is already in the list.",
  linkNotPublic: "We can only read public pages on the internet.",
  linkCap: "5 of 5 links added. Remove one to add another.",
  fileDropBold: "Choose a file",
  fileDrop: "or drag it here",
  fileDropActive: "Drop to add",
  fileHint: "PDF, DOCX, TXT, MD or HTML · up to 10 MB each · up to 3 files",
  filePrivacy: "Files are used to draft this persona and deleted after 90 days.",
  fileCount: (n, max) => `${n} of ${max} files`,
  fileRejectType: (file) => `${file} can’t be used.`,
  fileRejectSize: (file, size) => `${file} is ${size}. Files can be up to 10 MB.`,
  fileCap: "3 of 3 files added. Remove one to add another.",
  textLabel: "Paste something you wrote",
  textPlaceholder: "A post, a letter to clients…",
  textCounter: (value, max) => ({
    text: `${value.trim().length} / ${max}`,
    over: value.trim().length > max,
  }),
  textMin: "Paste at least 300 characters.",
  textTooLong: (n) => `That’s ${n} characters. Paste up to 20000.`,
  textAdd: "Add text",
  textCap: "You’ve added pasted text. Remove it to paste something else.",
  busy: (n) => `Writing a new draft from ${n} pieces of your writing…`,
  busyHomepage: "Writing a new draft from your homepage…",
  cancelRedraft: "Cancel",
  failed: "Couldn’t write a new draft. Your persona hasn’t changed.",
  retryRedraft: "Try again",
  confirmBody: "This persona’s voice was written or changed by hand.",
  confirmReplace: "Replace with a new draft",
  confirmKeep: "Keep it as it is",
};

const article = (id: string, title: string, state: VoiceSourceRow["state"] = "ready"): VoiceSourceRow => ({
  id,
  kind: "article",
  state,
  title,
  url: `https://claranovak.com/blog/${id}`,
  words: 1200,
});

const FOUND: VoiceSourceRow[] = [
  article("a1", "When anxiety talks louder than you do"),
  article("a2", "Why just relax never works"),
  article("a3", "Sleep, worry and the 3 a.m. brain", "notRead"),
];

function setup(over: Partial<VoiceSourcesProps> = {}) {
  const props: VoiceSourcesProps = {
    mode: "redraft",
    foundState: "found",
    found: FOUND,
    removedCount: 0,
    items: [],
    readingCount: 2,
    onAddLink: vi.fn(),
    onAddFiles: vi.fn(),
    onAddText: vi.fn(),
    onRemove: vi.fn(),
    onRetry: vi.fn(),
    onRestore: vi.fn(),
    onRedraft: vi.fn(),
    onCancel: vi.fn(),
    onCancelRedraft: vi.fn(),
    onConfirm: vi.fn(),
    onKeep: vi.fn(),
    labels: LABELS,
    ...over,
  };
  const utils = render(<VoiceSources {...props} />);
  return { ...utils, props, rerender: (next: Partial<VoiceSourcesProps>) => utils.rerender(<VoiceSources {...props} {...next} />) };
}

describe("VoiceSources · panel", () => {
  it("moves focus to its heading when it opens", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Your writing" })).toHaveFocus();
  });

  it("orders the groups: found on the site, then the add control, then added by you", () => {
    setup({ items: [{ id: "u1", kind: "text", state: "ready", words: 412 }] });
    const found = screen.getByText("Found on claranovak.com");
    const tabs = screen.getByRole("tablist", { name: "Add your writing as" });
    const yours = screen.getByText("Added by you");
    expect(found.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tabs.compareDocumentPosition(yours) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("VoiceSources · found articles", () => {
  it("tags articles past the five pieces Not read, with the reason as description and tooltip", () => {
    setup();
    const tag = screen.getByText("Not read").closest("span")!;
    expect(tag).toHaveAttribute("aria-description", LABELS.notReadHint);
    expect(tag).toHaveAttribute("title", LABELS.notReadHint);
    // The gap belongs to the text before it, so a tag that wraps on a phone
    // starts flush with the line above instead of 6px in.
    expect(tag.className).not.toMatch(/(^|\s)ml-/);
    expect(tag.previousElementSibling).toHaveClass("mr-1.5");
    expect(screen.getByText(LABELS.foundFill)).toBeInTheDocument();
    // Found articles open in a new tab and say so.
    expect(
      screen.getByRole("link", { name: "When anxiety talks louder than you do (opens in a new tab)" }),
    ).toHaveAttribute("target", "_blank");
  });

  it("× removes, announces it and moves focus to the next row's ×, else the previous", () => {
    const { props, rerender } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Remove Why just relax never works" }));
    expect(props.onRemove).toHaveBeenCalledWith("a2");
    rerender({ found: [FOUND[0], FOUND[2]], removedCount: 1 });
    expect(screen.getByRole("button", { name: "Remove Sleep, worry and the 3 a.m. brain" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Removed Why just relax never works.");

    fireEvent.click(screen.getByRole("button", { name: "Remove Sleep, worry and the 3 a.m. brain" }));
    rerender({ found: [FOUND[0]], removedCount: 2 });
    expect(screen.getByRole("button", { name: "Remove When anxiety talks louder than you do" })).toHaveFocus();
  });

  it("the last row's × sends focus to the selected tab", () => {
    const { rerender } = setup({ found: [FOUND[0]] });
    fireEvent.click(screen.getByRole("button", { name: "Remove When anxiety talks louder than you do" }));
    rerender({ found: [], removedCount: 1 });
    expect(screen.getByRole("tab", { name: "Link" })).toHaveFocus();
  });

  it("Restore brings removed articles back and focuses the first restored row's ×", () => {
    const { props, rerender } = setup({ found: [FOUND[0]], removedCount: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Restore 2 removed articles" }));
    expect(props.onRestore).toHaveBeenCalledTimes(1);
    rerender({ found: FOUND, removedCount: 0 });
    expect(screen.getByRole("button", { name: "Remove Why just relax never works" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: /Restore/ })).toBeNull();
  });

  it("no articles is a plain sentence, not an error; an unbound persona hides the group", () => {
    const { rerender } = setup({ foundState: "none", found: [] });
    expect(screen.getByText(LABELS.foundNone)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    rerender({ foundState: "unreachable", found: [] });
    expect(screen.getByText(LABELS.foundUnreachable)).toBeInTheDocument();
    rerender({ foundState: undefined, found: [] });
    expect(screen.queryByText("Found on claranovak.com")).toBeNull();
  });
});

describe("VoiceSources · Link", () => {
  const input = () => screen.getByRole("textbox", { name: "Link to a page you wrote" });

  it("checks the address before reading it: not https, already listed, not public", () => {
    const { props } = setup({
      items: [{ id: "u1", kind: "link", state: "ready", title: "Letters", url: "https://claranovak.substack.com/p/letters", words: 980 }],
    });
    fireEvent.change(input(), { target: { value: "claranovak.com/blog/3am" } });
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    expect(screen.getByRole("alert")).toHaveTextContent(LABELS.linkInvalid);
    // The error replaces the hint; the counter stays.
    expect(screen.queryByText(LABELS.linkHint)).toBeNull();
    expect(screen.getByText("1 of 5 links")).toBeInTheDocument();
    expect(input()).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(input(), { target: { value: "https://www.claranovak.substack.com/p/letters/" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(screen.getByRole("alert")).toHaveTextContent(LABELS.linkDuplicate);

    fireEvent.change(input(), { target: { value: "https://claranovak.com/blog/a1" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(screen.getByRole("alert")).toHaveTextContent(LABELS.linkDuplicate);

    fireEvent.change(input(), { target: { value: "https://192.168.1.10/post" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(screen.getByRole("alert")).toHaveTextContent(LABELS.linkNotPublic);
    expect(props.onAddLink).not.toHaveBeenCalled();
  });

  it("Enter adds a well-formed link, clears the field and keeps focus in it", () => {
    const { props } = setup();
    input().focus();
    fireEvent.change(input(), { target: { value: "  https://mindfulpractice.org/blog/burnout  " } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(props.onAddLink).toHaveBeenCalledWith("https://mindfulpractice.org/blog/burnout");
    expect(input()).toHaveValue("");
    expect(input()).toHaveFocus();
  });

  it("at five links the input becomes the cap strip; the tab stays selectable", () => {
    const links: VoiceSourceRow[] = [1, 2, 3, 4, 5].map((n) => ({
      id: `l${n}`,
      kind: "link",
      state: "ready",
      title: `Post ${n}`,
      url: `https://example.com/${n}`,
      words: 900,
    }));
    setup({ items: links });
    expect(screen.getByText(LABELS.linkCap)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Link to a page you wrote" })).toBeNull();
    expect(screen.getByRole("tab", { name: /Link/ })).toHaveAttribute("aria-selected", "true");
  });
});

describe("VoiceSources · File", () => {
  const openFileTab = () => fireEvent.click(screen.getByRole("tab", { name: /^File/ }));
  const pick = (container: HTMLElement, files: File[]) => {
    const el = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!el) throw new Error("no file input");
    fireEvent.change(el, { target: { files } });
  };

  it("rejects a wrong type and an oversize file inline, never as toasts, and always shows the privacy line", () => {
    const { container, props } = setup();
    openFileTab();
    expect(screen.getByText(LABELS.filePrivacy)).toBeInTheDocument();
    const big = new File(["x"], "Book manuscript.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 25 * 1024 * 1024 });
    pick(container, [new File(["x"], "Workshop slides.pptx"), big]);
    const alerts = screen.getAllByRole("alert");
    expect(alerts[0]).toHaveTextContent("Workshop slides.pptx can’t be used.");
    expect(alerts[1]).toHaveTextContent("Book manuscript.pdf is 25.0 MB. Files can be up to 10 MB.");
    expect(props.onAddFiles).not.toHaveBeenCalled();
  });

  it("hands accepted files to the consumer and keeps only the free slots", () => {
    const { container, props } = setup({
      items: [
        { id: "f1", kind: "file", state: "ready", title: "a.docx", ext: "docx", pages: 3 },
        { id: "f2", kind: "file", state: "ready", title: "b.md", ext: "md", sizeBytes: 14000 },
      ],
    });
    openFileTab();
    pick(container, [new File(["x"], "c.txt"), new File(["x"], "d.txt")]);
    expect(props.onAddFiles).toHaveBeenCalledWith([expect.objectContaining({ name: "c.txt" })]);
    expect(screen.getByRole("alert")).toHaveTextContent(LABELS.fileCap);
    expect(screen.getByText("2 of 3 files")).toBeInTheDocument();
  });

  it("at three files the dropzone becomes the cap strip", () => {
    setup({
      items: [1, 2, 3].map((n) => ({ id: `f${n}`, kind: "file" as const, state: "ready" as const, title: `${n}.pdf`, ext: "pdf", pages: 2 })),
    });
    openFileTab();
    expect(screen.getByText(LABELS.fileCap)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Choose a file/ })).toBeNull();
  });
});

describe("VoiceSources · Text", () => {
  const openTextTab = () => fireEvent.click(screen.getByRole("tab", { name: /^Text/ }));
  const area = () => screen.getByRole("textbox", { name: "Paste something you wrote" });
  const add = () => screen.getByRole("button", { name: "Add text" });

  it("Add text waits for 300 characters and refuses more than 20,000, saying why", () => {
    const { props } = setup();
    openTextTab();
    expect(add()).toBeDisabled();
    expect(screen.getByText(LABELS.textMin)).toBeInTheDocument();

    fireEvent.change(area(), { target: { value: "x".repeat(20_001) } });
    expect(add()).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("That’s 20001 characters. Paste up to 20000.");
    expect(screen.getByText("20001 / 20000")).toBeInTheDocument();

    const text = "Most weeks I start these letters on a Sunday evening. ".repeat(8);
    fireEvent.change(area(), { target: { value: text } });
    expect(add()).toBeEnabled();
    fireEvent.click(add());
    expect(props.onAddText).toHaveBeenCalledWith(text);
  });

  it("one pasted text: the textarea becomes the cap strip", () => {
    setup({ items: [{ id: "t1", kind: "text", state: "ready", words: 412 }] });
    openTextTab();
    expect(screen.getByText(LABELS.textCap)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Paste something you wrote" })).toBeNull();
  });
});

describe("VoiceSources · added by you", () => {
  it("busy, ready, short and failed rows", () => {
    const { props } = setup({
      items: [
        { id: "u1", kind: "link", state: "busy", url: "https://mindfulpractice.org/blog/burnout" },
        { id: "u2", kind: "link", state: "ready", title: "Letters to my Sunday self", url: "https://claranovak.substack.com/p/letters", words: 980 },
        { id: "u3", kind: "text", state: "ready", words: 140 },
        { id: "u4", kind: "file", state: "failed", title: "scan.pdf", ext: "pdf", error: "We couldn’t find any text in this file." },
      ],
    });
    const yours = screen.getByRole("region", { name: "Added by you" });
    // Busy: the address without its scheme, the runner and a stop control.
    expect(within(yours).getByText("mindfulpractice.org/blog/burnout")).toBeInTheDocument();
    expect(within(yours).getByText("Reading…")).toBeInTheDocument();
    expect(within(yours).getByRole("button", { name: "Stop adding mindfulpractice.org/blog/burnout" })).toBeInTheDocument();
    // Ready: domain and words, the ready disc in words.
    expect(within(yours).getByText("claranovak.substack.com · 980 words")).toBeInTheDocument();
    expect(within(yours).getAllByText("Ready")).toHaveLength(2);
    // Short: information, read anyway.
    expect(within(yours).getByText(LABELS.short)).toBeInTheDocument();
    // Failed: the reason in words, Try again and remove.
    expect(within(yours).getByText("We couldn’t find any text in this file.")).toBeInTheDocument();
    fireEvent.click(within(yours).getByRole("button", { name: "Try again: scan.pdf" }));
    expect(props.onRetry).toHaveBeenCalledWith("u4");
    // Redraft waits while a row is still busy.
    expect(screen.getByRole("button", { name: "Redraft persona" })).toBeDisabled();
  });

  // 2026-11-14: a long host ran under the ready disc at 360px. The row now
  // wraps it inside its column, and these break points put the wrap at a
  // dot or slash ("claranovak.substack." over "com · 980 words").
  it("a host or an address wraps after a dot or slash, a title stays whole", () => {
    setup({
      items: [
        { id: "u1", kind: "link", state: "failed", url: "https://members.claranovak.com/course/week-1", error: "Couldn’t read this page." },
        { id: "u2", kind: "link", state: "ready", title: "Letters to my Sunday self", url: "https://claranovak.substack.com/p/letters", words: 980 },
      ],
    });
    const yours = screen.getByRole("region", { name: "Added by you" });
    expect(within(yours).getByText("members.claranovak.com/course/week-1").innerHTML).toBe(
      "members.<wbr>claranovak.<wbr>com/<wbr>course/<wbr>week-1",
    );
    expect(within(yours).getByText("claranovak.substack.com · 980 words").innerHTML).toBe(
      "claranovak.<wbr>substack.<wbr>com · 980 words",
    );
    expect(within(yours).getByText("Letters to my Sunday self").querySelector("wbr")).toBeNull();
  });
});

describe("VoiceSources · footer", () => {
  it("summarizes what will be read; with nothing, the homepage; New persona says Draft", () => {
    const { rerender } = setup({ readingCount: 5 });
    expect(screen.getByText("The draft will read 5 pieces of your writing.")).toBeInTheDocument();
    rerender({ readingCount: 0, found: [], foundState: "none", mode: "draft" });
    expect(screen.getByText(LABELS.willReadHomepage)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Draft persona" })).toBeEnabled();
  });

  it("redraft running: the body locks, the busy line names what is read and Cancel takes focus", () => {
    const { props, rerender, container } = setup({ readingCount: 5 });
    rerender({ busy: true, readingCount: 5 });
    expect(screen.getByText("Writing a new draft from 5 pieces of your writing…")).toBeInTheDocument();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveFocus();
    expect(container.querySelector("[inert]")).not.toBeNull();
    fireEvent.click(cancel);
    expect(props.onCancelRedraft).toHaveBeenCalledTimes(1);
  });

  it("redraft failed: the error in words and Try again takes focus", () => {
    const { props, rerender } = setup();
    rerender({ error: true });
    expect(screen.getByText(LABELS.failed)).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry).toHaveFocus();
    fireEvent.click(retry);
    expect(props.onRedraft).toHaveBeenCalledTimes(1);
  });

  // 2026-11-14, editor dialog with the real backend: the busy line's Cancel
  // was reused as Try again, so focus never moved and Try again stayed
  // scrolled out of the dialog. Each line is its own control.
  it("failed while running: Try again is a new control that takes focus, not Cancel relabeled", () => {
    const { rerender } = setup({ readingCount: 5 });
    rerender({ busy: true, readingCount: 5 });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveFocus();
    rerender({ busy: false, error: true, readingCount: 5 });
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry).not.toBe(cancel);
    expect(cancel).not.toBeInTheDocument();
    expect(retry).toHaveFocus();
  });

  it("confirmation before replacing hand edits: inline, focus on Keep, Esc keeps", () => {
    const { props, rerender } = setup();
    rerender({ confirm: true });
    const group = screen.getByRole("group", { name: LABELS.confirmBody });
    const keep = within(group).getByRole("button", { name: "Keep it as it is" });
    expect(keep).toHaveFocus();
    fireEvent.keyDown(keep, { key: "Escape" });
    expect(props.onKeep).toHaveBeenCalledTimes(1);
    fireEvent.click(within(group).getByRole("button", { name: "Replace with a new draft" }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("after Keep, focus returns to the Redraft button instead of falling to the page", () => {
    const { rerender } = setup();
    rerender({ confirm: true });
    rerender({ confirm: false });
    expect(screen.getByRole("button", { name: "Redraft persona" })).toHaveFocus();
  });

  it("Cancel closes the panel", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});
