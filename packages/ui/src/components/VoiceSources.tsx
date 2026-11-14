import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  BookOpenText,
  CheckCheck,
  CircleAlert,
  CloudUpload,
  ExternalLink,
  FileDown,
  FileText,
  Link2,
  Lock,
  Minus,
  PenLine,
  Plus,
  RefreshCw,
  RotateCcw,
  TextQuote,
  WandSparkles,
  X,
} from "lucide-react";
import {
  VOICE_FILES_MAX,
  VOICE_LINKS_MAX,
  VOICE_TEXT_MAX_LENGTH,
  VOICE_TEXT_MIN_LENGTH,
} from "@structura/types";
import { cn } from "../utils";
import { formFieldGroupVariants } from "../variants/form-field";
import { Alert } from "./Alert";
import {
  AttachmentIconButton,
  AttachmentReadyDisc,
  AttachmentRetryButton,
  AttachmentRow,
  AttachmentTile,
} from "./AttachmentRow";
import { Button } from "./Button";
import { Card } from "./Card";
import { Favicon } from "./Favicon";
import { formatBytes, matchesAccept } from "./FileUpload";
import { InputField } from "./InputField";
import { useLiveAnnouncer } from "./LiveAnnouncer";
import { usePendingFocus } from "./PendingFocus";
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_SIZE_BYTES } from "./ResearchAttachments";
import { StatusLine } from "./StatusLine";
import { Tabs } from "./Tabs";
import { TextArea } from "./TextArea";
import { voiceHost } from "./VoiceBasis";

/** A ready row under this many words gets the neutral "Short" note (handoff persona voice, owner call E). */
const SHORT_PIECE_WORDS = 200;

/**
 * One row of the panel: an article found on the site, or a link, a file or
 * the pasted text the customer added.
 */
export interface VoiceSourceRow {
  /** Stable id: the found article's id, or a local id for the customer's pieces. */
  id: string;
  kind: "article" | "link" | "file" | "text";
  /**
   * `busy`: being read or uploaded (holds one of the five slots). `ready`:
   * will be read. `notRead`: listed but past the five pieces. `failed`:
   * could not be read (frees its slot).
   */
  state: "busy" | "ready" | "notRead" | "failed";
  /** Page title or file name. Pasted text shows the "Pasted text" label instead. */
  title?: string;
  /** Web pages: opens in a new tab once read. */
  url?: string;
  /** Files: the extension shown in the tile. */
  ext?: string;
  words?: number;
  pages?: number;
  sizeBytes?: number;
  /** Failed rows: why, in words. */
  error?: string;
  /** Failed rows offer Try again unless this is false. */
  retryable?: boolean;
}

/** Every string the panel shows, injected by the consumer (the component carries no copy). */
export interface VoiceSourcesLabels {
  title: string;
  intro: string;
  /** "Found on {domain}". */
  found: string;
  foundFill: string;
  foundNone: string;
  foundUnreachable: string;
  /** Shown while the lookup for the site's articles runs. */
  foundLoading: string;
  notRead: string;
  notReadHint: string;
  restore: (count: number) => string;
  yours: string;
  /** Accessible name of the Link / File / Text tabs. */
  addLabel: string;
  tabLink: string;
  tabFile: string;
  tabText: string;
  willRead: (count: number) => string;
  willReadHomepage: string;
  cancel: string;
  redraft: string;
  draft: string;
  reading: string;
  uploading: string;
  remove: (name: string) => string;
  stopAdding: (name: string) => string;
  retry: string;
  short: string;
  /** Announced after ×: "Removed {name}." */
  removed: (name: string) => string;
  srReady: string;
  pastedText: string;
  words: (count: number) => string;
  pages: (count: number) => string;
  newTab: string;
  linkLabel: string;
  linkPlaceholder: string;
  linkAdd: string;
  linkHint: string;
  linkCount: (count: number, max: number) => string;
  linkInvalid: string;
  linkDuplicate: string;
  linkNotPublic: string;
  linkCap: string;
  fileDropBold: string;
  fileDrop: string;
  fileDropActive: string;
  fileHint: string;
  filePrivacy: string;
  fileCount: (count: number, max: number) => string;
  fileRejectType: (file: string) => string;
  fileRejectSize: (file: string, size: string) => string;
  fileCap: string;
  textLabel: string;
  textPlaceholder: string;
  /** The TextArea counter, "2,384 / 20,000", formatted in the reader's locale. */
  textCounter: (value: string, max: number) => { text: string; over: boolean };
  textMin: string;
  textTooLong: (count: number) => string;
  textAdd: string;
  textCap: string;
  busy: (count: number) => string;
  busyHomepage: string;
  cancelRedraft: string;
  failed: string;
  retryRedraft: string;
  confirmBody: string;
  confirmReplace: string;
  confirmKeep: string;
}

