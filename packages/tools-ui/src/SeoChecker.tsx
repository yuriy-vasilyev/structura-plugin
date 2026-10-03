"use client";

import { type FC, type ReactNode, useEffect, useId, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, CircleHelp, Copy, MinusCircle, XCircle, type LucideIcon } from "lucide-react";
import { Button } from "@structura/ui/button";
import { seoVerdict, type ScoreBucket } from "./lib/score";
import { fill } from "./lib/format";
import { taskLearnSlug, type LearnTarget } from "./lib/learn";
import { actionListText, buildSeoReport, formatCheckValue, type ReportTask, type TaskId } from "./lib/tasks";
import { isRefusal, isSeoCheckId, isSeoCheckStatus, type SeoCheck, type SeoCheckId, type SeoCheckerResult } from "./lib/types";
import { useToolRun, type ToolRefusal, type ToolRequestInput, type ToolRunEvent, type ToolRunner } from "./useToolRun";
import {
  BigScore,
  EmptyPane,
  ErrorPane,
  LearnLink,
  ReportBody,
  ReportFooter,
  ReportFrame,
  ReportSkeleton,
  ResultArea,
  ScoreMeter,
  SourceBar,
  ToolCard,
  ToolForm,
  VerdictChip,
  type ToolFormDict,
  type ToolSharedDict,
} from "./ToolUi";

/**
 * The SEO checker's copy (www: `seo-checker.json`), limited to the keys the
 * widget reads. Each surface keeps its own dictionary (§4.9.4).
 */
export interface SeoCheckerDict {
  /** Card label and form copy. */
  tool: ToolFormDict;
  /** Everything under the form. */
  result: {
    /** Empty state before the first check. */
    empty: { title: string; hint: string; checks: string[] };
    /** The one honest line above the loading skeleton. */
    loading: string;
    /** What was measured, after the vendor in the source bar. */
    source: string;
    /** The report. */
    report: {
      /** Heading of the score column. */
      scoreLabel: string;
      /** Scale after the score, e.g. "/ 100". */
      outOf: string;
      /** Accessible name of the score; `{{score}}`. */
      scoreAria: string;
      /** Caveat under the score. */
      scoreNote: string;
      /** Shown in place of a score when the crawl reported none. */
      noScore: string;
      /** Chip label and line per score bucket (§4.11). */
      verdicts: Record<ScoreBucket, { label: string; line: string }>;
      /** Counter label per status. */
      counters: { pass: string; fail: string; warn: string; unknown: string };
      /** Headline over the tasks, by task count; `other` takes `{{count}}`. */
      headline: { none: string; one: string; other: string };
      /** Line under the headline, without and with tasks. */
      subline: { none: string; some: string };
      /** Added to a task that groups several failed checks; `{{count}}`. */
      covers: string;
      /** Label of a task's fix. */
      whatToDo: string;
      /** Title of the not-measured group. */
      unmeasuredTitle: string;
      /** Why a not-measured check is not a failure. */
      unmeasuredBody: string;
      /** Title of the group of checks this build has no copy for. */
      otherTitle: string;
      /** Explanation under that title. */
      otherBody: string;
      /** Verdict per status in evidence lines and the other-checks group. */
      statusLabels: { pass: string; warn: string; fail: string; unknown: string; other: string };
      /** Summary of the collapsed passed checks; `other` takes `{{count}}`. */
      passed: { one: string; other: string };
      /** "Copy action list" button. */
      copy: string;
      /** The button and status once copied. */
      copied: string;
      /** Shown when the clipboard refused, above the list to select by hand. */
      copyFailed: string;
      /** First line of the copied list; `{{url}}`. */
      copyHeading: string;
      /** The copied list when there is nothing to fix. */
      copyNoTasks: string;
      /** Heading of the not-measured part of the copied list. */
      copyUnmeasured: string;
    };
  };
  /** Task title per task id and severity. */
  tasks: Record<TaskId, { fail: string; warn: string }>;
  /** Label and fix hint per check id; `value` formats the measured value with `{{value}}`. */
  checks: Record<SeoCheckId, { label: string; hint: string; value?: string }>;
  /** The report footer's pitch next to the actions. */
  resultCta: { title: string; body: string };
}

