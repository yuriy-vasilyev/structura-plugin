"use client";

import { type FC, type FormEvent, type ReactNode, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Database,
  ExternalLink,
  Info,
  MinusCircle,
  RotateCcw,
  Sparkles,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@structura/ui/button";
import { InputField } from "@structura/ui/input-field";
import { Select } from "@structura/ui/select";
import { formatCountdown, formatDate, fill } from "./lib/format";
import type { LearnSlug, LearnTarget } from "./lib/learn";
import type { VerdictIntent } from "./lib/score";
import { isValidToolInput } from "./lib/validate";
import { TOOL_COUNTRIES, type RefusalCode, type ToolCountry, type ToolErrorCode, type ToolId } from "./lib/types";

/**
 * Building blocks shared by the three data-backed tool widgets
 * (`SeoChecker`, `DomainRatingChecker`, `KeywordGenerator`). The card frame
 * follows www's `AiDetectorTool` so the five free tools look like one
 * family; the report interior follows the rev 2 prototype: a source bar, a
 * score column beside a detail column, and a footer action row
 * (specs/blogseo-gap-analysis.md §4.8.2).
 *
 * Readable text uses neutral-600/700 (dark: 300/200) or darker; semantic
 * colours go on icons, large numbers and the text of tinted verdict chips
 * only, because emerald-600 and amber-600 on white fall below 4.5:1 for
 * body-size text (§4.8.1 #10, §4.11).
 */

/**
 * Copy every tool shares (www: `tools.json#shared`). Dictionaries stay per
 * surface; this lists only the keys the package reads, so a surface passes
 * its own dictionary unchanged (specs/blogseo-gap-analysis.md §4.9.4).
 */
export interface ToolSharedDict {
  /** Label of the country select. */
  countryLabel: string;
  /** Display name per market, for the select and a result's source line. */
  countries: Record<ToolCountry, string>;
  /** Display name per result language; a language without one shows the market alone. */
  languages: Readonly<Record<string, string>>;
  /** "Check another" in the source bar. */
  checkAnother: string;
  /** "Try again" on an error. */
  retry: string;
  /** The retry button during a 429 wait; `{{time}}` is m:ss. */
  retryIn: string;
  /** A figure the source did not report. */
  notMeasured: string;
  /** An empty table cell. */
  noValue: string;
  /** Check date in the source bar; `{{date}}`. */
  checkedAt: string;
  /** Title and body per error. Refusals are absent: each surface renders its own state for them. */
  errors: Record<Exclude<ToolErrorCode, RefusalCode>, { title: string; body: string }>;
  /** Source bar: the data vendor's name and the cached-result badge. */
  source: { vendor: string; cached: string };
  /** Accessible name of the loading skeleton. */
  loadingAria: string;
  /** Learn link copy (§4.11). */
  learn: LearnCopy;
}

/** Learn link copy every tool shares (www: `tools.json#shared.learn`, specs/blogseo-gap-analysis.md §4.11). */
export interface LearnCopy {
  /** Action link on a figure whose verdict asks for work. */
  howToImprove: string;
  /** Action link at the end of an SEO task's fix. */
  howToFix: string;
  /** Screen-reader note on a link that opens a new tab. */
  newTab: string;
  /** Title per Learn page: the label of a reference link. */
  pages: Record<LearnSlug, string>;
}

type Shared = ToolSharedDict;

/**
 * Dark-mode fill for primary buttons in the tools. The shared primitive's
 * `dark:bg-brand-500` gives white label text 4.47:1, just under AA for
 * button-size text; brand-600 clears it. Local to the tools (enforced by
 * www's `e2e/support/contrast.ts`) rather than changed in `@structura/ui`, which
 * would restyle every product surface in one unreviewed step.
 */
export const PRIMARY_DARK_AA = "dark:bg-brand-600 dark:hover:bg-brand-700";

/** Form copy every tool dictionary carries under `tool`. */
export interface ToolFormDict {
  /** Small-caps label in the card's top bar. */
  cardLabel: string;
  /** Byline at the right of the top bar. */
  cardByline: string;
  /** Label of the input. */
  inputLabel: string;
  /** Example input. */
  placeholder: string;
  /** Submit button. */
  submit: string;
  /** Submit button while a run is in flight. */
  submitting: string;
  /** Line under the form: what is fetched and how long results are cached. */
  privacyLine: string;
  /** Shown when the input fails validation, in the form and as the `invalid_input` error body. */
  invalidHint: string;
}

/* ─── Card frame ─────────────────────────────────────────────────── */

/** Outer card with the small-caps top bar, as on `/ai-detector`. */
export const ToolCard: FC<{ label: string; byline: string; children: ReactNode }> = ({
  label,
  byline,
  children,
}) => (
  <div className="mx-auto w-full max-w-[1000px]">
    <div className="overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white shadow-2xl shadow-brand-600/10 dark:border-white/[0.08] dark:bg-neutral-900 dark:shadow-black/40 dark:ring-1 dark:ring-white/[0.04]">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-6 py-3.5 dark:border-white/[0.06]">
        <span className="text-[10px] font-black uppercase tracking-widest text-brand-700 dark:text-brand-300">
          {label}
        </span>
        <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">{byline}</span>
      </div>
      {children}
    </div>
  </div>
);

/* ─── Form ───────────────────────────────────────────────────────── */

interface ToolFormProps {
  tool: ToolId;
  dict: ToolFormDict;
  shared: Shared;
  busy: boolean;
  /** Show the country select (authority + keywords). */
  withCountry?: boolean;
  defaultCountry?: ToolCountry;
  /** What the field starts with, e.g. the input a portal link carries. */
  defaultInput?: string;
  onSubmit: (input: string, country?: ToolCountry) => void;
}

/**
 * One input (+ optional country select) and a submit button, on the
 * `@structura/ui` primitives. Validates with the same rules as the API
 * route, so an obviously bad entry gets instant, translated feedback
 * instead of a round trip.
 *
 * The text field stays uncontrolled on purpose: text typed before
 * hydration finishes survives it (a controlled `value=""` would wipe it),
 * and the submit button stays disabled until hydration so an early click
 * cannot fall through to a native GET submit that reloads the page. The
 * country is controlled because the Listbox-based `Select` has no native
 * form value; it cannot be operated before hydration anyway.
 */
export const ToolForm: FC<ToolFormProps> = ({
  tool,
  dict,
  shared,
  busy,
  withCountry = false,
  defaultCountry = "us",
  defaultInput,
  onSubmit,
}) => {
  const [hydrated, setHydrated] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [country, setCountry] = useState<ToolCountry>(defaultCountry);
  useEffect(() => setHydrated(true), []);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const value = String(new FormData(e.currentTarget).get("input") ?? "");
    if (!isValidToolInput(tool, value)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onSubmit(value.trim(), withCountry ? country : undefined);
  };

  const countryOptions = TOOL_COUNTRIES.map((c) => ({ value: c, label: shared.countries[c] }));

  return (
    <form onSubmit={submit} noValidate className="p-6 sm:p-7">
      {/* Every control is h-12 so the button lines up with the input on the
          md row; the button's natural lg height is 50px against a 40px input. */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="min-w-0 flex-1">
          <InputField
            label={dict.inputLabel}
            labelStyle="prominent"
            className="h-12"
            name="input"
            type="text"
            defaultValue={defaultInput}
            inputMode={tool === "keywords" ? "text" : "url"}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={dict.placeholder}
            error={invalid ? dict.invalidHint : undefined}
            aria-invalid={invalid}
            // 16px on phones so iOS does not zoom into the field on focus.
            inputClassName="!text-base sm:!text-sm !py-3"
            onChange={() => {
              if (invalid) setInvalid(false);
            }}
          />
        </div>
        {withCountry && (
          <div className="md:w-52">
            <Select
              options={countryOptions}
              value={country}
              onValueChange={(v) => setCountry(v as ToolCountry)}
            >
              <Select.Label labelStyle="prominent">{shared.countryLabel}</Select.Label>
              <Select.Trigger className="h-12 !py-3" />
              <Select.Content />
            </Select>
          </div>
        )}
        <div className="md:pt-[1.625rem]">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={busy}
            disabled={!hydrated}
            className={"h-12 w-full justify-center md:w-auto " + PRIMARY_DARK_AA}
          >
            {busy ? dict.submitting : dict.submit}
          </Button>
        </div>
      </div>
      {!invalid && (
        <p className="mt-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">{dict.privacyLine}</p>
      )}
    </form>
  );
};

/* ─── Result area states ─────────────────────────────────────────── */

/** Wrapper for everything under the form; announces changes politely. */
export const ResultArea: FC<{ children: ReactNode }> = ({ children }) => (
  <div
    className="border-t border-neutral-200 bg-neutral-50 p-4 sm:p-7 dark:border-white/[0.06] dark:bg-neutral-950/40"
    aria-live="polite"
  >
    {children}
  </div>
);

/** Empty state: what the visitor will get. */
export const EmptyPane: FC<{ title: string; hint: string; checks: string[] }> = ({ title, hint, checks }) => (
  <div className="flex flex-col items-center py-6 text-center">
    <div className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
      <Sparkles size={22} strokeWidth={2} aria-hidden="true" />
    </div>
    <p className="text-base font-bold text-neutral-900 dark:text-white">{title}</p>
    <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{hint}</p>
    <ul className="mt-5 flex flex-col gap-2 text-left sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-6">
      {checks.map((c) => (
        <li key={c} className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-200">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-500 dark:text-emerald-400" strokeWidth={2.5} aria-hidden="true" />
          {c}
        </li>
      ))}
    </ul>
  </div>
);

const Bone: FC<{ className: string }> = ({ className }) => (
  <div className={"rounded-md bg-neutral-200 motion-safe:animate-pulse dark:bg-white/[0.08] " + className} />
);

/**
 * Loading state: the report's shape plus one honest line. The backend has
 * no stages to report, so there is no fake progress (§4.8.1 #11).
 */
export const ReportSkeleton: FC<{ line: string; ariaLabel: string }> = ({ line, ariaLabel }) => (
  <div role="status" aria-label={ariaLabel} data-testid="report-skeleton">
    <p className="mb-4 text-sm font-semibold text-neutral-700 dark:text-neutral-200">{line}</p>
    <div aria-hidden="true" className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.06] dark:bg-neutral-900">
      <div className="border-b border-neutral-200 px-5 py-3 dark:border-white/[0.06]">
        <Bone className="h-3 w-48" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="space-y-3 border-b border-neutral-200 p-5 md:border-r md:border-b-0 dark:border-white/[0.06]">
          <Bone className="h-3 w-24" />
          <Bone className="h-14 w-28" />
          <Bone className="h-1.5 w-full" />
          <Bone className="h-3 w-full" />
        </div>
        <div className="space-y-4 p-5">
          <Bone className="h-5 w-2/3" />
          <Bone className="h-12 w-full" />
          <Bone className="h-12 w-full" />
          <Bone className="h-12 w-5/6" />
        </div>
      </div>
    </div>
  </div>
);

/** Seconds left until `retryAt`, ticking once a second; 0 when it has passed. */
function useSecondsUntil(retryAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!retryAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [retryAt]);
  return retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;
}

