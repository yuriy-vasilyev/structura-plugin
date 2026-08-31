import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  Check,
  CheckCheck,
  FileDown,
  Info,
  Paperclip,
  Plus,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { cn } from "../utils";
import { Card } from "./Card";
import { ProgressBar } from "./ProgressBar";
import { formatBytes, matchesAccept } from "./FileUpload";

/**
 * One attached research file as the consumer sees it. Rows are created by
 * the component (pick/drop), reported up via `onFilesChange`, and the
 * consumer submits the `attachmentId`s of `status === "ready"` rows with
 * the generation request.
 */
export interface ResearchAttachmentFile {
  /** Local row id (uuid), stable across status changes. */
  localId: string;
  name: string;
  /** Lowercased extension for the type tile — "pdf" | "docx" | "txt" | "md" | "html". */
  ext: string;
  sizeBytes: number;
  /**
   * A file is only ever uploading-and-reading, ready, or failed — the
   * upload + text extraction happen in a single round-trip (handoff:
   * one combined state, no percent, no stages).
   */
  status: "busy" | "ready" | "failed";
  /** Set when ready — server-assigned reference the form submits. */
  attachmentId?: string;
  /** Extracted-size signal, user terms (pages for PDF/DOCX, words otherwise). */
  extracted?: {
    unit: "pages" | "words";
    used: number;
    total: number;
    truncated: boolean;
  };
  /** i18n'd failure message for the failed state. */
  errorMessage?: string;
}

/**
 * Payload the consumer's uploader resolves to — the server-side result of
 * the single upload + extract round-trip.
 */
export interface ResearchAttachmentUploadResult {
  attachmentId: string;
  name: string;
  ext: string;
  sizeBytes: number;
  charCount: number;
  truncated: boolean;
  extractedUnit: "pages" | "words";
  extractedUsed: number;
  extractedTotal: number;
}

/**
 * All user-facing strings, injected by the consumer — the two surfaces
 * localize differently (wp-admin via `@wordpress/i18n`, the portal via its
 * own `t(...)`), so the component itself carries zero copy.
 */
export interface ResearchAttachmentsLabels {
  title: string;
  optionalTag: string;
  valueLine: string;
  /** Trailing (non-bold) part of the dropzone CTA — " or drag and drop". */
  dropCta: string;
  /** Leading bold-brand part of the dropzone CTA — "Click to upload". */
  dropCtaBold: string;
  dropHint: string;
  dropActive: string;
  /** "Uploading & reading…" */
  busy: string;
  /** "{n} pages read" */
  readPages: (n: number) => string;
  /** "≈{n} words read" */
  readWords: (n: number) => string;
  partialNote: (n: number, unit: "pages" | "words") => string;
  failedNote: string;
  retry: string;
  remove: (name: string) => string;
  cancel: string;
  rejectType: (file: string) => string;
  rejectSize: (file: string, size: string) => string;
  addMore: (n: number, max: number) => string;
  capStrip: string;
  /** Header chip — "n of 5". */
  counter: (n: number, max: number) => string;
  /**
   * sr-only text inside the emerald check disc ("Ready"). Not in the
   * original handoff label table, but the status must not be color-only
   * (WCAG) and every string ships localized — so it is injected too.
   */
  srReady: string;
}

export interface ResearchAttachmentsProps {
  files: ResearchAttachmentFile[];
  onFilesChange: (files: ResearchAttachmentFile[]) => void;
  /**
   * Uploads one file (single upload + extract round-trip); resolves with
   * the ready-row payload or throws with a user-displayable message. THIS
   * is where each surface plugs in its transport — wp-admin proxies via
   * WP, the portal talks to Storage — so the component stays
   * transport-agnostic like its single-file sibling `FileUpload`.
   */
  onUpload: (file: File) => Promise<ResearchAttachmentUploadResult>;
  /** Optional server-side cancel/delete hook for remove; fire-and-forget. */
  onRemove?: (attachmentId: string) => void;
  /** @defaultValue 5 */
  maxFiles?: number;
  /** @defaultValue 10 MiB */
  maxSizeBytes?: number;
  disabled?: boolean;
  labels: ResearchAttachmentsLabels;
  className?: string;
}

