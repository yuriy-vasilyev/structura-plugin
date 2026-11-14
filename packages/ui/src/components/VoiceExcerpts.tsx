import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Trash2, Undo2, X } from "lucide-react";
import type { VoiceSample, VoiceSourceRef } from "@structura/types";
import { cn } from "../utils";
import { useLiveAnnouncer } from "./LiveAnnouncer";
import { usePendingFocus } from "./PendingFocus";
import { KIND_ICON } from "./voiceKindIcon";

/** Every string {@link VoiceExcerpts} shows, injected by the consumer. */
export interface VoiceExcerptsLabels {
  title: string;
  help: string;
  /** "From {source}": wraps the source node (a link for web pages) in the localized sentence. */
  from: (source: ReactNode) => ReactNode;
  more: string;
  less: string;
  /** Accessible name and tooltip of ×: "Remove excerpt from {source}". */
  remove: (source: string) => string;
  /** "Excerpt removed." — the row left in place, and what is announced. */
  removed: string;
  undo: string;
  /** Shown when the persona keeps no excerpts. */
  none: string;
  pastedText: string;
  newTab: string;
}

export interface VoiceExcerptsProps {
  samples: VoiceSample[];
  /** Indexes removed in this session; each stays in its slot with Undo until the dialog saves. */
  removed: ReadonlySet<number>;
  onRemove: (index: number) => void;
  onUndo: (index: number) => void;
  /** The sub-heading level. @defaultValue 4 */
  headingLevel?: 3 | 4;
  labels: VoiceExcerptsLabels;
  className?: string;
}

/** Returns the name an excerpt's source goes by. */
function sourceName(source: VoiceSourceRef, labels: VoiceExcerptsLabels): string {
  if (source.kind === "file") return source.name;
  if (source.kind === "text") return labels.pastedText;
  return source.title || source.url;
}

/**
 * VoiceExcerpts — the style excerpts a persona keeps (handoff persona voice,
 * 2b and 4d). Each is quoted with where it came from, four lines by default
 * with "Show all" only when the text is actually clamped. × leaves an
 * "Excerpt removed. Undo" row in the same slot; the removal is saved with
 * the dialog. Removable, never editable.
 */
export function VoiceExcerpts({
  samples,
  removed,
  onRemove,
  onUndo,
  headingLevel = 4,
  labels,
  className,
}: VoiceExcerptsProps) {
  const { announce, region } = useLiveAnnouncer();
  const undoRefs = useRef(new Map<number, HTMLButtonElement>());
  const removeRefs = useRef(new Map<number, HTMLButtonElement>());
  // The row's Undo, or its × again, once the consumer has re-rendered it.
  const focusWhenReady = usePendingFocus<{ index: number; target: "undo" | "remove" }>(
    ({ index, target }) => (target === "undo" ? undoRefs.current : removeRefs.current).get(index),
  );

  const kept = samples.length - samples.filter((_, i) => removed.has(i)).length;
  const Heading = headingLevel === 3 ? "h3" : "h4";

  return (
    <div className={className}>
      <Heading className="m-0! mb-0.5 flex items-baseline gap-2 text-[13px] font-bold text-neutral-900 dark:text-white">
        {labels.title}
        {kept > 0 ? (
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{kept}</span>
        ) : null}
      </Heading>
      <p className="m-0! mb-2.5 text-pretty text-xs leading-normal text-neutral-500 dark:text-neutral-400">
        {labels.help}
      </p>
      {samples.length === 0 ? (
        <p className="m-0! rounded-xl border border-dashed border-neutral-300 px-3.5 py-3 text-[12.5px] leading-normal text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          {labels.none}
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {samples.map((sample, index) =>
            removed.has(index) ? (
              <div
                key={index}
                className="flex items-center gap-2.5 rounded-xl border border-dashed border-neutral-300 px-3.5 py-2.5 text-[12.5px] text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
              >
                <Trash2 size={14} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0 flex-1">{labels.removed}</span>
                <button
                  ref={(el) => {
                    if (el) undoRefs.current.set(index, el);
                    else undoRefs.current.delete(index);
                  }}
                  type="button"
                  onClick={() => {
                    focusWhenReady({ index, target: "remove" });
                    onUndo(index);
                  }}
                  className="inline-flex cursor-pointer items-center gap-1 rounded text-xs font-bold text-brand-600 underline-offset-3 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:text-brand-400"
                >
                  <Undo2 size={13} aria-hidden="true" />
                  {labels.undo}
                </button>
              </div>
            ) : (
              <Excerpt
                key={index}
                sample={sample}
                labels={labels}
                removeRef={(el) => {
                  if (el) removeRefs.current.set(index, el);
                  else removeRefs.current.delete(index);
                }}
                onRemove={() => {
                  focusWhenReady({ index, target: "undo" });
                  announce(labels.removed);
                  onRemove(index);
                }}
              />
            ),
          )}
        </div>
      )}
      {region}
    </div>
  );
}

function Excerpt({
  sample,
  labels,
  onRemove,
  removeRef,
}: {
  sample: VoiceSample;
  labels: VoiceExcerptsLabels;
  onRemove: () => void;
  removeRef: (el: HTMLButtonElement | null) => void;
}) {
  const quoteId = useId();
  const quoteRef = useRef<HTMLQuoteElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const name = sourceName(sample.source, labels);
  const KindIcon = KIND_ICON[sample.source.kind];
  const url =
    sample.source.kind === "article" || sample.source.kind === "link" ? sample.source.url : null;

  // "Show all" only when the four-line clamp actually cuts the text; measured
  // while collapsed, and again when the width changes.
  useLayoutEffect(() => {
    const el = quoteRef.current;
    if (!el || expanded) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, sample.text]);

  return (
    <figure className="m-0 min-w-0 rounded-xl border border-neutral-200 bg-white p-3.5 pb-2.5 dark:border-neutral-700 dark:bg-neutral-900">
      <blockquote
        ref={quoteRef}
        id={quoteId}
        className={cn(
          "m-0 border-l-[3px] border-neutral-300 pl-3.5 text-[13px] leading-[1.6] text-neutral-600 dark:border-neutral-700 dark:text-neutral-300",
          expanded ? "whitespace-pre-line" : "line-clamp-4",
        )}
      >
        {/* Collapsed, the paragraphs run on as one block; expanded keeps the breaks. */}
        {expanded ? sample.text : sample.text.replace(/\s*\n+\s*/g, " ")}
      </blockquote>
      <figcaption className="mt-2 flex min-w-0 items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          <KindIcon size={13} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 truncate">
            {labels.from(
              url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-current/35 underline-offset-2"
                >
                  {name}
                  <span className="sr-only"> {labels.newTab}</span>
                </a>
              ) : (
                name
              ),
            )}
          </span>
        </span>
        {clamped || expanded ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={quoteId}
            onClick={() => setExpanded((on) => !on)}
            className="shrink-0 cursor-pointer rounded text-xs font-bold text-brand-600 underline-offset-3 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:text-brand-400"
          >
            {expanded ? labels.less : labels.more}
          </button>
        ) : null}
        <button
          ref={removeRef}
          type="button"
          aria-label={labels.remove(name)}
          title={labels.remove(name)}
          onClick={onRemove}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[7px] text-neutral-400 transition-colors outline-none hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:text-neutral-500 dark:hover:bg-red-950/30 dark:hover:text-red-400"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </figcaption>
    </figure>
  );
}