/**
 * Error state for every code except the refusals (each surface renders its
 * own). "Try again" re-issues the previous request; after a 429
 * it stays disabled and counts down the `Retry-After` wait, so the visitor
 * is not invited to hammer a limiter that will refuse them.
 */
export const ErrorPane: FC<{
  error: Exclude<ToolErrorCode, RefusalCode>;
  shared: Shared;
  invalidHint: string;
  retryAt?: number;
  onRetry: () => void;
}> = ({ error, shared, invalidHint, retryAt, onRetry }) => {
  const copy = shared.errors[error];
  const body = error === "invalid_input" ? invalidHint : copy.body;
  const wait = useSecondsUntil(error === "rate_limited" ? retryAt : undefined);
  return (
    <div role="alert" className="flex flex-col items-center py-6 text-center">
      <div className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
        <AlertTriangle size={22} strokeWidth={2} aria-hidden="true" />
      </div>
      <p className="text-base font-bold text-neutral-900 dark:text-white">{copy.title}</p>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{body}</p>
      {/* Re-sending an input the checker already rejected cannot help. */}
      {error !== "invalid_input" && (
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={onRetry}
          disabled={wait > 0}
          className="mt-5 gap-2"
        >
          <RotateCcw className="size-4" strokeWidth={2.5} aria-hidden="true" />
          {wait > 0 ? fill(shared.retryIn, { time: formatCountdown(wait) }) : shared.retry}
        </Button>
      )}
    </div>
  );
};

