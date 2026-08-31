import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  ResearchAttachments,
  type ResearchAttachmentFile,
  type ResearchAttachmentUploadResult,
  type ResearchAttachmentsProps,
} from "../ResearchAttachments";

/** English microcopy per the handoff table — the component itself carries no copy. */
const LABELS: ResearchAttachmentsProps["labels"] = {
  title: "Research material",
  optionalTag: "Optional",
  valueLine: "Attach research, briefs or notes — the post will draw on them.",
  dropCta: "or drag and drop",
  dropCtaBold: "Click to upload",
  dropHint: "PDF, DOCX, TXT, MD or HTML · up to 10 MB each · up to 5 files",
  dropActive: "Drop to attach",
  busy: "Uploading & reading…",
  readPages: (n) => `${n} pages read`,
  readWords: (n) => `≈${n} words read`,
  partialNote: (n, unit) => `Long document — we'll use the first ~${n} ${unit}.`,
  failedNote: "We couldn't read this file — it may be corrupt or image-only.",
  retry: "Retry",
  remove: (name) => `Remove ${name}`,
  cancel: "Cancel upload",
  rejectType: (file) => `${file} isn't a supported format — use PDF, DOCX, TXT, MD or HTML.`,
  rejectSize: (file, size) => `${file} is ${size} — files can be up to 10 MB.`,
  addMore: (n, max) => `Add more files · ${n} of ${max}`,
  capStrip: "5 of 5 files attached — remove one to add another.",
  counter: (n, max) => `${n} of ${max}`,
  srReady: "Ready",
};

