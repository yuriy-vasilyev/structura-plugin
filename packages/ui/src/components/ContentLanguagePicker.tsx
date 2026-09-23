import {
  CONTENT_LANGUAGE_OPTIONS,
  contentLanguageLabel,
  isContentLanguageOption,
  otherWpLocales,
  resolveLanguageSupport,
} from "@structura/i18n-contracts";
import { Check, ChevronRight, Info, Search, SearchX } from "lucide-react";
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "../utils";
import { formFieldGroupVariants } from "../variants/form-field";
import { Combobox, type ComboboxGroup, type ComboboxOption } from "./Combobox";

/**
 * ContentLanguagePicker — the campaign **Language** field, shared by the
 * portal and wp-admin.
 *
 * Three inline states (handoff `design_handoff_campaign_setup_step` §3):
 *
 * - **A** — one {@link Combobox}: the site's other languages pinned first,
 *   then the supported list (`CONTENT_LANGUAGE_OPTIONS`, German kept as
 *   three regional entries), then an "Other…" escape hatch.
 * - **B** — "Other…" reveals a second, always-open searchable list of the
 *   remaining locales under a "MORE LANGUAGES" overline (the catalogue is
 *   WordPress's locale list, but headless users never hear "WordPress").
 *   Choosing "Other…" itself never changes `value`.
 * - **C** — an `ai_only` value gets an honest brand-tinted note under the
 *   field (search data unavailable, AI research instead) with a way back to
 *   the supported list. Never a modal: the old "Not finding your language?"
 *   dialog is retired.
 *
 * All copy arrives through `labels` — this package has no i18n runtime, and
 * the two consumers translate through different stacks (`__()` vs `t()`).
 */

/** Every translatable string the picker renders. */
export interface ContentLanguagePickerLabels {
  /** Group header for the site's `additionalLanguages`. */
  alsoOnSite: string;
  /** Group header for `CONTENT_LANGUAGE_OPTIONS`. */
  supported: string;
  /** The escape-hatch row ("Other…"). */
  other: string;
  /** Caption under the escape-hatch row ("More languages"). */
  otherCaption: string;
  /** Overline above the catalogue field. */
  allWordPressLanguages: string;
  searchPlaceholder: string;
  noMatches: (query: string) => string;
  searchCount: (matched: number, total: number) => string;
  /** Empty-state action in the catalogue that returns to state A. */
  backToSupported: string;
  /** The honest note for an `ai_only` language, given its display name. */
  aiOnlyNote: (languageName: string) => string;
  /** Escape-hatch button inside the note. */
  pickSupported: string;
  /** Second line of the note ("Everything else works the same…"). */
  aiOnlyReassurance: string;
}

export interface ContentLanguagePickerProps {
  /** Current code — a picker option (`de_AT`) or a catalogue code (`fa_IR`). */
  value: string;
  onChange: (code: string) => void;
  /** Viewer's UI locale, for `Intl.DisplayNames` labels ("Deutsch (Österreich)"). */
  uiLocale: string;
  /** The site's other content languages, pinned first under "Also on your site". */
  additionalLanguages?: string[];
  disabled?: boolean;
  labels: ContentLanguagePickerLabels;
  /** Trigger id; the ai_only note is `${id}-note` so consumers can reference it. */
  id?: string;
  className?: string;
}

type PickerMode = "supported" | "catalog";

/** Sentinel option id for the "Other…" row — never a real language code. */
const OTHER_ID = "__other__";

const OVERLINE =
  "text-[10px] font-black tracking-widest uppercase text-neutral-400 dark:text-neutral-500";

const LocaleCode: React.FC<{ code: string }> = ({ code }) => (
  <span className="font-mono text-[11px] text-neutral-400 dark:text-neutral-500">{code}</span>
);

/** Label OR code match; the escape hatch stays visible under any query. */
const primaryFilter = (option: ComboboxOption, query: string): boolean => {
  if (option.id === OTHER_ID) return true;
  const q = query.toLowerCase();
  return option.label.toLowerCase().includes(q) || option.id.toLowerCase().includes(q);
};