/* ─── Report pieces ──────────────────────────────────────────────── */

/**
 * Source line above a report: provider + what was measured on the left,
 * check date (+ "Cached result") and "Check another" on the right.
 */
export const SourceBar: FC<{
  shared: Shared;
  locale: string;
  detail: string;
  fetchedAt: string;
  cached: boolean;
  onReset: () => void;
}> = ({ shared, locale, detail, fetchedAt, cached, onReset }) => (
  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-neutral-200 px-4 py-3 text-xs text-neutral-600 sm:px-6 dark:border-white/[0.06] dark:text-neutral-300">
    <span className="flex min-w-0 flex-wrap items-center gap-1.5" data-testid="report-source">
      <Database className="size-3.5 shrink-0 text-neutral-500 dark:text-neutral-400" strokeWidth={2} aria-hidden="true" />
      {/* Dot stays glued to the vendor so a wrapped line never starts with it. */}
      <span className="whitespace-nowrap">
        <span className="font-semibold text-neutral-800 dark:text-neutral-100">{shared.source.vendor}</span> ·
      </span>
      <span>{detail}</span>
    </span>
    <span className="flex flex-wrap items-center gap-2">
      <span>{fill(shared.checkedAt, { date: formatDate(fetchedAt, locale) })}</span>
      {cached && (
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-700 dark:bg-white/[0.08] dark:text-neutral-200">
          {shared.source.cached}
        </span>
      )}
      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-1 rounded-md font-semibold text-brand-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 dark:text-brand-300"
      >
        <RotateCcw className="size-3" strokeWidth={2.5} aria-hidden="true" />
        {shared.checkAnother}
      </button>
    </span>
  </div>
);