type Dict = SeoCheckerDict;
type Shared = ToolSharedDict;

interface SeoCheckerProps {
  /** Locale for numbers and dates. */
  locale: string;
  /** The tool's copy. */
  dict: Dict;
  /** Copy every tool shares. */
  shared: Shared;
  /** Where the surface's Learn links go and which pages are published (§4.11). */
  learn: LearnTarget;
  /** Runs the check the surface's way. */
  runner: ToolRunner;
  /** The surface's analytics for each step of a run. */
  onEvent?: (event: ToolRunEvent) => void;
  /**
   * Shown in place of the error pane when a run is refused: the shared pool
   * is spent (`capacity`) or, on www, the visitor's own daily checks are
   * (`visitor_limit`, §4.10).
   */
  renderCapacity: (request: ToolRequestInput, refusal: ToolRefusal) => ReactNode;
  /** The report footer's call to action, after "Copy action list". */
  cta: ReactNode;
  /** URL the field starts with, e.g. from a portal link. */
  initialInput?: string;
  /** Check `initialInput` once on mount, when it is a valid URL. */
  autoRun?: boolean;
}

/**
 * Free SEO Checker widget: one URL in, an on-page score and a task list
 * out (specs/blogseo-gap-analysis.md §4.3 "seo-checker", report §4.8.2).
 * The surface supplies the runner, the capacity state and the footer CTA.
 */
export const SeoChecker: FC<SeoCheckerProps> = ({
  locale,
  dict,
  shared,
  learn,
  runner,
  onEvent,
  renderCapacity,
  cta,
  initialInput,
  autoRun = false,
}) => {
  const { state, run, retry, reset } = useToolRun(
    "seo-checker",
    runner,
    onEvent,
    autoRun && initialInput ? { input: initialInput } : undefined,
  );
  const busy = state.phase === "loading";

  return (
    <ToolCard label={dict.tool.cardLabel} byline={dict.tool.cardByline}>
      <ToolForm
        tool="seo-checker"
        dict={dict.tool}
        shared={shared}
        busy={busy}
        defaultInput={initialInput}
        onSubmit={(input) => void run(input)}
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
          <SeoReport
            result={state.result}
            cached={state.cached}
            locale={locale}
            dict={dict}
            shared={shared}
            learn={learn}
            cta={cta}
            onReset={reset}
          />
        )}
      </ResultArea>
    </ToolCard>
  );
};

// Red, not rose: the design guide's danger colour (§4.11).
const BUCKET_NUMBER: Record<ScoreBucket, string> = {
  good: "text-emerald-700 dark:text-emerald-300",
  fair: "text-amber-700 dark:text-amber-300",
  poor: "text-red-700 dark:text-red-300",
};
const BUCKET_BAR: Record<ScoreBucket, string> = {
  good: "bg-emerald-500",
  fair: "bg-amber-500",
  poor: "bg-red-500",
};

