import { useId, type ReactNode, type Ref } from "react";
import {
  Building2,
  ExternalLink,
  House,
  Newspaper,
  PenLine,
  Pencil,
  Plus,
  type LucideIcon,
} from "lucide-react";
import type { VoiceDraftBasis, VoiceSourceRef } from "@structura/types";
import { cn } from "../utils";
import { Button } from "./Button";
import { KIND_ICON } from "./voiceKindIcon";

/**
 * Every string {@link VoiceBasis} shows, injected by the consumer: the
 * portal and wp-admin localize differently, so the component carries none.
 * Functions take the value they interpolate.
 */
export interface VoiceBasisLabels {
  /** "What {name} is based on" (wizard overline). */
  overline: (personaName: string) => string;
  /** "Based on {count} of your articles": only articles from the site were read. */
  articles: (count: number) => string;
  /** "Based on {count} pieces of your writing": anything the customer added was read. */
  writing: (count: number) => string;
  homepage: string;
  profile: string;
  /** Body when writing was read (the privacy promise). */
  howWriting: string;
  howHomepage: (domain: string) => string;
  howProfile: (domain: string) => string;
  /** "Drafted {date}", the date formatted in the reader's locale. */
  draftedOn: (date: Date) => string;
  add: string;
  change: string;
  /** Accessible name of Change: "Change what {name} is based on". */
  changeLabel: (personaName: string) => string;
  pastedText: string;
  words: (count: number) => string;
  pages: (count: number) => string;
  fileDeleted: string;
  /** Visually hidden suffix of every external link, "(opens in a new tab)". */
  newTab: string;
}

export interface VoiceBasisProps {
  /** `line`: one muted line (persona card). `list`: the block with what was read (wizard, editor). */
  variant: "list" | "line";
  basis: VoiceDraftBasis;
  /** What the draft read, in reading order (`voiceSources`). */
  items?: VoiceSourceRef[];
  /** Host the draft looked at, for the homepage and business-details sentences. */
  domain?: string;
  /** Names the overline and the Change action's accessible name. */
  personaName?: string;
  /** @defaultValue true — the editor hides it (the dialog already names the persona). */
  showOverline?: boolean;
  /** "· Drafted {date}" after the title (editor). */
  draftedAt?: Date;
  /** `change` (transparent, pencil) when writing was read; `add` (secondary, plus) otherwise. */
  action?: "add" | "change";
  onAction?: () => void;
  /** The action button, for returning focus to it when the panel it opened is cancelled. */
  actionRef?: Ref<HTMLElement>;
  /** One status line above the overline (busy, done with Undo, restored). */
  status?: ReactNode;
  /** h4 under the wizard step's h3; h3 in the editor dialog. @defaultValue 4 */
  headingLevel?: 3 | 4;
  /** Clock for the expired-upload test; defaults to now. */
  now?: number;
  labels: VoiceBasisLabels;
  className?: string;
}

/** Returns the summary every surface shares: its icon and its title. */
export function voiceBasisSummary(
  basis: VoiceDraftBasis,
  items: readonly VoiceSourceRef[],
  labels: Pick<VoiceBasisLabels, "articles" | "writing" | "homepage" | "profile">,
): { icon: LucideIcon; title: string } {
  if (basis === "homepage") return { icon: House, title: labels.homepage };
  if (basis === "profile") return { icon: Building2, title: labels.profile };
  const onlyArticles = items.every((item) => item.kind === "article");
  return onlyArticles
    ? { icon: Newspaper, title: labels.articles(items.length) }
    : { icon: PenLine, title: labels.writing(items.length) };
}

/** Returns the host of a web address without `www.`, or the address when it does not parse. */
export function voiceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Returns an item's title and meta for the list. */
function describe(item: VoiceSourceRef, labels: VoiceBasisLabels, now: number) {
  switch (item.kind) {
    case "article":
    case "link":
      return { title: item.title || item.url, meta: voiceHost(item.url) };
    case "file": {
      const deleted = Date.parse(item.expiresAt) <= now;
      const meta = deleted
        ? labels.fileDeleted
        : item.pages
          ? labels.pages(item.pages)
          : item.words
            ? labels.words(item.words)
            : undefined;
      return { title: item.name, meta };
    }
    case "text":
      return { title: labels.pastedText, meta: labels.words(item.words) };
  }
}

/**
 * VoiceBasis — "what this voice is based on" (handoff persona voice, 4a).
 * One component, one summary everywhere: `line` on the persona card, `list`
 * in the wizard and the editor, where it adds what we did, the privacy
 * promise, the list of what was read and the action to change it.
 * Presentational: strings in `labels`, the action in `onAction`.
 */