/** The report card that sits inside the result area. */
export const ReportFrame: FC<{ testId: string; children: ReactNode }> = ({ testId, children }) => (
  <div
    data-testid={testId}
    className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-neutral-900"
  >
    {children}
  </div>
);

/**
 * Two-column body: a narrow overview beside the detail (stacked below `md`).
 * `wideOverview` gives the domain rank's stage chips 15rem, so the most
 * common one ("Early-stage link profile") fits on one line (QA 2026-10-02).
 */
export const ReportBody: FC<{ overview: ReactNode; children: ReactNode; wideOverview?: boolean }> = ({
  overview,
  children,
  wideOverview = false,
}) => (
  <div
    className={
      "grid grid-cols-1 " + (wideOverview ? "md:grid-cols-[15rem_minmax(0,1fr)]" : "md:grid-cols-[13.5rem_minmax(0,1fr)]")
    }
  >
    <aside className="border-b border-neutral-200 bg-neutral-50 p-5 sm:p-6 md:border-r md:border-b-0 dark:border-white/[0.06] dark:bg-white/[0.02]">
      {overview}
    </aside>
    <div className="min-w-0 p-4 sm:p-6">{children}</div>
  </div>
);

/**
 * The big score: "72 / 100". `toneClass` colours the number only; the SEO
 * checker passes its bucket colour, the domain rank passes a neutral one
 * (a link rank has no universal good or bad, §4.8.2).
 */
export const BigScore: FC<{ score: number; outOf: string; ariaLabel: string; toneClass: string }> = ({
  score,
  outOf,
  ariaLabel,
  toneClass,
}) => (
  <p role="img" aria-label={ariaLabel} className="mt-3 flex items-baseline gap-1.5">
    <span aria-hidden="true" className={"font-display text-6xl font-extrabold leading-none tracking-tight tabular-nums " + toneClass}>
      {Math.round(score)}
    </span>
    <span aria-hidden="true" className="text-base font-medium text-neutral-600 dark:text-neutral-300">
      {outOf}
    </span>
  </p>
);

/** Thin horizontal meter under a score. Decorative; the number carries the value. */
export const ScoreMeter: FC<{ score: number; barClass: string }> = ({ score, barClass }) => (
  <div aria-hidden="true" className="my-4 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-white/[0.1]">
    <div className={"h-full rounded-full " + barClass} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
  </div>
);