export const ContentLanguagePicker: React.FC<ContentLanguagePickerProps> = ({
  value,
  onChange,
  uiLocale,
  additionalLanguages,
  disabled = false,
  labels,
  id: idProp,
  className,
}) => {
  const generatedId = useId();
  const id = idProp ?? `${generatedId}-language`;
  const noteId = `${id}-note`;
  const catalogLabelId = `${id}-catalog-label`;
  const catalogListId = `${id}-catalog-listbox`;

  const rootRef = useRef<HTMLDivElement>(null);
  const catalogInputRef = useRef<HTMLInputElement>(null);
  // Set when the user picks "Other…" so the reveal moves focus into the
  // catalogue search. Not on mount: a campaign that already stores a
  // catalogue code must not steal focus when the form loads.
  const focusCatalogOnReveal = useRef(false);

  const catalog = useMemo(() => otherWpLocales(), []);
  const catalogEntry = catalog.find((entry) => entry.value === value);

  const pinned = useMemo(
    () => Array.from(new Set((additionalLanguages ?? []).filter(Boolean))),
    [additionalLanguages]
  );

  const modeFor = (code: string): PickerMode | null => {
    if (catalog.some((entry) => entry.value === code)) return "catalog";
    if (isContentLanguageOption(code) || pinned.includes(code)) return "supported";
    return null;
  };

  const [pickerMode, setPickerMode] = useState<PickerMode>(() => modeFor(value) ?? "supported");

  // Follow external value changes (async site-language default, a reset)
  // so the trigger never reads "Other…" over a supported value. Picking
  // "Other…" leaves `value` untouched, so it does not run here.
  useEffect(() => {
    const next = modeFor(value);
    if (next) setPickerMode(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (pickerMode === "catalog" && focusCatalogOnReveal.current) {
      focusCatalogOnReveal.current = false;
      catalogInputRef.current?.focus();
    }
  }, [pickerMode]);

  const focusTrigger = () => {
    rootRef.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus();
  };

  const groups = useMemo<ComboboxGroup[]>(() => {
    const toOption = (code: string): ComboboxOption => ({
      id: code,
      label: contentLanguageLabel(code, uiLocale),
      trailing: <LocaleCode code={code} />,
    });
    const pinnedSet = new Set(pinned);
    const result: ComboboxGroup[] = [];
    if (pinned.length > 0) {
      result.push({ id: "also", label: labels.alsoOnSite, options: pinned.map(toOption) });
    }
    result.push({
      id: "supported",
      label: labels.supported,
      // A pinned code wins over its supported twin: option ids must be
      // unique across groups, and the site's own languages sit on top.
      options: CONTENT_LANGUAGE_OPTIONS.filter((code) => !pinnedSet.has(code)).map(toOption),
    });
    result.push({
      id: "other",
      label: labels.other,
      hideHeader: true,
      options: [
        {
          id: OTHER_ID,
          label: labels.other,
          description: labels.otherCaption,
          trailing: (
            <ChevronRight className="size-4 text-neutral-400 dark:text-neutral-500" aria-hidden="true" />
          ),
        },
      ],
    });
    return result;
  }, [pinned, uiLocale, labels.alsoOnSite, labels.supported, labels.other, labels.otherCaption]);

  const handlePrimaryChange = (code: string) => {
    if (code === OTHER_ID) {
      focusCatalogOnReveal.current = true;
      setPickerMode("catalog");
      return;
    }
    setPickerMode("supported");
    onChange(code);
  };

  const backToSupported = () => {
    setPickerMode("supported");
    focusTrigger();
  };

  const support = resolveLanguageSupport(value);
  const showNote = support === "ai_only";
  const inCatalog = pickerMode === "catalog";

  return (
    <div ref={rootRef} className={cn("flex flex-col gap-3", className)}>
      <Combobox
        id={id}
        aria-describedby={showNote ? noteId : undefined}
        value={inCatalog ? undefined : value}
        onChange={handlePrimaryChange}
        groups={groups}
        filter={primaryFilter}
        disabled={disabled}
        placeholder={labels.searchPlaceholder}
        // In catalogue mode the trigger reads a muted "Other…"; a value the
        // primary list cannot resolve falls back to its catalogue label.
        triggerPlaceholder={inCatalog ? labels.other : (catalogEntry?.label ?? value)}
        noMatchesLabel={labels.noMatches}
        searchCountLabel={labels.searchCount}
      />

      {inCatalog && (
        <CatalogField
          value={value}
          onChange={onChange}
          uiLocale={uiLocale}
          disabled={disabled}
          labels={labels}
          entries={catalog}
          inputRef={catalogInputRef}
          labelId={catalogLabelId}
          listId={catalogListId}
          onEscape={focusTrigger}
          onBackToSupported={backToSupported}
        />
      )}

      {showNote && (
        <div
          id={noteId}
          className="flex gap-2.5 rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-3 dark:border-brand-900/60 dark:bg-brand-950/40"
        >
          <Info
            className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-400"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-relaxed text-brand-900 dark:text-brand-100">
              {labels.aiOnlyNote(contentLanguageLabel(value, uiLocale))}{" "}
              <button
                type="button"
                onClick={backToSupported}
                className="text-xs font-bold text-brand-700 underline underline-offset-2 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
              >
                {labels.pickSupported}
              </button>
            </p>
            <p className="mt-1 text-[11px] leading-snug text-brand-800 dark:text-brand-200/90">
              {labels.aiOnlyReassurance}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

interface CatalogFieldProps {
  value: string;
  onChange: (code: string) => void;
  uiLocale: string;
  disabled: boolean;
  labels: ContentLanguagePickerLabels;
  entries: ReturnType<typeof otherWpLocales>;
  inputRef: React.RefObject<HTMLInputElement>;
  labelId: string;
  listId: string;
  onEscape: () => void;
  onBackToSupported: () => void;
}

/**
 * The always-open second level (state B). Not a popover on purpose: the
 * handoff shows the list inline under its own overline so the user can see
 * the supported trigger, the catalogue and (after picking) the note at once.
 */
const CatalogField: React.FC<CatalogFieldProps> = ({
  value,
  onChange,
  uiLocale,
  disabled,
  labels,
  entries,
  inputRef,
  labelId,
  listId,
  onEscape,
  onBackToSupported,
}) => {
  const [query, setQuery] = useState("");
  const [activeValue, setActiveValue] = useState<string | null>(value || null);

  // The native-script label is what a speaker looks for; the name in the
  // viewer's locale lets everyone else find it and is searchable too.
  const rows = useMemo(
    () =>
      entries.map((entry) => {
        const localized = contentLanguageLabel(entry.value, uiLocale);
        return {
          ...entry,
          localized: localized !== entry.value && localized !== entry.label ? localized : null,
        };
      }),
    [entries, uiLocale]
  );

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (row) =>
          row.label.toLowerCase().includes(q) ||
          row.value.toLowerCase().includes(q) ||
          (row.localized?.toLowerCase().includes(q) ?? false)
      )
    : rows;

  const activeIndexRaw = filtered.findIndex((row) => row.value === activeValue);
  const activeIndex = activeIndexRaw === -1 ? (filtered.length > 0 ? 0 : -1) : activeIndexRaw;
  const active = activeIndex >= 0 ? filtered[activeIndex] : null;

  const optionDomId = (code: string) => `${listId}-${code}`;

  useEffect(() => {
    if (!active) return;
    document.getElementById(optionDomId(active.value))?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.value]);

  const moveTo = (index: number) => {
    if (filtered.length === 0) return;
    setActiveValue(filtered[(index + filtered.length) % filtered.length].value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveTo(activeIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveTo(activeIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        moveTo(0);
        break;
      case "End":
        event.preventDefault();
        moveTo(filtered.length - 1);
        break;
      case "Enter":
        // Swallowed so a surrounding form never submits from the search box.
        event.preventDefault();
        if (active) onChange(active.value);
        break;
      case "Escape":
        event.preventDefault();
        onEscape();
        break;
      default:
        break;
    }
  };

  const countLabel = q ? labels.searchCount(filtered.length, entries.length) : entries.length;

  return (
    <div>
      <span id={labelId} className={cn("mb-2 block", OVERLINE)}>
        {labels.allWordPressLanguages}
      </span>
      <div className={cn(formFieldGroupVariants({ intent: "default" }), "flex-col")}>
        <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2 dark:border-neutral-700">
          <Search className="size-3.5 shrink-0 text-neutral-400" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            disabled={disabled}
            placeholder={labels.searchPlaceholder}
            aria-labelledby={labelId}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active ? optionDomId(active.value) : undefined}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full min-w-0 flex-1 !border-0 !bg-transparent !p-0 text-sm !text-neutral-900 !shadow-none !ring-0 !outline-none placeholder:text-neutral-400 dark:!text-neutral-100 dark:placeholder:text-neutral-500"
          />
          <span
            aria-live="polite"
            className="shrink-0 font-mono text-[11px] text-neutral-400 dark:text-neutral-500"
          >
            {countLabel}
          </span>
        </div>
        <div
          role="listbox"
          id={listId}
          aria-labelledby={labelId}
          className="max-h-[240px] overflow-y-auto overscroll-contain p-1.5"
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
              <div className="flex size-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 dark:bg-white/[.06] dark:text-neutral-500">
                <SearchX className="size-4" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
                {labels.noMatches(query.trim())}
              </p>
              <button
                type="button"
                onClick={onBackToSupported}
                className="text-xs font-bold text-brand-600 hover:underline dark:text-brand-400"
              >
                {labels.backToSupported}
              </button>
            </div>
          ) : (
            filtered.map((row) => {
              const selected = row.value === value;
              const isActive = active?.value === row.value;
              return (
                <div
                  key={row.value}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-[7px]",
                    disabled
                      ? "opacity-40"
                      : selected
                        ? "bg-brand-50 dark:bg-brand-500/10"
                        : isActive
                          ? "bg-neutral-100 ring-2 ring-brand-500/40 ring-inset dark:bg-neutral-700/60"
                          : "hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
                  )}
                  // Keep focus (and aria-activedescendant) in the search input.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (!disabled) onChange(row.value);
                  }}
                >
                  <div
                    role="option"
                    id={optionDomId(row.value)}
                    aria-selected={selected}
                    aria-disabled={disabled || undefined}
                    className={cn("flex min-w-0 flex-1 items-center gap-2", !disabled && "cursor-pointer")}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
                        {row.label}
                      </span>
                      {row.localized && (
                        <span className="block truncate text-[11px] leading-tight text-neutral-500 dark:text-neutral-400">
                          {row.localized}
                        </span>
                      )}
                    </div>
                    {selected && (
                      <Check
                        className="size-[15px] shrink-0 text-brand-600 dark:text-brand-400"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <LocaleCode code={row.value} />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