export interface VoiceSourcesProps {
  /** `draft` in a New persona dialog (primary "Draft persona"), `redraft` otherwise. */
  mode: "draft" | "redraft";
  /** The lookup's outcome; absent hides the found group (a persona bound to no site). */
  foundState?: "loading" | "found" | "none" | "unreachable";
  /** Found articles not removed, in order, each `ready` or `notRead` by the five-piece rule. */
  found: VoiceSourceRow[];
  /** Found articles removed in this panel ("Restore n removed"). */
  removedCount: number;
  /** The customer's pieces, in the order added. */
  items: VoiceSourceRow[];
  /** Pieces the draft will read: ready pieces of theirs plus found articles within the five. */
  readingCount: number;
  /** A well-formed, new, public-looking https address; the consumer adds a busy row and reads it. */
  onAddLink: (url: string) => void;
  /** Files that passed the type, size and count checks; the consumer uploads them. */
  onAddFiles: (files: File[]) => void;
  onAddText: (text: string) => void;
  /** × on any row: removes a found article (remembered) or a piece of theirs, or stops a busy one. */
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onRestore: () => void;
  onRedraft: () => void;
  /** Panel Cancel: closes it and drops the changes made since it opened. */
  onCancel: () => void;
  /** Cancel on the busy line: keeps the current version. */
  onCancelRedraft: () => void;
  /** "Replace with a new draft". */
  onConfirm: () => void;
  /** "Keep it as it is" (and Esc). */
  onKeep: () => void;
  /** A redraft is running: the body locks, the footer shows the busy line. */
  busy?: boolean;
  /** The last redraft failed. */
  error?: boolean;
  /** Ask before replacing a hand-written voice. */
  confirm?: boolean;
  /** Inside the editor dialog: no shadow. */
  flat?: boolean;
  /** @defaultValue true — the heading takes focus when the panel opens. */
  focusOnMount?: boolean;
  /** h4 under the wizard step's h3; h3 in the dialog. @defaultValue 4 */
  headingLevel?: 3 | 4;
  labels: VoiceSourcesLabels;
  className?: string;
}

type Tab = "link" | "file" | "text";

/** Returns whether a hostname can only be a private or local address (the server validator decides the rest). */
function isPrivateHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host.endsWith(".internal") || host.startsWith("[")) return true;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/** Returns the address reduced to what makes two links the same page. */
function samePageKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * Returns why a typed address can't be added, or null. Client-side only and
 * never stricter than the server's shared URL validator, which reads the
 * page and has the last word.
 */
function linkProblem(raw: string, known: readonly string[]): "invalid" | "duplicate" | "notPublic" | null {
  if (!/^https:\/\//i.test(raw)) return "invalid";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "invalid";
  }
  const host = url.hostname.toLowerCase();
  if (url.username || url.password || !host.includes(".") || host.endsWith(".")) {
    return isPrivateHost(host) ? "notPublic" : "invalid";
  }
  if (isPrivateHost(host)) return "notPublic";
  const key = samePageKey(raw);
  return known.some((u) => samePageKey(u) === key) ? "duplicate" : null;
}

