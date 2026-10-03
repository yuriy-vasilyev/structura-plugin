import { formatBytes, formatDuration, formatNumber, fill } from "./format";
import { isSeoCheckId, isSeoCheckStatus, type SeoCheck, type SeoCheckId } from "./types";

/**
 * The SEO checker's report is a list of TASKS, not of checks
 * (specs/blogseo-gap-analysis.md §4.8.2): a missing meta description fails
 * both `meta_description_present` and `meta_description_length`, but it is
 * one thing to fix. This module groups the function's checks by cause.
 */

/** One fixable thing on the page. Order here is the display order within a severity. */
export const TASK_IDS = [
  "indexable",
  "https",
  "title",
  "meta_description",
  "h1",
  "viewport",
  "canonical",
  "content",
  "images_alt",
  "internal_links",
  "structured_data",
  "open_graph",
  "speed",
  "duplicates",
] as const;

/** One of {@link TASK_IDS}; translated under `seo-checker.json#tasks`. */
export type TaskId = (typeof TASK_IDS)[number];

/** Which task each check belongs to. Every check id maps to exactly one task. */
export const CHECK_TASK: Record<SeoCheckId, TaskId> = {
  title_present: "title",
  title_length: "title",
  meta_description_present: "meta_description",
  meta_description_length: "meta_description",
  single_h1: "h1",
  https: "https",
  canonical: "canonical",
  indexable: "indexable",
  viewport: "viewport",
  images_alt: "images_alt",
  word_count: "content",
  structured_data: "structured_data",
  open_graph: "open_graph",
  page_size: "speed",
  load_time: "speed",
  internal_links: "internal_links",
  duplicate_title_desc: "duplicates",
};

/** A task with at least one failed or warned check. */
export interface ReportTask {
  id: TaskId;
  /** `fail` when any of its checks failed, else `warn`. */
  severity: "fail" | "warn";
  /** The task's failed and warned checks, in the function's order. */
  checks: SeoCheck[];
  /** How many of those checks failed; the "covers N failed checks" line. */
  failedChecks: number;
}

/** The checker's result, arranged for the report. */
export interface SeoReport {
  /** Failed tasks first, then tasks with warnings, each in {@link TASK_IDS} order. */
  tasks: ReportTask[];
  /** Known checks the scan could not measure. Never shown with a fix hint. */
  unmeasured: SeoCheck[];
  /** Known checks that passed; collapsed in the UI. */
  passed: SeoCheck[];
  /**
   * Checks this build has no copy or style for (a newer function added an
   * id or a status). Rendered as neutral rows with the raw id.
   */
  unrecognised: SeoCheck[];
  /** Checks per known status, whatever their id. */
  counts: { pass: number; fail: number; warn: number; unknown: number };
}

/** Group a checker result's checks into the report's tasks and groups. Pure. */
export function buildSeoReport(checks: readonly SeoCheck[]): SeoReport {
  const counts = { pass: 0, fail: 0, warn: 0, unknown: 0 };
  const byTask = new Map<TaskId, SeoCheck[]>();
  const unmeasured: SeoCheck[] = [];
  const passed: SeoCheck[] = [];
  const unrecognised: SeoCheck[] = [];

  for (const check of checks) {
    if (isSeoCheckStatus(check.status)) counts[check.status] += 1;
    if (!isSeoCheckId(check.id) || !isSeoCheckStatus(check.status)) {
      unrecognised.push(check);
    } else if (check.status === "pass") {
      passed.push(check);
    } else if (check.status === "unknown") {
      unmeasured.push(check);
    } else {
      const task = CHECK_TASK[check.id];
      byTask.set(task, [...(byTask.get(task) ?? []), check]);
    }
  }

  const tasks: ReportTask[] = TASK_IDS.flatMap((id) => {
    const taskChecks = byTask.get(id);
    if (!taskChecks) return [];
    const failedChecks = taskChecks.filter((c) => c.status === "fail").length;
    return [{ id, severity: failedChecks > 0 ? "fail" : "warn", checks: taskChecks, failedChecks } as ReportTask];
  });
  tasks.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "fail" ? -1 : 1));
  return { tasks, unmeasured, passed, unrecognised, counts };
}

/**
 * A check's measured value for display ("65 characters", "310 ms"), or
 * `undefined` when it has none. `template` is the check's `value` copy.
 */
export function formatCheckValue(
  id: string,
  raw: string | undefined,
  template: string | undefined,
  locale: string,
): string | undefined {
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  if (id === "load_time" && Number.isFinite(n)) return formatDuration(n, locale);
  if (id === "page_size" && Number.isFinite(n)) return formatBytes(n, locale);
  if (template && Number.isFinite(n)) return fill(template, { value: formatNumber(n, locale) });
  return template ? fill(template, { value: raw }) : raw;
}

/** One task as the copy list states it. */
export interface ActionListTask {
  title: string;
  evidence: string;
  fix: string;
}

/**
 * Plain-text action list behind "Copy action list": a heading, the tasks
 * numbered with their evidence and fix, then the unmeasured signals so the
 * reader knows to verify them separately. Pure; the component resolves copy.
 */
export function actionListText(args: {
  heading: string;
  tasks: readonly ActionListTask[];
  noTasks: string;
  unmeasuredHeading: string;
  unmeasured: readonly string[];
}): string {
  const lines = [args.heading, ""];
  if (args.tasks.length === 0) {
    lines.push(args.noTasks);
  } else {
    args.tasks.forEach((t, i) => {
      lines.push(`${i + 1}. ${t.title}`);
      if (t.evidence) lines.push(`   ${t.evidence}`);
      lines.push(`   ${t.fix}`);
    });
  }
  if (args.unmeasured.length > 0) {
    lines.push("", args.unmeasuredHeading, ...args.unmeasured.map((u) => `- ${u}`));
  }
  return lines.join("\n");
}