/** Icons carry the semantic colour; the text next to them stays neutral for contrast. */
const STATUS_ICON: Record<"pass" | "warn" | "fail" | "unknown" | "other", { icon: LucideIcon; className: string }> = {
  pass: { icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400" },
  warn: { icon: AlertTriangle, className: "text-amber-500 dark:text-amber-400" },
  fail: { icon: XCircle, className: "text-red-600 dark:text-red-400" },
  unknown: { icon: MinusCircle, className: "text-neutral-400 dark:text-neutral-500" },
  other: { icon: CircleHelp, className: "text-neutral-400 dark:text-neutral-500" },
};

type CheckCopy = { label: string; hint: string; value?: string };

function checkCopy(dict: Dict, id: string): CheckCopy | undefined {
  return isSeoCheckId(id) ? (dict.checks[id] as CheckCopy) : undefined;
}

/**
 * "Title length: 65 characters · Meta description: Failed" for a task's
 * non-pass checks: the measured value when there is one, else the verdict.
 */
function evidenceOf(task: ReportTask, dict: Dict, locale: string): string {
  const labels = dict.result.report.statusLabels;
  return task.checks
    .map((c) => {
      const copy = checkCopy(dict, c.id);
      const value = formatCheckValue(c.id, c.value, copy?.value, locale);
      const status = c.status === "fail" || c.status === "warn" ? labels[c.status] : c.status;
      return `${copy?.label ?? c.id}: ${value ?? status}`;
    })
    .join(" · ");
}

/** The task's fix: the hints of its failing checks, de-duplicated, in order. */
function fixOf(task: ReportTask, dict: Dict): string {
  return [...new Set(task.checks.map((c) => checkCopy(dict, c.id)?.hint).filter(Boolean))].join(" ");
}

function plural(forms: { one: string; other: string }, count: number): string {
  return count === 1 ? forms.one : fill(forms.other, { count });
}

const SeoReport: FC<{
  result: SeoCheckerResult;
  cached: boolean;
  locale: string;
  dict: Dict;
  shared: Shared;
  learn: LearnTarget;
  cta: ReactNode;
  onReset: () => void;
}> = ({ result, cached, locale, dict, shared, learn, cta, onReset }) => {
  const r = dict.result.report;
  const report = buildSeoReport(result.checks);
  // From the rounded score, so the colour and the chip match the number shown.
  const verdict = seoVerdict(result.score);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const taskCount = report.tasks.length;
  // "How to fix" is described by its task's title, which needs a unique id.
  const idPrefix = useId();

  const actionText = actionListText({
    heading: fill(r.copyHeading, { url: result.url }),
    tasks: report.tasks.map((t) => ({
      title: dict.tasks[t.id][t.severity],
      evidence: evidenceOf(t, dict, locale),
      fix: fixOf(t, dict),
    })),
    noTasks: r.copyNoTasks,
    unmeasuredHeading: r.copyUnmeasured,
    unmeasured: report.unmeasured.map((c) => checkCopy(dict, c.id)?.label ?? c.id),
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(actionText);
      setCopyState("copied");
    } catch {
      // Clipboard access can be denied (permissions, insecure context):
      // say so next to the button instead of failing silently.
      setCopyState("failed");
    }
  };
  // The button reads "copied" for a moment, then offers to copy again
  // (QA 2026-09-29: the sr-only status alone left sighted users guessing).
  useEffect(() => {
    if (copyState !== "copied") return;
    const t = setTimeout(() => setCopyState("idle"), 2000);
    return () => clearTimeout(t);
  }, [copyState]);

  const counters: Array<{ key: "pass" | "fail" | "warn" | "unknown"; label: string }> = [
    { key: "pass", label: r.counters.pass },
    { key: "fail", label: r.counters.fail },
    { key: "warn", label: r.counters.warn },
    { key: "unknown", label: r.counters.unknown },
  ];

  return (
    <ReportFrame testId="seo-checker-result">
      <SourceBar
        shared={shared}
        locale={locale}
        detail={dict.result.source}
        fetchedAt={result.fetchedAt}
        cached={cached}
        onReset={onReset}
      />
      <ReportBody
        overview={
          <div className="grid grid-cols-2 gap-x-6 md:block">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">{r.scoreLabel}</p>
              {result.score !== undefined && verdict.band !== "notMeasured" ? (
                <>
                  <BigScore
                    score={result.score}
                    outOf={r.outOf}
                    ariaLabel={fill(r.scoreAria, { score: Math.round(result.score) })}
                    toneClass={BUCKET_NUMBER[verdict.band]}
                  />
                  <div className="mt-3 flex">
                    <VerdictChip intent={verdict.intent} label={r.verdicts[verdict.band].label} />
                  </div>
                  <ScoreMeter score={result.score} barClass={BUCKET_BAR[verdict.band]} />
                  <p className="text-xs font-semibold leading-relaxed text-pretty text-neutral-800 dark:text-neutral-100">
                    {r.verdicts[verdict.band].line}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">{r.scoreNote}</p>
                </>
              ) : (
                <>
                  <p
                    aria-hidden="true"
                    className="mt-3 font-display text-6xl font-extrabold leading-none text-neutral-300 dark:text-neutral-600"
                  >
                    {shared.noValue}
                  </p>
                  <div className="mt-3 flex">
                    <VerdictChip intent="unknown" label={shared.notMeasured} />
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">{r.noScore}</p>
                </>
              )}
              {verdict.action && (
                <LearnLink
                  target={learn}
                  copy={shared.learn}
                  slug="on-page-seo"
                  label={shared.learn.howToImprove}
                  className="mt-3"
                />
              )}
            </div>
            <ul className="space-y-2.5 md:mt-6" data-testid="seo-counters">
              {counters.map(({ key, label }) => {
                const { icon: Icon, className } = STATUS_ICON[key];
                return (
                  <li key={key} data-counter={key} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 text-neutral-700 dark:text-neutral-200">
                      <Icon className={"size-4 shrink-0 " + className} strokeWidth={2.5} aria-hidden="true" />
                      {label}
                    </span>
                    <strong className="tabular-nums text-neutral-900 dark:text-white">{report.counts[key]}</strong>
                  </li>
                );
              })}
            </ul>
          </div>
        }
      >
        <h3 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
          {taskCount === 0 ? r.headline.none : plural(r.headline, taskCount)}
        </h3>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          {taskCount === 0 ? r.subline.none : r.subline.some}
        </p>
        <p className="mt-2 break-all font-mono text-[11px] text-neutral-600 dark:text-neutral-300">{result.url}</p>

        {taskCount > 0 && (
          <ul className="mt-4 divide-y divide-neutral-200 border-y border-neutral-200 dark:divide-white/[0.06] dark:border-white/[0.06]">
            {report.tasks.map((task, i) => {
              const { icon: Icon, className } = STATUS_ICON[task.severity];
              const titleId = `${idPrefix}-task-${task.id}`;
              return (
                <li key={task.id} data-task-id={task.id} data-severity={task.severity}>
                  <details open={i === 0} className="group py-3.5">
                    <summary className="flex cursor-pointer list-none items-start gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 [&::-webkit-details-marker]:hidden">
                      <Icon className={"mt-0.5 size-[18px] shrink-0 " + className} strokeWidth={2.5} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span id={titleId} className="block text-sm font-semibold text-neutral-900 dark:text-white">
                          {dict.tasks[task.id][task.severity]}
                        </span>
                        <span className="mt-0.5 block break-words text-xs text-neutral-600 dark:text-neutral-300">
                          {evidenceOf(task, dict, locale)}
                          {task.failedChecks > 1 && ` · ${fill(r.covers, { count: task.failedChecks })}`}
                        </span>
                      </span>
                      <ChevronDown
                        className="mt-0.5 size-4 shrink-0 text-neutral-500 transition-transform duration-fast group-open:rotate-180 motion-reduce:transition-none dark:text-neutral-400"
                        aria-hidden="true"
                      />
                    </summary>
                    <div className="mt-3 ml-[30px] rounded-lg bg-neutral-50 px-3.5 py-3 text-sm leading-relaxed text-neutral-700 dark:bg-white/[0.04] dark:text-neutral-200">
                      <strong className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-neutral-900 dark:text-white">
                        {r.whatToDo}
                      </strong>
                      {fixOf(task, dict)}
                      <LearnLink
                        target={learn}
                        copy={shared.learn}
                        slug={taskLearnSlug(task.id)}
                        label={shared.learn.howToFix}
                        describedBy={titleId}
                        className="mt-2.5"
                      />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        {report.unmeasured.length > 0 && (
          <div className="mt-5 flex items-start gap-2.5" data-testid="seo-unmeasured">
            <MinusCircle className={"mt-0.5 size-4 shrink-0 " + STATUS_ICON.unknown.className} strokeWidth={2.5} aria-hidden="true" />
            <div className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
              <p className="font-semibold text-neutral-800 dark:text-neutral-100">
                {r.unmeasuredTitle}:{" "}
                {report.unmeasured.map((c) => checkCopy(dict, c.id)?.label ?? c.id).join(", ")}
              </p>
              <p>{r.unmeasuredBody}</p>
            </div>
          </div>
        )}

        {report.unrecognised.length > 0 && <OtherChecks checks={report.unrecognised} dict={dict} locale={locale} />}

        {report.passed.length > 0 && (
          <details className="group mt-5 border-t border-neutral-200 pt-3.5 dark:border-white/[0.06]" data-testid="seo-passed">
            <summary className="flex cursor-pointer list-none items-center gap-3 rounded-md text-sm font-semibold text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 dark:text-white [&::-webkit-details-marker]:hidden">
              <CheckCircle2 className={"size-[18px] shrink-0 " + STATUS_ICON.pass.className} strokeWidth={2.5} aria-hidden="true" />
              <span className="flex-1">{plural(r.passed, report.passed.length)}</span>
              <ChevronDown
                className="size-4 shrink-0 text-neutral-500 transition-transform duration-fast group-open:rotate-180 motion-reduce:transition-none dark:text-neutral-400"
                aria-hidden="true"
              />
            </summary>
            <ul className="mt-2 ml-[30px] space-y-1 text-xs text-neutral-700 dark:text-neutral-200">
              {report.passed.map((c) => {
                const copyText = checkCopy(dict, c.id);
                const value = formatCheckValue(c.id, c.value, copyText?.value, locale);
                return (
                  <li key={c.id} data-check-id={c.id}>
                    {copyText?.label ?? c.id}
                    {value && <span className="text-neutral-600 dark:text-neutral-300"> · {value}</span>}
                  </li>
                );
              })}
            </ul>
          </details>
        )}

        {copyState === "failed" && (
          <>
            <p className="mt-4 text-xs text-red-600 dark:text-red-400">{r.copyFailed}</p>
            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-800 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-neutral-100">
              {actionText}
            </pre>
          </>
        )}
      </ReportBody>
      <ReportFooter title={dict.resultCta.title} body={dict.resultCta.body}>
        <Button type="button" variant="secondary" size="md" onClick={() => void copy()} className="justify-center gap-2">
          {copyState === "copied" ? (
            <Check className="size-4" strokeWidth={2.5} aria-hidden="true" />
          ) : (
            <Copy className="size-4" strokeWidth={2.5} aria-hidden="true" />
          )}
          {copyState === "copied" ? r.copied : r.copy}
        </Button>
        {cta}
      </ReportFooter>
      <p role="status" className="sr-only">
        {copyState === "copied" ? r.copied : copyState === "failed" ? r.copyFailed : ""}
      </p>
    </ReportFrame>
  );
};

/** Checks this build has no copy or style for: raw id, neutral icon, status text. */
const OtherChecks: FC<{ checks: SeoCheck[]; dict: Dict; locale: string }> = ({ checks, dict, locale }) => {
  const r = dict.result.report;
  return (
    <div className="mt-5" data-testid="seo-other">
      <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-100">{r.otherTitle}</p>
      <p className="text-xs text-neutral-600 dark:text-neutral-300">{r.otherBody}</p>
      <ul className="mt-2 space-y-1.5">
        {checks.map((c, i) => {
          const known = isSeoCheckStatus(c.status) ? c.status : "other";
          const { icon: Icon, className } = STATUS_ICON[known === "pass" || known === "unknown" ? known : "other"];
          const copyText = checkCopy(dict, c.id);
          const value = formatCheckValue(c.id, c.value, copyText?.value, locale);
          return (
            <li
              key={`${c.id}-${i}`}
              data-check-id={c.id}
              data-status={c.status}
              className="flex items-start gap-2 text-xs text-neutral-700 dark:text-neutral-200"
            >
              <Icon className={"mt-0.5 size-4 shrink-0 " + className} strokeWidth={2.5} aria-hidden="true" />
              <span className="min-w-0 break-all">
                <span className="font-mono">{copyText?.label ?? c.id}</span>
                {" · "}
                {r.statusLabels[known]}
                {value && ` · ${value}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