function uploadResult(
  overrides: Partial<ResearchAttachmentUploadResult> = {},
): ResearchAttachmentUploadResult {
  return {
    attachmentId: "att-1",
    name: "market-research-q3.pdf",
    ext: "pdf",
    sizeBytes: 1024,
    charCount: 9000,
    truncated: false,
    extractedUnit: "pages",
    extractedUsed: 12,
    extractedTotal: 12,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Controlled harness — the component reports every list change up. */
function Harness({
  onUpload,
  onRemove,
  initial = [],
  maxFiles,
  maxSizeBytes,
}: {
  onUpload: ResearchAttachmentsProps["onUpload"];
  onRemove?: ResearchAttachmentsProps["onRemove"];
  initial?: ResearchAttachmentFile[];
  maxFiles?: number;
  maxSizeBytes?: number;
}) {
  const [files, setFiles] = useState<ResearchAttachmentFile[]>(initial);
  return (
    <ResearchAttachments
      files={files}
      onFilesChange={setFiles}
      onUpload={onUpload}
      onRemove={onRemove}
      maxFiles={maxFiles}
      maxSizeBytes={maxSizeBytes}
      labels={LABELS}
    />
  );
}

const readyFile = (n: number): ResearchAttachmentFile => ({
  localId: `row-${n}`,
  name: `doc-${n}.pdf`,
  ext: "pdf",
  sizeBytes: 2048,
  status: "ready",
  attachmentId: `att-${n}`,
  extracted: { unit: "pages", used: 3, total: 3, truncated: false },
});

const pdf = (name = "notes.pdf") => new File(["x".repeat(20)], name, { type: "application/pdf" });

function pickFiles(container: HTMLElement, files: File[]) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("hidden file input not rendered");
  fireEvent.change(input, { target: { files } });
}

describe("ResearchAttachments", () => {
  it("rejects an unsupported type and an oversize file inline, naming the file and the rule", () => {
    const onUpload = vi.fn();
    const { container } = render(<Harness onUpload={onUpload} maxSizeBytes={10} />);

    pickFiles(container, [
      new File(["x"], "survey-data.xlsx", { type: "application/vnd.ms-excel" }),
      pdf("interview-audio-transcript.pdf"), // 20 bytes > maxSizeBytes 10
    ]);

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveTextContent(
      "survey-data.xlsx isn't a supported format — use PDF, DOCX, TXT, MD or HTML.",
    );
    expect(alerts[1]).toHaveTextContent(
      "interview-audio-transcript.pdf is 20 B — files can be up to 10 MB.",
    );
    // Rejections never reach the transport.
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("uploads a multi-file drop strictly one at a time and renders busy → ready with extracted meta", async () => {
    const first = deferred<ResearchAttachmentUploadResult>();
    const second = deferred<ResearchAttachmentUploadResult>();
    const onUpload = vi
      .fn<ResearchAttachmentsProps["onUpload"]>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { container } = render(<Harness onUpload={onUpload} />);

    pickFiles(container, [pdf("market-research-q3.pdf"), pdf("brief.docx")]);

    // Both rows appear busy immediately…
    expect(screen.getAllByText("Uploading & reading…")).toHaveLength(2);
    // …but only the first round-trip goes out (the queue starts on a microtask)…
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(onUpload.mock.calls[0][0].name).toBe("market-research-q3.pdf");
    // …and the second stays held back while the first is unresolved.
    await new Promise((r) => setTimeout(r, 20));
    expect(onUpload).toHaveBeenCalledTimes(1);

    first.resolve(uploadResult({ attachmentId: "att-a", extractedUsed: 12 }));
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2));
    expect(onUpload.mock.calls[1][0].name).toBe("brief.docx");

    second.resolve(
      uploadResult({
        attachmentId: "att-b",
        extractedUnit: "words",
        extractedUsed: 4200,
        extractedTotal: 4200,
      }),
    );

    // Ready meta in user terms: pages for the PDF, words for the DOCX.
    expect(await screen.findByText(/12 pages read/)).toBeInTheDocument();
    expect(await screen.findByText(/≈4200 words read/)).toBeInTheDocument();
    expect(screen.queryByText("Uploading & reading…")).not.toBeInTheDocument();
    // Both rows carry the sr-only ready signal (status not color-only).
    expect(screen.getAllByText("Ready")).toHaveLength(2);
  });

  it("renders the truncation note as an informational line on partially used files", async () => {
    const onUpload = vi
      .fn<ResearchAttachmentsProps["onUpload"]>()
      .mockResolvedValue(
        uploadResult({ truncated: true, extractedUsed: 8, extractedTotal: 42 }),
      );
    const { container } = render(<Harness onUpload={onUpload} />);

    pickFiles(container, [pdf("annual-report.pdf")]);

    expect(
      await screen.findByText("Long document — we'll use the first ~8 pages."),
    ).toBeInTheDocument();
  });

  it("shows a failed row with the thrown message and Retry re-invokes onUpload with the same file", async () => {
    const onUpload = vi
      .fn<ResearchAttachmentsProps["onUpload"]>()
      .mockRejectedValueOnce(new Error("Extraction failed — image-only PDF."))
      .mockResolvedValueOnce(uploadResult({ attachmentId: "att-retry" }));
    const { container } = render(<Harness onUpload={onUpload} />);

    pickFiles(container, [pdf("scan.pdf")]);

    expect(
      await screen.findByText("Extraction failed — image-only PDF."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Retry — scan\.pdf/ }));

    expect(await screen.findByText(/12 pages read/)).toBeInTheDocument();
    expect(onUpload).toHaveBeenCalledTimes(2);
    // Retry re-sends the exact same native File, not a re-pick.
    expect(onUpload.mock.calls[1][0]).toBe(onUpload.mock.calls[0][0]);
  });

  it("enforces the cap: the 6th file is rejected inline and the add affordance becomes the cap strip", async () => {
    const onUpload = vi.fn<ResearchAttachmentsProps["onUpload"]>();
    const { container } = render(
      <Harness onUpload={onUpload} initial={[1, 2, 3, 4, 5].map(readyFile)} />,
    );

    // At capacity: no dropzone, the quiet strip instead.
    expect(
      screen.getByText("5 of 5 files attached — remove one to add another."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Click to upload/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add more files/ })).not.toBeInTheDocument();

    // A 6th file dropped anyway (e.g. before rerender) is rejected inline.
    pickFiles(container, [pdf("overflow.pdf")]);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "5 of 5 files attached — remove one to add another.",
    );
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("remove fires onRemove with the server attachmentId and drops the row", async () => {
    const onRemove = vi.fn();
    render(<Harness onUpload={vi.fn()} onRemove={onRemove} initial={[readyFile(1)]} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove doc-1.pdf" }));

    expect(onRemove).toHaveBeenCalledWith("att-1");
    // Row is gone after the 150ms exit collapse.
    await waitFor(() => expect(screen.queryByText("doc-1.pdf")).not.toBeInTheDocument());
  });

  it("hides the counter chip at 0 files and shows it once a file exists", () => {
    const { unmount } = render(<Harness onUpload={vi.fn()} />);
    expect(screen.queryByText("0 of 5")).not.toBeInTheDocument();
    unmount();

    render(<Harness onUpload={vi.fn()} initial={[readyFile(1)]} />);
    expect(screen.getByText("1 of 5")).toBeInTheDocument();
  });

  it("opens the picker from the keyboard: Enter on the dropzone clicks the hidden input", () => {
    const { container } = render(<Harness onUpload={vi.fn()} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("hidden file input not rendered");
    const click = vi.spyOn(input, "click");

    const dropzone = screen.getByRole("button", { name: /Click to upload/ });
    fireEvent.keyDown(dropzone, { key: "Enter" });

    expect(click).toHaveBeenCalledTimes(1);
  });

  it("cancel on a busy row drops it and ignores the in-flight result", async () => {
    const pending = deferred<ResearchAttachmentUploadResult>();
    const onUpload = vi
      .fn<ResearchAttachmentsProps["onUpload"]>()
      .mockReturnValue(pending.promise);
    const onRemove = vi.fn();
    const { container } = render(<Harness onUpload={onUpload} onRemove={onRemove} />);

    pickFiles(container, [pdf("slow.pdf")]);
    fireEvent.click(screen.getByRole("button", { name: /Cancel upload — slow\.pdf/ }));

    await waitFor(() => expect(screen.queryByText("slow.pdf")).not.toBeInTheDocument());
    // Busy rows have no attachmentId yet — no server cleanup call.
    expect(onRemove).not.toHaveBeenCalled();

    // The late resolution must not resurrect the row.
    pending.resolve(uploadResult());
    await waitFor(() => expect(screen.queryByText("slow.pdf")).not.toBeInTheDocument());
  });
});
