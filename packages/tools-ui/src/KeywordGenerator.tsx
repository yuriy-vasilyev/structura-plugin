"use client";

import { type FC, Fragment, type ReactNode, useId, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronRight,
  Download,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@structura/ui/button";
import {
  EASY_KD_MAX,
  HARD_KD_MIN,
  VOLUME_SIZES,
  bandRanges,
  difficultyLevel,
  volumeSize,
  type DifficultyLevel,
  type VolumeSize,
} from "./lib/score";
import {
  easyKeywordRows,
  keywordsCsv,
  sortKeywordRows,
  type KeywordSortKey,
  type SortDirection,
} from "./lib/keywords";
import { formatNumber, formatRange, formatUsd, fill } from "./lib/format";
import type { LearnSlug, LearnTarget } from "./lib/learn";
import { isKnownCountry } from "./lib/response";
import { isRefusal, type KeywordIntent, type KeywordRow, type KeywordsResult, type ToolCountry } from "./lib/types";
import { useToolRun, type ToolRefusal, type ToolRequestInput, type ToolRunEvent, type ToolRunner } from "./useToolRun";
import {
  Disclosure,
  EmptyPane,
  ErrorPane,
  LearnLink,
  ReportFooter,
  ReportFrame,
  ReportSkeleton,
  ResultArea,
  SourceBar,
  ToolCard,
  ToolForm,
  type ToolFormDict,
  type ToolSharedDict,
} from "./ToolUi";

/**
 * The keyword generator's copy (www: `keyword-generator.json`), limited to
 * the keys the widget reads. Each surface keeps its own dictionary (§4.9.4).
 */
export interface KeywordGeneratorDict {
  /** Card label and form copy. */
  tool: ToolFormDict;
  /** Everything under the form. */
  result: {
    /** Empty state before the first run. */
    empty: { title: string; hint: string; checks: string[] };
    /** The one honest line above the loading skeleton. */
    loading: string;
    /** Market and language after the vendor in the source bar; `{{country}}`, `{{language}}`. */
    source: string;
    /** Table heading by idea count; `{{count}}`, `{{seed}}`. */
    title: { one: string; other: string };
    /** Column headers, also the CSV header row; `select` is the checkbox column's hidden label. */
    columns: { select: string; keyword: string; volume: string; difficulty: string; cpc: string; intent: string };
    /** Accessible name of a sort button; `{{column}}`. */
    sortBy: string;
    /** Name per keyword difficulty band. */
    difficultyLevels: Record<DifficultyLevel, string>;
    /** Accessible name of a KD chip; `{{value}}`, `{{level}}`. */
    difficultyAria: string;
    /** Name per search intent, in the table and the CSV. */
    intents: Record<KeywordIntent, string>;
    /** What to publish per search intent: the first line of an intent cell (§4.11). */
    intentActions: Record<KeywordIntent, string>;
    /** The legend between the title and the table (§4.11). */
    legend: {
      /** Label of the KD row. */
      kd: string;
      /** Note under the KD chips. */
      kdNote: string;
      /** Size word per volume band, also shown next to each row's volume. */
      volumeSizes: Record<VolumeSize, string>;
      /** Note under the volume words. */
      volumeNote: string;
      /** The link to how to pick keywords, also under the no-easy-ideas notice. */
      pickLink: string;
    };
    /** "How to read these numbers", per column. */
    read: {
      title: string;
      /** Term for the KD entry; the others reuse the column names. */
      kdTerm: string;
      kd: string;
      volume: string;
      cpc: string;
      intent: string;
    };
    /** Accessible name of a row checkbox; `{{keyword}}`. */
    selectRow: string;
    /** Label of the KD filter. */
    easyFilter: string;
    /** Selection count; `other` takes `{{count}}`. */
    selected: { none: string; one: string; other: string };
    /** "Export CSV" button. */
    exportCsv: string;
    /** CSV file name before the seed. */
    csvFilename: string;
    /** Summary of a row's details on phones (CPC and intent). */
    details: string;
    /** Shown when the seed found no ideas. */
    noResults: { title: string; body: string };
    /** Shown when the KD filter hides every row. */
    noEasy: string;
  };
  /** The report footer's pitch next to the call to action. */
  resultCta: { title: string; body: string };
}

/** What the visitor picked in the table, for the surface's content-plan call to action. */
export interface KeywordSelection {
  /** The seed the ideas came from. */
  seed: string;
  /** The market the figures are for. */
  country: string;
  /** Selected rows in the table's current sort order, including rows the KD filter hides. */
  picked: KeywordRow[];
}

type Dict = KeywordGeneratorDict;
type Shared = ToolSharedDict;

interface KeywordGeneratorProps {
  /** Locale for numbers and dates. */
  locale: string;
  /** Market the country select starts on. */
  defaultCountry: ToolCountry;
  /** The tool's copy. */
  dict: Dict;
  /** Copy every tool shares. */
  shared: Shared;
  /** Where the surface's Learn links go and which pages are published (§4.11). */
  learn: LearnTarget;
  /** Runs the generator the surface's way. */
  runner: ToolRunner;
  /** The surface's analytics for each step of a run. */
  onEvent?: (event: ToolRunEvent) => void;
  /**
   * Shown in place of the error pane when a run is refused: the shared pool
   * is spent (`capacity`) or, on www, the visitor's own daily checks are
   * (`visitor_limit`, §4.10).
   */
  renderCapacity: (request: ToolRequestInput, refusal: ToolRefusal) => ReactNode;
  /** The report footer's call to action, given the current selection. Not shown when the seed found no ideas. */
  renderCta: (selection: KeywordSelection) => ReactNode;
  /** Seed the field starts with, e.g. from a portal link. */
  initialInput?: string;
  /** Generate ideas for `initialInput` in `defaultCountry` once on mount, when the seed is valid. */
  autoRun?: boolean;
  /**
   * Keywords to tick when the table shows ideas for `initialInput` in
   * `defaultCountry`, e.g. the picks a portal link carries. Picks the
   * result does not contain are ignored.
   */
  initialPicks?: readonly string[];
}

/**
 * Free Keyword Generator widget: a seed keyword (+ country) in, up to 50
 * ideas out, in a table the visitor can sort, filter to KD 25 or less,
 * select from, export as CSV and hand to the surface's content-plan call to
 * action (specs/blogseo-gap-analysis.md §4.3 "keywords", §4.8.2).
 */
export const KeywordGenerator: FC<KeywordGeneratorProps> = ({
  locale,
  defaultCountry,
  dict,
  shared,
  learn,
  runner,
  onEvent,
  renderCapacity,
  renderCta,
  initialInput,
  autoRun = false,
  initialPicks,
}) => {
  const { state, run, retry, reset } = useToolRun(
    "keywords",
    runner,
    onEvent,
    autoRun && initialInput ? { input: initialInput, country: defaultCountry } : undefined,
  );
  const busy = state.phase === "loading";
  // Picks belong to the link's own search (and its retries), not to a seed
  // or market chosen afterwards.
  const picksFor = (request: ToolRequestInput) =>
    initialPicks && request.input === initialInput?.trim() && request.country === defaultCountry
      ? initialPicks
      : undefined;

  return (
    <ToolCard label={dict.tool.cardLabel} byline={dict.tool.cardByline}>
      <ToolForm
        tool="keywords"
        dict={dict.tool}
        shared={shared}
        busy={busy}
        withCountry
        defaultCountry={defaultCountry}
        defaultInput={initialInput}
        onSubmit={(input, country) => void run(input, country)}
      />
      <ResultArea>
        {state.phase === "idle" && <EmptyPane {...dict.result.empty} />}
        {state.phase === "loading" && <ReportSkeleton line={dict.result.loading} ariaLabel={shared.loadingAria} />}
        {state.phase === "error" &&
          (isRefusal(state.error) ? (
            renderCapacity(state.request, {
              reason: state.error,
              ...(state.retryAt !== undefined ? { retryAt: state.retryAt } : {}),
            })
          ) : (
            <ErrorPane
              error={state.error}
              shared={shared}
              invalidHint={dict.tool.invalidHint}
              retryAt={state.retryAt}
              onRetry={retry}
            />
          ))}
        {state.phase === "done" && (
          // Keyed by the result so a new search starts with a clean selection.
          <KeywordReport
            key={`${state.result.seed}|${state.result.country}|${state.result.fetchedAt}`}
            result={state.result}
            cached={state.cached}
            locale={locale}
            dict={dict}
            shared={shared}
            learn={learn}
            renderCta={renderCta}
            initialPicks={picksFor(state.request)}
            onReset={reset}
          />
        )}
      </ResultArea>
    </ToolCard>
  );
};

/** A keyword with its whitespace collapsed, the way `encodePick` writes it into a link. */
const pickKey = (keyword: string) => keyword.replace(/\s+/g, " ").trim();

/** `set` with `key` added, or removed when it was there. */
function toggled(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** The rows' own keywords for the picks they contain. */
function preselected(rows: readonly KeywordRow[], picks: readonly string[] | undefined): ReadonlySet<string> {
  if (!picks?.length) return new Set();
  const wanted = new Set(picks.map(pickKey));
  return new Set(rows.filter((row) => wanted.has(pickKey(row.keyword))).map((row) => row.keyword));
}

/**
 * KD chip styles: 800 (red 700) text on the 50 tint keeps AA. The icon shows
 * the level the colour stands for, which before §4.11 only the aria-label
 * said; red, not rose, is the design guide's danger colour.
 */
const DIFFICULTY_STYLE: Record<DifficultyLevel, { icon: LucideIcon; chip: string; iconClass: string }> = {
  easy: {
    icon: CheckCircle2,
    chip: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/20",
    iconClass: "text-emerald-600 dark:text-emerald-400",
  },
  medium: {
    icon: AlertTriangle,
    chip: "bg-amber-50 text-amber-800 ring-1 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20",
    iconClass: "text-amber-600 dark:text-amber-400",
  },
  hard: {
    icon: XCircle,
    chip: "bg-red-50 text-red-700 ring-1 ring-red-600/20 dark:bg-red-500/10 dark:text-red-200 dark:ring-red-400/20",
    iconClass: "text-red-600 dark:text-red-400",
  },
};

/**
 * `label` with a break opportunity after each "/", so "Recherches/mois" can
 * wrap in a narrow column. The last part stays on one line with `trailing`,
 * so a sort arrow never drops onto a line of its own (QA 2026-10-02).
 */
const SlashBreaks: FC<{ label: string; trailing?: ReactNode }> = ({ label, trailing }) => {
  const parts = label.split("/");
  const last = parts.pop();
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}/<wbr />
        </Fragment>
      ))}
      <span className="whitespace-nowrap">
        {last}
        {trailing}
      </span>
    </>
  );
};