export function VoiceBasis({
  variant,
  basis,
  items = [],
  domain = "",
  personaName = "",
  showOverline = true,
  draftedAt,
  action,
  onAction,
  actionRef,
  status,
  headingLevel = 4,
  now = Date.now(),
  labels,
  className,
}: VoiceBasisProps) {
  const headingId = useId();
  const { icon: Icon, title } = voiceBasisSummary(basis, items, labels);

  if (variant === "line") {
    return (
      <p
        className={cn(
          "m-0! mt-2.5 flex items-center gap-1.5 text-[11.5px] font-medium leading-snug text-neutral-500 dark:text-neutral-400",
          className,
        )}
      >
        <Icon size={13} aria-hidden="true" className="shrink-0" />
        <span className="min-w-0">{title}</span>
      </p>
    );
  }

  const body =
    basis === "homepage"
      ? labels.howHomepage(domain)
      : basis === "profile"
        ? labels.howProfile(domain)
        : labels.howWriting;
  const Heading = headingLevel === 3 ? "h3" : "h4";

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "min-w-0 rounded-2xl border border-neutral-200 bg-neutral-50 px-[18px] py-4 max-sm:p-3.5 dark:border-neutral-800 dark:bg-neutral-950/40",
        className,
      )}
    >
      {status ? (
        <div className="mb-3 border-b border-neutral-100 pb-3 dark:border-neutral-800">{status}</div>
      ) : null}
      {showOverline && personaName ? (
        <span className="mb-2.5 block text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
          {labels.overline(personaName)}
        </span>
      ) : null}
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-white text-brand-600 ring-1 ring-inset ring-neutral-200 dark:bg-neutral-900 dark:text-brand-400 dark:ring-neutral-800"
        >
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <Heading
            id={headingId}
            className="m-0! text-sm font-bold leading-snug text-neutral-900 dark:text-white"
          >
            {title}
            {draftedAt ? (
              <span className="ml-1.5 whitespace-nowrap text-xs font-medium text-neutral-500 dark:text-neutral-400">
                · {labels.draftedOn(draftedAt)}
              </span>
            ) : null}
          </Heading>
          <p className="m-0! mt-0.5 text-pretty text-[12.5px] leading-relaxed text-neutral-600 dark:text-neutral-300">
            {body}
          </p>
        </div>
      </div>

      {items.length > 0 ? (
        <ul aria-label={title} className="m-0 mt-3 ml-11 flex list-none flex-col p-0 max-sm:ml-0">
          {items.map((item, i) => {
            const KindIcon = KIND_ICON[item.kind];
            const { title: itemTitle, meta } = describe(item, labels, now);
            const url = item.kind === "article" || item.kind === "link" ? item.url : null;
            return (
              <li
                key={i}
                className="flex min-w-0 items-start gap-2.5 border-t border-neutral-100 py-[7px] first:border-t-0 first:pt-0.5 dark:border-neutral-800"
              >
                <KindIcon
                  size={14}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-neutral-500 dark:text-neutral-400"
                />
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-px max-sm:flex-col max-sm:items-start">
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] font-semibold leading-snug text-neutral-900 underline decoration-current/30 underline-offset-3 hover:decoration-current dark:text-white"
                    >
                      {itemTitle}
                      <ExternalLink
                        size={11}
                        aria-hidden="true"
                        className="ml-[3px] inline align-[-1px] text-neutral-500 dark:text-neutral-400"
                      />
                      <span className="sr-only"> {labels.newTab}</span>
                    </a>
                  ) : (
                    <span className="text-[13px] font-semibold leading-snug text-neutral-900 dark:text-white">
                      {itemTitle}
                    </span>
                  )}
                  {meta ? (
                    <span className="whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
                      {meta}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {action ? (
        <div className="mt-3.5 ml-11 flex flex-wrap gap-2 max-sm:ml-0">
          {action === "add" ? (
            <Button ref={actionRef} type="button" variant="secondary" size="sm" onClick={onAction}>
              <Plus aria-hidden="true" />
              {labels.add}
            </Button>
          ) : (
            <Button
              ref={actionRef}
              type="button"
              variant="transparent"
              size="sm"
              onClick={onAction}
              aria-label={labels.changeLabel(personaName)}
            >
              <Pencil aria-hidden="true" />
              {labels.change}
            </Button>
          )}
        </div>
      ) : null}
    </section>
  );
}
