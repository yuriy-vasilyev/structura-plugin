import { useId, useState, type ReactNode } from "react";
import { Copy, Search, Trash2, Type, X } from "lucide-react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { InputField } from "./InputField";
import { PaletteSwatches } from "./PaletteSwatches";
import { Skeleton } from "./Skeleton";

// The Visuals page's "Switch preset" popup (owner-approved design,
// 2026-11-21), shared by the customer portal and wp-admin. Surface-neutral:
// no i18n, no data fetching, tokens only. No <p>, <ul> or <li>: the dialog
// portals out of the plugin's root, where wp-admin's unlayered `p` and `li`
// margins beat layered utilities (the KeywordBankList rule).

/** One preset in {@link PresetLibraryDialog}, already in display words. */
export interface PresetLibraryRow {
  /** The preset's id, passed back to the row's actions. */
  id: string;
  /** Preset name, the first line. */
  name: string;
  /** A curated signature's small thumbnail. Absent: a neutral tile with a text icon. */
  thumbnailSrc?: string;
  /** `srcset` for the thumbnail, with density descriptors (`"…-640.webp 1x, …-1280.webp 2x"`). */
  thumbnailSrcSet?: string;
  /** The look's name, the second line ("Editorial reportage", "Free prompt"). */
  look: string;
  /** Brand palette, drawn as swatches after the look; absent or empty draws none. */
  palette?: string[];
  /** Where the preset is used, the third line ("Used by a.com", "Not used · edited Sep 12"). */
  usage: string;
  /** Text the search matches besides the name, such as the names of the sites using it. */
  searchText?: string;
  /** Shows the delete action on this row. */
  canDelete?: boolean;
}

/** A row action of {@link PresetLibraryDialog}. */
export type PresetLibraryAction = "use" | "duplicate" | "delete";

/** The words of {@link PresetLibraryDialog}; the surface translates them. */
export interface PresetLibraryDialogLabels {
  /** Dialog title ("Switch preset"). */
  title: string;
  /** Accessible name of the close button. */
  close: string;
  /** The search field's placeholder and accessible name. */
  search: string;
  /** A row's primary action ("Use here"). */
  useHere: string;
  /** A row's copy action ("Duplicate"). */
  duplicate: string;
  /** Accessible name of the delete button; needed when a row has `canDelete`. */
  delete?: string;
  /** Accessible name of a row's palette swatches. */
  palette: string;
  /** Shown when there is no preset to list. */
  empty: string;
  /** Shown when the search matches no row. */
  noMatches: string;
  /** Shown when the list could not be loaded; needed when `error` can be set. */
  loadError?: string;
  /** The load error's retry button; needed with `onRetry`. */
  retry?: string;
}

/** Props for {@link PresetLibraryDialog}. */
export interface PresetLibraryDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Close button, Escape and a click outside. */
  onClose: () => void;
  /** The presets to list, in display order. */
  rows: PresetLibraryRow[];
  /** The list is loading: skeleton rows in its place. Wins over `error`. */
  loading?: boolean;
  /** The list could not be loaded: the error line and a retry in its place. */
  error?: boolean;
  /** The error line's retry. */
  onRetry?: () => void;
  /** A row's "Use here", with its id. */
  onUse: (id: string) => void;
  /** A row's "Duplicate", with its id. */
  onDuplicate: (id: string) => void;
  /** A deletable row's delete, with its id. */
  onDelete?: (id: string) => void;
  /** The action in flight: its button shows loading and every other action is disabled. */
  pending?: { id: string; action: PresetLibraryAction } | null;
  /** Content under the list, end-aligned, such as a link to the library page. */
  footer?: ReactNode;
  /** The dialog's words. */
  labels: PresetLibraryDialogLabels;
}

/**
 * PresetLibraryDialog: picks another visual preset from the workspace
 * library for this site. A title with a close button, a search over the
 * preset names (and each row's `searchText`), and a scrolling list of rows:
 * thumbnail, name, look with palette swatches and usage, then "Use here",
 * "Duplicate" and, where allowed, delete. While `loading` the list shows
 * skeleton rows; on `error`, a line with a retry. The search starts empty
 * each time the dialog opens.
 */