/** Returns the name a row goes by (accessible names, announcements). */
function rowName(row: VoiceSourceRow, labels: VoiceSourcesLabels): string {
  if (row.kind === "text") return labels.pastedText;
  if ((row.state === "busy" || row.state === "failed") && row.kind === "link" && row.url) {
    return row.url.replace(/^https:\/\//i, "");
  }
  return row.title || (row.url ? row.url.replace(/^https:\/\//i, "") : "");
}

/** `text` with a line-break opportunity after each "." and "/", so a host or URL wraps there on a phone, not mid-word. */
function urlBreaks(text: string): ReactNode[] {
  return text.split(/(?<=[./])/).flatMap((part, i) => (i === 0 ? [part] : [<wbr key={i} />, part]));
}

/**
 * VoiceSources — the "Your writing" panel (handoff persona voice, 4c): what
 * was found on the site, Link / File / Text, what the customer added, and
 * the redraft. Presentational and controlled: the consumer owns the rows
 * (reading links, uploading files, the five-piece rule) and gets every add,
 * removal and action back. Strings are injected.
 */
export function VoiceSources({
  mode,
  foundState,
  found,
  removedCount,
  items,
  readingCount,
  onAddLink,
  onAddFiles,
  onAddText,
  onRemove,
  onRetry,
  onRestore,
  onRedraft,
  onCancel,
  onCancelRedraft,
  onConfirm,
  onKeep,
  busy = false,
  error = false,
  confirm = false,
  flat = false,
  focusOnMount = true,
  headingLevel = 4,
  labels,
  className,
}: VoiceSourcesProps) {
  const ids = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const removeRefs = useRef(new Map<string, HTMLButtonElement>());
  const cancelRedraftRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLElement>(null);
  const redraftRef = useRef<HTMLElement>(null);
  const { announce, region } = useLiveAnnouncer();

  const [tab, setTab] = useState<Tab>("link");
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [rejections, setRejections] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
    // Only when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The body is locked while a redraft runs: still readable, not operable.
  // `inert` is set on the element because React 18 does not know the prop.
  useLayoutEffect(() => {
    bodyRef.current?.toggleAttribute("inert", busy);
  }, [busy]);

  // Focus follows the footer's state (handoff "Announcements and focus").
  useEffect(() => {
    if (busy) cancelRedraftRef.current?.focus();
  }, [busy]);
  useEffect(() => {
    if (error && !busy) retryRef.current?.focus();
  }, [error, busy]);
  // The confirmation takes focus; when it closes on Keep, focus returns to
  // the button that asked for it instead of falling to the page.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirm) keepRef.current?.focus();
    else if (wasConfirming.current && !busy) redraftRef.current?.focus();
    wasConfirming.current = confirm;
  }, [confirm, busy]);

  // After ×: the next row's ×, else the previous one, else the selected tab.
  // After Restore: the first restored row's ×, once the consumer shows it.
  const focusWhenReady = usePendingFocus<{ row: string } | "tab" | { restoredFrom: Set<string> }>(
    (target) => {
      if (target === "tab") {
        return tabsRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      }
      if ("row" in target) return removeRefs.current.get(target.row);
      const first = found.find((row) => !target.restoredFrom.has(row.id));
      return first ? removeRefs.current.get(first.id) : null;
    },
  );

  const counts = {
    link: items.filter((r) => r.kind === "link").length,
    file: items.filter((r) => r.kind === "file").length,
    text: items.filter((r) => r.kind === "text").length,
  };
  const anyBusy = items.some((r) => r.state === "busy");

  const remove = (row: VoiceSourceRow, group: VoiceSourceRow[]) => {
    const i = group.findIndex((r) => r.id === row.id);
    const next = group[i + 1] ?? group[i - 1];
    focusWhenReady(next ? { row: next.id } : "tab");
    announce(labels.removed(rowName(row, labels)));
    onRemove(row.id);
  };

  const addLink = () => {
    const value = link.trim();
    const known = [...found, ...items].flatMap((r) => (r.url ? [r.url] : []));
    const problem = linkProblem(value, known);
    if (problem) {
      setLinkError(
        problem === "invalid"
          ? labels.linkInvalid
          : problem === "duplicate"
            ? labels.linkDuplicate
            : labels.linkNotPublic,
      );
      linkInputRef.current?.focus();
      return;
    }
    setLinkError(null);
    setLink("");
    onAddLink(value);
    linkInputRef.current?.focus();
  };

  const takeFiles = (list: FileList | File[] | null) => {
    const incoming = Array.from(list ?? []);
    if (incoming.length === 0) return;
    const accepted: File[] = [];
    const lines: string[] = [];
    let slots = VOICE_FILES_MAX - counts.file;
    let capShown = false;
    for (const file of incoming) {
      if (!matchesAccept(file, ATTACHMENT_ACCEPT)) {
        lines.push(labels.fileRejectType(file.name));
      } else if (file.size > ATTACHMENT_MAX_SIZE_BYTES) {
        lines.push(labels.fileRejectSize(file.name, formatBytes(file.size)));
      } else if (slots <= 0) {
        // One line however many files spill over the cap.
        if (!capShown) lines.push(labels.fileCap);
        capShown = true;
      } else {
        slots -= 1;
        accepted.push(file);
      }
    }
    // Rejections clear on the next successful add (as in ResearchAttachments).
    setRejections((prev) => (accepted.length > 0 ? lines : [...prev, ...lines]));
    if (accepted.length > 0) onAddFiles(accepted);
  };

  const textLength = text.trim().length;
  const textOver = textLength > VOICE_TEXT_MAX_LENGTH;
  const textUnder = textLength < VOICE_TEXT_MIN_LENGTH;
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const panelId = `${ids}-panel`;

  const renderRow = (row: VoiceSourceRow, group: VoiceSourceRow[]) => {
    const name = rowName(row, labels);
    const domain = row.url ? voiceHost(row.url) : "";
    const web = row.kind === "article" || row.kind === "link";
    const shownName =
      row.url && name === row.url.replace(/^https:\/\//i, "") ? urlBreaks(name) : name;
    const tile =
      row.kind === "file" ? (
        <AttachmentTile density="compact" failed={row.state === "failed"}>
          {(row.ext ?? "").toUpperCase()}
        </AttachmentTile>
      ) : row.kind === "text" ? (
        <AttachmentTile density="compact">
          <TextQuote size={16} />
        </AttachmentTile>
      ) : (
        <AttachmentTile density="compact">
          <Favicon domain={domain} size={16} />
        </AttachmentTile>
      );

    const withRef = (
      <AttachmentIconButton
        label={row.state === "busy" ? labels.stopAdding(name) : labels.remove(name)}
        onClick={() => remove(row, group)}
        danger={row.state !== "busy"}
        buttonRef={(el) => {
          if (el) removeRefs.current.set(row.id, el);
          else removeRefs.current.delete(row.id);
        }}
      >
        <X size={15} aria-hidden="true" />
      </AttachmentIconButton>
    );

    if (row.state === "busy") {
      return (
        <AttachmentRow
          key={row.id}
          state="busy"
          density="compact"
          tile={tile}
          title={shownName}
          titleTooltip={name}
          meta={row.kind === "file" ? labels.uploading : labels.reading}
          actions={withRef}
        />
      );
    }
    if (row.state === "failed") {
      return (
        <AttachmentRow
          key={row.id}
          state="failed"
          density="compact"
          tile={tile}
          title={shownName}
          titleTooltip={name}
          meta={row.error}
          actions={
            <>
              {row.retryable === false ? null : (
                <AttachmentRetryButton label={`${labels.retry}: ${name}`} onClick={() => onRetry(row.id)}>
                  <RefreshCw size={12} aria-hidden="true" />
                  {labels.retry}
                </AttachmentRetryButton>
              )}
              {withRef}
            </>
          }
        />
      );
    }

    const notRead = row.state === "notRead";
    const details =
      row.kind === "file"
        ? row.pages
          ? labels.pages(row.pages)
          : row.sizeBytes
            ? formatBytes(row.sizeBytes)
            : row.words
              ? labels.words(row.words)
              : ""
        : row.kind === "text"
          ? labels.words(row.words ?? 0)
          : (
              <>
                {urlBreaks(domain)}
                {domain && row.words ? " · " : null}
                {row.words ? labels.words(row.words) : null}
              </>
            );
    return (
      <AttachmentRow
        key={row.id}
        state="ready"
        density="compact"
        muted={notRead}
        tile={tile}
        title={
          web && row.url ? (
            <a
              href={row.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-current/30 underline-offset-3 hover:decoration-current"
            >
              {shownName}
              <ExternalLink
                size={11}
                aria-hidden="true"
                className="ml-[3px] inline align-[-1px] text-neutral-500 dark:text-neutral-400"
              />
              <span className="sr-only"> {labels.newTab}</span>
            </a>
          ) : (
            name
          )
        }
        titleTooltip={name}
        meta={
          notRead ? (
            <>
              {/* The gap sits after the text, not before the tag, so a tag
                  that wraps to its own line (de, fr) starts flush left. */}
              <span className="mr-1.5">{details}</span>
              <span
                title={labels.notReadHint}
                aria-description={labels.notReadHint}
                className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 align-[1px] text-[10.5px] font-semibold leading-snug whitespace-nowrap text-neutral-600 ring-1 ring-inset ring-neutral-200 dark:bg-white/[.06] dark:text-neutral-300 dark:ring-neutral-700"
              >
                <Minus size={11} aria-hidden="true" />
                {labels.notRead}
              </span>
            </>
          ) : (
            details
          )
        }
        note={
          row.state === "ready" && row.words !== undefined && row.words < SHORT_PIECE_WORDS
            ? labels.short
            : undefined
        }
        actions={
          <>
            {row.kind !== "article" && row.state === "ready" ? (
              <AttachmentReadyDisc label={labels.srReady} />
            ) : null}
            {withRef}
          </>
        }
      />
    );
  };

  const rowList = (group: VoiceSourceRow[]) => (
    <div
      aria-live="polite"
      className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900"
    >
      {group.map((row) => renderRow(row, group))}
    </div>
  );

  const groupHeading = (id: string, label: string, count?: number, end?: ReactNode) => (
    <div className="mb-2 flex flex-wrap items-baseline gap-2">
      <span
        id={id}
        className="text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-400"
      >
        {label}
      </span>
      {count ? (
        <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">{count}</span>
      ) : null}
      {end}
    </div>
  );

  const capStrip = (message: string) => (
    <div className="flex items-center justify-center gap-2 rounded-xl bg-neutral-50 px-4 py-2.5 text-center text-xs font-medium text-neutral-600 ring-1 ring-inset ring-neutral-200 dark:bg-neutral-950/40 dark:text-neutral-300 dark:ring-neutral-800">
      <CheckCheck size={14} aria-hidden="true" className="shrink-0 text-neutral-500 dark:text-neutral-400" />
      {message}
    </div>
  );

  const foundGroup =
    foundState === undefined ? null : (
      <section aria-labelledby={`${ids}-found`}>
        {groupHeading(
          `${ids}-found`,
          labels.found,
          foundState === "found" ? found.length : undefined,
          foundState === "found" && removedCount > 0 ? (
            <button
              type="button"
              onClick={() => {
                focusWhenReady({ restoredFrom: new Set(found.map((r) => r.id)) });
                onRestore();
              }}
              className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded text-xs font-bold text-brand-600 underline-offset-3 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:text-brand-400"
            >
              <RotateCcw size={13} aria-hidden="true" />
              {labels.restore(removedCount)}
            </button>
          ) : null,
        )}
        {foundState === "loading" ? (
          <StatusLine tone="busy" className="text-xs">
            {labels.foundLoading}
          </StatusLine>
        ) : foundState === "none" || foundState === "unreachable" ? (
          <p className="m-0! text-xs leading-normal text-neutral-500 dark:text-neutral-400">
            {foundState === "none" ? labels.foundNone : labels.foundUnreachable}
          </p>
        ) : found.length > 0 ? (
          <>
            <p className="m-0! -mt-0.5 mb-2 text-xs leading-normal text-neutral-500 dark:text-neutral-400">
              {labels.foundFill}
            </p>
            {rowList(found)}
          </>
        ) : null}
      </section>
    );

  const linkHintId = `${ids}-link-hint`;
  const linkBox =
    counts.link >= VOICE_LINKS_MAX ? (
      capStrip(labels.linkCap)
    ) : (
      <>
        <div className="flex items-end gap-2 max-sm:flex-col max-sm:items-stretch">
          <div className="min-w-0 flex-1">
            <InputField
              ref={linkInputRef}
              label={labels.linkLabel}
              type="url"
              inputMode="url"
              placeholder={labels.linkPlaceholder}
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                if (linkError) setLinkError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addLink();
                }
              }}
              invalid={!!linkError}
              aria-describedby={linkHintId}
              className={linkError ? formFieldGroupVariants({ intent: "error" }) : undefined}
            />
          </div>
          <Button type="button" variant="secondary" onClick={addLink} className="max-sm:min-h-11">
            <Plus aria-hidden="true" />
            {labels.linkAdd}
          </Button>
        </div>
        <div
          id={linkHintId}
          className="mt-1.5 flex items-start justify-between gap-3 text-xs leading-normal text-neutral-500 dark:text-neutral-400"
        >
          {linkError ? (
            <span role="alert" className="flex gap-1.5 font-medium text-red-600 dark:text-red-400">
              <CircleAlert size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
              {linkError}
            </span>
          ) : (
            <span>{labels.linkHint}</span>
          )}
          <span className="shrink-0 tabular-nums">{labels.linkCount(counts.link, VOICE_LINKS_MAX)}</span>
        </div>
      </>
    );

  const openPicker = () => fileInputRef.current?.click();
  const fileBox = (
    <>
      {counts.file >= VOICE_FILES_MAX ? (
        capStrip(labels.fileCap)
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={openPicker}
          onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openPicker();
            }
          }}
          onDragOver={(e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setDragging(false);
            takeFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-5 text-center transition-colors outline-none focus-visible:shadow-glow-brand focus-visible:ring-2 focus-visible:ring-brand-500/40",
            dragging
              ? "border-brand-400 bg-brand-50/70 dark:border-brand-500 dark:bg-brand-500/10"
              : "border-neutral-300 bg-neutral-50/60 hover:border-brand-300 hover:bg-brand-50/40 dark:border-neutral-700 dark:bg-white/[.02] dark:hover:border-brand-500/60 dark:hover:bg-brand-500/[.06]",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex size-9 items-center justify-center rounded-full",
              dragging
                ? "bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300"
                : "bg-neutral-100 text-neutral-400 dark:bg-white/[.06] dark:text-neutral-500",
            )}
          >
            {dragging ? <FileDown size={18} /> : <CloudUpload size={18} />}
          </span>
          <p className="m-0! text-[13px] font-medium text-neutral-600 dark:text-neutral-300">
            {dragging ? (
              labels.fileDropActive
            ) : (
              <>
                <span className="font-bold text-brand-600 dark:text-brand-400">{labels.fileDropBold}</span>{" "}
                {labels.fileDrop}
              </>
            )}
          </p>
          <p className="m-0! text-[11.5px] text-neutral-500 dark:text-neutral-400">{labels.fileHint}</p>
        </div>
      )}
      {rejections.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {rejections.map((message, i) => (
            <p
              key={`${message}-${i}`}
              role="alert"
              className="m-0! flex items-start gap-1.5 text-xs font-medium leading-normal text-red-600 dark:text-red-400"
            >
              <CircleAlert size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>{message}</span>
            </p>
          ))}
        </div>
      ) : null}
      <div className="mt-2.5 flex items-start justify-between gap-3 text-[11.5px] leading-normal text-neutral-500 dark:text-neutral-400">
        <p className="m-0! flex items-start gap-1.5 text-pretty">
          <Lock size={13} aria-hidden="true" className="mt-px shrink-0" />
          <span>{labels.filePrivacy}</span>
        </p>
        {counts.file > 0 ? (
          <span className="shrink-0 tabular-nums">{labels.fileCount(counts.file, VOICE_FILES_MAX)}</span>
        ) : null}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          takeFiles(e.target.files);
          // Reset so picking the same file again fires change.
          e.target.value = "";
        }}
      />
    </>
  );

  const textCounter = labels.textCounter(text, VOICE_TEXT_MAX_LENGTH);
  const textBox =
    counts.text >= 1 ? (
      capStrip(labels.textCap)
    ) : (
      <>
        <TextArea
          label={labels.textLabel}
          placeholder={labels.textPlaceholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          counter={textCounter}
          error={textOver ? labels.textTooLong(textLength) : undefined}
          description={!textOver && textUnder ? labels.textMin : undefined}
        />
        <div className="mt-2.5 flex justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={textUnder || textOver}
            onClick={() => {
              onAddText(text);
              setText("");
            }}
          >
            <Plus aria-hidden="true" />
            {labels.textAdd}
          </Button>
        </div>
      </>
    );

  const tabLabel = tab === "link" ? labels.tabLink : tab === "file" ? labels.tabFile : labels.tabText;
  const addControl = (
    <div>
      <div ref={tabsRef}>
        <Tabs
          aria-label={labels.addLabel}
          value={tab}
          onChange={(id) => setTab(id as Tab)}
          // Equal cells under 600px; icons go under 400px so the three
          // labels fit at +40% (handoff 4c "Tabs").
          className="max-sm:flex max-sm:w-full max-sm:[&>button]:flex-1 max-sm:[&>button]:justify-center max-[399.98px]:[&_[aria-hidden=true]]:hidden"
          items={[
            {
              id: "link",
              label: labels.tabLink,
              icon: <Link2 />,
              badge: counts.link ? String(counts.link) : undefined,
              badgeTone: "neutral",
              controls: panelId,
            },
            {
              id: "file",
              label: labels.tabFile,
              icon: <FileText />,
              badge: counts.file ? String(counts.file) : undefined,
              badgeTone: "neutral",
              controls: panelId,
            },
            {
              id: "text",
              label: labels.tabText,
              icon: <TextQuote />,
              badge: counts.text ? String(counts.text) : undefined,
              badgeTone: "neutral",
              controls: panelId,
            },
          ]}
        />
      </div>
      <div id={panelId} role="tabpanel" aria-label={tabLabel} className="mt-3">
        {tab === "link" ? linkBox : tab === "file" ? fileBox : textBox}
      </div>
    </div>
  );

  const yoursGroup =
    items.length > 0 ? (
      <section aria-labelledby={`${ids}-yours`}>
        {groupHeading(`${ids}-yours`, labels.yours, items.length)}
        {rowList(items)}
      </section>
    ) : null;

  // The busy and the failed line are keyed apart: reconciled in place, the
  // focused Cancel turned into Try again without a focus move, so nothing
  // scrolled it into view or announced it (2026-11-14, editor dialog).
  let footer: ReactNode;
  if (busy) {
    footer = (
      <StatusLine
        key="busy"
        tone="busy"
        action={{ label: labels.cancelRedraft, onClick: onCancelRedraft, buttonRef: cancelRedraftRef }}
      >
        {readingCount > 0 ? labels.busy(readingCount) : labels.busyHomepage}
      </StatusLine>
    );
  } else if (confirm) {
    footer = (
      <Alert
        variant="warning"
        role="group"
        aria-labelledby={`${ids}-confirm`}
        className="basis-full px-3.5 py-3 text-[13px] leading-normal shadow-none [&>svg]:size-4"
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Escape") {
            // Keep, and stop the dialog around the panel from closing too.
            e.stopPropagation();
            onKeep();
          }
        }}
      >
        <CircleAlert aria-hidden="true" />
        <p id={`${ids}-confirm`} className="m-0!">
          {labels.confirmBody}
        </p>
        <div className="mt-2.5 flex flex-wrap justify-end gap-2">
          <Button ref={keepRef} type="button" variant="secondary" size="sm" onClick={onKeep}>
            {labels.confirmKeep}
          </Button>
          <Button type="button" size="sm" onClick={onConfirm}>
            {labels.confirmReplace}
          </Button>
        </div>
      </Alert>
    );
  } else {
    footer = (
      <>
        {error ? (
          <StatusLine
            key="error"
            tone="error"
            className="min-w-[200px] flex-1 max-sm:min-w-0"
            action={{ label: labels.retryRedraft, onClick: onRedraft, icon: "retry", buttonRef: retryRef }}
          >
            {labels.failed}
          </StatusLine>
        ) : (
          <p className="m-0! flex min-w-[200px] flex-1 items-start gap-1.5 text-[12.5px] leading-snug text-neutral-600 max-sm:min-w-0 dark:text-neutral-300">
            <BookOpenText
              size={14}
              aria-hidden="true"
              className="mt-px shrink-0 text-neutral-500 dark:text-neutral-400"
            />
            <span>{readingCount > 0 ? labels.willRead(readingCount) : labels.willReadHomepage}</span>
          </p>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          className="max-sm:order-2 max-sm:min-h-11 max-sm:w-full"
        >
          {labels.cancel}
        </Button>
        <Button
          ref={redraftRef}
          type="button"
          onClick={onRedraft}
          disabled={anyBusy}
          className="max-sm:order-1 max-sm:min-h-11 max-sm:w-full"
        >
          <WandSparkles aria-hidden="true" />
          {mode === "draft" ? labels.draft : labels.redraft}
        </Button>
      </>
    );
  }

  return (
    <Card
      className={cn("p-0", flat && "shadow-none dark:ring-0", className)}
      aria-labelledby={`${ids}-title`}
      role="region"
    >
      <div className="flex items-start gap-3 border-b border-neutral-100 px-5 pt-[18px] pb-3.5 max-sm:px-4 dark:border-neutral-800">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-neutral-100 text-neutral-500 dark:bg-white/[.06] dark:text-neutral-400"
        >
          <PenLine size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <Heading
            ref={headingRef}
            id={`${ids}-title`}
            tabIndex={-1}
            className="m-0! text-[15px] font-bold tracking-tight text-neutral-900 outline-none dark:text-white"
          >
            {labels.title}
          </Heading>
          <p className="m-0! mt-0.5 text-pretty text-[12.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            {labels.intro}
          </p>
        </div>
      </div>
      <div
        ref={bodyRef}
        aria-disabled={busy || undefined}
        className={cn(
          "flex flex-col gap-5 px-5 pt-4 pb-5 transition-opacity duration-normal max-sm:px-4",
          busy && "opacity-55",
        )}
      >
        {foundGroup}
        {addControl}
        {yoursGroup}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 px-5 py-3.5 max-sm:flex-col max-sm:items-stretch max-sm:px-4 dark:border-neutral-800">
        {footer}
      </div>
      {region}
    </Card>
  );
}