/** A KD chip: the level's colour and icon around a score, or around the level's name in the legend. */
const KdChip: FC<{ level: DifficultyLevel; ariaLabel?: string; children: ReactNode }> = ({ level, ariaLabel, children }) => {
  const { icon: Icon, chip, iconClass } = DIFFICULTY_STYLE[level];
  return (
    <span
      data-level={level}
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1 rounded-full py-0.5 pr-2 pl-1.5 font-mono text-[11px] font-bold tabular-nums ${chip}`}
    >
      <Icon className={`size-3 shrink-0 ${iconClass}`} strokeWidth={2.5} aria-hidden="true" />
      {children}
    </span>
  );
};

/** The legend over the table: what the KD chips and the volume words mean (§4.11). */
const KeywordLegend: FC<{ dict: Dict; shared: Shared; locale: string; learn: LearnTarget }> = ({
  dict,
  shared,
  locale,
  learn,
}) => {
  const r = dict.result;
  const legend = r.legend;
  const levels: Array<{ level: DifficultyLevel; min: number; max: number }> = [
    { level: "easy", min: 0, max: EASY_KD_MAX },
    { level: "medium", min: EASY_KD_MAX + 1, max: HARD_KD_MIN - 1 },
    { level: "hard", min: HARD_KD_MIN, max: 100 },
  ];
  const sizes = bandRanges(VOLUME_SIZES);
  const term = "text-[11px] font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-200";
  return (
    <div
      data-testid="keyword-legend"
      className="mt-4 rounded-xl border border-neutral-200 bg-white px-3.5 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]"
    >
      <dl className="grid grid-cols-1 gap-y-3 sm:grid-cols-[6.75rem_minmax(0,1fr)] sm:gap-x-3">
        <dt className={`${term} sm:pt-1`}>{legend.kd}</dt>
        <dd className="-mt-1.5 sm:mt-0">
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {levels.map(({ level, min, max }) => (
              <li key={level} className="inline-flex items-center gap-1.5">
                <KdChip level={level}>
                  <span className="font-sans">{r.difficultyLevels[level]}</span>
                </KdChip>
                <span className="text-[11px] tabular-nums text-neutral-600 dark:text-neutral-300">
                  {formatRange({ min, max }, locale)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">{legend.kdNote}</p>
        </dd>
        {/* "RECHERCHES/MOIS" is wider than the label column at 11px caps. */}
        <dt className={term}>
          <SlashBreaks label={r.columns.volume} />
        </dt>
        <dd className="-mt-1.5 sm:mt-0">
          <ul className="flex flex-wrap gap-x-2.5 gap-y-1 text-xs text-neutral-800 dark:text-neutral-100">
            {sizes.map((size, i) => (
              <li key={size.key} className="whitespace-nowrap">
                {/* The "·" leads its item, so a wrapped line never ends on one; on
                    phones, where the words wrap anyway, the gap alone separates them. */}
                {i > 0 && (
                  <span aria-hidden="true" className="mr-2.5 hidden text-neutral-300 sm:inline dark:text-neutral-600">
                    ·
                  </span>
                )}
                <span className="font-semibold">{legend.volumeSizes[size.key]}</span>{" "}
                <span className="tabular-nums text-neutral-600 dark:text-neutral-300">{formatRange(size, locale)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">{legend.volumeNote}</p>
        </dd>
      </dl>
      <LearnLink
        target={learn}
        copy={shared.learn}
        slug="keyword-difficulty"
        label={legend.pickLink}
        className="mt-3 border-t border-neutral-200 pt-2.5 dark:border-white/[0.06]"
      />
    </div>
  );
};

/** The table only ever shows this many rows, whatever the API sends. */
const MAX_ROWS = 50;

function plural(forms: { none: string; one: string; other: string }, count: number): string {
  if (count === 0) return forms.none;
  return count === 1 ? forms.one : fill(forms.other, { count });
}

/** Hand the CSV to the browser as a download. */
function download(filename: string, text: string): void {
  // BOM so Excel opens UTF-8 keywords (umlauts, accents) correctly.
  const url = URL.createObjectURL(new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const KeywordReport: FC<{
  result: KeywordsResult;
  cached: boolean;
  locale: string;
  dict: Dict;
  shared: Shared;
  learn: LearnTarget;
  renderCta: (selection: KeywordSelection) => ReactNode;
  initialPicks?: readonly string[];
  onReset: () => void;
}> = ({ result, cached, locale, dict, shared, learn, renderCta, initialPicks, onReset }) => {
  const r = dict.result;
  const [sort, setSort] = useState<{ key: KeywordSortKey; dir: SortDirection }>({ key: "volume", dir: "desc" });
  const [easyOnly, setEasyOnly] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() =>
    preselected(result.items.slice(0, MAX_ROWS), initialPicks),
  );

  const all = useMemo(() => result.items.slice(0, MAX_ROWS), [result.items]);
  const rows = useMemo(
    () => sortKeywordRows(easyOnly ? easyKeywordRows(all) : all, sort.key, sort.dir),
    [all, easyOnly, sort],
  );
  // Selection survives filtering; export and the plan link use every
  // selected row, in the table's current order first.
  const picked = useMemo(() => {
    const ordered = sortKeywordRows(all, sort.key, sort.dir);
    return ordered.filter((row) => selected.has(row.keyword));
  }, [all, selected, sort]);

  const countryName = isKnownCountry(result.country) ? shared.countries[result.country] : result.country.toUpperCase();
  const languageName =
    result.language && result.language in shared.languages
      ? shared.languages[result.language as keyof typeof shared.languages]
      : undefined;
  const source = languageName ? fill(r.source, { country: countryName, language: languageName }) : countryName;

  // First click on a column picks its useful direction: most volume first,
  // easiest difficulty first. A second click flips it.
  const toggleSort = (key: KeywordSortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "volume" ? "desc" : "asc" },
    );

  const toggleRow = (keyword: string) => setSelected((prev) => toggled(prev, keyword));

  // Rows whose CPC and intent are open in a narrow table, and an id per row
  // for the More button to point at.
  const [openDetails, setOpenDetails] = useState<ReadonlySet<string>>(() => new Set());
  const toggleDetails = (keyword: string) => setOpenDetails((prev) => toggled(prev, keyword));
  const idPrefix = useId();
  const position = useMemo(() => new Map(all.map((row, i) => [row.keyword, i])), [all]);

  const exportCsv = () =>
    download(
      `${r.csvFilename}-${result.seed.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")}.csv`,
      keywordsCsv(picked, r.columns, (intent) => r.intents[intent]),
    );

  const sortHeader = (key: KeywordSortKey, label: string, widthClass: string) => {
    const active = sort.key === key;
    const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th
        scope="col"
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
        className={"px-2 py-2.5 text-right @2xl:px-3 " + widthClass}
      >
        <button
          type="button"
          onClick={() => toggleSort(key)}
          aria-label={fill(r.sortBy, { column: label })}
          className="rounded-md text-right font-bold hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 dark:hover:text-white"
        >
          {/* Inline flow, not flex: "Recherches/mois" wraps after the slash and the
              icon follows the last word, so the header fits a phone-width column
              (QA 2026-09-30: de/es/fr ran into the KD header at 390px). */}
          <SlashBreaks
            label={label}
            trailing={<Icon className="ml-1 inline size-3 align-[-1px]" strokeWidth={2.5} aria-hidden="true" />}
          />
        </button>
      </th>
    );
  };

  const kdChip = (row: KeywordRow) => {
    if (row.difficulty === undefined) return <span className="text-neutral-600 dark:text-neutral-300">{shared.noValue}</span>;
    const level = difficultyLevel(row.difficulty);
    return (
      <KdChip level={level} ariaLabel={fill(r.difficultyAria, { value: row.difficulty, level: r.difficultyLevels[level] })}>
        {row.difficulty}
      </KdChip>
    );
  };

  const cpcText = (row: KeywordRow) => (row.cpc !== undefined ? formatUsd(row.cpc, locale) : shared.noValue);
  // What to publish first, then the intent's name, which the CSV keeps.
  // Balanced, so "Skip: people want a specific site" leaves no word alone.
  const intentLines = (row: KeywordRow) =>
    row.intent ? (
      <>
        <span className="block font-medium text-balance text-neutral-900 dark:text-white">
          {r.intentActions[row.intent]}
        </span>
        <span className="block text-[11px] leading-4 text-neutral-600 dark:text-neutral-300">{r.intents[row.intent]}</span>
      </>
    ) : (
      <span className="text-neutral-600 dark:text-neutral-300">{shared.noValue}</span>
    );

  // One reference link per page in a panel: CPC shares the search-volume
  // page the entry before it links, and the intent page is the Intent
  // column header's (QA 2026-10-02).
  const readItems: Array<{ term: string; body: string; slug?: LearnSlug }> = [
    { term: r.read.kdTerm, body: r.read.kd, slug: "keyword-difficulty" },
    { term: r.columns.volume, body: r.read.volume, slug: "search-volume" },
    { term: r.columns.cpc, body: r.read.cpc },
    { term: r.columns.intent, body: r.read.intent },
  ];

  return (
    <ReportFrame testId="keywords-result">
      <SourceBar shared={shared} locale={locale} detail={source} fetchedAt={result.fetchedAt} cached={cached} onReset={onReset} />
      <div className="p-4 sm:p-6">
        {all.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-base font-bold text-neutral-900 dark:text-white">{r.noResults.title}</p>
            <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-300">{r.noResults.body}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">
                {fill(all.length === 1 ? r.title.one : r.title.other, { count: all.length, seed: result.seed })}
              </h3>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
                <input
                  type="checkbox"
                  checked={easyOnly}
                  onChange={(e) => setEasyOnly(e.target.checked)}
                  className="size-4 rounded border-neutral-300 accent-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 dark:border-white/20 dark:[color-scheme:dark]"
                />
                {r.easyFilter}
              </label>
            </div>

            <KeywordLegend dict={dict} shared={shared} locale={locale} learn={learn} />

            {/* A container: the layout follows the table's own width, which the
                portal's sidebar narrows well below the viewport's (§4.11). Under
                42rem the table keeps keyword, volume and KD, and CPC and intent
                move into a row of their own; from 42rem they get columns; from
                52rem the designed widths fit beside a readable keyword column
                (QA 2026-10-02: at 641-700px keywords stacked a letter a line). */}
            <div className="@container mt-4 rounded-xl border border-neutral-200 dark:border-white/[0.06]">
              <table className="w-full table-fixed text-sm">
                <thead className="border-b border-neutral-200 text-[11px] text-neutral-700 dark:border-white/[0.06] dark:text-neutral-200">
                  <tr>
                    <th scope="col" className="w-8 px-2 py-2.5 @2xl:w-11 @2xl:px-3">
                      <span className="sr-only">{r.columns.select}</span>
                    </th>
                    <th scope="col" className="px-2 py-2.5 text-left font-bold @2xl:px-3">
                      {r.columns.keyword}
                    </th>
                    {sortHeader("volume", r.columns.volume, "w-[5.5rem] @2xl:w-32 @min-[52rem]:w-40")}
                    {sortHeader("difficulty", r.columns.difficulty, "w-16 @2xl:w-20 @min-[52rem]:w-24")}
                    {/* w-28 fits "99,99 $US", the longest CPC in any locale (QA 2026-10-02: fr spilled from w-20). */}
                    <th scope="col" className="hidden w-28 px-3 py-2.5 text-right font-bold @2xl:table-cell">
                      {r.columns.cpc}
                    </th>
                    <th scope="col" className="hidden w-32 px-3 py-2.5 text-left font-bold @2xl:table-cell @min-[52rem]:w-52">
                      <LearnLink
                        target={learn}
                        copy={shared.learn}
                        slug="search-intent"
                        label={r.columns.intent}
                        textClassName="text-[11px] font-bold"
                        fallback={r.columns.intent}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-white/[0.06]">
                  {rows.map((row) => {
                    const checked = selected.has(row.keyword);
                    const open = openDetails.has(row.keyword);
                    const detailsId = `${idPrefix}-details-${position.get(row.keyword)}`;
                    const tint = checked ? "bg-brand-50/60 dark:bg-brand-500/[0.07]" : "";
                    return (
                      <Fragment key={row.keyword}>
                        <tr
                          data-keyword={row.keyword}
                          // An open row and its details read as one: no divider between them.
                          className={[tint, open ? "@max-2xl:border-b-0" : ""].join(" ").trim() || undefined}
                        >
                          <td className="px-2 py-2.5 align-top @2xl:px-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleRow(row.keyword)}
                              aria-label={fill(r.selectRow, { keyword: row.keyword })}
                              className="mt-0.5 size-4 cursor-pointer accent-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 dark:[color-scheme:dark]"
                            />
                          </td>
                          {/* hyphens-auto: at phone width the column is ~100px, and German
                              compounds broke mid-word ("kaffeemasc|hine", QA 2026-09-30).
                              Keywords are in the market's language, which can differ from
                              the page's: `lang` gives hyphenation the right dictionary. It
                              sits on this cell, not the row group, so the size words and
                              intent verbs in the other cells keep the page's language. */}
                          <td
                            lang={result.language}
                            className="break-words hyphens-auto px-2 py-2.5 align-top font-medium text-neutral-900 @2xl:px-3 dark:text-white"
                          >
                            {row.keyword}
                            {/* A narrow table keeps CPC and intent one tap away, in a row
                                of their own: inside this ~90px cell the intent verb wrapped
                                four times and hyphenated mid-word (QA 2026-10-02). */}
                            <button
                              type="button"
                              lang={locale}
                              aria-expanded={open}
                              // The details row exists only while open.
                              aria-controls={open ? detailsId : undefined}
                              onClick={() => toggleDetails(row.keyword)}
                              className="mt-1 flex items-center gap-1 rounded-md text-xs font-semibold text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 @2xl:hidden dark:text-brand-300"
                            >
                              <ChevronRight
                                className={
                                  "size-3 shrink-0 transition-transform duration-fast motion-reduce:transition-none " +
                                  (open ? "rotate-90" : "")
                                }
                                strokeWidth={2.5}
                                aria-hidden="true"
                              />
                              {r.details}
                            </button>
                          </td>
                          <td className="px-2 py-2.5 text-right align-top @2xl:px-3">
                            {row.volume !== undefined ? (
                              // The number over its size word until the wide layout, then the word first.
                              <span className="inline-flex flex-col items-end @min-[52rem]:flex-row-reverse @min-[52rem]:items-baseline @min-[52rem]:gap-1.5">
                                <span className="font-mono tabular-nums text-neutral-800 dark:text-neutral-100">
                                  {formatNumber(row.volume, locale)}
                                </span>
                                <span className="text-[11px] text-neutral-600 dark:text-neutral-300">
                                  {r.legend.volumeSizes[volumeSize(row.volume)]}
                                </span>
                              </span>
                            ) : (
                              <span className="text-neutral-600 dark:text-neutral-300">{shared.noValue}</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-right align-top @2xl:px-3">{kdChip(row)}</td>
                          <td className="hidden px-3 py-2.5 text-right align-top font-mono tabular-nums text-neutral-800 @2xl:table-cell dark:text-neutral-100">
                            {cpcText(row)}
                          </td>
                          <td className="hidden px-3 py-2.5 align-top text-xs leading-5 @2xl:table-cell">{intentLines(row)}</td>
                        </tr>
                        {open && (
                          <tr id={detailsId} data-testid="row-details" className={"@2xl:hidden " + tint}>
                            <td />
                            <td colSpan={3} lang={locale} className="px-2 pt-0 pb-3">
                              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs text-neutral-700 dark:text-neutral-200">
                                <dt className="font-semibold">{r.columns.cpc}</dt>
                                <dd className="tabular-nums">{cpcText(row)}</dd>
                                <dt className="font-semibold">{r.columns.intent}</dt>
                                <dd>{intentLines(row)}</dd>
                              </dl>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {rows.length === 0 && (
                <div data-testid="keyword-no-easy" className="px-4 py-7 text-center">
                  <p className="text-sm text-neutral-600 dark:text-neutral-300">{r.noEasy}</p>
                  <LearnLink
                    target={learn}
                    copy={shared.learn}
                    slug="keyword-difficulty"
                    label={r.legend.pickLink}
                    className="mt-2.5"
                  />
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p aria-live="polite" data-testid="selected-count" className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                {plural(r.selected, picked.length)}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={exportCsv}
                disabled={picked.length === 0}
                className="justify-center gap-2"
              >
                <Download className="size-4" strokeWidth={2.5} aria-hidden="true" />
                {r.exportCsv}
              </Button>
            </div>
            <Disclosure title={r.read.title} testId="keyword-read" className="mt-4">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                {readItems.map((item) => (
                  <div key={item.term}>
                    <dt className="text-xs font-semibold text-neutral-800 dark:text-neutral-100">{item.term}</dt>
                    <dd className="mt-0.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                      {item.body}
                      {item.slug && <LearnLink target={learn} copy={shared.learn} slug={item.slug} className="mt-1.5" />}
                    </dd>
                  </div>
                ))}
              </dl>
            </Disclosure>
          </>
        )}
      </div>
      {/* Nothing to select or carry into a content plan when the seed found no ideas. */}
      {all.length > 0 && (
        <ReportFooter title={dict.resultCta.title} body={dict.resultCta.body}>
          {renderCta({ seed: result.seed, country: result.country, picked })}
        </ReportFooter>
      )}
    </ReportFrame>
  );
};