export function PresetLibraryDialog({
  open,
  onClose,
  rows,
  loading = false,
  error = false,
  onRetry,
  onUse,
  onDuplicate,
  onDelete,
  pending = null,
  footer,
  labels,
}: PresetLibraryDialogProps) {
  const [query, setQuery] = useState("");
  // Reset on opening rather than on closing, during render: the closing
  // fade keeps the filtered list, and the first frame after opening is clean.
  const [openedFor, setOpenedFor] = useState(open);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open) setQuery("");
  }

  const needle = query.trim().toLocaleLowerCase();
  const shown = needle
    ? rows.filter(
        (row) =>
          row.name.toLocaleLowerCase().includes(needle) ||
          (row.searchText ?? "").toLocaleLowerCase().includes(needle)
      )
    : rows;

  const body = loading ? (
    <div aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <SkeletonRow key={index} />
      ))}
    </div>
  ) : error ? (
    <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center">
      <span className="text-[13px] text-neutral-600 dark:text-neutral-300">{labels.loadError}</span>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {labels.retry}
        </Button>
      )}
    </div>
  ) : rows.length === 0 ? (
    <div className="py-8 text-center text-[13px] text-neutral-500 dark:text-neutral-400">
      {labels.empty}
    </div>
  ) : shown.length === 0 ? (
    <div role="status" className="py-8 text-center text-[13px] text-neutral-500 dark:text-neutral-400">
      {labels.noMatches}
    </div>
  ) : (
    <div role="list">
      {shown.map((row) => (
        <PresetRow
          key={row.id}
          row={row}
          labels={labels}
          pending={pending}
          onUse={onUse}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      ))}
    </div>
  );

  return (
    <Dialog.Root open={open} onClose={onClose} size="lg">
      {/* The list scrolls; the title, the search and the footer stay put.
          Anchored to the top, so a search or the first load moves only the
          bottom edge instead of re-centring the panel on every keystroke. */}
      <Dialog.Content className="flex max-h-[calc(100dvh-2rem)] flex-col self-start max-sm:px-4 max-sm:py-5 sm:mt-[8dvh] sm:max-h-[calc(92dvh-2rem)]">
        <div className="flex shrink-0 items-center justify-between gap-3">
          <Dialog.Title>{labels.title}</Dialog.Title>
          <Button
            variant="transparent"
            size="icon"
            onClick={onClose}
            aria-label={labels.close}
            className="-mr-2 shrink-0"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <div className="mt-4 shrink-0">
          {/* A text field with the searchbox role: `type="search"` adds the
              browser's own clear button, blue in Chrome whatever the theme. */}
          <InputField
            role="searchbox"
            enterKeyHint="search"
            label={labels.search}
            hiddenLabel
            placeholder={labels.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            leftAdornment={<Search className="size-3.5 text-neutral-400" aria-hidden="true" />}
            autoComplete="off"
            autoFocus
          />
        </div>
        <div
          data-slot="preset-library-body"
          aria-busy={loading || undefined}
          className="-mx-6 mt-3 min-h-0 flex-1 overflow-y-auto px-6 max-sm:-mx-4 max-sm:px-4"
        >
          {body}
        </div>
        {footer != null && (
          <div className="mt-3 flex shrink-0 justify-end border-t border-neutral-200 pt-3 dark:border-neutral-700">
            {footer}
          </div>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

/** One preset: thumbnail, three lines of text and the actions, which wrap under the text on phones. */
function PresetRow({
  row,
  labels,
  pending,
  onUse,
  onDuplicate,
  onDelete,
}: {
  row: PresetLibraryRow;
  labels: PresetLibraryDialogLabels;
  pending: PresetLibraryDialogProps["pending"];
  onUse: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const nameId = useId();
  const busy = (action: PresetLibraryAction) => pending?.id === row.id && pending.action === action;
  const locked = pending != null;

  return (
    <div
      role="listitem"
      className="flex items-start gap-3 border-t border-neutral-100 py-3 first:border-t-0 dark:border-neutral-700/70"
    >
      <span
        data-slot="preset-tile"
        className="flex aspect-video w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 sm:w-20 dark:bg-neutral-900/60"
      >
        {row.thumbnailSrc ? (
          <img
            src={row.thumbnailSrc}
            srcSet={row.thumbnailSrcSet}
            alt=""
            loading="lazy"
            className="block h-full w-full object-cover"
          />
        ) : (
          <Type size={16} aria-hidden="true" className="text-neutral-500 dark:text-neutral-400" />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-3">
        <div className="min-w-0 flex-1">
          <span
            id={nameId}
            data-slot="preset-name"
            className="line-clamp-2 text-[13px] leading-snug font-bold text-neutral-900 [overflow-wrap:anywhere] dark:text-white"
          >
            {row.name}
          </span>
          <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-snug text-neutral-600 dark:text-neutral-300">
            <span className="max-w-full truncate">{row.look}</span>
            {row.palette && row.palette.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <PaletteSwatches colors={row.palette} size={12} label={labels.palette} />
              </>
            )}
          </span>
          {/* A host such as "uniconfoto.com" has no break points (AttachmentRow, 2026-11-14). */}
          <span className="mt-0.5 block text-xs leading-snug text-neutral-500 [overflow-wrap:anywhere] dark:text-neutral-400">
            {row.usage}
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            loading={busy("use")}
            disabled={locked}
            onClick={() => onUse(row.id)}
            aria-describedby={nameId}
          >
            {labels.useHere}
          </Button>
          <Button
            variant="transparent"
            size="sm"
            loading={busy("duplicate")}
            disabled={locked}
            onClick={() => onDuplicate(row.id)}
            aria-describedby={nameId}
          >
            <Copy aria-hidden="true" />
            {labels.duplicate}
          </Button>
          {row.canDelete && onDelete && (
            <Button
              variant="transparent"
              size="sm"
              loading={busy("delete")}
              disabled={locked}
              onClick={() => onDelete(row.id)}
              aria-label={labels.delete}
              aria-describedby={nameId}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** A placeholder row in the shape of {@link PresetRow}. */
function SkeletonRow() {
  return (
    <div
      data-slot="preset-skeleton"
      className="flex items-start gap-3 border-t border-neutral-100 py-3 first:border-t-0 dark:border-neutral-700/70"
    >
      <Skeleton className="aspect-video w-16 shrink-0 rounded-lg sm:w-20" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
        <Skeleton className="h-3.5 w-2/5 rounded-full" />
        <Skeleton className="h-3 w-3/5 rounded-full" />
        <Skeleton className="h-3 w-1/3 rounded-full" />
      </div>
    </div>
  );
}

/**
 * Returns a preset's last-edit date as "Sep 12" in `locale`, with the year
 * when it is not the current one ("Sep 12, 2025"); "" when unreadable.
 */
export function formatEditedDate(iso: string, locale: string | undefined, now: Date = new Date()): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(date);
}