/**
 * Accepted research formats. `.htm` is accepted and normalized to the
 * `html` tile so users with legacy exports aren't rejected on a
 * spelling technicality.
 */
const ACCEPT = ".pdf,.docx,.txt,.md,.html,.htm";

const DEFAULT_MAX_FILES = 5;
const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Row-exit animation length. Mirrors `--duration-fast` (150ms) from
 * `@structura/tailwind-config` — the JS timer must match the CSS
 * transition so the row is dropped exactly when the collapse ends.
 */
const EXIT_MS = 150;

/** Lowercased extension from a file name; `.htm` normalizes to `html`. */
function extFromFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
  return ext === "htm" ? "html" : ext;
}

function newLocalId(): string {
  // crypto.randomUUID is available everywhere we ship (secure contexts +
  // Node 20/jsdom); the fallback only guards ancient embedded webviews.
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ra-${Math.random().toString(36).slice(2)}`;
}

function prefersReducedMotion(): boolean {
  // jsdom has no matchMedia — treat "unknown" as motion-ok; the CSS side
  // is still guarded by `motion-reduce:` variants either way.
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** File-type tile — mono extension label, not per-type icons (handoff §row anatomy). */
function ExtTile({ ext, failed }: { ext: string; failed?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-9 w-10 shrink-0 items-center justify-center rounded-lg font-mono text-[9px] font-bold uppercase tracking-wide",
        failed
          ? "bg-red-50 text-red-600 ring-1 ring-inset ring-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20"
          : "bg-neutral-100 text-neutral-500 ring-1 ring-inset ring-neutral-200 dark:bg-white/[.06] dark:text-neutral-400 dark:ring-white/[.08]",
      )}
      aria-hidden="true"
    >
      {ext.toUpperCase()}
    </span>
  );
}

function IconButton({
  label,
  onClick,
  danger,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-neutral-400 transition-colors disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-500",
        danger
          ? "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
          : "hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-white/10 dark:hover:text-neutral-300",
      )}
    >
      {children}
    </button>
  );
}

/**
 * ResearchAttachments — the multi-file "Research material" section for
 * single post generation (handoff:
 * `marketing/design_handoff_research_attachments/README.md`).
 *
 * The multi-file sibling of `FileUpload`: controlled around a
 * `ResearchAttachmentFile[]` and transport-agnostic — the consumer
 * injects `onUpload` (one upload + extract round-trip per file) and gets
 * every list change back via `onFilesChange`. Multi-file drops enqueue
 * and upload strictly one at a time.
 *
 * States per row: busy (indeterminate runner + cancel) → ready (emerald
 * check, extracted-size meta, optional "partially used" note) or failed
 * (red wash, retry + remove). Pre-upload rejections (type/size/cap)
 * render as inline `role="alert"` lines under the dropzone — never
 * toasts — and clear on the next successful add.
 *
 * A11y: keyboard-operable dropzone (`role="button"`, Enter/Space),
 * `aria-live="polite"` list, all actions labelled with the file name,
 * status never conveyed by color alone. Motion honors
 * `prefers-reduced-motion`.
 *
 * The free-tier locked state is NOT rendered here — consumers gate the
 * whole section with the shipped `SectionGateTeaser`.
 */
export const ResearchAttachments = forwardRef<HTMLDivElement, ResearchAttachmentsProps>(
  (
    {
      files,
      onFilesChange,
      onUpload,
      onRemove,
      maxFiles = DEFAULT_MAX_FILES,
      maxSizeBytes = DEFAULT_MAX_SIZE_BYTES,
      disabled = false,
      labels,
      className,
    },
    ref,
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setDragging] = useState(false);
    /** Formatted, ready-to-render rejection messages (type/size/cap). */
    const [rejections, setRejections] = useState<string[]>([]);
    /** Rows currently playing their exit collapse before removal. */
    const [leavingIds, setLeavingIds] = useState<ReadonlySet<string>>(new Set());

    // The component mutates the list from async continuations (queue
    // steps, exit timers) that can fire before the parent has re-rendered
    // with the previous change. `filesRef` is therefore the single
    // read-your-writes source inside handlers: synced from props on every
    // render, updated eagerly on every emit.
    const filesRef = useRef(files);
    filesRef.current = files;
    const onFilesChangeRef = useRef(onFilesChange);
    onFilesChangeRef.current = onFilesChange;
    const onUploadRef = useRef(onUpload);
    onUploadRef.current = onUpload;
    const onRemoveRef = useRef(onRemove);
    onRemoveRef.current = onRemove;

    /** Serializes uploads: each enqueued round-trip awaits the previous one. */
    const queueRef = useRef<Promise<void>>(Promise.resolve());
    /** Busy rows the user cancelled — their in-flight result is ignored. */
    const cancelledRef = useRef(new Set<string>());
    /** Native File per row, kept until ready so failed rows can Retry. */
    const nativeFilesRef = useRef(new Map<string, File>());
    const exitTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
    useEffect(() => {
      const timers = exitTimersRef.current;
      return () => timers.forEach(clearTimeout);
    }, []);

    const commit = useCallback((next: ResearchAttachmentFile[]) => {
      filesRef.current = next;
      onFilesChangeRef.current(next);
    }, []);

    const patchRow = useCallback(
      (localId: string, patch: Partial<ResearchAttachmentFile>) => {
        commit(
          filesRef.current.map((f) => (f.localId === localId ? { ...f, ...patch } : f)),
        );
      },
      [commit],
    );

    const runUpload = useCallback(
      async (localId: string, file: File) => {
        try {
          const result = await onUploadRef.current(file);
          if (cancelledRef.current.delete(localId)) return;
          nativeFilesRef.current.delete(localId);
          patchRow(localId, {
            status: "ready",
            attachmentId: result.attachmentId,
            extracted: {
              unit: result.extractedUnit,
              used: result.extractedUsed,
              total: result.extractedTotal,
              truncated: result.truncated,
            },
            errorMessage: undefined,
          });
        } catch (err) {
          if (cancelledRef.current.delete(localId)) return;
          patchRow(localId, {
            status: "failed",
            errorMessage:
              err instanceof Error && err.message ? err.message : undefined,
          });
        }
      },
      [patchRow],
    );

    const enqueueUpload = useCallback(
      (localId: string, file: File) => {
        queueRef.current = queueRef.current.then(() => runUpload(localId, file));
      },
      [runUpload],
    );

    /** Count that drives the cap / counter — rows animating out don't hold a slot. */
    const count = files.filter((f) => !leavingIds.has(f.localId)).length;
    const atCapacity = count >= maxFiles;

    const handleIncoming = useCallback(
      (list: FileList | File[] | null) => {
        if (disabled) return;
        const incoming = Array.from(list ?? []);
        if (incoming.length === 0) return;

        const accepted: Array<{ localId: string; file: File }> = [];
        const newRejections: string[] = [];
        let capMessageShown = false;
        let slots = filesRef.current.filter((f) => !leavingIds.has(f.localId)).length;

        for (const file of incoming) {
          if (!matchesAccept(file, ACCEPT)) {
            newRejections.push(labels.rejectType(file.name));
            continue;
          }
          if (file.size > maxSizeBytes) {
            newRejections.push(labels.rejectSize(file.name, formatBytes(file.size)));
            continue;
          }
          if (slots >= maxFiles) {
            // Overflow past the cap: one inline line no matter how many
            // files spilled — repeating it per file is pure noise.
            if (!capMessageShown) {
              newRejections.push(labels.capStrip);
              capMessageShown = true;
            }
            continue;
          }
          slots += 1;
          accepted.push({ localId: newLocalId(), file });
        }

        // Handoff: rejections clear on the next successful add — so a
        // batch with any accepted file replaces stale lines; an
        // all-rejected batch stacks onto what's shown.
        setRejections((prev) =>
          accepted.length > 0 ? newRejections : [...prev, ...newRejections],
        );
        if (accepted.length === 0) return;

        const rows: ResearchAttachmentFile[] = accepted.map(({ localId, file }) => {
          nativeFilesRef.current.set(localId, file);
          return {
            localId,
            name: file.name,
            ext: extFromFileName(file.name),
            sizeBytes: file.size,
            status: "busy" as const,
          };
        });
        commit([...filesRef.current, ...rows]);
        for (const { localId, file } of accepted) enqueueUpload(localId, file);
      },
      [commit, disabled, enqueueUpload, labels, leavingIds, maxFiles, maxSizeBytes],
    );

    const dropRow = useCallback(
      (localId: string) => {
        const finish = () => {
          commit(filesRef.current.filter((f) => f.localId !== localId));
          setLeavingIds((prev) => {
            if (!prev.has(localId)) return prev;
            const next = new Set(prev);
            next.delete(localId);
            return next;
          });
        };
        if (prefersReducedMotion()) {
          finish();
          return;
        }
        setLeavingIds((prev) => new Set(prev).add(localId));
        const timer = setTimeout(() => {
          exitTimersRef.current.delete(timer);
          finish();
        }, EXIT_MS);
        exitTimersRef.current.add(timer);
      },
      [commit],
    );

    const removeRow = useCallback(
      (row: ResearchAttachmentFile) => {
        // Fire-and-forget server cleanup — a busy row has no attachmentId
        // yet, so cancel paths never reach the hook.
        if (row.attachmentId) onRemoveRef.current?.(row.attachmentId);
        nativeFilesRef.current.delete(row.localId);
        dropRow(row.localId);
      },
      [dropRow],
    );

    const cancelRow = useCallback(
      (row: ResearchAttachmentFile) => {
        // The round-trip has no abort seam — mark it cancelled so the
        // eventual resolution is ignored, and drop the row now.
        cancelledRef.current.add(row.localId);
        removeRow(row);
      },
      [removeRow],
    );

    const retryRow = useCallback(
      (row: ResearchAttachmentFile) => {
        const file = nativeFilesRef.current.get(row.localId);
        // The native File only survives while the component is mounted;
        // a failed row hydrated from outside can't retry — leave it be.
        if (!file) return;
        patchRow(row.localId, { status: "busy", errorMessage: undefined });
        enqueueUpload(row.localId, file);
      },
      [enqueueUpload, patchRow],
    );

    const openPicker = () => {
      if (disabled) return;
      inputRef.current?.click();
    };

    const dropzoneKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPicker();
      }
    };
    const onDragOver = (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!disabled) setDragging(true);
    };
    const onDragLeave = () => setDragging(false);
    const onDrop = (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      handleIncoming(e.dataTransfer.files);
    };

    const dropzoneFocusRing =
      "outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:shadow-glow-brand";

    return (
      <Card ref={ref} className={cn("p-0", className)}>
        {/* ── Section header — quiet neutral tile: this is an optional
            enhancer and must not out-shout the required topic field. ── */}
        <div className="flex items-start gap-3 border-b border-neutral-100 px-6 pb-4 pt-5 dark:border-neutral-800">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500 ring-1 ring-inset ring-neutral-200/70 dark:bg-white/[.06] dark:text-neutral-400 dark:ring-white/[.08]">
            <Paperclip size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="m-0! text-[15px] font-bold tracking-tight text-neutral-900 dark:text-white">
                {labels.title}
              </h3>
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-neutral-400 dark:bg-white/10 dark:text-neutral-500">
                {labels.optionalTag}
              </span>
              {count >= 1 ? (
                <span className="ml-auto shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-500 ring-1 ring-inset ring-neutral-200 dark:bg-white/[.06] dark:text-neutral-400 dark:ring-white/[.08]">
                  {labels.counter(count, maxFiles)}
                </span>
              ) : null}
            </div>
            <p className="m-0! mt-0.5 text-[12.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              {labels.valueLine}
            </p>
          </div>
        </div>

        <div className="space-y-3 p-6 pt-5">
          {/* ── File rows. aria-live announces per-file transitions
              (busy → ready meta, failures, removals). ── */}
          {files.length > 0 ? (
            <div
              aria-live="polite"
              className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800"
            >
              {files.map((row) => {
                const leaving = leavingIds.has(row.localId);
                return (
                  <div
                    key={row.localId}
                    // 1fr→0fr grid collapse animates the row's height
                    // without measuring it; opacity fades in the same
                    // 150ms `--ease-in` exit envelope as the JS timer.
                    className={cn(
                      "grid grid-rows-[1fr] transition-[grid-template-rows,opacity] duration-fast ease-in motion-reduce:transition-none",
                      leaving && "grid-rows-[0fr] opacity-0",
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="animate-slide-in-bottom motion-reduce:animate-none">
                        {row.status === "busy" ? (
                          <div className="flex items-center gap-3 px-3.5 py-3">
                            <ExtTile ext={row.ext} />
                            <div className="min-w-0 flex-1">
                              <p
                                className="m-0! truncate text-[13px] font-semibold text-neutral-800 dark:text-neutral-100"
                                title={row.name}
                              >
                                {row.name}
                              </p>
                              <ProgressBar
                                className="mt-1.5 h-1 max-w-[240px] bg-neutral-200 dark:bg-white/10"
                                fillClassName="bg-brand-500 dark:bg-brand-400"
                              />
                              <p className="m-0! mt-1 text-[11.5px] text-neutral-500 dark:text-neutral-400">
                                {labels.busy}{" "}
                                <span className="text-neutral-400 dark:text-neutral-600">
                                  · {formatBytes(row.sizeBytes)}
                                </span>
                              </p>
                            </div>
                            <IconButton
                              label={`${labels.cancel} — ${row.name}`}
                              onClick={() => cancelRow(row)}
                              disabled={disabled}
                            >
                              <X size={15} aria-hidden="true" />
                            </IconButton>
                          </div>
                        ) : row.status === "failed" ? (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-red-50/60 px-3.5 py-3 dark:bg-red-500/[.06]">
                            <ExtTile ext={row.ext} failed />
                            {/* basis-40 lets the actions wrap below ~380px
                                instead of crushing the failure note. */}
                            <div className="min-w-0 flex-1 basis-40">
                              <p
                                className="m-0! truncate text-[13px] font-semibold text-neutral-800 dark:text-neutral-100"
                                title={row.name}
                              >
                                {row.name}
                              </p>
                              <p className="m-0! mt-0.5 text-[11.5px] font-medium leading-snug text-red-600 dark:text-red-400">
                                {row.errorMessage || labels.failedNote}
                              </p>
                            </div>
                            <div className="ml-auto flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                aria-label={`${labels.retry} — ${row.name}`}
                                onClick={() => retryRow(row)}
                                disabled={disabled}
                                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                              >
                                <RefreshCw size={12} aria-hidden="true" />
                                {labels.retry}
                              </button>
                              <IconButton
                                label={labels.remove(row.name)}
                                onClick={() => removeRow(row)}
                                danger
                                disabled={disabled}
                              >
                                <Trash2 size={15} aria-hidden="true" />
                              </IconButton>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 px-3.5 py-3">
                            <ExtTile ext={row.ext} />
                            <div className="min-w-0 flex-1">
                              <p
                                className="m-0! truncate text-[13px] font-semibold text-neutral-800 dark:text-neutral-100"
                                title={row.name}
                              >
                                {row.name}
                              </p>
                              <p className="m-0! mt-0.5 text-[11.5px] text-neutral-500 dark:text-neutral-400">
                                {formatBytes(row.sizeBytes)}
                                {row.extracted
                                  ? ` · ${
                                      row.extracted.unit === "pages"
                                        ? labels.readPages(row.extracted.used)
                                        : labels.readWords(row.extracted.used)
                                    }`
                                  : ""}
                              </p>
                              {row.extracted?.truncated ? (
                                // Informational, deliberately NOT amber —
                                // partial use is a fact, not a warning.
                                <p className="m-0! mt-1 flex items-start gap-1.5 text-[11.5px] leading-snug text-neutral-500 dark:text-neutral-400">
                                  <Info
                                    size={12}
                                    className="mt-0.5 shrink-0 text-neutral-400 dark:text-neutral-500"
                                    aria-hidden="true"
                                  />
                                  <span>
                                    {labels.partialNote(
                                      row.extracted.used,
                                      row.extracted.unit,
                                    )}
                                  </span>
                                </p>
                              ) : null}
                            </div>
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                              <Check size={13} aria-hidden="true" />
                              <span className="sr-only">{labels.srReady}</span>
                            </span>
                            <IconButton
                              label={labels.remove(row.name)}
                              onClick={() => removeRow(row)}
                              danger
                              disabled={disabled}
                            >
                              <Trash2 size={15} aria-hidden="true" />
                            </IconButton>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* ── Add affordance: full dropzone → compact add row → cap strip ── */}
          {atCapacity ? (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-neutral-50 px-4 py-2.5 text-center text-xs font-medium text-neutral-500 ring-1 ring-inset ring-neutral-200/70 dark:bg-white/[.03] dark:text-neutral-400 dark:ring-white/[.06]">
              <CheckCheck
                size={14}
                className="shrink-0 text-neutral-400 dark:text-neutral-500"
                aria-hidden="true"
              />
              {labels.capStrip}
            </div>
          ) : count === 0 ? (
            <div
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-disabled={disabled || undefined}
              onClick={openPicker}
              onKeyDown={dropzoneKeyDown}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-7 text-center transition-colors",
                dropzoneFocusRing,
                disabled
                  ? "cursor-not-allowed border-neutral-200 bg-neutral-50 opacity-60 dark:border-neutral-800 dark:bg-white/[.02]"
                  : isDragging
                    ? "cursor-pointer border-brand-400 bg-brand-50/70 dark:border-brand-500 dark:bg-brand-500/10"
                    : "cursor-pointer border-neutral-300 bg-neutral-50/60 hover:border-brand-300 hover:bg-brand-50/40 dark:border-neutral-700 dark:bg-white/[.02] dark:hover:border-brand-500/60 dark:hover:bg-brand-500/[.06]",
              )}
            >
              <span
                className={cn(
                  "flex size-10 items-center justify-center rounded-full",
                  isDragging
                    ? "bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300"
                    : "bg-neutral-100 text-neutral-400 dark:bg-white/[.06] dark:text-neutral-500",
                )}
              >
                {isDragging ? (
                  <FileDown size={19} aria-hidden="true" />
                ) : (
                  <UploadCloud size={19} aria-hidden="true" />
                )}
              </span>
              <p className="m-0! text-[13px] font-medium text-neutral-600 dark:text-neutral-300">
                {isDragging ? (
                  labels.dropActive
                ) : (
                  <>
                    <span className="font-bold text-brand-600 dark:text-brand-400">
                      {labels.dropCtaBold}
                    </span>{" "}
                    {labels.dropCta}
                  </>
                )}
              </p>
              <p className="m-0! text-[11.5px] text-neutral-400 dark:text-neutral-500">
                {labels.dropHint}
              </p>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-disabled={disabled || undefined}
              onClick={openPicker}
              onKeyDown={dropzoneKeyDown}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl border border-dashed py-2.5 text-xs font-bold transition-colors",
                dropzoneFocusRing,
                disabled
                  ? "cursor-not-allowed border-neutral-200 text-neutral-400 opacity-60 dark:border-neutral-800 dark:text-neutral-600"
                  : isDragging
                    ? "cursor-pointer border-brand-400 bg-brand-50/70 text-brand-600 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-300"
                    : "cursor-pointer border-neutral-300 text-neutral-500 hover:border-brand-300 hover:text-brand-600 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-brand-500/60 dark:hover:text-brand-300",
              )}
            >
              {isDragging ? (
                <FileDown size={14} aria-hidden="true" />
              ) : (
                <Plus size={14} aria-hidden="true" />
              )}
              {isDragging ? labels.dropActive : labels.addMore(count, maxFiles)}
            </div>
          )}

          {/* ── Inline pre-upload rejections — never toasts. ── */}
          {rejections.length > 0 ? (
            <div className="space-y-1.5">
              {rejections.map((message, i) => (
                <p
                  key={`${message}-${i}`}
                  role="alert"
                  className="m-0! flex items-start gap-1.5 text-xs font-medium leading-relaxed text-red-600 dark:text-red-400"
                >
                  <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{message}</span>
                </p>
              ))}
            </div>
          ) : null}
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          disabled={disabled}
          className="hidden"
          onChange={(e) => {
            handleIncoming(e.target.files);
            // Reset so re-picking the same file fires change again.
            e.target.value = "";
          }}
        />
      </Card>
    );
  },
);

ResearchAttachments.displayName = "ResearchAttachments";