/** Footer row of a report: a short pitch on the left, actions on the right. */
export const ReportFooter: FC<{ title: string; body: string; children: ReactNode }> = ({ title, body, children }) => (
  <div className="flex flex-col gap-4 border-t border-neutral-200 bg-neutral-50 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between dark:border-white/[0.06] dark:bg-white/[0.02]">
    <div className="min-w-0">
      <p className="text-sm font-bold text-neutral-900 dark:text-white">{title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">{body}</p>
    </div>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">{children}</div>
  </div>
);

/* ─── Verdicts and Learn links (specs/blogseo-gap-analysis.md §4.11) ── */

/** The soft-glow focus ring (specs/design-guide.md §6.5). */
const FOCUS_GLOW =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:shadow-[0_0_0_4px_rgba(99,102,241,0.15)]";

/**
 * Chip styles per intent. Text is the 800 shade (red and neutral 700) on the
 * light tint, or 200 on a 10% tint in dark, for AA; the icon is 600 / 400
 * and only backs up the label.
 */
const VERDICT_STYLE: Record<VerdictIntent, { icon: LucideIcon; chip: string; iconClass: string }> = {
  good: {
    icon: CheckCircle2,
    chip: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/25",
    iconClass: "text-emerald-600 dark:text-emerald-400",
  },
  warn: {
    icon: AlertTriangle,
    chip: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/25",
    iconClass: "text-amber-600 dark:text-amber-400",
  },
  bad: {
    icon: XCircle,
    chip: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-500/10 dark:text-red-200 dark:ring-red-400/25",
    iconClass: "text-red-600 dark:text-red-400",
  },
  neutral: {
    icon: Info,
    chip: "bg-neutral-100 text-neutral-700 ring-1 ring-inset ring-neutral-900/10 dark:bg-white/[0.06] dark:text-neutral-200 dark:ring-white/10",
    iconClass: "text-neutral-500 dark:text-neutral-400",
  },
  // The only chip without a fill, so it never reads as a verdict.
  unknown: {
    icon: MinusCircle,
    chip: "border border-dashed border-neutral-300 text-neutral-600 dark:border-white/20 dark:text-neutral-300",
    iconClass: "text-neutral-500 dark:text-neutral-400",
  },
};

/**
 * A verdict: semantic colour, an icon and a label that carries the meaning
 * on its own (WCAG 1.4.1). `sm` is the Badge `sm` geometry; `xs` is for band
 * legends. A long label wraps into a stadium with the icon on its first line.
 */
export const VerdictChip: FC<{ intent: VerdictIntent; label: string; size?: "sm" | "xs" }> = ({
  intent,
  label,
  size = "sm",
}) => {
  const { icon: Icon, chip, iconClass } = VERDICT_STYLE[intent];
  // The dashed border takes a pixel of the padding, so every chip has the same outer size.
  const dashed = intent === "unknown";
  const box =
    size === "xs"
      ? `${dashed ? "px-[7px] py-px" : "px-2 py-0.5"} text-[11px] leading-4`
      : `${dashed ? "px-[9px] py-[3px]" : "px-2.5 py-1"} text-xs leading-tight`;
  return (
    <span
      data-intent={intent}
      className={`inline-flex max-w-full items-start gap-1.5 rounded-full font-semibold text-balance ${box} ${chip}`}
    >
      <Icon
        className={`shrink-0 ${size === "xs" ? "mt-[2px] size-3" : "mt-px size-3.5"} ${iconClass}`}
        strokeWidth={2.5}
        aria-hidden="true"
      />
      <span className="min-w-0">{label}</span>
    </span>
  );
};

/**
 * One figure in a report grid: its label (the `dt`, read first), the value,
 * a verdict chip, one plain line and an optional Learn link.
 *
 * The tile takes three rows of the grid it sits in (label, value, the rest)
 * as a subgrid, so tiles side by side line up their values and chips even
 * when one label has a note or wraps (QA 2026-10-02: 16px apart).
 */
export const MetricTile: FC<{
  /** Stable key for tests, e.g. `spamScore`. */
  metric: string;
  label: string;
  /** Second line of the label, e.g. what a share is a share of. */
  note?: string;
  value: ReactNode;
  /** The value is a placeholder dash: muted and hidden from screen readers, because the chip says why. */
  missing?: boolean;
  verdict?: { intent: VerdictIntent; label: string };
  line?: string;
  /** A Learn link; it carries its own margin, so a gated link leaves no gap. */
  learn?: ReactNode;
}> = ({ metric, label, note, value, missing = false, verdict, line, learn }) => (
  <div
    data-metric={metric}
    className="row-span-3 grid min-w-0 grid-rows-subgrid gap-y-0 border-t border-neutral-200 pt-3 dark:border-white/[0.08]"
  >
    <dt className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
      {label}
      {note && <span className="block font-normal text-neutral-600 dark:text-neutral-300">{note}</span>}
    </dt>
    <dd className="row-span-2 grid grid-rows-subgrid gap-y-0">
      {/* The dash is neutral-500: muted, and still 3:1 or better on both themes' tiles. */}
      <span
        aria-hidden={missing || undefined}
        className={
          "mt-1 block font-display text-2xl font-bold tracking-tight tabular-nums " +
          (missing ? "text-neutral-500" : "text-neutral-900 dark:text-white")
        }
      >
        {value}
      </span>
      <div>
        {verdict && (
          <span className="mt-2 flex">
            <VerdictChip intent={verdict.intent} label={verdict.label} />
          </span>
        )}
        {line && (
          <span className="mt-1.5 block text-xs leading-relaxed text-pretty text-neutral-600 dark:text-neutral-300">
            {line}
          </span>
        )}
        {learn}
      </div>
    </dd>
  </div>
);

/**
 * A link to a Learn page. Action links pass a `label` ("How to improve",
 * "How to fix"); reference links read the page's title. It renders nothing,
 * or `fallback`, unless the surface lists the page as published, and
 * `className` goes on a wrapper that exists only with the link, so a gated
 * link leaves no gap. On www it stays in the tab; in the portal it opens www
 * in a new tab and says so to screen readers. `py-1 -my-1` gives a 24px hit
 * area without moving the line (WCAG 2.5.8).
 */
export const LearnLink: FC<{
  target: LearnTarget;
  copy: LearnCopy;
  slug: LearnSlug;
  /** An action label; without one the link is a reference and reads the page title. */
  label?: string;
  /** Wrapper classes, usually the top margin. */
  className?: string;
  /** Size and weight of the link text. */
  textClassName?: string;
  /** Id of what the link is about, e.g. the task a "How to fix" fixes. */
  describedBy?: string;
  /** Shown instead while the page is not published. */
  fallback?: ReactNode;
}> = ({ target, copy, slug, label, className, textClassName = "text-xs font-semibold", describedBy, fallback = null }) => {
  if (!target.published.has(slug)) return <>{fallback}</>;
  const link = (
    <a
      href={`${target.base}/${slug}`}
      target={target.newTab ? "_blank" : undefined}
      rel={target.newTab ? "noopener" : undefined}
      aria-describedby={describedBy}
      data-learn={slug}
      onClick={target.onFollow && (() => target.onFollow?.(slug))}
      className={`group/learn -my-1 inline-flex max-w-full items-start gap-1.5 rounded-md py-1 leading-4 text-brand-700 underline-offset-2 hover:underline dark:text-brand-300 ${FOCUS_GLOW} ${textClassName}`}
    >
      <BookOpen className="mt-px size-3.5 shrink-0" strokeWidth={2.25} aria-hidden="true" />
      <span className="min-w-0">{label ?? copy.pages[slug]}</span>
      {target.newTab ? (
        <>
          <ExternalLink className="mt-0.5 size-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
          {/* The leading space keeps the name "Intent (opens…)" where no style separates the parts. */}
          <span className="sr-only"> {copy.newTab}</span>
        </>
      ) : (
        <ArrowRight
          className="mt-0.5 size-3 shrink-0 transition-transform duration-fast group-hover/learn:translate-x-0.5 motion-reduce:transition-none"
          strokeWidth={2.5}
          aria-hidden="true"
        />
      )}
    </a>
  );
  return className ? <div className={className}>{link}</div> : link;
};

/** A closed-by-default explainer under a report: "How these bands work", "How to read these numbers". */
export const Disclosure: FC<{ title: string; testId?: string; className?: string; children: ReactNode }> = ({
  title,
  testId,
  className = "",
  children,
}) => (
  <details
    data-testid={testId}
    className={`group/disclosure rounded-xl border border-neutral-200 bg-neutral-50/60 dark:border-white/[0.06] dark:bg-white/[0.02] ${className}`}
  >
    <summary
      className={`flex cursor-pointer list-none items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-neutral-800 dark:text-neutral-100 [&::-webkit-details-marker]:hidden ${FOCUS_GLOW}`}
    >
      <Info className="size-3.5 shrink-0 text-neutral-500 dark:text-neutral-400" strokeWidth={2.5} aria-hidden="true" />
      <span className="flex-1">{title}</span>
      <ChevronDown
        className="size-4 shrink-0 text-neutral-500 transition-transform duration-fast group-open/disclosure:rotate-180 motion-reduce:transition-none dark:text-neutral-400"
        aria-hidden="true"
      />
    </summary>
    <div className="border-t border-neutral-200 px-3.5 pt-3 pb-3.5 dark:border-white/[0.06]">{children}</div>
  </details>
);
